// src/services/costs/taxRegimes.js
/**
 * Tax Regime Configuration
 *
 * Defines tax rules for different countries/jurisdictions.
 * Used by portfolio tax tracking and agent decision making.
 */

/**
 * Supported tax jurisdictions
 */
const TAX_JURISDICTIONS = {
  AT: 'austria',
  US: 'united_states',
  DE: 'germany',
  UK: 'united_kingdom',
  CH: 'switzerland',
  NONE: 'tax_free'  // For tax-advantaged accounts
};

/**
 * Tax regime definitions
 */
const TAX_REGIMES = {
  // Austria - KESt (Kapitalertragsteuer)
  austria: {
    code: 'AT',
    name: 'Austria',
    currency: 'EUR',
    capitalGains: {
      rate: 0.275, // 27.5% flat
      shortTermRate: 0.275, // Same rate
      longTermRate: 0.275,  // No distinction
      holdingPeriodDays: 0, // No holding period benefit
      hasHoldingPeriodBenefit: false
    },
    dividends: {
      rate: 0.275,
      withholdingRate: 0.275, // If Austrian broker
      foreignWithholdingCredit: 0.15 // Can credit up to 15%
    },
    lossRules: {
      canOffsetGains: true,
      carryForwardYears: 0, // Must use in same year
      carryBackYears: 0,
      washSaleRule: false, // No wash sale restriction
      annualLossLimit: null // No limit
    },
    reporting: {
      form: 'E1kv',
      brokerWithholding: true, // Austrian brokers withhold
      selfReportRequired: true // For foreign brokers
    },
    lotMethod: 'fifo' // Standard in Austria
  },

  // United States
  united_states: {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    capitalGains: {
      rate: 0.37, // Short-term (ordinary income max)
      shortTermRate: 0.37,
      longTermRate: 0.20, // Top LTCG rate
      holdingPeriodDays: 365, // 1 year for long-term
      hasHoldingPeriodBenefit: true
    },
    dividends: {
      rate: 0.20, // Qualified dividends
      ordinaryRate: 0.37, // Non-qualified
      withholdingRate: 0
    },
    lossRules: {
      canOffsetGains: true,
      carryForwardYears: Infinity, // Unlimited
      carryBackYears: 0,
      washSaleRule: true, // 30-day rule
      washSaleWindowDays: 30,
      annualLossLimit: 3000 // $3k vs ordinary income
    },
    reporting: {
      form: 'Schedule D, Form 8949',
      brokerWithholding: false,
      selfReportRequired: true
    },
    lotMethod: 'fifo' // Default, but can choose
  },

  // Germany
  germany: {
    code: 'DE',
    name: 'Germany',
    currency: 'EUR',
    capitalGains: {
      rate: 0.26375, // 25% + 5.5% soli
      shortTermRate: 0.26375,
      longTermRate: 0.26375, // No distinction
      holdingPeriodDays: 0,
      hasHoldingPeriodBenefit: false
    },
    dividends: {
      rate: 0.26375,
      withholdingRate: 0.26375,
      foreignWithholdingCredit: 0.15
    },
    lossRules: {
      canOffsetGains: true,
      carryForwardYears: Infinity,
      carryBackYears: 0,
      washSaleRule: false,
      annualLossLimit: null,
      // Special: Stock losses only offset stock gains
      stockLossRestriction: true
    },
    reporting: {
      form: 'Anlage KAP',
      brokerWithholding: true,
      selfReportRequired: true
    },
    freibetrag: 1000, // €1000 exemption (single)
    lotMethod: 'fifo'
  },

  // United Kingdom
  united_kingdom: {
    code: 'UK',
    name: 'United Kingdom',
    currency: 'GBP',
    capitalGains: {
      rate: 0.20, // Higher rate
      basicRate: 0.10,
      higherRate: 0.20,
      holdingPeriodDays: 0,
      hasHoldingPeriodBenefit: false
    },
    dividends: {
      rate: 0.3375, // Higher rate
      basicRate: 0.0875,
      allowance: 500 // £500 allowance
    },
    lossRules: {
      canOffsetGains: true,
      carryForwardYears: Infinity,
      carryBackYears: 0,
      washSaleRule: true, // Bed and breakfast rule
      washSaleWindowDays: 30,
      annualLossLimit: null
    },
    reporting: {
      form: 'Self Assessment',
      brokerWithholding: false,
      selfReportRequired: true
    },
    annualExemption: 3000, // £3000 CGT allowance
    lotMethod: 'fifo' // Share pooling rules apply
  },

  // Switzerland
  switzerland: {
    code: 'CH',
    name: 'Switzerland',
    currency: 'CHF',
    capitalGains: {
      rate: 0, // Generally tax-free for private investors
      shortTermRate: 0,
      longTermRate: 0,
      holdingPeriodDays: 0,
      hasHoldingPeriodBenefit: false,
      // Unless classified as professional trader
      professionalTraderRate: 0.40 // Approximate
    },
    dividends: {
      rate: 0.35, // Withholding
      reclaimable: 0.35 // Can reclaim if resident
    },
    lossRules: {
      canOffsetGains: false, // No gains to offset
      washSaleRule: false
    },
    reporting: {
      form: 'Steuererklärung',
      wealthTax: true // Wealth tax applies
    },
    lotMethod: 'fifo'
  },

  // Tax-free (e.g., ISA, Roth IRA, etc.)
  tax_free: {
    code: 'NONE',
    name: 'Tax-Free Account',
    currency: null, // Use account currency
    capitalGains: {
      rate: 0,
      shortTermRate: 0,
      longTermRate: 0,
      hasHoldingPeriodBenefit: false
    },
    dividends: {
      rate: 0
    },
    lossRules: {
      canOffsetGains: false, // No tax benefit from losses
      washSaleRule: false
    },
    reporting: {
      selfReportRequired: false
    },
    lotMethod: 'fifo'
  }
};

/**
 * Get tax regime by country code
 */
function getTaxRegime(countryCode) {
  const code = countryCode?.toUpperCase() || 'AT';
  const jurisdiction = TAX_JURISDICTIONS[code];
  return TAX_REGIMES[jurisdiction] || TAX_REGIMES.austria;
}

/**
 * Calculate tax on a gain
 */
function calculateTax(gain, regime, options = {}) {
  if (gain <= 0) {
    return { tax: 0, netGain: gain, rate: 0 };
  }

  const { isLongTerm = false, isDividend = false } = options;
  let rate;

  if (isDividend) {
    rate = regime.dividends.rate;
  } else if (regime.capitalGains.hasHoldingPeriodBenefit && isLongTerm) {
    rate = regime.capitalGains.longTermRate;
  } else {
    rate = regime.capitalGains.shortTermRate || regime.capitalGains.rate;
  }

  // Apply exemptions if applicable
  let taxableGain = gain;

  if (regime.freibetrag) {
    taxableGain = Math.max(0, gain - regime.freibetrag);
  }

  if (regime.annualExemption) {
    taxableGain = Math.max(0, gain - regime.annualExemption);
  }

  const tax = taxableGain * rate;

  return {
    grossGain: gain,
    taxableGain,
    tax,
    netGain: gain - tax,
    rate,
    exemptionApplied: gain - taxableGain
  };
}

/**
 * Check if wash sale rules apply
 */
function checkWashSale(regime, saleLoss, repurchaseDate, saleDate) {
  if (!regime.lossRules.washSaleRule || saleLoss >= 0) {
    return { isWashSale: false };
  }

  const windowDays = regime.lossRules.washSaleWindowDays || 30;
  const saleTime = new Date(saleDate).getTime();
  const repurchaseTime = new Date(repurchaseDate).getTime();
  const daysDiff = Math.abs(repurchaseTime - saleTime) / (1000 * 60 * 60 * 24);

  return {
    isWashSale: daysDiff <= windowDays,
    daysDiff,
    windowDays,
    disallowedLoss: daysDiff <= windowDays ? Math.abs(saleLoss) : 0
  };
}

/**
 * Determine if a position qualifies for long-term treatment
 */
function isLongTermHolding(regime, purchaseDate, saleDate = new Date()) {
  if (!regime.capitalGains.hasHoldingPeriodBenefit) {
    return { isLongTerm: false, daysHeld: 0, daysRequired: 0 };
  }

  const purchase = new Date(purchaseDate).getTime();
  const sale = new Date(saleDate).getTime();
  const daysHeld = Math.floor((sale - purchase) / (1000 * 60 * 60 * 24));
  const daysRequired = regime.capitalGains.holdingPeriodDays;

  return {
    isLongTerm: daysHeld >= daysRequired,
    daysHeld,
    daysRequired,
    daysUntilLongTerm: Math.max(0, daysRequired - daysHeld)
  };
}

/**
 * Get country options for UI dropdown
 */
function getCountryOptions() {
  return [
    { code: 'AT', name: 'Austria', flag: '🇦🇹', currency: 'EUR' },
    { code: 'US', name: 'United States', flag: '🇺🇸', currency: 'USD' },
    { code: 'DE', name: 'Germany', flag: '🇩🇪', currency: 'EUR' },
    { code: 'UK', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
    { code: 'CH', name: 'Switzerland', flag: '🇨🇭', currency: 'CHF' },
    { code: 'NONE', name: 'Tax-Free Account', flag: '🏦', currency: null }
  ];
}

/**
 * Get tax summary for display
 */
function getTaxRegimeSummary(countryCode) {
  const regime = getTaxRegime(countryCode);

  return {
    name: regime.name,
    code: regime.code,
    currency: regime.currency,
    capitalGainsRate: `${(regime.capitalGains.rate * 100).toFixed(1)}%`,
    hasLongTermBenefit: regime.capitalGains.hasHoldingPeriodBenefit,
    longTermRate: regime.capitalGains.hasHoldingPeriodBenefit
      ? `${(regime.capitalGains.longTermRate * 100).toFixed(1)}%`
      : null,
    holdingPeriod: regime.capitalGains.holdingPeriodDays > 0
      ? `${regime.capitalGains.holdingPeriodDays} days`
      : null,
    washSaleRule: regime.lossRules.washSaleRule,
    lossCarryforward: regime.lossRules.carryForwardYears === Infinity
      ? 'Unlimited'
      : regime.lossRules.carryForwardYears > 0
        ? `${regime.lossRules.carryForwardYears} years`
        : 'Same year only',
    reportingForm: regime.reporting.form
  };
}

module.exports = {
  TAX_JURISDICTIONS,
  TAX_REGIMES,
  getTaxRegime,
  calculateTax,
  checkWashSale,
  isLongTermHolding,
  getCountryOptions,
  getTaxRegimeSummary
};
