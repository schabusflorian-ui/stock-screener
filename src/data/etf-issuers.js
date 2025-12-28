// src/data/etf-issuers.js
// ETF issuer metadata

/**
 * ETF Issuer Definition
 * @typedef {Object} ETFIssuer
 * @property {string} name - Short display name
 * @property {string} slug - URL-safe identifier
 * @property {string} fullName - Full legal/company name
 * @property {string} [website] - Issuer website URL
 */

const ETF_ISSUERS = [
  {
    name: 'Vanguard',
    slug: 'vanguard',
    fullName: 'The Vanguard Group',
    website: 'https://investor.vanguard.com'
  },
  {
    name: 'iShares',
    slug: 'ishares',
    fullName: 'iShares by BlackRock',
    website: 'https://www.ishares.com'
  },
  {
    name: 'SPDR',
    slug: 'spdr',
    fullName: 'SPDR ETFs by State Street Global Advisors',
    website: 'https://www.ssga.com'
  },
  {
    name: 'Schwab',
    slug: 'schwab',
    fullName: 'Charles Schwab Investment Management',
    website: 'https://www.schwab.com'
  },
  {
    name: 'Invesco',
    slug: 'invesco',
    fullName: 'Invesco Ltd.',
    website: 'https://www.invesco.com'
  },
  {
    name: 'Fidelity',
    slug: 'fidelity',
    fullName: 'Fidelity Investments',
    website: 'https://www.fidelity.com'
  },
  {
    name: 'ProShares',
    slug: 'proshares',
    fullName: 'ProShares',
    website: 'https://www.proshares.com'
  },
  {
    name: 'VanEck',
    slug: 'vaneck',
    fullName: 'VanEck',
    website: 'https://www.vaneck.com'
  },
  {
    name: 'WisdomTree',
    slug: 'wisdomtree',
    fullName: 'WisdomTree Investments',
    website: 'https://www.wisdomtree.com'
  },
  {
    name: 'First Trust',
    slug: 'first-trust',
    fullName: 'First Trust Advisors',
    website: 'https://www.ftportfolios.com'
  },
  {
    name: 'Global X',
    slug: 'global-x',
    fullName: 'Global X ETFs',
    website: 'https://www.globalxetfs.com'
  },
  {
    name: 'ARK Invest',
    slug: 'ark',
    fullName: 'ARK Investment Management LLC',
    website: 'https://ark-invest.com'
  },
  {
    name: 'Dimensional',
    slug: 'dimensional',
    fullName: 'Dimensional Fund Advisors',
    website: 'https://www.dimensional.com'
  },
  {
    name: 'Simplify',
    slug: 'simplify',
    fullName: 'Simplify Asset Management',
    website: 'https://www.simplify.us'
  },
  {
    name: 'iMGP',
    slug: 'imgp',
    fullName: 'iMGP Fund Management',
    website: 'https://imgpfunds.com'
  },
  {
    name: 'KFA',
    slug: 'kfa',
    fullName: 'KraneShares',
    website: 'https://kraneshares.com'
  },
  {
    name: 'JPMorgan',
    slug: 'jpmorgan',
    fullName: 'J.P. Morgan Asset Management',
    website: 'https://am.jpmorgan.com'
  },
  {
    name: 'Goldman Sachs',
    slug: 'goldman',
    fullName: 'Goldman Sachs Asset Management',
    website: 'https://www.gsam.com'
  },
  {
    name: 'Pacer',
    slug: 'pacer',
    fullName: 'Pacer ETFs',
    website: 'https://www.paceretfs.com'
  },
  {
    name: 'Direxion',
    slug: 'direxion',
    fullName: 'Direxion',
    website: 'https://www.direxion.com'
  }
];

/**
 * Get issuer by slug
 * @param {string} slug
 * @returns {Object|undefined}
 */
function getIssuerBySlug(slug) {
  return ETF_ISSUERS.find(i => i.slug === slug);
}

/**
 * Get issuer by name (case-insensitive partial match)
 * @param {string} name
 * @returns {Object|undefined}
 */
function getIssuerByName(name) {
  const lowerName = name.toLowerCase();
  return ETF_ISSUERS.find(i =>
    i.name.toLowerCase().includes(lowerName) ||
    i.fullName.toLowerCase().includes(lowerName)
  );
}

/**
 * Infer issuer slug from ETF name
 * @param {string} etfName
 * @returns {string} Issuer slug or 'other'
 */
function inferIssuerFromName(etfName) {
  const lowerName = etfName.toLowerCase();

  if (lowerName.includes('vanguard')) return 'vanguard';
  if (lowerName.includes('ishares')) return 'ishares';
  if (lowerName.includes('spdr')) return 'spdr';
  if (lowerName.includes('schwab')) return 'schwab';
  if (lowerName.includes('invesco') || lowerName.includes('powershares')) return 'invesco';
  if (lowerName.includes('fidelity')) return 'fidelity';
  if (lowerName.includes('proshares')) return 'proshares';
  if (lowerName.includes('vaneck')) return 'vaneck';
  if (lowerName.includes('wisdomtree')) return 'wisdomtree';
  if (lowerName.includes('first trust')) return 'first-trust';
  if (lowerName.includes('global x')) return 'global-x';
  if (lowerName.includes('ark ')) return 'ark';
  if (lowerName.includes('dimensional') || lowerName.includes('avantis')) return 'dimensional';
  if (lowerName.includes('simplify')) return 'simplify';
  if (lowerName.includes('jpmorgan') || lowerName.includes('j.p. morgan')) return 'jpmorgan';
  if (lowerName.includes('goldman')) return 'goldman';
  if (lowerName.includes('direxion')) return 'direxion';
  if (lowerName.includes('pacer')) return 'pacer';

  return 'other';
}

module.exports = {
  ETF_ISSUERS,
  getIssuerBySlug,
  getIssuerByName,
  inferIssuerFromName
};
