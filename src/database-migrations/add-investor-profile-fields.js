/**
 * Migration: Add investor profile fields
 *
 * Adds richer profile information to famous_investors table for better
 * investor overview sections.
 *
 * New fields:
 *   - inception_year: Year the fund was founded
 *   - headquarters: Fund location (city, state/country)
 *   - fund_type: Type of investment vehicle (hedge fund, family office, etc.)
 *   - investment_philosophy: Longer text about investment approach
 *   - notable_achievements: Famous trades or milestones
 *   - aum_billions: Assets under management (for display, not from 13F)
 */

const db = require('../database').db;

// Key investor profile data to seed
const INVESTOR_PROFILES = {
  'Warren Buffett': {
    fund_type: 'Holding Company',
    inception_year: 1965,
    headquarters: 'Omaha, Nebraska',
    investment_philosophy: 'Value investing focused on wonderful companies at fair prices. Emphasizes durable competitive advantages (moats), quality management, and long-term holding periods. Famous for "be fearful when others are greedy, and greedy when others are fearful."',
    notable_achievements: 'Built Berkshire Hathaway from a textile mill to one of the world\'s largest conglomerates. Notable investments include Coca-Cola, American Express, Apple, and GEICO.',
    aum_billions: 900
  },
  'Bill Ackman': {
    fund_type: 'Hedge Fund',
    inception_year: 2004,
    headquarters: 'New York, NY',
    investment_philosophy: 'Activist value investing with concentrated positions. Takes large stakes in undervalued companies and actively works with management to unlock value. Known for bold, high-conviction bets.',
    notable_achievements: 'Famous 2020 COVID hedge generated $2.6B from a $27M bet. Successful investments include Chipotle turnaround and Hilton Hotels.',
    aum_billions: 18
  },
  'Carl Icahn': {
    fund_type: 'Holding Company',
    inception_year: 1987,
    headquarters: 'New York, NY',
    investment_philosophy: 'Corporate raider turned activist investor. Targets undervalued companies where management changes or restructuring can unlock shareholder value. Known for aggressive proxy fights.',
    notable_achievements: 'Pioneer of shareholder activism. Notable campaigns include TWA, Texaco, Apple, and eBay. Forbes estimated peak net worth at $24 billion.',
    aum_billions: 15
  },
  'Ray Dalio': {
    fund_type: 'Hedge Fund',
    inception_year: 1975,
    headquarters: 'Westport, Connecticut',
    investment_philosophy: 'Systematic, principles-based approach combining fundamental and quantitative analysis. Pioneered the "All Weather" strategy for risk parity portfolio construction.',
    notable_achievements: 'Built Bridgewater Associates into the world\'s largest hedge fund. Author of "Principles" and known for radical transparency culture.',
    aum_billions: 124
  },
  'David Tepper': {
    fund_type: 'Hedge Fund',
    inception_year: 1993,
    headquarters: 'Miami, Florida',
    investment_philosophy: 'Distressed debt and equity investing with macro overlay. Known for contrarian bets on beaten-down financials and high-yield opportunities during market dislocations.',
    notable_achievements: 'Made billions betting on bank stocks during 2009 financial crisis. Owner of Carolina Panthers NFL team.',
    aum_billions: 17
  },
  'George Soros': {
    fund_type: 'Family Office',
    inception_year: 1969,
    headquarters: 'New York, NY',
    investment_philosophy: 'Global macro investing based on reflexivity theory. Takes large directional bets on currencies, commodities, and bonds based on macroeconomic trends and market psychology.',
    notable_achievements: 'Famous for "breaking the Bank of England" in 1992, earning $1B by shorting the British pound. Founded Open Society Foundations philanthropy.',
    aum_billions: 28
  },
  'Stanley Druckenmiller': {
    fund_type: 'Family Office',
    inception_year: 1981,
    headquarters: 'New York, NY',
    investment_philosophy: 'Top-down macro approach combined with concentrated equity positions. Focuses on identifying major economic trends and positioning aggressively when conviction is high.',
    notable_achievements: 'Managed money for George Soros during the Bank of England trade. Never had a down year at Duquesne Capital from 1981-2010.',
    aum_billions: 4
  },
  'Seth Klarman': {
    fund_type: 'Hedge Fund',
    inception_year: 1982,
    headquarters: 'Boston, Massachusetts',
    investment_philosophy: 'Deep value investing with emphasis on margin of safety. Willing to hold large cash positions when opportunities are scarce. Focuses on complex, overlooked situations.',
    notable_achievements: 'Author of the rare investing classic "Margin of Safety." Baupost Group known for consistent returns with low volatility.',
    aum_billions: 27
  },
  'Michael Burry': {
    fund_type: 'Hedge Fund',
    inception_year: 2000,
    headquarters: 'Cupertino, California',
    investment_philosophy: 'Deep value investing with focus on overlooked or misunderstood situations. Known for independent, contrarian analysis and willingness to make bold directional bets.',
    notable_achievements: 'Famously predicted and profited from the 2008 subprime mortgage crisis (depicted in "The Big Short"). Early investor in GameStop.',
    aum_billions: 0.3
  },
  'Daniel Loeb': {
    fund_type: 'Hedge Fund',
    inception_year: 1995,
    headquarters: 'New York, NY',
    investment_philosophy: 'Event-driven activist investing. Targets companies with catalysts like spin-offs, mergers, or management changes. Known for pointed letters to CEOs.',
    notable_achievements: 'Third Point known for successful campaigns at Yahoo, Sony, and Campbell Soup. Pioneer of shareholder activism in Asia.',
    aum_billions: 13
  },
  'Chase Coleman': {
    fund_type: 'Hedge Fund',
    inception_year: 2001,
    headquarters: 'New York, NY',
    investment_philosophy: 'Technology-focused growth investing with long-term horizon. Concentrates on high-quality, high-growth technology companies with durable competitive advantages.',
    notable_achievements: 'Tiger Global became one of the most successful tech-focused hedge funds. Early investor in Facebook, LinkedIn, and many unicorn startups.',
    aum_billions: 35
  },
  'Philippe Laffont': {
    fund_type: 'Hedge Fund',
    inception_year: 1999,
    headquarters: 'New York, NY',
    investment_philosophy: 'Technology and telecommunications focused with global perspective. Long/short strategy targeting technology leaders and disruptors.',
    notable_achievements: 'Coatue Management known for successful tech bets including Apple, Meta, and numerous venture investments in private tech companies.',
    aum_billions: 20
  },
  'David Einhorn': {
    fund_type: 'Hedge Fund',
    inception_year: 1996,
    headquarters: 'New York, NY',
    investment_philosophy: 'Value-oriented long/short equity with activist component. Known for thorough fundamental research and willingness to take public short positions.',
    notable_achievements: 'Famous short of Lehman Brothers before 2008 collapse. Author of "Fooling Some of the People All of the Time." Professional poker player.',
    aum_billions: 3
  },
  'Leon Cooperman': {
    fund_type: 'Family Office',
    inception_year: 1991,
    headquarters: 'Short Hills, New Jersey',
    investment_philosophy: 'Value investing with focus on overlooked mid-cap stocks. Combines fundamental analysis with understanding of market sentiment and technicals.',
    notable_achievements: 'Former chairman of Goldman Sachs Asset Management. Known philanthropist who signed the Giving Pledge.',
    aum_billions: 3
  },
  'Ken Griffin': {
    fund_type: 'Hedge Fund',
    inception_year: 1990,
    headquarters: 'Miami, Florida',
    investment_philosophy: 'Multi-strategy approach combining quantitative and fundamental techniques across asset classes. Pioneer of market making and systematic trading.',
    notable_achievements: 'Built Citadel into one of the largest and most successful hedge funds. Citadel Securities became largest market maker in US equities.',
    aum_billions: 65
  }
};

function runMigration() {
  console.log('Adding investor profile fields...\n');

  // Add new columns
  const newColumns = [
    { name: 'fund_type', type: 'TEXT' },
    { name: 'inception_year', type: 'INTEGER' },
    { name: 'headquarters', type: 'TEXT' },
    { name: 'investment_philosophy', type: 'TEXT' },
    { name: 'notable_achievements', type: 'TEXT' },
    { name: 'aum_billions', type: 'REAL' }
  ];

  for (const col of newColumns) {
    try {
      db.prepare(`ALTER TABLE famous_investors ADD COLUMN ${col.name} ${col.type}`).run();
      console.log(`  Added column: ${col.name}`);
    } catch (err) {
      if (err.message.includes('duplicate column name')) {
        console.log(`  Column ${col.name} already exists`);
      } else {
        throw err;
      }
    }
  }

  console.log('\nSeeding investor profile data...\n');

  // Update profiles for known investors
  const updateStmt = db.prepare(`
    UPDATE famous_investors SET
      fund_type = COALESCE(?, fund_type),
      inception_year = COALESCE(?, inception_year),
      headquarters = COALESCE(?, headquarters),
      investment_philosophy = COALESCE(?, investment_philosophy),
      notable_achievements = COALESCE(?, notable_achievements),
      aum_billions = COALESCE(?, aum_billions)
    WHERE name = ?
  `);

  let updated = 0;
  for (const [name, profile] of Object.entries(INVESTOR_PROFILES)) {
    const result = updateStmt.run(
      profile.fund_type,
      profile.inception_year,
      profile.headquarters,
      profile.investment_philosophy,
      profile.notable_achievements,
      profile.aum_billions,
      name
    );

    if (result.changes > 0) {
      console.log(`  Updated: ${name}`);
      updated++;
    }
  }

  console.log(`\nUpdated ${updated} investor profiles`);

  // Show results
  const profiles = db.prepare(`
    SELECT name, fund_type, inception_year, headquarters
    FROM famous_investors
    WHERE fund_type IS NOT NULL
    ORDER BY display_order
    LIMIT 15
  `).all();

  console.log('\nInvestor profiles updated:');
  for (const p of profiles) {
    console.log(`  ${p.name}: ${p.fund_type} (${p.inception_year || 'N/A'}) - ${p.headquarters || 'N/A'}`);
  }

  return updated;
}

// Run if called directly
if (require.main === module) {
  try {
    const count = runMigration();
    console.log(`\nMigration complete: ${count} profiles updated`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

module.exports = { runMigration, INVESTOR_PROFILES };
