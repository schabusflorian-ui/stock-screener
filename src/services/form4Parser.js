/**
 * Form 4 Parser - Parses SEC Form 4 XML filings for insider transactions
 *
 * Form 4 is filed within 2 business days of an insider transaction.
 * XML structure: ownershipDocument -> issuer, reportingOwner, nonDerivativeTable, derivativeTable
 */

const xml2js = require('xml2js');

// Transaction code meanings per SEC rules
const TRANSACTION_CODES = {
  // Open market and private transactions
  'P': { type: 'buy', name: 'Open market or private purchase', isOpenMarket: true },
  'S': { type: 'sell', name: 'Open market or private sale', isOpenMarket: true },

  // Grants and awards
  'A': { type: 'award', name: 'Grant, award, or other acquisition' },
  'K': { type: 'award', name: 'Equity swap or similar instrument' },

  // Options and conversions
  'M': { type: 'exercise', name: 'Exercise or conversion of derivative' },
  'C': { type: 'conversion', name: 'Conversion of derivative' },
  'E': { type: 'expiration', name: 'Expiration of short derivative' },

  // Dispositions
  'D': { type: 'return', name: 'Disposition to issuer' },
  'F': { type: 'tax', name: 'Payment of exercise price or tax' },
  'G': { type: 'gift', name: 'Bona fide gift' },
  'L': { type: 'discretionary', name: 'Small acquisition under Rule 16a-6' },
  'W': { type: 'inheritance', name: 'Acquisition or disposition by will or laws of descent' },

  // Other
  'I': { type: 'discretionary', name: 'Discretionary transaction' },
  'J': { type: 'other', name: 'Other (see footnotes)' },
  'U': { type: 'tender', name: 'Disposition pursuant to tender offer' },
  'X': { type: 'exercise', name: 'Exercise of in-the-money derivative' },
  'Z': { type: 'other', name: 'Deposit or withdrawal from voting trust' },
};

// Officer title patterns for normalization
const TITLE_PATTERNS = {
  ceo: /\b(ceo|chief\s+executive\s+officer)\b/i,
  cfo: /\b(cfo|chief\s+financial\s+officer)\b/i,
  coo: /\b(coo|chief\s+operating\s+officer)\b/i,
  cto: /\b(cto|chief\s+technology\s+officer)\b/i,
  president: /\b(president)\b/i,
  chairman: /\b(chairman|chair)\b/i,
  director: /\b(director)\b/i,
  vp: /\b(vp|vice\s+president)\b/i,
  controller: /\b(controller|comptroller)\b/i,
  treasurer: /\b(treasurer)\b/i,
  secretary: /\b(secretary)\b/i,
  general_counsel: /\b(general\s+counsel|chief\s+legal)\b/i,
};

class Form4Parser {
  constructor() {
    this.parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true,
    });
  }

  /**
   * Parse a Form 4 XML document
   * @param {string} xmlContent - Raw XML content
   * @returns {Object} Parsed form data
   */
  async parse(xmlContent) {
    try {
      const result = await this.parser.parseStringPromise(xmlContent);
      const doc = result.ownershipDocument;

      if (!doc) {
        throw new Error('Invalid Form 4: missing ownershipDocument');
      }

      return {
        issuer: this.parseIssuer(doc.issuer),
        owner: this.parseOwner(doc.reportingOwner),
        transactions: this.parseAllTransactions(doc),
        filing: this.parseFilingInfo(doc),
        footnotes: this.parseFootnotes(doc.footnotes),
      };
    } catch (error) {
      throw new Error(`Form 4 parsing failed: ${error.message}`);
    }
  }

  /**
   * Parse issuer (company) information
   */
  parseIssuer(issuer) {
    if (!issuer) return null;

    return {
      cik: this.cleanValue(issuer.issuerCik),
      name: this.cleanValue(issuer.issuerName),
      ticker: this.cleanValue(issuer.issuerTradingSymbol)?.toUpperCase(),
    };
  }

  /**
   * Parse reporting owner (insider) information
   */
  parseOwner(reportingOwner) {
    if (!reportingOwner) return null;

    // Handle array of owners (rare but possible)
    const owners = Array.isArray(reportingOwner) ? reportingOwner : [reportingOwner];

    return owners.map(owner => {
      const id = owner.reportingOwnerId || {};
      const address = owner.reportingOwnerAddress || {};
      const relationship = owner.reportingOwnerRelationship || {};

      const title = this.cleanValue(relationship.officerTitle);

      return {
        cik: this.cleanValue(id.rptOwnerCik),
        name: this.cleanValue(id.rptOwnerName),

        // Address (sometimes useful for identifying individuals)
        street1: this.cleanValue(address.rptOwnerStreet1),
        street2: this.cleanValue(address.rptOwnerStreet2),
        city: this.cleanValue(address.rptOwnerCity),
        state: this.cleanValue(address.rptOwnerState),
        zipCode: this.cleanValue(address.rptOwnerZipCode),

        // Relationship to company
        isDirector: this.parseBoolean(relationship.isDirector),
        isOfficer: this.parseBoolean(relationship.isOfficer),
        isTenPercentOwner: this.parseBoolean(relationship.isTenPercentOwner),
        isOther: this.parseBoolean(relationship.isOther),
        officerTitle: title,
        otherText: this.cleanValue(relationship.otherText),

        // Normalized title detection
        titleFlags: this.detectTitleFlags(title),
      };
    });
  }

  /**
   * Detect specific officer titles
   */
  detectTitleFlags(title) {
    if (!title) return {};

    const flags = {};
    for (const [key, pattern] of Object.entries(TITLE_PATTERNS)) {
      flags[key] = pattern.test(title);
    }
    return flags;
  }

  /**
   * Parse all transactions (non-derivative and derivative)
   */
  parseAllTransactions(doc) {
    const transactions = [];

    // Non-derivative transactions (common stock, etc.)
    if (doc.nonDerivativeTable) {
      const nonDerivTx = doc.nonDerivativeTable.nonDerivativeTransaction;
      const nonDerivHolding = doc.nonDerivativeTable.nonDerivativeHolding;

      if (nonDerivTx) {
        const items = Array.isArray(nonDerivTx) ? nonDerivTx : [nonDerivTx];
        items.forEach(tx => {
          const parsed = this.parseNonDerivativeTransaction(tx);
          if (parsed) transactions.push(parsed);
        });
      }

      // Holdings are positions without transactions (for context)
      if (nonDerivHolding) {
        const items = Array.isArray(nonDerivHolding) ? nonDerivHolding : [nonDerivHolding];
        items.forEach(holding => {
          const parsed = this.parseNonDerivativeHolding(holding);
          if (parsed) transactions.push(parsed);
        });
      }
    }

    // Derivative transactions (options, warrants, etc.)
    if (doc.derivativeTable) {
      const derivTx = doc.derivativeTable.derivativeTransaction;
      const derivHolding = doc.derivativeTable.derivativeHolding;

      if (derivTx) {
        const items = Array.isArray(derivTx) ? derivTx : [derivTx];
        items.forEach(tx => {
          const parsed = this.parseDerivativeTransaction(tx);
          if (parsed) transactions.push(parsed);
        });
      }

      if (derivHolding) {
        const items = Array.isArray(derivHolding) ? derivHolding : [derivHolding];
        items.forEach(holding => {
          const parsed = this.parseDerivativeHolding(holding);
          if (parsed) transactions.push(parsed);
        });
      }
    }

    return transactions;
  }

  /**
   * Parse a non-derivative (common stock) transaction
   */
  parseNonDerivativeTransaction(tx) {
    const coding = tx.transactionCoding || {};
    const amounts = tx.transactionAmounts || {};
    const postAmounts = tx.postTransactionAmounts || {};
    const ownership = tx.ownershipNature || {};

    const code = this.cleanValue(coding.transactionCode);
    const codeInfo = TRANSACTION_CODES[code] || { type: 'unknown', name: code };

    const shares = this.parseNumber(amounts.transactionShares?.value);
    const pricePerShare = this.parseNumber(amounts.transactionPricePerShare?.value);
    const acquiredDisposed = this.cleanValue(amounts.transactionAcquiredDisposedCode?.value);

    // If it's a disposition, shares should be negative for calculations
    const signedShares = acquiredDisposed === 'D' ? -Math.abs(shares) : Math.abs(shares);

    return {
      isDerivative: false,
      isHolding: false,

      // Security
      securityTitle: this.cleanValue(tx.securityTitle?.value),

      // Transaction
      transactionDate: this.cleanValue(tx.transactionDate?.value),
      transactionCode: code,
      transactionType: codeInfo.type,
      transactionName: codeInfo.name,
      isOpenMarket: codeInfo.isOpenMarket || false,
      is10b51Plan: this.parseBoolean(coding.transactionTimeliness),

      // Amounts
      shares: shares,
      signedShares: signedShares,
      pricePerShare: pricePerShare,
      totalValue: shares && pricePerShare ? shares * pricePerShare : null,

      // Direction
      acquisitionDisposition: acquiredDisposed, // 'A' = acquired, 'D' = disposed

      // Post-transaction
      sharesOwnedAfter: this.parseNumber(postAmounts.sharesOwnedFollowingTransaction?.value),

      // Ownership type
      directIndirect: this.cleanValue(ownership.directOrIndirectOwnership?.value), // 'D' or 'I'
      indirectOwnershipNature: this.cleanValue(ownership.natureOfOwnership?.value),

      // Footnotes
      footnoteIds: this.extractFootnoteIds(tx),
    };
  }

  /**
   * Parse a non-derivative holding (position without transaction)
   */
  parseNonDerivativeHolding(holding) {
    const postAmounts = holding.postTransactionAmounts || {};
    const ownership = holding.ownershipNature || {};

    return {
      isDerivative: false,
      isHolding: true,

      securityTitle: this.cleanValue(holding.securityTitle?.value),
      sharesOwnedAfter: this.parseNumber(postAmounts.sharesOwnedFollowingTransaction?.value),
      directIndirect: this.cleanValue(ownership.directOrIndirectOwnership?.value),
      indirectOwnershipNature: this.cleanValue(ownership.natureOfOwnership?.value),
    };
  }

  /**
   * Parse a derivative (options, warrants) transaction
   */
  parseDerivativeTransaction(tx) {
    const coding = tx.transactionCoding || {};
    const amounts = tx.transactionAmounts || {};
    const postAmounts = tx.postTransactionAmounts || {};
    const underlying = tx.underlyingSecurity || {};
    const ownership = tx.ownershipNature || {};

    const code = this.cleanValue(coding.transactionCode);
    const codeInfo = TRANSACTION_CODES[code] || { type: 'unknown', name: code };

    const shares = this.parseNumber(amounts.transactionShares?.value);
    const pricePerShare = this.parseNumber(amounts.transactionPricePerShare?.value);
    const acquiredDisposed = this.cleanValue(amounts.transactionAcquiredDisposedCode?.value);

    return {
      isDerivative: true,
      isHolding: false,

      // Derivative security
      securityTitle: this.cleanValue(tx.securityTitle?.value),
      conversionOrExercisePrice: this.parseNumber(tx.conversionOrExercisePrice?.value),
      exerciseDate: this.cleanValue(tx.exerciseDate?.value),
      expirationDate: this.cleanValue(tx.expirationDate?.value),

      // Transaction
      transactionDate: this.cleanValue(tx.transactionDate?.value),
      transactionCode: code,
      transactionType: codeInfo.type,
      transactionName: codeInfo.name,

      // Amounts
      shares: shares,
      pricePerShare: pricePerShare,
      totalValue: shares && pricePerShare ? shares * pricePerShare : null,
      acquisitionDisposition: acquiredDisposed,

      // Underlying security
      underlyingSecurityTitle: this.cleanValue(underlying.underlyingSecurityTitle?.value),
      underlyingShares: this.parseNumber(underlying.underlyingSecurityShares?.value),

      // Post-transaction
      sharesOwnedAfter: this.parseNumber(postAmounts.sharesOwnedFollowingTransaction?.value),

      // Ownership
      directIndirect: this.cleanValue(ownership.directOrIndirectOwnership?.value),
      indirectOwnershipNature: this.cleanValue(ownership.natureOfOwnership?.value),

      footnoteIds: this.extractFootnoteIds(tx),
    };
  }

  /**
   * Parse derivative holding
   */
  parseDerivativeHolding(holding) {
    const postAmounts = holding.postTransactionAmounts || {};
    const underlying = holding.underlyingSecurity || {};
    const ownership = holding.ownershipNature || {};

    return {
      isDerivative: true,
      isHolding: true,

      securityTitle: this.cleanValue(holding.securityTitle?.value),
      conversionOrExercisePrice: this.parseNumber(holding.conversionOrExercisePrice?.value),
      exerciseDate: this.cleanValue(holding.exerciseDate?.value),
      expirationDate: this.cleanValue(holding.expirationDate?.value),

      underlyingSecurityTitle: this.cleanValue(underlying.underlyingSecurityTitle?.value),
      underlyingShares: this.parseNumber(underlying.underlyingSecurityShares?.value),

      sharesOwnedAfter: this.parseNumber(postAmounts.sharesOwnedFollowingTransaction?.value),
      directIndirect: this.cleanValue(ownership.directOrIndirectOwnership?.value),
    };
  }

  /**
   * Parse filing metadata
   */
  parseFilingInfo(doc) {
    return {
      schemaVersion: this.cleanValue(doc.schemaVersion),
      documentType: this.cleanValue(doc.documentType),
      periodOfReport: this.cleanValue(doc.periodOfReport),
      notSubjectToSection16: this.parseBoolean(doc.notSubjectToSection16),
      form3HoldingsReported: this.parseBoolean(doc.form3HoldingsReported),
      form4TransactionsReported: this.parseBoolean(doc.form4TransactionsReported),
    };
  }

  /**
   * Parse footnotes
   */
  parseFootnotes(footnotes) {
    if (!footnotes?.footnote) return {};

    const notes = Array.isArray(footnotes.footnote)
      ? footnotes.footnote
      : [footnotes.footnote];

    const result = {};
    notes.forEach(note => {
      const id = note.id || note.$?.id;
      const text = typeof note === 'string' ? note : note._ || note.text || '';
      if (id) {
        result[id] = this.cleanValue(text);
      }
    });

    return result;
  }

  /**
   * Extract footnote IDs from a transaction element
   */
  extractFootnoteIds(element) {
    const ids = [];
    const traverse = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.footnoteId) {
        const footnoteId = obj.footnoteId;
        const items = Array.isArray(footnoteId) ? footnoteId : [footnoteId];
        items.forEach(f => {
          const id = f.id || f.$?.id || f;
          if (id && typeof id === 'string') ids.push(id);
        });
      }
      Object.values(obj).forEach(traverse);
    };
    traverse(element);
    return [...new Set(ids)];
  }

  // Utility methods
  cleanValue(val) {
    if (val === undefined || val === null) return null;
    if (typeof val === 'object') val = val._ || val.value || val.text || '';
    return String(val).trim() || null;
  }

  parseNumber(val) {
    if (val === undefined || val === null) return null;
    if (typeof val === 'object') val = val._ || val.value || '';
    const num = parseFloat(String(val).replace(/[,$]/g, ''));
    return isNaN(num) ? null : num;
  }

  parseBoolean(val) {
    if (val === undefined || val === null) return false;
    if (typeof val === 'boolean') return val;
    const str = String(val).toLowerCase().trim();
    return str === '1' || str === 'true' || str === 'yes';
  }
}

module.exports = Form4Parser;
