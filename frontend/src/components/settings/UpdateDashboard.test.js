// frontend/src/components/settings/UpdateDashboard.test.js
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UpdateDashboard from './UpdateDashboard';

// Mock the API services
jest.mock('../../services/api', () => ({
  settingsAPI: {
    getUpdateSchedules: jest.fn(),
    toggleSchedule: jest.fn()
  },
  insidersAPI: {
    getUpdateStatus: jest.fn(),
    triggerUpdate: jest.fn()
  },
  capitalAPI: {
    getStats: jest.fn(),
    triggerUpdate: jest.fn()
  },
  sentimentAPI: {
    getStatus: jest.fn(),
    getTrending: jest.fn()
  },
  priceUpdatesAPI: {
    getStats: jest.fn(),
    run: jest.fn()
  },
  indicesAPI: {
    getAll: jest.fn(),
    update: jest.fn()
  },
  secRefreshAPI: {
    getStatus: jest.fn(),
    run: jest.fn()
  },
  knowledgeAPI: {
    getUpdateStatus: jest.fn(),
    refresh: jest.fn()
  }
}));

// Import mocked API
import { settingsAPI, priceUpdatesAPI } from '../../services/api';

// Sample schedule data
const mockSchedules = [
  {
    name: 'stock_prices',
    displayName: 'Stock Prices',
    isEnabled: true,
    frequency: 'daily',
    lastRunAt: '2025-12-29T18:00:00Z',
    status: 'idle'
  },
  {
    name: 'stock_fundamentals',
    displayName: 'SEC Filings',
    isEnabled: false,
    frequency: 'weekly',
    lastRunAt: null,
    status: 'idle'
  }
];

const mockPriceStats = {
  data: {
    overall: { total: 100, fresh_1d: 80 }
  }
};

describe('UpdateDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settingsAPI.getUpdateSchedules.mockResolvedValue({ data: { data: mockSchedules } });
    priceUpdatesAPI.getStats.mockResolvedValue(mockPriceStats);
  });

  test('renders loading state initially', () => {
    render(<UpdateDashboard />);
    expect(screen.getByText('Loading update schedules...')).toBeInTheDocument();
  });

  test('renders update schedules after loading', async () => {
    render(<UpdateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Stock Prices')).toBeInTheDocument();
    });

    expect(screen.getByText('SEC Filings')).toBeInTheDocument();
  });

  test('displays summary statistics', async () => {
    render(<UpdateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Active Schedules')).toBeInTheDocument();
    });

    expect(screen.getByText('Data Sources')).toBeInTheDocument();
  });

  test('toggle switch changes schedule state', async () => {
    settingsAPI.toggleSchedule.mockResolvedValue({ success: true });

    render(<UpdateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Stock Prices')).toBeInTheDocument();
    });

    // Find and click a toggle
    const toggles = screen.getAllByRole('checkbox');
    expect(toggles.length).toBeGreaterThan(0);

    fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(settingsAPI.toggleSchedule).toHaveBeenCalled();
    });
  });

  test('run button triggers update', async () => {
    priceUpdatesAPI.run.mockResolvedValue({ success: true });

    render(<UpdateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Stock Prices')).toBeInTheDocument();
    });

    // Find run buttons
    const runButtons = screen.getAllByText('Run');
    expect(runButtons.length).toBeGreaterThan(0);

    fireEvent.click(runButtons[0]);

    // Button should show running state
    await waitFor(() => {
      expect(priceUpdatesAPI.run).toHaveBeenCalled();
    });
  });

  test('shows error state when API fails', async () => {
    settingsAPI.getUpdateSchedules.mockRejectedValue(new Error('API Error'));

    render(<UpdateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load update schedules')).toBeInTheDocument();
    });
  });

  test('refresh button reloads data', async () => {
    render(<UpdateDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Stock Prices')).toBeInTheDocument();
    });

    // Find refresh button
    const refreshButton = screen.getByText('Refresh Status');
    fireEvent.click(refreshButton);

    // API should be called again
    await waitFor(() => {
      expect(settingsAPI.getUpdateSchedules).toHaveBeenCalledTimes(2);
    });
  });
});
