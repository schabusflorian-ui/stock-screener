/**
 * Onboarding System Usage Examples
 *
 * This file demonstrates how to use the various onboarding components
 * throughout the application.
 */

// ==========================================
// Example 1: Using Empty States
// ==========================================
import { EmptyWatchlist, EmptyPortfolio, EmptyState } from '../components/empty-states';

function WatchlistPage() {
  const [stocks, setStocks] = useState([]);

  return (
    <div>
      {stocks.length === 0 ? (
        <EmptyWatchlist onAddStock={() => setShowModal(true)} />
      ) : (
        <StockList stocks={stocks} />
      )}
    </div>
  );
}

// ==========================================
// Example 2: Using Metric Tooltips
// ==========================================
import { MetricTooltip, HelpTooltip } from '../components/help';

function StockMetrics({ stock }) {
  return (
    <div className="metrics-grid">
      <div className="metric-card">
        <div className="metric-label">
          P/E Ratio
          <MetricTooltip metric="pe_ratio" />
        </div>
        <div className="metric-value">{stock.peRatio}</div>
      </div>

      <div className="metric-card">
        <div className="metric-label">
          Market Cap
          <MetricTooltip metric="market_cap" />
        </div>
        <div className="metric-value">{formatMarketCap(stock.marketCap)}</div>
      </div>

      {/* Custom tooltip for non-standard metrics */}
      <div className="metric-card">
        <div className="metric-label">
          Custom Score
          <HelpTooltip content="Our proprietary score combining multiple factors">
            <HelpCircle className="help-icon" />
          </HelpTooltip>
        </div>
        <div className="metric-value">{stock.customScore}</div>
      </div>
    </div>
  );
}

// ==========================================
// Example 3: Using Tours
// ==========================================
import { useTour } from '../hooks/useTour';

function DashboardPage() {
  // Auto-start tour for new users after 1 second
  const { startTour, hasCompletedTour } = useTour('main', true, 1000);

  return (
    <div>
      {/* Add data-tour attributes to elements you want to highlight */}
      <input
        data-tour="search"
        type="text"
        placeholder="Search stocks..."
      />

      <div data-tour="watchlist">
        <h2>Your Watchlist</h2>
        {/* Watchlist content */}
      </div>

      <button data-tour="ai-chat">
        Ask AI
      </button>

      {/* Manual tour trigger */}
      {!hasCompletedTour && (
        <button onClick={startTour}>
          Take a tour
        </button>
      )}
    </div>
  );
}

// ==========================================
// Example 4: Using Onboarding Progress
// ==========================================
import { OnboardingProgress } from '../components/onboarding';
import { useOnboardingProgress } from '../hooks/useOnboardingProgress';

function HomePage() {
  const { markTaskComplete } = useOnboardingProgress();

  const handleFirstStockAdded = () => {
    // Your logic to add stock
    addStockToWatchlist(stock);

    // Mark onboarding task as complete
    markTaskComplete('watchlist');
  };

  return (
    <div>
      {/* Show progress widget */}
      <OnboardingProgress />

      {/* Rest of your page */}
    </div>
  );
}

// ==========================================
// Example 5: Triggering Tours Manually
// ==========================================
import { useOnboarding } from '../context/OnboardingContext';

function SettingsPage() {
  const { startTour } = useOnboarding();

  return (
    <div>
      <h1>Settings</h1>

      <button onClick={() => startTour('main')}>
        Restart Dashboard Tour
      </button>

      <button onClick={() => startTour('agents')}>
        Learn About Trading Agents
      </button>
    </div>
  );
}

// ==========================================
// Example 6: Custom Empty State
// ==========================================
import { EmptyState } from '../components/empty-states';

function MyCustomPage() {
  const [data, setData] = useState([]);

  if (data.length === 0) {
    return (
      <EmptyState
        icon="🎯"
        title="No strategies yet"
        description="Create your first trading strategy to get started with automated analysis."
        action={() => navigate('/strategies/new')}
        actionLabel="Create strategy"
        secondaryAction={() => window.open('/help/strategies')}
        secondaryLabel="Learn more"
      />
    );
  }

  return <div>{/* Your content */}</div>;
}

// ==========================================
// Example 7: Adding New Tour Steps
// ==========================================

// In lib/tours/tourDriver.js:
export const TOURS = {
  // ... existing tours

  myNewTour: [
    {
      element: '[data-tour="element-1"]',
      popover: {
        title: 'Step 1 Title',
        description: 'Explanation of what this element does.',
        side: 'bottom', // or 'top', 'left', 'right'
        align: 'center', // or 'start', 'end'
      },
    },
    {
      element: '[data-tour="element-2"]',
      popover: {
        title: 'Step 2 Title',
        description: 'Next step explanation.',
        side: 'right',
      },
    },
  ],
};

// Then use it:
const { startTour } = useTour('myNewTour');

// ==========================================
// Example 8: Tracking Onboarding Events
// ==========================================
import { useOnboardingProgress } from '../hooks/useOnboardingProgress';

function ProfileSetup() {
  const { markTaskComplete } = useOnboardingProgress();

  const handleProfileSave = async () => {
    await saveProfile(profileData);

    // Mark as complete
    markTaskComplete('profile');

    // Optional: Send analytics event
    analytics.track('onboarding_profile_complete', {
      timestamp: new Date(),
    });
  };

  return <form onSubmit={handleProfileSave}>...</form>;
}

// ==========================================
// Example 9: Conditional Tour Auto-Start
// ==========================================
function StockDetailPage({ symbol }) {
  const [shouldStartTour, setShouldStartTour] = useState(false);

  useEffect(() => {
    // Only auto-start tour if this is user's first time viewing a stock
    const viewedStocks = JSON.parse(localStorage.getItem('viewed_stocks') || '[]');
    if (viewedStocks.length === 0) {
      setShouldStartTour(true);
    }
    viewedStocks.push(symbol);
    localStorage.setItem('viewed_stocks', JSON.stringify(viewedStocks));
  }, [symbol]);

  useTour('stockDetail', shouldStartTour, 1500);

  return <div>Stock details...</div>;
}

// ==========================================
// Example 10: Adding FAQ Content
// ==========================================

// In data/faq.js, add to FAQ_CATEGORIES:
{
  id: 'my-new-category',
  title: 'My Category',
  icon: '🎨',
  questions: [
    {
      q: 'How do I do X?',
      a: 'To do X, follow these steps: 1) Go to the page, 2) Click the button, 3) Complete the form.'
    },
    {
      q: 'What is Y?',
      a: 'Y is a feature that helps you analyze stocks more effectively by combining multiple data sources.'
    }
  ]
}

export default OnboardingExamples;
