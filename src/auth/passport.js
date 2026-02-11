// src/auth/passport.js
// Passport.js configuration for Google OAuth

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const { getDatabaseAsync, getDatabaseSync, isUsingPostgres } = require('../lib/db');

function configurePassport() {
  // Serialize user into session
  passport.serializeUser((user, done) => {
    // For dev-admin, store the whole user object (no database lookup needed)
    if (user.isDevAdmin) {
      return done(null, { devAdmin: true, user });
    }
    // For regular users, just store the ID
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (data, done) => {
    try {
      // Handle dev-admin sessions (bypass database lookup)
      if (data && typeof data === 'object' && data.devAdmin) {
        return done(null, data.user);
      }

      const userId = data;

      // PostgreSQL mode - use async query
      if (isUsingPostgres()) {
        const dbClient = await getDatabaseAsync();
        const result = await dbClient.query('SELECT * FROM users WHERE id = $1', [userId]);
        const user = result.rows[0] || null;
        return done(null, user);
      }

      // SQLite mode - use synchronous query
      const sqliteDb = getDatabaseSync();
      const user = sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      done(null, user || null);
    } catch (error) {
      console.error('[Passport] deserializeUser error:', error);
      done(error, null);
    }
  });

  // Google OAuth Strategy
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/google/callback`,
      scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // PostgreSQL mode - use async queries
        if (isUsingPostgres()) {
          const database = await getDatabaseAsync();

          // Check if user already exists
          let result = await database.query(
            'SELECT * FROM users WHERE google_id = $1',
            [profile.id]
          );
          let user = result.rows[0];

          if (user) {
            // Update last login and profile info
            await database.query(`
              UPDATE users
              SET last_login_at = CURRENT_TIMESTAMP,
                  name = $1,
                  picture = $2,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $3
            `, [profile.displayName, profile.photos?.[0]?.value, user.id]);

            // Refresh user data
            result = await database.query('SELECT * FROM users WHERE id = $1', [user.id]);
            user = result.rows[0];
          } else {
            // Create new user
            const userId = crypto.randomUUID();
            await database.query(`
              INSERT INTO users (id, google_id, email, name, picture, last_login_at)
              VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            `, [
              userId,
              profile.id,
              profile.emails[0].value,
              profile.displayName,
              profile.photos?.[0]?.value
            ]);

            result = await database.query('SELECT * FROM users WHERE id = $1', [userId]);
            user = result.rows[0];

            console.log(`[OAuth] New user created: ${user.email}`);
          }

          return done(null, user);
        }

        // SQLite mode - use synchronous queries
        const sqliteDb = getDatabaseSync();
        // Check if user already exists
        let user = sqliteDb.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.id);

        if (user) {
          // Update last login and profile info
          sqliteDb.prepare(`
            UPDATE users
            SET last_login_at = CURRENT_TIMESTAMP,
                name = ?,
                picture = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(profile.displayName, profile.photos?.[0]?.value, user.id);

          // Refresh user data
          user = sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        } else {
          // Create new user
          const userId = crypto.randomUUID();
          sqliteDb.prepare(`
            INSERT INTO users (id, google_id, email, name, picture, last_login_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(
            userId,
            profile.id,
            profile.emails[0].value,
            profile.displayName,
            profile.photos?.[0]?.value
          );

          user = sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(userId);

          console.log(`[OAuth] New user created: ${user.email}`);
        }

        return done(null, user);
      } catch (error) {
        console.error('[Passport] Google Strategy error:', error);
        return done(error, null);
      }
    }
  ));

  return passport;
}

module.exports = { configurePassport };
