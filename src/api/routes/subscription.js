/**
 * Subscription API Routes
 *
 * Handles subscription management:
 * - GET /api/subscription - Get current subscription and usage
 * - GET /api/subscription/tiers - Get available tiers
 * - POST /api/subscription/checkout - Create Stripe checkout session
 * - POST /api/subscription/portal - Get Stripe customer portal URL
 * - POST /api/subscription/webhook - Stripe webhook handler
 * - POST /api/subscription/cancel - Cancel subscription
 */

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');
const { requireAuth, optionalAuth } = require('../../middleware/auth');
const { getSubscriptionService } = require('../../services/subscriptionService');
const { isAdminRequest } = require('../../middleware/subscription');

// Check if Stripe is configured
const STRIPE_CONFIGURED = !!(process.env.STRIPE_SECRET_KEY);
let stripe = null;

if (STRIPE_CONFIGURED) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

/**
 * GET /api/subscription
 * Get current user's subscription and usage stats
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    // Admin gets full Ultra access with no limits
    if (isAdminRequest(req)) {
      return res.json({
        success: true,
        subscription: {
          tier: 'ultra',
          displayName: 'Admin',
          status: 'active',
          features: {
            basic_screener: true,
            advanced_screener: true,
            ai_research_agents: true,
            filing_analyzer: true,
            realtime_13f: true,
            prism_reports: true,
            dcf_valuation: true,
            paper_trading_bots: true,
            ml_optimization: true,
            monte_carlo: true,
            stress_testing: true,
            backtesting: true,
            factor_analysis: true,
            data_export: true,
            api_access: true
          },
          limits: {
            ai_queries_monthly: -1,
            prism_reports_monthly: -1,
            watchlist_stocks: -1,
            portfolios: -1,
            alerts: -1,
            agents: -1
          },
          badgeColor: '#8B5CF6',
          isGrandfathered: false,
          isGrandfatheredActive: true,
          isAdmin: true
        },
        usage: {}
      });
    }

    const db = await getDatabaseAsync();
    const subscriptionService = getSubscriptionService(db);

    const subscription = await subscriptionService.getUserSubscription(req.user.id);
    const usage = await subscriptionService.getAllUsage(req.user.id);

    // Build usage with limits
    const usageWithLimits = {};
    const limits = subscription.effectiveLimits || subscription.limits || {};

    for (const [key, limit] of Object.entries(limits)) {
      const current = usage[key]?.count || 0;
      usageWithLimits[key] = {
        current,
        limit,
        unlimited: limit === -1,
        remaining: limit === -1 ? -1 : Math.max(0, limit - current),
        lastUsedAt: usage[key]?.lastUsedAt
      };
    }

    res.json({
      success: true,
      subscription: {
        tier: subscription.tier_name,
        displayName: subscription.tier_display_name,
        status: subscription.status || 'active',
        billingPeriod: subscription.billing_period,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
        features: subscription.effectiveFeatures || subscription.features,
        limits: subscription.effectiveLimits || subscription.limits,
        badgeColor: subscription.badge_color,
        // Grandfathering info
        isGrandfathered: subscription.isGrandfathered,
        isGrandfatheredActive: subscription.isGrandfatheredActive,
        grandfatheredDaysRemaining: subscription.grandfatheredDaysRemaining
      },
      usage: usageWithLimits
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch subscription'
    });
  }
});

/**
 * GET /api/subscription/tiers
 * Get all available subscription tiers (for pricing page)
 */
router.get('/tiers', optionalAuth, async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const subscriptionService = getSubscriptionService(db);

    const tiers = await subscriptionService.getAllTiers();

    // Get current tier if authenticated
    let currentTier = null;
    if (req.user?.id) {
      const subscription = await subscriptionService.getUserSubscription(req.user.id);
      currentTier = subscription.tier_name;
    }

    res.json({
      success: true,
      tiers: tiers.map(tier => ({
        id: tier.id,
        name: tier.name,
        displayName: tier.display_name,
        description: tier.description,
        priceMonthly: tier.priceMonthly,
        priceYearly: tier.priceYearly,
        limits: tier.limits,
        features: tier.features,
        badgeColor: tier.badge_color,
        isCurrent: tier.name === currentTier
      })),
      currentTier
    });
  } catch (error) {
    console.error('Error fetching tiers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tiers'
    });
  }
});

/**
 * POST /api/subscription/checkout
 * Create a Stripe checkout session for subscription
 */
router.post('/checkout', requireAuth, async (req, res) => {
  if (!STRIPE_CONFIGURED) {
    return res.status(503).json({
      success: false,
      error: 'Payment processing is not configured'
    });
  }

  try {
    const { tierName, billingPeriod = 'monthly' } = req.body;

    if (!tierName || !['pro', 'ultra'].includes(tierName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier specified'
      });
    }

    // Get price ID from environment
    const priceIdKey = billingPeriod === 'yearly'
      ? `STRIPE_${tierName.toUpperCase()}_YEARLY_PRICE_ID`
      : `STRIPE_${tierName.toUpperCase()}_PRICE_ID`;

    const priceId = process.env[priceIdKey];

    if (!priceId) {
      return res.status(503).json({
        success: false,
        error: `Pricing not configured for ${tierName} (${billingPeriod})`
      });
    }

    const db = await getDatabaseAsync();
    const subscriptionService = getSubscriptionService(db);
    const currentSub = await subscriptionService.getUserSubscription(req.user.id);

    // Create or get Stripe customer
    let customerId = currentSub.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name,
        metadata: {
          userId: req.user.id
        }
      });
      customerId = customer.id;

      // Save customer ID
      await subscriptionService.createOrUpdateSubscription(req.user.id, {
        stripeCustomerId: customerId
      });
    }

    // Build success/cancel URLs
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const successUrl = `${appUrl}/pricing/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/pricing?cancelled=true`;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: req.user.id,
        tierName,
        billingPeriod
      },
      subscription_data: {
        metadata: {
          userId: req.user.id,
          tierName
        }
      }
    });

    res.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout session'
    });
  }
});

/**
 * POST /api/subscription/portal
 * Get Stripe customer portal URL for managing subscription
 */
router.post('/portal', requireAuth, async (req, res) => {
  if (!STRIPE_CONFIGURED) {
    return res.status(503).json({
      success: false,
      error: 'Payment processing is not configured'
    });
  }

  try {
    const db = await getDatabaseAsync();
    const subscriptionService = getSubscriptionService(db);
    const subscription = await subscriptionService.getUserSubscription(req.user.id);

    if (!subscription.stripe_customer_id) {
      return res.status(400).json({
        success: false,
        error: 'No billing account found'
      });
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const returnUrl = `${appUrl}/settings/subscription`;

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl
    });

    res.json({
      success: true,
      portalUrl: session.url
    });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create billing portal session'
    });
  }
});

/**
 * POST /api/subscription/cancel
 * Cancel subscription (at period end)
 */
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const { reason, immediate = false } = req.body;

    const db = await getDatabaseAsync();
    const subscriptionService = getSubscriptionService(db);
    const subscription = await subscriptionService.getUserSubscription(req.user.id);

    if (subscription.tier_name === 'free') {
      return res.status(400).json({
        success: false,
        error: 'No active paid subscription to cancel'
      });
    }

    // Cancel in Stripe if configured
    if (STRIPE_CONFIGURED && subscription.stripe_subscription_id) {
      if (immediate) {
        await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
      } else {
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true
        });
      }
    }

    // Update local subscription
    await subscriptionService.cancelSubscription(req.user.id, reason, immediate);

    res.json({
      success: true,
      message: immediate
        ? 'Subscription cancelled immediately'
        : 'Subscription will be cancelled at the end of the billing period'
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription'
    });
  }
});

/**
 * POST /api/subscription/webhook
 * Stripe webhook handler
 *
 * NOTE: This route must use raw body parser.
 * Configure in server.js: app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }))
 */
router.post('/webhook', async (req, res) => {
  if (!STRIPE_CONFIGURED) {
    return res.status(503).send('Webhook not configured');
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = await getDatabaseAsync();
  const subscriptionService = getSubscriptionService(db);

  // Check idempotency
  if (subscriptionService.isEventProcessed(event.id)) {
    console.log(`Webhook ${event.id} already processed, skipping`);
    return res.json({ received: true, skipped: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutComplete(subscriptionService, session);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscriptionService, subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscriptionService, subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await handlePaymentFailed(subscriptionService, invoice);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await handlePaymentSucceeded(subscriptionService, invoice);
        break;
      }

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    // Log event for audit trail
    const userId = extractUserIdFromEvent(event);
    if (userId) {
      subscriptionService.logEvent(userId, `webhook_${event.type}`, {
        stripeEventId: event.id,
        metadata: { eventType: event.type }
      });
    }
  } catch (error) {
    console.error(`Error handling webhook ${event.type}:`, error);
    // Still return 200 to prevent Stripe retries for handled errors
  }

  res.json({ received: true });
});

// Webhook handler helpers

async function handleCheckoutComplete(subscriptionService, session) {
  const userId = session.metadata?.userId;
  const tierName = session.metadata?.tierName;
  const billingPeriod = session.metadata?.billingPeriod || 'monthly';

  if (!userId || !tierName) {
    console.error('Missing userId or tierName in checkout session metadata');
    return;
  }

  // Get tier ID
  const tier = subscriptionService.getTierByName(tierName);
  if (!tier) {
    console.error(`Tier not found: ${tierName}`);
    return;
  }

  // Get subscription details from Stripe
  const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);

  // Update user subscription
  subscriptionService.createOrUpdateSubscription(userId, {
    tierId: tier.id,
    status: 'active',
    billingPeriod,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: session.subscription,
    currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
    currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000).toISOString()
  });

  // Log upgrade event
  subscriptionService.logEvent(userId, 'upgraded', {
    newTierId: tier.id,
    metadata: { checkoutSessionId: session.id }
  });

  console.log(`User ${userId} upgraded to ${tierName}`);
}

async function handleSubscriptionUpdate(subscriptionService, stripeSubscription) {
  const userId = stripeSubscription.metadata?.userId;
  if (!userId) return;

  const tierName = stripeSubscription.metadata?.tierName;
  const tier = tierName ? subscriptionService.getTierByName(tierName) : null;

  subscriptionService.createOrUpdateSubscription(userId, {
    tierId: tier?.id,
    status: stripeSubscription.status,
    currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
    currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000).toISOString()
  });
}

async function handleSubscriptionDeleted(subscriptionService, stripeSubscription) {
  const userId = stripeSubscription.metadata?.userId;
  if (!userId) return;

  subscriptionService.downgradeToFree(userId, 'Subscription cancelled');
  console.log(`User ${userId} downgraded to free tier`);
}

async function handlePaymentFailed(subscriptionService, invoice) {
  const userId = invoice.subscription_details?.metadata?.userId;
  if (!userId) return;

  // Update status to past_due
  const db = subscriptionService.db;
  const { getDatabaseAsync } = require('../../database');
  const database = await getDatabaseAsync();

  await database.query(`
    UPDATE user_subscriptions
    SET status = 'past_due', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `, [userId]);

  subscriptionService.invalidateUserCache(userId);

  // Log event
  subscriptionService.logEvent(userId, 'payment_failed', {
    metadata: { invoiceId: invoice.id }
  });

  console.log(`Payment failed for user ${userId}`);
}

async function handlePaymentSucceeded(subscriptionService, invoice) {
  const userId = invoice.subscription_details?.metadata?.userId;
  if (!userId) return;

  // Clear past_due status
  const { getDatabaseAsync } = require('../../database');
  const database = await getDatabaseAsync();

  await database.query(`
    UPDATE user_subscriptions
    SET status = 'active', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND status = 'past_due'
  `, [userId]);

  subscriptionService.invalidateUserCache(userId);
}

function extractUserIdFromEvent(event) {
  const data = event.data?.object;
  return data?.metadata?.userId || data?.subscription_details?.metadata?.userId;
}

module.exports = router;
