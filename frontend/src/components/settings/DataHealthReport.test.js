// frontend/src/components/settings/DataHealthReport.test.js
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DataHealthReport from './DataHealthReport';

// Mock the API services
jest.mock('../../services/api', () => ({
  settingsAPI: {
    getDataHealth: jest.fn()
  }
}));

// eslint-disable-next-line import/first
import { settingsAPI } from '../../services/api';

const mockHealthData = {
  data: {
    generatedAt: '2025-12-30T15:00:00Z',
    overall: 'healthy',
    metrics: [
      {
        name: 'Stale Stock Prices',
        status: 'ok',
        value: 5,
        threshold: 50,
        message: '5 stocks haven\'t updated in 5+ days'
      },
      {
        name: 'Missing Metrics',
        status: 'warning',
        value: 25,
        threshold: 100,
        message: '25 stocks missing calculated metrics'
      },
      {
        name: 'Failed Updates',
        status: 'critical',
        value: 10,
        threshold: 3,
        message: '10 failed updates in the last 24 hours'
      }
    ]
  }
};

describe('DataHealthReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settingsAPI.getDataHealth.mockResolvedValue(mockHealthData);
  });

  test('renders loading state initially', () => {
    render(<DataHealthReport />);
    expect(screen.getByText('Loading health report...')).toBeInTheDocument();
  });

  test('renders health report after loading', async () => {
    render(<DataHealthReport />);

    await waitFor(() => {
      expect(screen.getByText('Data Health')).toBeInTheDocument();
    });

    expect(screen.getByText('All Systems Healthy')).toBeInTheDocument();
  });

  test('displays all health metrics', async () => {
    render(<DataHealthReport />);

    await waitFor(() => {
      expect(screen.getByText('Stale Stock Prices')).toBeInTheDocument();
    });

    expect(screen.getByText('Missing Metrics')).toBeInTheDocument();
    expect(screen.getByText('Failed Updates')).toBeInTheDocument();
  });

  test('displays metric values and messages', async () => {
    render(<DataHealthReport />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText(/5 stocks haven't updated/)).toBeInTheDocument();
  });

  test('displays threshold information', async () => {
    render(<DataHealthReport />);

    await waitFor(() => {
      expect(screen.getByText('Threshold: 50')).toBeInTheDocument();
    });

    expect(screen.getByText('Threshold: 100')).toBeInTheDocument();
    expect(screen.getByText('Threshold: 3')).toBeInTheDocument();
  });

  test('refresh button triggers data reload', async () => {
    render(<DataHealthReport />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Refresh'));

    await waitFor(() => {
      expect(settingsAPI.getDataHealth).toHaveBeenCalledTimes(2);
    });
  });

  test('shows warning status correctly', async () => {
    const warningHealth = {
      data: {
        ...mockHealthData.data,
        overall: 'warning'
      }
    };
    settingsAPI.getDataHealth.mockResolvedValue(warningHealth);

    render(<DataHealthReport />);

    await waitFor(() => {
      expect(screen.getByText('Some Issues Detected')).toBeInTheDocument();
    });
  });

  test('shows critical status correctly', async () => {
    const criticalHealth = {
      data: {
        ...mockHealthData.data,
        overall: 'critical'
      }
    };
    settingsAPI.getDataHealth.mockResolvedValue(criticalHealth);

    render(<DataHealthReport />);

    await waitFor(() => {
      expect(screen.getByText('Critical Issues')).toBeInTheDocument();
    });
  });

  test('shows error when API fails', async () => {
    settingsAPI.getDataHealth.mockRejectedValue(new Error('API Error'));

    render(<DataHealthReport />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load health report')).toBeInTheDocument();
    });
  });

  test('displays last checked time', async () => {
    render(<DataHealthReport />);

    await waitFor(() => {
      expect(screen.getByText(/Last checked:/)).toBeInTheDocument();
    });
  });
});
