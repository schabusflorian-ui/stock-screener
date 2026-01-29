// src/database-migrations/add-european-indices.js
const db = require('../database');

/**
 * Database Migration: Add European Stock Indices
 *
 * Adds major European and UK stock indices to enable:
 * - Geographic filtering
 * - Index-based screening
 * - EU/UK market coverage
 */

const EUROPEAN_INDICES = [
  // United Kingdom
  { code: 'FTSE', name: 'FTSE 100', country: 'GB', description: 'UK blue-chip index of 100 largest companies on LSE' },
  { code: 'FTMC', name: 'FTSE 250', country: 'GB', description: 'UK mid-cap index of 250 companies ranked 101-350' },
  { code: 'FTAS', name: 'FTSE All-Share', country: 'GB', description: 'UK broad market index covering 98% of market cap' },

  // Germany
  { code: 'DAX', name: 'DAX 40', country: 'DE', description: 'German blue-chip index of 40 largest companies on Frankfurt' },
  { code: 'MDAX', name: 'MDAX', country: 'DE', description: 'German mid-cap index of 50 companies below DAX' },
  { code: 'SDAX', name: 'SDAX', country: 'DE', description: 'German small-cap index of 70 companies below MDAX' },
  { code: 'TDAX', name: 'TecDAX', country: 'DE', description: 'German technology index of 30 largest tech companies' },

  // France
  { code: 'CAC', name: 'CAC 40', country: 'FR', description: 'French blue-chip index of 40 largest companies on Euronext Paris' },
  { code: 'SBF', name: 'SBF 120', country: 'FR', description: 'French broad index of 120 largest companies' },

  // Netherlands
  { code: 'AEX', name: 'AEX', country: 'NL', description: 'Dutch blue-chip index of 25 largest companies on Euronext Amsterdam' },
  { code: 'AMX', name: 'AMX', country: 'NL', description: 'Dutch mid-cap index of 25 companies below AEX' },

  // Switzerland
  { code: 'SMI', name: 'SMI', country: 'CH', description: 'Swiss blue-chip index of 20 largest companies on SIX' },
  { code: 'SPI', name: 'SPI', country: 'CH', description: 'Swiss Performance Index - broad market coverage' },

  // Spain
  { code: 'IBEX', name: 'IBEX 35', country: 'ES', description: 'Spanish blue-chip index of 35 largest companies' },

  // Italy
  { code: 'FTSEMIB', name: 'FTSE MIB', country: 'IT', description: 'Italian blue-chip index of 40 largest companies' },

  // Belgium
  { code: 'BEL', name: 'BEL 20', country: 'BE', description: 'Belgian blue-chip index of 20 largest companies' },

  // Sweden
  { code: 'OMX30', name: 'OMX Stockholm 30', country: 'SE', description: 'Swedish blue-chip index of 30 largest companies' },

  // Denmark
  { code: 'OMXC25', name: 'OMX Copenhagen 25', country: 'DK', description: 'Danish blue-chip index of 25 largest companies' },

  // Norway
  { code: 'OBX', name: 'OBX', country: 'NO', description: 'Norwegian blue-chip index of 25 most traded stocks' },

  // Finland
  { code: 'OMXH25', name: 'OMX Helsinki 25', country: 'FI', description: 'Finnish blue-chip index of 25 largest companies' },

  // Austria
  { code: 'ATX', name: 'ATX', country: 'AT', description: 'Austrian blue-chip index of 20 largest companies' },

  // Portugal
  { code: 'PSI', name: 'PSI 20', country: 'PT', description: 'Portuguese blue-chip index of 20 largest companies' },

  // Ireland
  { code: 'ISEQ', name: 'ISEQ 20', country: 'IE', description: 'Irish blue-chip index of 20 largest companies' },

  // Pan-European
  { code: 'SX5E', name: 'Euro Stoxx 50', country: 'EU', description: 'Eurozone blue-chip index of 50 largest companies' },
  { code: 'SXXP', name: 'Stoxx Europe 600', country: 'EU', description: 'Pan-European index of 600 large, mid, and small cap companies' },
  { code: 'SX7E', name: 'Euro Stoxx Banks', country: 'EU', description: 'Eurozone banking sector index' },
];

function runMigration() {
  console.log('\n📦 DATABASE MIGRATION: European Stock Indices\n');
  console.log('='.repeat(60));

  const database = db.getDatabase();

  try {
    database.exec('BEGIN TRANSACTION');

    // Insert indices
    console.log('\n1️⃣  Adding European stock indices...');

    const insertIndex = database.prepare(`
      INSERT OR IGNORE INTO stock_indexes (code, name, country, description)
      VALUES (?, ?, ?, ?)
    `);

    let added = 0;
    let skipped = 0;

    for (const index of EUROPEAN_INDICES) {
      const result = insertIndex.run(index.code, index.name, index.country, index.description);
      if (result.changes > 0) {
        console.log(`   ✓ Added ${index.code}: ${index.name} (${index.country})`);
        added++;
      } else {
        skipped++;
      }
    }

    // Also add to market_indices table if it exists (for price tracking)
    const marketIndicesExists = database.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='market_indices'
    `).get();

    if (marketIndicesExists) {
      console.log('\n2️⃣  Adding to market_indices table for price tracking...');

      const insertMarketIndex = database.prepare(`
        INSERT OR IGNORE INTO market_indices (symbol, name, short_name, index_type, is_active, display_order, description)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `);

      // Map to Yahoo Finance symbols where available
      const yahooSymbols = {
        'FTSE': '^FTSE',
        'DAX': '^GDAXI',
        'CAC': '^FCHI',
        'AEX': '^AEX',
        'SMI': '^SSMI',
        'IBEX': '^IBEX',
        'FTSEMIB': 'FTSEMIB.MI',
        'SX5E': '^STOXX50E',
        'SXXP': '^STOXX',
        'OMX30': '^OMX',
        'ATX': '^ATX',
      };

      let marketAdded = 0;
      let displayOrder = 100; // Start after US indices

      for (const index of EUROPEAN_INDICES) {
        const yahooSymbol = yahooSymbols[index.code];
        if (yahooSymbol) {
          try {
            insertMarketIndex.run(
              yahooSymbol,
              index.name,
              index.code,
              'equity',
              displayOrder++,
              `${index.description} (${index.country})`
            );
            marketAdded++;
          } catch (e) {
            // Already exists
          }
        }
      }

      console.log(`   ✓ Added ${marketAdded} indices to market_indices`);
    }

    // Commit transaction
    database.exec('COMMIT');

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   • stock_indexes: ${added} added, ${skipped} already existed`);
    console.log(`   • Total European indices: ${EUROPEAN_INDICES.length}`);
    console.log(`   • Countries covered: ${[...new Set(EUROPEAN_INDICES.map(i => i.country))].join(', ')}`);
    console.log('\n');

  } catch (error) {
    database.exec('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration if executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration, EUROPEAN_INDICES };
