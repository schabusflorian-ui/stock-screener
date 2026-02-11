#!/usr/bin/env node
/**
 * Set a user's subscription tier by email (e.g. give ultra).
 * Usage: node scripts/set-user-tier-by-email.js <email> <tier>
 * Example: node scripts/set-user-tier-by-email.js schabus.florian@gmail.com ultra
 *
 * Requires: User must exist (sign in at least once so users row exists).
 * Works with both SQLite and PostgreSQL.
 */

require('dotenv').config();
const { getDatabaseAsync } = require('../src/lib/db');
const { getSubscriptionService } = require('../src/services/subscriptionService');

const email = process.argv[2]?.trim().toLowerCase();
const tierName = (process.argv[3] || 'ultra').toLowerCase();

if (!email) {
  console.error('Usage: node scripts/set-user-tier-by-email.js <email> [tier]');
  console.error('Example: node scripts/set-user-tier-by-email.js schabus.florian@gmail.com ultra');
  process.exit(1);
}

const validTiers = ['free', 'pro', 'ultra'];
if (!validTiers.includes(tierName)) {
  console.error('Tier must be one of:', validTiers.join(', '));
  process.exit(1);
}

async function main() {
  const database = await getDatabaseAsync();

  // Resolve user by email (case-insensitive)
  const userResult = await database.query(
    'SELECT id, email, name FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  const user = userResult.rows[0];

  if (!user) {
    console.error(`No user found with email: ${email}`);
    console.error('The user must sign in at least once (e.g. via Google OAuth) so their account exists.');
    process.exit(1);
  }

  // Get tier id by name
  const tierResult = await database.query(
    'SELECT id, name, display_name FROM subscription_tiers WHERE name = $1 AND is_active = 1',
    [tierName]
  );
  const tier = tierResult.rows[0];

  if (!tier) {
    console.error(`Tier "${tierName}" not found in subscription_tiers. Run subscription migration first.`);
    process.exit(1);
  }

  const subscriptionService = getSubscriptionService();
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);

  await subscriptionService.createOrUpdateSubscription(user.id, {
    tierId: tier.id,
    status: 'active',
    billingPeriod: 'monthly',
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString()
  });

  console.log(`Done. ${user.email} (${user.name || user.id}) is now on **${tier.display_name}** (${tier.name}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
