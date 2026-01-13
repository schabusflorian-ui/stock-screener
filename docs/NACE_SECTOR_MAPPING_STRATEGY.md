# NACE to GICS Sector Mapping Strategy

## Overview

Implement sector/industry classification for EU/UK companies using NACE codes and map them to GICS sectors for consistency with US data.

**Current State**: Only 60/2,904 EU/UK companies (2.1%) have sector data
**Target**: 80%+ coverage using multiple data sources

## Understanding the Classification Systems

### NACE (EU Standard)
- **Name**: Nomenclature of Economic Activities
- **Structure**: 4-digit hierarchical code
  - First 2 digits: Division (e.g., "64" = Financial service activities)
  - 3rd digit: Group (e.g., "641" = Monetary intermediation)
  - 4th digit: Class (e.g., "6419" = Other monetary intermediation)
- **Version**: NACE Rev 2 (current), Rev 2.1 (from Jan 2025)
- **Authority**: Eurostat
- **Coverage**: All EU/UK companies must use for official filings

### GICS (Global Standard)
- **Name**: Global Industry Classification Standard
- **Structure**: 8-digit hierarchical code
  - Digits 1-2: Sector (e.g., "40" = Financials)
  - Digits 3-4: Industry Group (e.g., "4030" = Banks)
  - Digits 5-6: Industry (e.g., "403010" = Banks)
  - Digits 7-8: Sub-Industry (e.g., "40301010" = Diversified Banks)
- **Authority**: MSCI & S&P Global
- **Coverage**: Global equity markets, used in US data

### Why Map NACE → GICS?

1. **Consistency**: US companies use GICS, need same taxonomy for EU
2. **Compatibility**: Screening/filtering across US+EU markets
3. **Industry Analysis**: Compare European banks vs. US banks
4. **Existing Code**: Sector analysis already uses GICS sectors

## Data Sources Strategy

### Phase 1: Extract NACE from XBRL Filings (Primary Source)

**Availability**: XBRL filings contain entity information including NACE codes

**Implementation**:
1. Enhance `xbrlParser.js` to extract NACE from entity metadata
2. Store in `companies.nace_code` column (need to add)
3. Map NACE → GICS using lookup table

**Expected Coverage**: 80-90% (all companies filing XBRL)

**Advantages**:
- Free, authoritative source
- Already in our database (xbrl_filings)
- Updates automatically with new filings

---

### Phase 2: Yahoo Finance Fallback (Secondary Source)

**Availability**: Yahoo Finance has sector/industry for most EU companies

**Implementation**:
1. Query Yahoo Finance for missing companies
2. Map Yahoo sectors to GICS
3. Store as fallback when NACE unavailable

**Expected Coverage**: +5-10% additional

**Advantages**:
- Free
- Already used for price data
- Good coverage for major stocks

---

### Phase 3: Manual Classification (Tertiary Source)

**For remaining companies without NACE or Yahoo data**:
1. Use company name heuristics (e.g., "Bank" → Financials)
2. Manual review of top 100 companies
3. Leave rest unclassified

**Expected Coverage**: +2-5% additional

---

## Implementation Plan

### Step 1: Add NACE Column to Database

```sql
ALTER TABLE companies ADD COLUMN nace_code TEXT;
ALTER TABLE companies ADD COLUMN nace_description TEXT;
CREATE INDEX idx_companies_nace ON companies(nace_code);
```

### Step 2: Enhance XBRL Parser

**File**: `src/services/xbrl/xbrlParser.js`

Add NACE extraction to entity parsing:

```javascript
// In parseXBRLJson() method
const entityInfo = this._extractEntityInfo(json);

// New method
_extractEntityInfo(json) {
  return {
    lei: json.entity?.lei || json.documentInfo?.lei,
    name: json.entity?.name || json.documentInfo?.entityName,
    naceCode: json.entity?.naceCode || json.entity?.['nace:Code'],
    naceDescription: json.entity?.naceDescription,
    country: json.entity?.country
  };
}
```

### Step 3: Create NACE to GICS Mapping Table

**Source**: [WiserFunding NACE-GICS Mapping](https://knowledge.wiserfunding.com/hubfs/kb-repository/WF-NACE-GICS-20240808.pdf)

**Alternative Sources**:
- [S&P Global NACE-to-GICS Mapping](https://www.spglobal.com/spdji/en/documents/additional-material/sp-global-gics-sub-industry-climate-impact.pdf)
- [Classification.Codes NACE Data](https://classification.codes/classifications/industry/nace)
- [GitHub NACE Rev 2 Gist](https://gist.github.com/b-rodrigues/4218d6daa8275acce80ebef6377953fe)

**Structure**:
```javascript
// data/nace-to-gics-mapping.json
{
  "01": {  // NACE Division
    "sector": "Materials",
    "gicsSector": "15",
    "industry": "Agriculture",
    "gicsIndustry": "151010"
  },
  "64": {
    "sector": "Financials",
    "gicsSector": "40",
    "industry": "Banks",
    "gicsIndustry": "401010"
  }
  // ... 600+ mappings
}
```

### Step 4: Create NACE Enrichment Script

**File**: `data/enrich-nace-sectors.js`

```javascript
/**
 * NACE Sector Enrichment Script
 *
 * Extracts NACE codes from XBRL filings and maps to GICS sectors
 */

const Database = require('better-sqlite3');
const path = require('path');
const naceMapping = require('./nace-to-gics-mapping.json');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Step 1: Extract NACE from xbrl_filings raw_json
// Step 2: Look up GICS sector from mapping
// Step 3: Update companies table
// Step 4: Fallback to Yahoo Finance for missing

console.log('Enriching EU/UK companies with NACE-based sectors...');
```

### Step 5: Update FundamentalStore

**File**: `src/services/xbrl/fundamentalStore.js`

Add NACE storage when storing filing:

```javascript
storeFiling(filing) {
  // ... existing code ...

  // Update company NACE if available
  if (filing.naceCode) {
    this.db.prepare(`
      UPDATE companies
      SET nace_code = ?,
          nace_description = ?,
          sector = ?,
          industry = ?
      WHERE lei = ?
    `).run(
      filing.naceCode,
      filing.naceDescription,
      this._mapNACEToGICSSector(filing.naceCode),
      this._mapNACEToGICSIndustry(filing.naceCode),
      filing.lei
    );
  }
}
```

---

## GICS Sector Structure (Target)

We'll map NACE to these 11 GICS sectors:

| GICS Code | Sector Name | Example EU Industries |
|-----------|-------------|----------------------|
| 10 | Energy | Oil & Gas, Utilities |
| 15 | Materials | Mining, Chemicals |
| 20 | Industrials | Manufacturing, Transport |
| 25 | Consumer Discretionary | Retail, Auto, Hotels |
| 30 | Consumer Staples | Food, Beverages, Household |
| 35 | Health Care | Pharma, Biotech, Medical Devices |
| 40 | Financials | Banks, Insurance, Real Estate |
| 45 | Information Technology | Software, Hardware, Semiconductors |
| 50 | Communication Services | Telecom, Media |
| 55 | Utilities | Electric, Water, Gas |
| 60 | Real Estate | REITs, Real Estate Management |

---

## NACE → GICS Mapping Examples

### Financial Services (NACE 64-66 → GICS 40)

| NACE | Description | GICS | Industry |
|------|-------------|------|----------|
| 6419 | Other monetary intermediation | 40301010 | Diversified Banks |
| 6499 | Other financial service activities | 40203010 | Investment Banking & Brokerage |
| 6511 | Life insurance | 40301020 | Insurance |
| 6612 | Security and commodity brokers | 40203010 | Capital Markets |

### Technology (NACE 26, 58-63 → GICS 45)

| NACE | Description | GICS | Industry |
|------|-------------|------|----------|
| 2620 | Manufacture of computers | 45301010 | Technology Hardware |
| 5821 | Publishing of computer games | 45101010 | Software |
| 6201 | Computer programming | 45101010 | IT Services |
| 6311 | Data processing, hosting | 45101020 | IT Consulting |

### Consumer Goods (NACE 10-15 → GICS 30)

| NACE | Description | GICS | Industry |
|------|-------------|------|----------|
| 1073 | Manufacture of macaroni | 30201030 | Packaged Foods |
| 1105 | Manufacture of beer | 30202030 | Brewers |
| 1419 | Manufacture of other wearing apparel | 25202010 | Apparel Retail |

---

## Expected Results

### Coverage Targets

| Metric | Before | After Phase 1 | After Phase 2 | After Phase 3 |
|--------|--------|---------------|---------------|---------------|
| Companies with sector | 60 (2%) | 2,320 (80%) | 2,610 (90%) | 2,760 (95%) |
| NACE codes extracted | 0 | 2,200 | 2,200 | 2,200 |
| Yahoo fallback | 60 | 120 | 410 | 410 |
| Manual classification | 0 | 0 | 0 | 150 |

### Data Quality Validation

**Validation checks**:
1. Sector distribution reasonable (no single sector > 30%)
2. Known companies correctly classified (e.g., LVMH = Consumer Discretionary)
3. No "Unknown" or null for top 500 companies
4. Consistency with US peer companies

---

## Integration Points

### 1. Screening Page
```javascript
// Filter by sector
WHERE c.sector = 'Financials' AND c.country IN ('FR', 'DE', 'GB')
```

### 2. Sector Analysis
```javascript
// Compare sectors across regions
SELECT sector, country, AVG(pe_ratio), AVG(roe)
FROM companies
GROUP BY sector, country
```

### 3. Company Page
```html
<div className="company-classification">
  <span className="sector">{company.sector}</span>
  <span className="industry">{company.industry}</span>
  <span className="nace">NACE {company.nace_code}</span>
</div>
```

---

## Alternative: Financial Modeling Prep API

If NACE extraction proves difficult, fallback to paid API:

**Cost**: $50/month
**Coverage**: 95%+ EU companies
**Data**: Sector, industry, country, market cap, prices

**Endpoint**:
```javascript
GET https://financialmodelingprep.com/api/v3/profile/{symbol}
```

**Response includes**:
```json
{
  "symbol": "AIR.PA",
  "companyName": "Airbus SE",
  "sector": "Industrials",
  "industry": "Aerospace & Defense",
  "country": "FR"
}
```

---

## Implementation Timeline

### Week 1: Foundation
- ✅ Day 1-2: Add NACE columns to database
- ✅ Day 3: Create NACE-to-GICS mapping JSON file
- ✅ Day 4-5: Enhance XBRL parser to extract NACE

### Week 2: Enrichment
- ⏭️ Day 1-2: Create enrichment script
- ⏭️ Day 3: Run enrichment on existing filings
- ⏭️ Day 4: Validate results, fix mappings
- ⏭️ Day 5: Yahoo Finance fallback for missing

### Week 3: Integration
- ⏭️ Day 1-2: Update screening filters
- ⏭️ Day 3: Update sector analysis
- ⏭️ Day 4-5: Frontend display updates

**Total Effort**: 10-15 days

---

## Success Criteria

✅ **80%+ companies have sector** (2,320+/2,904)
✅ **GICS sectors match US taxonomy** (same 11 sectors)
✅ **Known companies correctly classified** (manual spot checks)
✅ **Screening by sector works** (returns expected companies)
✅ **Sector distribution reasonable** (no single sector > 30%)

---

## Risks & Mitigations

### Risk 1: NACE Codes Not in XBRL Filings
**Likelihood**: Medium
**Impact**: High
**Mitigation**: Fallback to Financial Modeling Prep API ($50/month)

### Risk 2: NACE → GICS Mapping Incomplete
**Likelihood**: Medium
**Impact**: Medium
**Mitigation**: Use multiple mapping sources, allow manual overrides

### Risk 3: GICS Changes Over Time
**Likelihood**: Low (last change: March 2023)
**Impact**: Low
**Mitigation**: Use latest GICS version, plan for updates

---

## Resources

### Mapping Files
- [WiserFunding NACE-GICS Mapping PDF](https://knowledge.wiserfunding.com/hubfs/kb-repository/WF-NACE-GICS-20240808.pdf)
- [S&P Global NACE-to-GICS Climate Impact](https://www.spglobal.com/spdji/en/documents/additional-material/sp-global-gics-sub-industry-climate-impact.pdf)
- [Classification.Codes NACE Data](https://classification.codes/classifications/industry/nace)

### NACE Code Lists
- [GitHub NACE Rev 2 Gist](https://gist.github.com/b-rodrigues/4218d6daa8275acce80ebef6377953fe)
- [R Package NACE Data](https://vincentarelbundock.github.io/Rdatasets/doc/validate/nace_rev2.html)
- [CSO Ireland NACE List](https://www.cso.ie/en/qnhs/qnhsmethodology/naceclassificationslist/)

### GICS Documentation
- [GICS Structure (Classification.Codes)](https://classification.codes/classifications/industry/gics)
- [MSCI GICS Methodology](https://www.msci.com/indexes/index-resources/gics)
- [GICS March 2023 Update (GitHub)](https://gist.github.com/uknj/c9bcf66ab379a35fcc8758f9a6c86ceb)

---

**Next Step**: Start with Phase 1 - Add database columns and extract sample NACE codes from XBRL filings to verify availability.
