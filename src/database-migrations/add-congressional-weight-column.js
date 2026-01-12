// src/database-migrations/add-congressional-weight-column.js
// Migration: Add weight_congressional column to strategy_configs table

const Database = require('better-sqlite3');
const db = new Database('./data/stocks.db');

console.log('🏛️  Adding weight_congressional column to strategy_configs...\n');

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(strategy_configs)").all();
  const hasCongressionalWeight = tableInfo.some(col => col.name === 'weight_congressional');

  if (hasCongressionalWeight) {
    console.log('✅ Column weight_congressional already exists - no migration needed');
  } else {
    // Add the column with default value
    db.exec(`
      ALTER TABLE strategy_configs
      ADD COLUMN weight_congressional INTEGER DEFAULT 10;
    `);

    console.log('✅ Added weight_congressional column with default value 10');

    // Update existing strategies to rebalance weights
    const strategies = db.prepare('SELECT id, name FROM strategy_configs').all();

    console.log(`\n📊 Updating ${strategies.length} existing strategies...\n`);

    for (const strategy of strategies) {
      // Reduce other weights slightly to make room for 10% congressional
      // We'll scale existing weights down proportionally
      db.prepare(`
        UPDATE strategy_configs
        SET
          weight_technical = ROUND(weight_technical * 0.9),
          weight_fundamental = ROUND(weight_fundamental * 0.9),
          weight_sentiment = ROUND(weight_sentiment * 0.9),
          weight_momentum = ROUND(weight_momentum * 0.9),
          weight_value = ROUND(weight_value * 0.9),
          weight_quality = ROUND(weight_quality * 0.9),
          weight_insider = ROUND(weight_insider * 0.9),
          weight_congressional = 10,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(strategy.id);

      console.log(`   ✅ ${strategy.name}: Added 10% congressional weight`);
    }
  }

  // Update presets to include congressional weight
  console.log(`\n📋 Updating strategy presets to include congressional weight...\n`);

  const presets = db.prepare('SELECT * FROM strategy_presets').all();

  for (const preset of presets) {
    const config = JSON.parse(preset.config_json);

    // Only update if weight_congressional is missing
    if (config.weight_congressional === undefined) {
      // Scale down existing weights and add congressional
      const scale = 0.9;
      config.weight_technical = Math.round((config.weight_technical || 0) * scale);
      config.weight_fundamental = Math.round((config.weight_fundamental || 0) * scale);
      config.weight_sentiment = Math.round((config.weight_sentiment || 0) * scale);
      config.weight_momentum = Math.round((config.weight_momentum || 0) * scale);
      config.weight_value = Math.round((config.weight_value || 0) * scale);
      config.weight_quality = Math.round((config.weight_quality || 0) * scale);
      config.weight_insider = Math.round((config.weight_insider || 0) * scale);
      config.weight_congressional = 10;

      db.prepare(`
        UPDATE strategy_presets
        SET config_json = ?
        WHERE id = ?
      `).run(JSON.stringify(config), preset.id);

      console.log(`   ✅ ${preset.name}: Added 10% congressional weight to preset`);
    }
  }

  console.log('\n✅ Migration complete!');
  console.log('\n📊 Summary:');
  console.log(`   - Added weight_congressional column to strategy_configs`);
  console.log(`   - Congressional trades expected alpha: +6-10%`);

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
