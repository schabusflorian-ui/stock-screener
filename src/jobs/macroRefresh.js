#!/usr/bin/env node
/**
 * Macro Data Refresh Job
 *
 * Updates FRED economic data for value investing context.
 * Run weekly via cron or manually.
 *
 * Usage:
 *   node src/jobs/macroRefresh.js
 *
 * Cron (Sunday 6 AM):
 *   0 6 * * 0 cd /path/to/project && node src/jobs/macroRefresh.js
 */

require('dotenv').config();

const { FREDService } = require('../services/dataProviders');

async function main() {
  console.log('='.repeat(50));
  console.log('MACRO DATA REFRESH');
  console.log('Started:', new Date().toISOString());
  console.log('='.repeat(50));

  if (!process.env.FRED_API_KEY) {
    console.error('❌ FRED_API_KEY not configured in .env');
    process.exit(1);
  }

  const fred = new FREDService(null, process.env.FRED_API_KEY);

  try {
    const result = await fred.updateAllSeries();

    if (result.success) {
      console.log('\n✅ Macro refresh completed successfully');
      console.log(`   Observations updated: ${result.totalUpdated}`);

      // Show current signals
      const signals = await fred.getMacroSignals();
      console.log('\n📊 Current Macro Signals:');
      console.log(`   VIX: ${signals.summary.vix?.toFixed(2) || 'N/A'}`);
      console.log(`   HY Spread: ${signals.summary.hySpread?.toFixed(2) || 'N/A'}%`);
      console.log(`   Yield Curve Inverted: ${signals.summary.yieldCurveInverted ? 'YES ⚠️' : 'NO'}`);
      console.log(`   Risk Level: ${signals.summary.riskLevel.toUpperCase()}`);

      if (signals.signals.length > 0) {
        console.log('\n⚠️  Active Alerts:');
        for (const signal of signals.signals) {
          console.log(`   - ${signal.message}`);
        }
      }
    } else {
      console.error('❌ Macro refresh failed:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error during macro refresh:', error.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Finished:', new Date().toISOString());
  console.log('='.repeat(50));
}

main();
