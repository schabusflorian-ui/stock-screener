# Onboarding System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER FIRST LOGIN                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Check LocalStorage  │
                  │  onboarding_complete │
                  └──────────┬───────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
           YES  │                         │  NO
                ▼                         ▼
        ┌───────────────┐        ┌────────────────┐
        │ Skip Welcome  │        │  Show Welcome  │
        │     Flow      │        │      Flow      │
        └───────────────┘        └───────┬────────┘
                                         │
                                         ▼
                              ╔══════════════════════╗
                              ║   WELCOME FLOW       ║
                              ║   (5 Steps)          ║
                              ╚══════════════════════╝

┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 1: WELCOME                                   │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                          👋                                 │    │
│  │                                                             │    │
│  │              Welcome, [User Name]!                         │    │
│  │                                                             │    │
│  │    Let's personalize your experience in just a few steps   │    │
│  │                                                             │    │
│  │               [Get Started] Button                         │    │
│  │                                                             │    │
│  │             Takes less than 2 minutes                      │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  STEP 2: INTERESTS                                   │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              What interests you?                            │    │
│  │                                                             │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │ 📈 Growth│ │ 💎 Value │ │ 💰 Div.  │ │ 💻 Tech  │    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │ 📊 ETFs  │ │ 🌍 Intl. │ │ 🚀 Small │ │ 🔢 Quant │    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │    │
│  │                                                             │    │
│  │           [Back]              [Continue]                   │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                STEP 3: RISK PROFILE                                  │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │           Your risk tolerance?                              │    │
│  │                                                             │    │
│  │  ┌────────────────────────────────────────────────────┐   │    │
│  │  │ 🛡️  Conservative                                   │   │    │
│  │  │ Preserve capital, steady returns                   │   │    │
│  │  │ Stocks 30% | Bonds 50% | Cash 20%                 │   │    │
│  │  └────────────────────────────────────────────────────┘   │    │
│  │  ┌────────────────────────────────────────────────────┐   │    │
│  │  │ ⚖️  Moderate                                        │   │    │
│  │  │ Balance growth and stability                       │   │    │
│  │  │ Stocks 60% | Bonds 30% | Cash 10%                 │   │    │
│  │  └────────────────────────────────────────────────────┘   │    │
│  │  ┌────────────────────────────────────────────────────┐   │    │
│  │  │ 🔥  Aggressive                                      │   │    │
│  │  │ Maximize growth, higher risk                       │   │    │
│  │  │ Stocks 85% | Bonds 10% | Cash 5%                  │   │    │
│  │  └────────────────────────────────────────────────────┘   │    │
│  │                                                             │    │
│  │           [Back]              [Continue]                   │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 4: FIRST WATCHLIST                                 │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │        Create your first watchlist                          │    │
│  │                                                             │    │
│  │  Watchlist name: [My Watchlist____________]               │    │
│  │                                                             │    │
│  │  Selected: [AAPL] [MSFT] [GOOGL]                          │    │
│  │                                                             │    │
│  │  Suggested (based on your interests):                      │    │
│  │  [+ AAPL] [+ MSFT] [+ NVDA] [+ TSLA] [+ AMZN]            │    │
│  │                                                             │    │
│  │           [Back]           [Continue / Skip]               │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│               STEP 5: TOUR OFFER                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │                          🎉                                 │    │
│  │                                                             │    │
│  │                 You're all set!                            │    │
│  │                                                             │    │
│  │    Would you like a quick tour of the key features?       │    │
│  │              It only takes 2 minutes.                      │    │
│  │                                                             │    │
│  │          [Yes, show me around] Button                      │    │
│  │                                                             │    │
│  │          Skip, I'll explore on my own                      │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                             │
                   ┌─────────┴─────────┐
                   │                   │
            START TOUR            SKIP TOUR
                   │                   │
                   ▼                   ▼
         ╔═══════════════════╗   ┌──────────────┐
         ║   FEATURE TOUR    ║   │ Go to App    │
         ║   (Main)          ║   │              │
         ╚═══════════════════╝   └──────────────┘
                   │
                   │
         ┌─────────┼─────────┬─────────┬─────────┐
         │         │         │         │         │
         ▼         ▼         ▼         ▼         ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │ Search │ │Watchlst│ │AI Chat │ │ Screen │ │ Agents │
    │  Bar   │ │ Button │ │ Button │ │  Link  │ │  Link  │
    └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
         │         │         │         │         │
         └─────────┴─────────┴─────────┴─────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  Complete Tour │
                    │  Save to       │
                    │  LocalStorage  │
                    └────────────────┘


╔══════════════════════════════════════════════════════════════════════╗
║                      ONBOARDING PROGRESS                             ║
║                                                                      ║
║  After onboarding, user sees progress widget:                       ║
║                                                                      ║
║  ┌──────────────────────────────────────────────────────────────┐  ║
║  │ 🎯 Getting Started                                      [×]   │  ║
║  │                                                               │  ║
║  │ Progress: ████████░░░░░░░░░░░░  2 of 5 complete             │  ║
║  │                                                               │  ║
║  │ ✅ Complete your profile                                     │  ║
║  │ ✅ Add 3 stocks to watchlist                                 │  ║
║  │ ○  Create a portfolio                                        │  ║
║  │ ○  Set your first alert                                      │  ║
║  │ ○  Ask the AI a question                                     │  ║
║  └──────────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════╝


╔══════════════════════════════════════════════════════════════════════╗
║                        EMPTY STATES                                  ║
║                                                                      ║
║  Shown when user has no data:                                       ║
║                                                                      ║
║  ┌──────────────────────────────────────────────────────────────┐  ║
║  │                         ⭐                                    │  ║
║  │                                                               │  ║
║  │              Your watchlist is empty                         │  ║
║  │                                                               │  ║
║  │   Start tracking stocks by adding them to your watchlist.   │  ║
║  │   Search for any company or browse our suggestions.         │  ║
║  │                                                               │  ║
║  │            [Add your first stock] Button                     │  ║
║  └──────────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════╝


╔══════════════════════════════════════════════════════════════════════╗
║                     CONTEXTUAL HELP                                  ║
║                                                                      ║
║  Metric tooltips shown on hover:                                    ║
║                                                                      ║
║  ┌──────────────────────────────────────────────────────────────┐  ║
║  │ P/E Ratio: 25.3  [?] ← Hover                                 │  ║
║  │                                                               │  ║
║  │        ┌───────────────────────────────────┐                 │  ║
║  │        │ P/E Ratio                         │                 │  ║
║  │        │                                   │                 │  ║
║  │        │ Price-to-Earnings ratio shows    │                 │  ║
║  │        │ how much investors pay for each  │                 │  ║
║  │        │ dollar of earnings.               │                 │  ║
║  │        │                                   │                 │  ║
║  │        │ Formula:                          │                 │  ║
║  │        │ Stock Price ÷ EPS                │                 │  ║
║  │        │                                   │                 │  ║
║  │        │ Interpretation:                   │                 │  ║
║  │        │ Lower may indicate undervaluation│                 │  ║
║  │        └───────────────────────────────────┘                 │  ║
║  └──────────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════╝


╔══════════════════════════════════════════════════════════════════════╗
║                        HELP CENTER                                   ║
║                                                                      ║
║  Accessible at /help:                                                ║
║                                                                      ║
║  ┌──────────────────────────────────────────────────────────────┐  ║
║  │                    📚 Help Center                            │  ║
║  │                                                               │  ║
║  │  🔍 [Search for help...___________________]                  │  ║
║  │                                                               │  ║
║  │  🚀 Getting Started                                          │  ║
║  │  ▼ How do I create a watchlist?                             │  ║
║  │     Click the "+" button in the Watchlists section...       │  ║
║  │                                                               │  ║
║  │  ⚡ Features & Analysis                                       │  ║
║  │  ▶ How does the AI analysis work?                           │  ║
║  │  ▶ What do the sentiment scores mean?                       │  ║
║  │                                                               │  ║
║  │  📊 Financial Metrics                                         │  ║
║  │  📖 Account & Privacy                                         │  ║
║  │  🔧 Troubleshooting                                           │  ║
║  │                                                               │  ║
║  │  ────────────────────────────────────────                    │  ║
║  │                                                               │  ║
║  │  💬 Still need help?                                         │  ║
║  │  Can't find what you're looking for?                         │  ║
║  │  [Contact Support] Button                                    │  ║
║  └──────────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════════╝
```

## Flow Summary

1. **User logs in** → Check if onboarding is complete
2. **If not complete** → Show 5-step welcome flow
3. **Collect data** → Interests, risk profile, first stocks
4. **Offer tour** → User can accept or skip
5. **If accepted** → Start interactive feature tour
6. **Show progress** → Track 5 onboarding tasks
7. **Throughout app** → Empty states, tooltips, help available

## Storage Keys

- `investment_onboarding_complete` - Boolean flag
- `investment_onboarding_data` - User's onboarding preferences
- `investment_completed_tours` - Array of completed tour IDs
- `onboarding_completed_tasks` - Array of completed task IDs
- `onboarding_progress_dismissed` - Boolean if user dismissed widget
