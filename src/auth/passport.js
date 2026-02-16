// src/auth/passport.js
// Passport.js configuration for Google OAuth

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const { getDatabaseAsync } = require('../lib/db');

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

  // Deserialize user from session (async DB for both SQLite and Postgres)
  passport.deserializeUser(async (data, done) => {
    try {
      if (data && typeof data === 'object' && data.devAdmin) {
        return done(null, data.user);
      }
      const userId = data;
      const db = await getDatabaseAsync();
      const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = (result.rows && result.rows[0]) || null;
      done(null, user);
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
        const database = await getDatabaseAsync();

        let result = await database.query(
          'SELECT * FROM users WHERE google_id = $1',
          [profile.id]
        );
        let user = (result.rows && result.rows[0]) || null;

        if (user) {
          await database.query(`
            UPDATE users
            SET last_login_at = CURRENT_TIMESTAMP,
                name = $1,
                picture = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [profile.displayName, profile.photos?.[0]?.value, user.id]);

          result = await database.query('SELECT * FROM users WHERE id = $1', [user.id]);
          user = result.rows[0];
        } else {
          const userId = crypto.randomUUID();
          await database.query(`
            INSERT INTO users (id, google_id, email, name, picture, last_login_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          `, [
            userId,
            profile.id,
            profile.emails?.[0]?.value ?? '',
            profile.displayName ?? '',
            profile.photos?.[0]?.value ?? null
          ]);

          result = await database.query('SELECT * FROM users WHERE id = $1', [userId]);
          user = result.rows[0];
          console.log(`[OAuth] New user created: ${user?.email ?? userId}`);
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
