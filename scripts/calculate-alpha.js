const db = require('../src/database').db;

const SPY_COMPANY_ID = 14353;

// Pre-calculate all SPY 1-year returns and store in a map for fast lookup
console.log('Pre-calculating SPY returns...');

const spyPrices = db.prepare(`
  SELECT date, close FROM daily_prices
  WHERE company_id = ?
  ORDER BY date
`).all(SPY_COMPANY_ID);

// Create a map of date -> SPY 1-year return
const spyReturns = new Map();

for (let i = 0; i < spyPrices.length; i++) {
  const entryDate = spyPrices[i].date;
  const entryPrice = spyPrices[i].close;

  // Find exit price ~365 days later
  const targetDate = new Date(entryDate);
  targetDate.setDate(targetDate.getDate() + 365);
  const targetDateStr = targetDate.toISOString().split('T')[0];

  // Find first price on or after target date
  let exitPrice = null;
  for (let j = i + 1; j < spyPrices.length; j++) {
    if (spyPrices[j].date >= targetDateStr) {
      exitPrice = spyPrices[j].close;
      break;
    }
  }

  if (exitPrice && entryPrice > 0) {
    const spyReturn = ((exitPrice - entryPrice) / entryPrice) * 100;
    spyReturns.set(entryDate, spyReturn);
  }
}

console.log(`SPY returns calculated for ${spyReturns.size} dates`);

// Now process investment decisions in batches
const getDecisions = db.prepare(`
  SELECT id, decision_date, return_1y
  FROM investment_decisions
  WHERE return_1y IS NOT NULL
    AND alpha_1y IS NULL
  LIMIT ?
`);

const updateAlpha = db.prepare(`
  UPDATE investment_decisions SET alpha_1y = ? WHERE id = ?
`);

let totalUpdated = 0;
const batchSize = 50000;

while (true) {
  const decisions = getDecisions.all(batchSize);

  if (decisions.length === 0) {
    console.log('\nNo more decisions to process.');
    break;
  }

  let updated = 0;
  const batchUpdate = db.transaction(() => {
    for (const d of decisions) {
      // Find SPY return for closest date on or before decision date
      let spyReturn = spyReturns.get(d.decision_date);

      if (!spyReturn) {
        // Find closest earlier date
        const dates = Array.from(spyReturns.keys()).filter(date => date <= d.decision_date);
        if (dates.length > 0) {
          const closestDate = dates[dates.length - 1];
          spyReturn = spyReturns.get(closestDate);
        }
      }

      if (spyReturn !== undefined) {
        const alpha = d.return_1y - spyReturn;
        updateAlpha.run(alpha, d.id);
        updated++;
      }
    }
  });
  batchUpdate();

  totalUpdated += updated;
  console.log('Batch done:', updated, '| Total:', totalUpdated);
}

const total = db.prepare('SELECT COUNT(*) as c FROM investment_decisions WHERE alpha_1y IS NOT NULL').get();
console.log('\nFinal total with alpha:', total.c);
