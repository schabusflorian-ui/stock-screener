#!/usr/bin/env node
/**
 * Backfill Sentiment History
 *
 * Populates the sentiment_history table from existing Reddit posts
 * to enable historical charting in the frontend.
 */

const db = require('../src/database');

async function backfillHistory() {
  const database = db.getDatabase();

  console.log('Starting sentiment history backfill...\n');

  // Get all companies with Reddit posts
  const companies = database.prepare(`
    SELECT DISTINCT c.id, c.symbol, c.name
    FROM companies c
    JOIN reddit_posts rp ON rp.company_id = c.id
    WHERE rp.sentiment_score IS NOT NULL
  `).all();

  console.log(`Found ${companies.length} companies with sentiment data\n`);

  let totalRecords = 0;

  for (const company of companies) {
    console.log(`Processing ${company.symbol} (${company.name})...`);

    // Get daily aggregated sentiment from posts
    const dailyData = database.prepare(`
      SELECT
        DATE(posted_at) as snapshot_date,
        COUNT(*) as post_count,
        AVG(sentiment_score) as avg_sentiment,
        SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(score) as total_score,
        SUM(num_comments) as total_comments,
        SUM(CASE WHEN is_dd = 1 THEN 1 ELSE 0 END) as dd_count,
        SUM(CASE WHEN is_yolo = 1 THEN 1 ELSE 0 END) as yolo_count,
        SUM(COALESCE(has_rockets, 0)) as rocket_count
      FROM reddit_posts
      WHERE company_id = ?
        AND sentiment_score IS NOT NULL
        AND posted_at IS NOT NULL
      GROUP BY DATE(posted_at)
      ORDER BY DATE(posted_at) ASC
    `).all(company.id);

    if (dailyData.length === 0) {
      console.log(`  No daily data found for ${company.symbol}`);
      continue;
    }

    // Insert/update history records
    const insertStmt = database.prepare(`
      INSERT OR REPLACE INTO sentiment_history (
        company_id, snapshot_date, source,
        post_count, mention_count,
        avg_sentiment, weighted_sentiment, sentiment_std_dev,
        positive_count, negative_count, neutral_count,
        total_score, total_comments, avg_engagement,
        signal, signal_strength,
        rocket_count, dd_count, yolo_count
      ) VALUES (
        ?, ?, 'reddit',
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?
      )
    `);

    for (const day of dailyData) {
      // Calculate weighted sentiment (simple version)
      const weightedSentiment = day.avg_sentiment;

      // Calculate sentiment std dev from posts for this day
      const postsForDay = database.prepare(`
        SELECT sentiment_score FROM reddit_posts
        WHERE company_id = ? AND DATE(posted_at) = ? AND sentiment_score IS NOT NULL
      `).all(company.id, day.snapshot_date);

      let sentimentStdDev = 0;
      if (postsForDay.length > 1) {
        const mean = day.avg_sentiment;
        const squaredDiffs = postsForDay.map(p => Math.pow(p.sentiment_score - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / postsForDay.length;
        sentimentStdDev = Math.sqrt(avgSquaredDiff);
      }

      // Determine signal based on sentiment
      let signal, signalStrength;
      if (day.avg_sentiment >= 0.4) {
        signal = 'strong_buy';
        signalStrength = 5;
      } else if (day.avg_sentiment >= 0.2) {
        signal = 'buy';
        signalStrength = 4;
      } else if (day.avg_sentiment >= 0.05) {
        signal = 'lean_buy';
        signalStrength = 3;
      } else if (day.avg_sentiment <= -0.4) {
        signal = 'strong_sell';
        signalStrength = 5;
      } else if (day.avg_sentiment <= -0.2) {
        signal = 'sell';
        signalStrength = 4;
      } else if (day.avg_sentiment <= -0.05) {
        signal = 'lean_sell';
        signalStrength = 3;
      } else {
        signal = 'hold';
        signalStrength = 2;
      }

      // Calculate average engagement
      const avgEngagement = day.post_count > 0
        ? (day.total_score + day.total_comments) / day.post_count
        : 0;

      try {
        insertStmt.run(
          company.id,
          day.snapshot_date,
          day.post_count,
          day.post_count, // mention_count = post_count for now
          Math.round(day.avg_sentiment * 1000) / 1000,
          Math.round(weightedSentiment * 1000) / 1000,
          Math.round(sentimentStdDev * 1000) / 1000,
          day.positive_count,
          day.negative_count,
          day.neutral_count,
          day.total_score,
          day.total_comments,
          Math.round(avgEngagement * 100) / 100,
          signal,
          signalStrength,
          day.rocket_count || 0,
          day.dd_count || 0,
          day.yolo_count || 0
        );
        totalRecords++;
      } catch (err) {
        if (!err.message.includes('UNIQUE')) {
          console.error(`  Error inserting ${day.snapshot_date}:`, err.message);
        }
      }
    }

    console.log(`  Added ${dailyData.length} daily records for ${company.symbol}`);
  }

  console.log(`\nBackfill complete! Total records: ${totalRecords}`);

  // Show summary
  const summary = database.prepare(`
    SELECT
      COUNT(DISTINCT company_id) as companies,
      COUNT(*) as total_records,
      MIN(snapshot_date) as earliest_date,
      MAX(snapshot_date) as latest_date
    FROM sentiment_history
    WHERE source = 'reddit'
  `).get();

  console.log('\nSentiment History Summary:');
  console.log(`  Companies: ${summary.companies}`);
  console.log(`  Total Records: ${summary.total_records}`);
  console.log(`  Date Range: ${summary.earliest_date} to ${summary.latest_date}`);
}

backfillHistory()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
