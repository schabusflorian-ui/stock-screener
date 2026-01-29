const db = require('../src/database').db;

const getEntryPrice = db.prepare(`
  SELECT close FROM daily_prices
  WHERE company_id = ? AND date <= ?
  ORDER BY date DESC LIMIT 1
`);

const getExitPrice = db.prepare(`
  SELECT close FROM daily_prices
  WHERE company_id = ? AND date >= date(?, '+365 days')
  ORDER BY date ASC LIMIT 1
`);

const updateReturn = db.prepare(`
  UPDATE investment_decisions SET return_1y = ? WHERE id = ?
`);

let totalUpdated = 0;
const batchSize = 50000;

const getDecisions = db.prepare(`
  SELECT id, company_id, decision_date
  FROM investment_decisions
  WHERE company_id IS NOT NULL
    AND return_1y IS NULL
    AND decision_date < date('now', '-365 days')
  LIMIT ?
`);

while (true) {
  const decisions = getDecisions.all(batchSize);

  if (decisions.length === 0) {
    console.log('\nNo more decisions to process.');
    break;
  }

  let updated = 0;
  const batchUpdate = db.transaction(() => {
    for (const d of decisions) {
      const entry = getEntryPrice.get(d.company_id, d.decision_date);
      const exit = getExitPrice.get(d.company_id, d.decision_date);
      if (entry && exit && entry.close > 0) {
        updateReturn.run(((exit.close - entry.close) / entry.close) * 100, d.id);
        updated++;
      }
    }
  });
  batchUpdate();

  totalUpdated += updated;
  console.log('Batch done:', updated, '| Total:', totalUpdated);
}

const total = db.prepare('SELECT COUNT(*) as c FROM investment_decisions WHERE return_1y IS NOT NULL').get();
console.log('\nFinal total with returns:', total.c);
