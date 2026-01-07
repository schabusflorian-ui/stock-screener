// frontend/src/components/settings/PreferencesForm.test.js
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PreferencesForm from './PreferencesForm';

// Suppress React act warnings
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (/not wrapped in act/.test(args[0])) return;
    originalError.call(console, ...args);
  };
});
afterAll(() => {
  console.error = originalError;
});

// Mock the API services
jest.mock('../../services/api', () => ({
  settingsAPI: {
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
    getExchangeRates: jest.fn()
  }
}));

// Mock the PreferencesContext exports
jest.mock('../../context/PreferencesContext', () => ({
  CURRENCIES: [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' }
  ],
  DATE_FORMATS: [
    { value: 'MMM D, YYYY', label: 'Jan 1, 2025', example: 'Jan 1, 2025' },
    { value: 'YYYY-MM-DD', label: 'ISO', example: '2025-01-01' }
  ],
  NUMBER_FORMATS: [
    { value: 'en-US', label: 'US (1,234.56)' },
    { value: 'de-DE', label: 'German (1.234,56)' }
  ],
  THEMES: [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' }
  ]
}));

import { settingsAPI } from '../../services/api';

const mockPreferences = {
  theme: 'dark',
  currency: 'USD',
  dateFormat: 'MMM D, YYYY',
  numberFormat: 'en-US',
  showPercentages: true,
  compactNumbers: true,
  autoRefreshInterval: 0,
  notificationsEnabled: false,
  defaultBenchmark: 'SPY',
  defaultTimeHorizon: 10
};

const mockExchangeRates = {
  rates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79
  },
  lastUpdated: Date.now()
};

describe('PreferencesForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settingsAPI.getPreferences.mockResolvedValue({ data: { data: mockPreferences } });
    settingsAPI.getExchangeRates.mockResolvedValue({ data: mockExchangeRates });
    settingsAPI.updatePreferences.mockResolvedValue({ success: true });
  });

  test('renders loading state initially', () => {
    render(<PreferencesForm />);
    expect(screen.getByText('Loading preferences...')).toBeInTheDocument();
  });

  test('renders preferences form after loading', async () => {
    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByText('User Preferences')).toBeInTheDocument();
    });

    expect(screen.getByText('Display')).toBeInTheDocument();
    expect(screen.getByText('Currency & Data')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  test('displays theme selector with correct value', async () => {
    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Theme')).toBeInTheDocument();
    });

    const themeSelect = screen.getByLabelText('Theme');
    expect(themeSelect.value).toBe('dark');
  });

  test('displays currency selector with correct value', async () => {
    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Display Currency')).toBeInTheDocument();
    });

    const currencySelect = screen.getByLabelText('Display Currency');
    expect(currencySelect.value).toBe('USD');
  });

  test('save button is disabled when no changes', async () => {
    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByText('Save Preferences')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Preferences');
    expect(saveButton).toBeDisabled();
  });

  test('save button is enabled after making changes', async () => {
    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Theme')).toBeInTheDocument();
    });

    // Change theme
    const themeSelect = screen.getByLabelText('Theme');
    fireEvent.change(themeSelect, { target: { value: 'light' } });

    const saveButton = screen.getByText('Save Preferences');
    expect(saveButton).not.toBeDisabled();
  });

  test('saves preferences when save button clicked', async () => {
    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Theme')).toBeInTheDocument();
    });

    // Change theme
    const themeSelect = screen.getByLabelText('Theme');
    fireEvent.change(themeSelect, { target: { value: 'light' } });

    // Click save
    const saveButton = screen.getByText('Save Preferences');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(settingsAPI.updatePreferences).toHaveBeenCalled();
    });
  });

  test('shows success message after saving', async () => {
    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Theme')).toBeInTheDocument();
    });

    // Change theme and save
    const themeSelect = screen.getByLabelText('Theme');
    fireEvent.change(themeSelect, { target: { value: 'light' } });
    fireEvent.click(screen.getByText('Save Preferences'));

    await waitFor(() => {
      expect(screen.getByText('Preferences saved successfully!')).toBeInTheDocument();
    });
  });

  test('reset button restores original values', async () => {
    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Theme')).toBeInTheDocument();
    });

    // Change theme
    const themeSelect = screen.getByLabelText('Theme');
    fireEvent.change(themeSelect, { target: { value: 'light' } });
    expect(themeSelect.value).toBe('light');

    // Click reset
    const resetButton = screen.getByText('Reset Changes');
    fireEvent.click(resetButton);

    // Should revert to original
    expect(themeSelect.value).toBe('dark');
  });

  test('checkbox toggles work correctly', async () => {
    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByText('Show percentages by default')).toBeInTheDocument();
    });

    const checkbox = screen.getByLabelText('Show percentages by default');
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });

  test('shows error when API fails', async () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    settingsAPI.getPreferences.mockRejectedValue(new Error('API Error'));

    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load preferences')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  test('shows exchange rate for non-USD currencies', async () => {
    render(<PreferencesForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Display Currency')).toBeInTheDocument();
    });

    // Change to EUR
    const currencySelect = screen.getByLabelText('Display Currency');
    fireEvent.change(currencySelect, { target: { value: 'EUR' } });

    await waitFor(() => {
      expect(screen.getByText(/1 USD = 0.9200 EUR/)).toBeInTheDocument();
    });
  });
});
