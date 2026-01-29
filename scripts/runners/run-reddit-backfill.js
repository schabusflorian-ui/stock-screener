// run-reddit-backfill.js
// Backfill Reddit data for sentiment analysis

const Database = require('better-sqlite3');
const RedditFetcher = require('./src/services/redditFetcher');

console.log('\n' + '='.repeat(80));
console.log('📱 REDDIT DATA BACKFILL');
console.log('='.repeat(80));

const db = new Database('./data/stocks.db');
const reddit = new RedditFetcher(db);

async function main() {
  try {
    // Check current coverage
    const currentPosts = db.prepare('SELECT COUNT(*) as count FROM reddit_posts').get();
    const currentMentions = db.prepare('SELECT COUNT(*) as count FROM reddit_ticker_mentions').get();

    console.log('\n📊 Current Coverage:');
    console.log(`   Reddit Posts: ${currentPosts.count}`);
    console.log(`   Ticker Mentions: ${currentMentions.count}`);

    // Get popular tickers to track
    const tickers = db.prepare(`
      SELECT DISTINCT symbol
      FROM companies
      WHERE market_cap > 10000000000
        AND is_active = 1
      ORDER BY market_cap DESC
      LIMIT 50
    `).all().map(r => r.symbol);

    console.log(`\n🎯 Tracking ${tickers.length} large-cap stocks`);
    console.log(`   Sample: ${tickers.slice(0, 10).join(', ')}`);

    // Fetch from key subreddits
    const subreddits = ['wallstreetbets', 'stocks', 'investing'];
    console.log(`\n📡 Fetching from subreddits: ${subreddits.join(', ')}`);

    let totalFetched = 0;
    let totalMentions = 0;

    for (const subreddit of subreddits) {
      console.log(`\n🔄 Fetching r/${subreddit}...`);

      try {
        const result = await reddit.fetchSubreddit(subreddit, {
          limit: 100,  // Fetch 100 posts per subreddit
          timeFilter: 'week',  // Last week's posts
          minScore: 5  // Minimum 5 upvotes
        });

        console.log(`   ✅ Fetched ${result.posts || 0} posts`);
        console.log(`   ✅ Found ${result.mentions || 0} ticker mentions`);

        totalFetched += (result.posts || 0);
        totalMentions += (result.mentions || 0);

        // Wait between subreddits to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Error fetching r/${subreddit}: ${error.message}`);
      }
    }

    // Update sentiment aggregation
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 AGGREGATING SENTIMENT');
    console.log('='.repeat(80));

    const sentimentResults = await reddit.aggregateSentiment({
      lookbackDays: 7,
      minMentions: 3
    });

    console.log(`\n✅ Aggregated sentiment for ${sentimentResults?.companies || 0} companies`);

    // Show summary
    console.log('\n\n' + '='.repeat(80));
    console.log('📈 BACKFILL SUMMARY');
    console.log('='.repeat(80));

    const finalPosts = db.prepare('SELECT COUNT(*) as count FROM reddit_posts').get();
    const finalMentions = db.prepare('SELECT COUNT(*) as count FROM reddit_ticker_mentions').get();
    const sentiment = db.prepare('SELECT COUNT(*) as count FROM combined_sentiment WHERE reddit_sentiment IS NOT NULL').get();

    console.log('\n📊 Final Coverage:');
    console.log(`   Total Posts: ${finalPosts.count} (+${finalPosts.count - currentPosts.count})`);
    console.log(`   Ticker Mentions: ${finalMentions.count} (+${finalMentions.count - currentMentions.count})`);
    console.log(`   Companies with Sentiment: ${sentiment.count}`);

    // Show top mentions
    const topMentions = db.prepare(`
      SELECT
        c.symbol,
        c.name,
        COUNT(*) as mention_count,
        AVG(rtm.sentiment_score) as avg_sentiment
      FROM reddit_ticker_mentions rtm
      JOIN companies c ON rtm.company_id = c.id
      WHERE rtm.created_at >= datetime('now', '-7 days')
      GROUP BY c.symbol, c.name
      HAVING mention_count >= 3
      ORDER BY mention_count DESC
      LIMIT 10
    `).all();

    if (topMentions.length > 0) {
      console.log('\n🔥 Top Mentioned Stocks (Last 7 Days):');
      topMentions.forEach((stock, i) => {
        const sentimentEmoji = stock.avg_sentiment > 0.6 ? '🟢' : stock.avg_sentiment < 0.4 ? '🔴' : '⚪';
        console.log(`   ${i + 1}. ${stock.symbol} - ${stock.mention_count} mentions ${sentimentEmoji} (sentiment: ${stock.avg_sentiment?.toFixed(2) || 'N/A'})`);
      });
    }

    console.log('\n✅ Reddit backfill complete!');
    console.log('\n💡 To keep data fresh, run this script daily or set up a cron job:');
    console.log('   node run-reddit-backfill.js\n');

  } catch (error) {
    console.error('\n❌ Backfill failed:', error);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

main();
