const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();
/**
 * Database Migration: Migrate Existing Users to Subscription System
 *
 * This script:
 * 1. Creates subscription records for all existing users
 * 2. Grants 90-day grandfathered access with all features unlocked
 * 3. Sets up usage tracking for each user
 * 4. Logs the migration event for each user
 *
 * IMPORTANT: Run this AFTER add-subscription-tables.js migration
 */

const { v4: uuidv4 } = require('uuid');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/stocks.db');

// 90 days from now
const GRANDFATHERED_DAYS = 90;

function run() {
  const db = getDb();

  console.log('Starting existing users to subscription migration...');
  console.log(`Grandfathering period: ${GRANDFATHERED_DAYS} days`);

  db.exec('BEGIN TRANSACTION');

  try {
    // 1. Get the free tier ID
    const freeTier = db.prepare('SELECT id FROM subscription_tiers WHERE name = ?').get('free');
    if (!freeTier) {
      throw new Error('Free tier not found. Run add-subscription-tables.js first.');
    }
    console.log(`  Free tier ID: ${freeTier.id}`);

    // 2. Get all users without subscriptions
    const usersWithoutSub = db.prepare(`
      SELECT u.id, u.email, u.name, u.created_at
      FROM users u
      LEFT JOIN user_subscriptions us ON u.id = us.user_id
      WHERE us.id IS NULL
    `).all();

    console.log(`  Found ${usersWithoutSub.length} users without subscriptions`);

    if (usersWithoutSub.length === 0) {
      console.log('  No users to migrate.');
      db.exec('COMMIT');
      return;
    }

    // 3. Calculate grandfathered expiration date
    const now = new Date();
    const grandfatheredExpiresAt = new Date(now.getTime() + GRANDFATHERED_DAYS * 24 * 60 * 60 * 1000);
    const farFuture = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years

    console.log(`  Grandfathered expires at: ${grandfatheredExpiresAt.toISOString()}`);

    // 4. Prepare statements
    const insertSubscription = db.prepare(`
      INSERT INTO user_subscriptions (
        user_id, tier_id, status, billing_period,
        current_period_start, current_period_end,
        grandfathered_from, grandfathered_expires_at
      ) VALUES (?, ?, 'active', 'monthly', ?, ?, 'early_adopter', ?)
    `);

    const insertEvent = db.prepare(`
      INSERT INTO subscription_events (
        user_id, event_type, new_tier_id, reason, metadata
      ) VALUES (?, 'created', ?, ?, ?)
    `);

    // 5. Migrate each user
    let successCount = 0;
    let errorCount = 0;

    for (const user of usersWithoutSub) {
      try {
        // Create subscription record
        insertSubscription.run(
          user.id,
          freeTier.id,
          now.toISOString(),
          farFuture.toISOString(), // Period end is far future for grandfathered
          grandfatheredExpiresAt.toISOString()
        );

        // Log the migration event
        insertEvent.run(
          user.id,
          freeTier.id,
          'Migration from legacy system - early adopter (90-day full access)',
          JSON.stringify({
            migratedAt: now.toISOString(),
            grandfatheredDays: GRANDFATHERED_DAYS,
            grandfatheredExpiresAt: grandfatheredExpiresAt.toISOString(),
            userCreatedAt: user.created_at
          })
        );

        successCount++;
      } catch (error) {
        console.error(`  Error migrating user ${user.id} (${user.email}):`, error.message);
        errorCount++;
      }
    }

    db.exec('COMMIT');

    console.log('');
    console.log('Migration completed:');
    console.log(`  Successfully migrated: ${successCount} users`);
    console.log(`  Errors: ${errorCount} users`);
    console.log('');
    console.log('All existing users now have:');
    console.log('  - Free tier subscription record');
    console.log(`  - 90-day grandfathered access (expires: ${grandfatheredExpiresAt.toLocaleDateString()})`);
    console.log('  - Full feature access during grandfathering period');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
  }
}

/**
 * Check migration status
 */
function checkStatus() {
  const db = getDb();

  try {
    // Count users with grandfathered status
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_users,
        COUNT(CASE WHEN us.grandfathered_from IS NOT NULL THEN 1 END) as grandfathered_users,
        COUNT(CASE WHEN us.grandfathered_expires_at > datetime('now') THEN 1 END) as active_grandfathered,
        COUNT(CASE WHEN us.grandfathered_expires_at <= datetime('now') THEN 1 END) as expired_grandfathered
      FROM users u
      LEFT JOIN user_subscriptions us ON u.id = us.user_id
    `).get();

    const usersWithoutSub = db.prepare(`
      SELECT COUNT(*) as count
      FROM users u
      LEFT JOIN user_subscriptions us ON u.id = us.user_id
      WHERE us.id IS NULL
    `).get();

    console.log('Subscription Migration Status:');
    console.log('------------------------------');
    console.log(`Total users: ${stats.total_users}`);
    console.log(`Users without subscription: ${usersWithoutSub.count}`);
    console.log(`Grandfathered users: ${stats.grandfathered_users}`);
    console.log(`  - Active grandfathering: ${stats.active_grandfathered}`);
    console.log(`  - Expired grandfathering: ${stats.expired_grandfathered}`);

    // Show upcoming expirations
    const upcoming = db.prepare(`
      SELECT u.email, us.grandfathered_expires_at
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      WHERE us.grandfathered_from IS NOT NULL
        AND us.grandfathered_expires_at > datetime('now')
        AND us.grandfathered_expires_at <= datetime('now', '+30 days')
      ORDER BY us.grandfathered_expires_at ASC
      LIMIT 10
    `).all();

    if (upcoming.length > 0) {
      console.log('');
      console.log('Users expiring in next 30 days:');
      for (const user of upcoming) {
        const expiresAt = new Date(user.grandfathered_expires_at);
        const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
        console.log(`  - ${user.email}: ${daysLeft} days left (${expiresAt.toLocaleDateString()})`);
      }
    }

  } finally {
  }
}

/**
 * Process expired grandfathering (run this daily via cron)
 * Transitions users from grandfathered to regular free tier
 */
function processExpiredGrandfathering() {
  const db = getDb();

  console.log('Processing expired grandfathering...');

  db.exec('BEGIN TRANSACTION');

  try {
    // Find users with expired grandfathering that haven't been processed
    const expiredUsers = db.prepare(`
      SELECT us.user_id, us.grandfathered_from, us.grandfathered_expires_at, u.email
      FROM user_subscriptions us
      JOIN users u ON us.user_id = u.id
      WHERE us.grandfathered_from IS NOT NULL
        AND us.grandfathered_expires_at <= datetime('now')
        AND us.status = 'active'
        AND us.stripe_subscription_id IS NULL
    `).all();

    console.log(`  Found ${expiredUsers.length} users with expired grandfathering`);

    const freeTier = db.prepare('SELECT id FROM subscription_tiers WHERE name = ?').get('free');

    const updateSubscription = db.prepare(`
      UPDATE user_subscriptions
      SET tier_id = ?,
          current_period_start = datetime('now'),
          current_period_end = datetime('now', '+1 month'),
          updated_at = datetime('now')
      WHERE user_id = ?
    `);

    const insertEvent = db.prepare(`
      INSERT INTO subscription_events (user_id, event_type, previous_tier_id, new_tier_id, reason)
      VALUES (?, 'grandfathering_expired', ?, ?, 'Grandfathering period ended - transitioned to free tier')
    `);

    for (const user of expiredUsers) {
      updateSubscription.run(freeTier.id, user.user_id);
      insertEvent.run(user.user_id, freeTier.id, freeTier.id);
      console.log(`  Transitioned ${user.email} to free tier`);
    }

    db.exec('COMMIT');
    console.log(`Processed ${expiredUsers.length} expired grandfathering records`);

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Processing failed:', error);
    throw error;
  } finally {
  }
}

// CLI interface
const command = process.argv[2];

switch (command) {
  case 'run':
  case undefined:
    run();
    break;
  case 'status':
    checkStatus();
    break;
  case 'process-expired':
    processExpiredGrandfathering();
    break;
  default:
    console.log('Usage:');
    console.log('  node migrate-existing-users-to-subscription.js run           - Run migration');
    console.log('  node migrate-existing-users-to-subscription.js status        - Check status');
    console.log('  node migrate-existing-users-to-subscription.js process-expired - Process expired grandfathering');
}

module.exports = { run, checkStatus, processExpiredGrandfathering };
