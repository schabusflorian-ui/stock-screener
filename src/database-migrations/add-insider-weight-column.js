// src/database-migrations/add-insider-weight-column.js
// Migration: Add weight_insider column to strategy_configs table

const { getDb } = require('./_migrationHelper');

const db = getDb();

console.log('🔧 Adding weight_insider column to strategy_configs...\n');

try {
  // Check if column already exists
  const tableInfo = db.prepare('PRAGMA table_info(strategy_configs)').all();
  const hasInsiderWeight = tableInfo.some(col => col.name === 'weight_insider');

  if (hasInsiderWeight) {
    console.log('✅ Column weight_insider already exists - no migration needed');
  } else {
    // Add the column with default value
    db.exec(`
      ALTER TABLE strategy_configs
      ADD COLUMN weight_insider INTEGER DEFAULT 10;
    `);

    console.log('✅ Added weight_insider column with default value 10');

    // Update existing strategies to have balanced weights
    // We'll reduce other weights slightly to accommodate insider weight
    const strategies = db.prepare('SELECT id, name, weight_technical, weight_fundamental, weight_sentiment, weight_momentum, weight_value, weight_quality FROM strategy_configs').all();

    console.log(`\n📊 Updating ${strategies.length} existing strategies...\n`);

    for (const strategy of strategies) {
      // Calculate current total (should be 100 before insider)
      const currentTotal = (strategy.weight_technical || 0) +
                          (strategy.weight_fundamental || 0) +
                          (strategy.weight_sentiment || 0) +
                          (strategy.weight_momentum || 0) +
                          (strategy.weight_value || 0) +
                          (strategy.weight_quality || 0);

      // If total is 100, scale down to 90 to make room for 10% insider
      if (currentTotal === 100) {
        const scale = 90 / 100;
        db.prepare(`
          UPDATE strategy_configs
          SET
            weight_technical = ROUND(weight_technical * ?),
            weight_fundamental = ROUND(weight_fundamental * ?),
            weight_sentiment = ROUND(weight_sentiment * ?),
            weight_momentum = ROUND(weight_momentum * ?),
            weight_value = ROUND(weight_value * ?),
            weight_quality = ROUND(weight_quality * ?),
            weight_insider = 10,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(scale, scale, scale, scale, scale, scale, strategy.id);

        console.log(`   ✅ ${strategy.name}: Scaled weights to 90% + 10% insider`);
      } else {
        // Just set insider to 10, leave others as-is
        db.prepare(`
          UPDATE strategy_configs
          SET weight_insider = 10, updated_at = datetime('now')
          WHERE id = ?
        `).run(strategy.id);

        console.log(`   ✅ ${strategy.name}: Added 10% insider weight`);
      }
    }
  }

  // Update presets to include insider weight
  console.log('\n📋 Updating strategy presets to include insider weight...\n');

  const presets = db.prepare('SELECT * FROM strategy_presets').all();

  for (const preset of presets) {
    const config = JSON.parse(preset.config_json);

    // Only update if weight_insider is missing
    if (config.weight_insider === undefined) {
      // Adjust existing weights to make room for insider
      const oldWeights = {
        technical: config.weight_technical || 0,
        fundamental: config.weight_fundamental || 0,
        sentiment: config.weight_sentiment || 0,
        momentum: config.weight_momentum || 0,
        value: config.weight_value || 0,
        quality: config.weight_quality || 0
      };

      const total = Object.values(oldWeights).reduce((a, b) => a + b, 0);

      if (total > 0) {
        // Scale down to 90% and add 10% insider
        const scale = 90 / total;
        config.weight_technical = Math.round((oldWeights.technical || 0) * scale);
        config.weight_fundamental = Math.round((oldWeights.fundamental || 0) * scale);
        config.weight_sentiment = Math.round((oldWeights.sentiment || 0) * scale);
        config.weight_momentum = Math.round((oldWeights.momentum || 0) * scale);
        config.weight_value = Math.round((oldWeights.value || 0) * scale);
        config.weight_quality = Math.round((oldWeights.quality || 0) * scale);
        config.weight_insider = 10;
      }

      db.prepare(`
        UPDATE strategy_presets
        SET config_json = ?
        WHERE id = ?
      `).run(JSON.stringify(config), preset.id);

      console.log(`   ✅ ${preset.name}: Added 10% insider weight to preset`);
    }
  }

  console.log('\n✅ Migration complete!');
  console.log('\n📊 Summary:');
  console.log('   - Added weight_insider column to strategy_configs');

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
}
