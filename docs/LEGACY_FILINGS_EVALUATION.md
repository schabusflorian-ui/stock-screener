# Legacy EU/UK Financial Data (2015-2020) - Feasibility Evaluation

## Current State

### Historical Coverage Analysis

**Current Coverage by Year:**
| Year | Companies | Periods | Coverage |
|------|-----------|---------|----------|
| 2018 | 2 | 2 | 0.1% |
| 2019 | 29 | 33 | 1.4% |
| 2020 | 553 | 647 | 26.5% |
| 2021 | 1,438 | 1,866 | 68.8% |
| 2022 | 1,987 | 2,432 | 95.1% |
| 2023 | 2,093 | 2,440 | 100% (peak) |
| 2024 | 1,701 | 1,883 | 81.4% |
| 2025 | 1,175 | 1,258 | 56.3% |

**Gap: 2015-2019 has minimal coverage (<2% of companies)**

### Why the Gap Exists

The **ESEF (European Single Electronic Format)** mandate requiring XBRL filings only started:
- **2020**: Initial adoption by early movers
- **2021**: Full mandate for large EU/EEA issuers
- **2022+**: Full coverage achieved

Before 2020, EU companies filed in:
- PDF format (most common)
- HTML format (some jurisdictions)
- National formats (varies by country)
- Paper filings (still accepted in some cases)

## Option 1: Data Provider APIs (Easiest, Most Expensive)

### Available Services

#### 1. FinancialReports.eu
- **Coverage**: 8.3M documents from 22,493 companies across 44 countries
- **History**: Decades of historical data available
- **Format**: REST API, delivers to S3 bucket
- **Pricing**: Free tier (100 API calls/year), paid tiers for production
- **Advantages**:
  - Already parsed and structured
  - Includes PDF originals + extracted data
  - Covers all EU countries
- **Link**: [FinancialReports.eu API](https://financialreports.eu/api-solutions/)

#### 2. Finnworlds
- **Coverage**: 7,000+ publicly traded companies
- **History**: Historical and current filings
- **Format**: PDF downloads, API access
- **Features**: Financial Reports Database with standardized data
- **Link**: [Finnworlds API](https://finnworlds.com/financial-data/company-financial-statement-reports-api/)

#### 3. ECCBSO ERICA Database
- **Coverage**: 9 European countries (AT, BE, FR, DE, GR, IT, PT, ES, TR)
- **History**: Data from 2000 onwards
- **Standards**: IFRS-based, aggregated and harmonized
- **Access**: Academic/institutional focus
- **Link**: [ECCBSO Databases](https://www.eccbso.org/wba/databases)

### Cost Estimate
- **FinancialReports.eu**: €500-2,000/month for production API access
- **Finnworlds**: Custom pricing (likely €300-1,000/month)
- **One-time bulk purchase**: €5,000-15,000 for historical dataset

### Implementation Effort
- **Time**: 2-3 weeks
- **Complexity**: Low (API integration only)
- **Maintenance**: Low (provider handles updates)

## Option 2: PDF Parsing Tools (Medium Effort, Lower Cost)

### Commercial Tools

#### 1. ParsePort XBRL Converter
- **Speed**: Converts PDF to XBRL in 90 seconds
- **Formats**: Excel, Word, PDF → XBRL/iXBRL
- **Standards**: ESEF, GAAP, EBA, EIOPA, CSRD
- **Pricing**: Likely €200-500/month subscription
- **Link**: [ParsePort](https://parseport.com/xbrl-converter/)

#### 2. Prophix One
- **Focus**: Enterprise XBRL tagging platform
- **Features**: Financial statement conversion and tagging
- **Pricing**: Enterprise (€1,000+/month)
- **Link**: [Prophix XBRL](https://www.prophix.com/blog/how-to-do-xbrl-tagging-for-financial-reports/)

### Open Source Tools

#### 1. cafr-parsing (GitHub)
- **Format**: PDF → JSON → XBRL/CSV/Excel
- **Technology**: Python-based
- **Limitations**: Built for US municipal reports (CAFR), would need adaptation
- **Link**: [GitHub - cafr-parsing](https://github.com/OpenTechStrategies/cafr-parsing)

#### 2. ONS parsing_company_accounts (GitHub)
- **Technology**: Python + Tesseract OCR
- **Format**: PDF → XBRL parser
- **Limitations**: UK-focused, handles both XBRLi and older XBRL
- **Link**: [GitHub - ONS parsing](https://github.com/ONSBigData/parsing_company_accounts)

### Custom PDF Parsing Stack

**Technology Stack:**
1. **PDF Text Extraction**:
   - PyMuPDF (fast, accurate)
   - pdfplumber (table extraction)
   - Tabula (table parsing)

2. **Table Recognition**:
   - Camelot (lattice/stream table detection)
   - pdfplumber (coordinate-based extraction)

3. **NLP/ML for Field Mapping**:
   - Regex patterns for common accounting terms
   - spaCy for entity recognition
   - GPT-4 API for intelligent field mapping (most flexible)

4. **Validation**:
   - Cross-check against known totals
   - Balance sheet equation validation
   - Trend analysis vs. subsequent XBRL filings

### Cost Estimate
- **Commercial tools**: €200-500/month
- **Open source**: €0 (dev time only)
- **Custom stack**: €0 tools + GPT-4 API (~€50-200/month for large batch)

### Implementation Effort
- **Commercial**: 1-2 weeks integration
- **Open source adaptation**: 4-6 weeks
- **Custom stack**: 8-12 weeks full development

### Accuracy Estimate
- **Commercial tools**: 85-95% (depends on PDF quality)
- **Open source**: 70-85% (requires tuning)
- **Custom stack**: 75-90% (with GPT-4 assistance)

## Option 3: Hybrid Approach (Recommended)

### Strategy

**Phase 1: Quick Win (Weeks 1-2)**
- Use free tier of FinancialReports.eu for top 100-200 large caps
- Focus on FTSE 100, CAC 40, DAX 40, IBEX 35 companies
- These have highest-quality PDFs and standardized formats

**Phase 2: Automated Parsing (Weeks 3-8)**
- Build custom PDF parser using:
  - PyMuPDF + pdfplumber for text/table extraction
  - GPT-4 API for intelligent field mapping
  - Validation against 2020-2021 XBRL filings (ground truth)
- Process mid-cap and small-cap companies

**Phase 3: Selective Manual Review (Weeks 9-12)**
- Spot-check automated extractions
- Manually tag ambiguous cases
- Build training data for future ML improvements

### Cost Breakdown
- **FinancialReports.eu (Phase 1)**: €500-1,000 one-time
- **GPT-4 API (Phase 2)**: €100-300 for batch processing
- **Dev time**: 8-12 weeks (can be done incrementally)
- **Total**: €600-1,300 + dev time

### Expected Results
- **Coverage**: 60-80% of top 1,000 EU companies for 2015-2019
- **Accuracy**: 80-90% for key metrics (revenue, net income, assets, equity)
- **Time**: 3 months end-to-end

## Challenges & Limitations

### Technical Challenges

1. **Format Variability**
   - PDFs vary wildly in structure (scanned vs. digital, layouts, fonts)
   - Each country has different reporting standards pre-IFRS adoption
   - Terminology differences (e.g., "turnover" vs. "revenue")

2. **Table Extraction**
   - Financial statements often span multiple pages
   - Merged cells, sub-totals, footnote references
   - Currency conversions and restatements

3. **Data Quality**
   - OCR errors in scanned documents
   - Missing pages or corrupted PDFs
   - Inconsistent historical data (restatements, format changes)

4. **Field Mapping**
   - No standardized taxonomy pre-XBRL
   - Company-specific line items (e.g., "exceptional items")
   - Need to map to IFRS concepts for consistency

### Business Challenges

1. **ROI Uncertainty**
   - Historical data is less valuable than current data
   - Users may prefer 2020+ data with higher accuracy
   - Effort may not justify incremental coverage

2. **Maintenance Burden**
   - One-time project vs. ongoing data pipeline
   - No automatic updates for legacy data
   - Technical debt if parsing quality is poor

3. **Legal/Licensing**
   - Some filings may be copyrighted
   - Terms of service for scraping national registries
   - Need to verify redistribution rights

## Recommendation

### For Production App: **Hybrid Approach (Phases 1-2 only)**

**Rationale:**
1. **80/20 Rule**: Top 200 companies = 80% of market cap
2. **Data Quality**: Large caps have best PDF quality and standardized reporting
3. **Cost Efficiency**: €1,000-1,500 total for meaningful historical depth
4. **Time Efficient**: 6-8 weeks vs. 12+ weeks for full coverage

**Implementation:**
1. ✅ Use FinancialReports.eu API for top 200 EU companies (STOXX 600)
2. ✅ Build GPT-4-powered parser for mid-cap companies (201-1000)
3. ⚠️ Skip small-caps (<€500M market cap) - poor ROI
4. ✅ Validate against 2020-2021 XBRL to ensure accuracy

### For MVP: **Skip Legacy Data**

**Rationale:**
1. Current coverage (2020-2025) is already excellent (95%+ for 2021-2024)
2. 5-year history is sufficient for most analysis use cases
3. Can add legacy data later as a premium feature
4. Focus engineering effort on data quality over coverage breadth

## Alternative: Third-Party Fundamentals Providers

Instead of parsing PDFs yourself, consider established providers:

1. **Financial Modeling Prep** (~$50/month)
   - 10+ years historical fundamentals
   - Already standardized and cleaned
   - International coverage

2. **Alpha Vantage** (~$50-200/month)
   - Fundamental data API
   - Historical coverage to 2000
   - Good EU/UK coverage

3. **IEX Cloud** (~$100-500/month)
   - International data including EU
   - Historical fundamentals

**Cost**: $50-500/month vs. building custom parser
**Quality**: Professional-grade vs. 80-90% accuracy
**Time**: 1 week integration vs. 8-12 weeks development

## Decision Matrix

| Approach | Cost | Time | Accuracy | Coverage | Maintenance |
|----------|------|------|----------|----------|-------------|
| Data Provider API | €€€€ | ★ | ★★★★★ | ★★★★★ | ★★★★★ |
| Commercial PDF Tools | €€€ | ★★ | ★★★★ | ★★★★ | ★★★★ |
| Open Source Tools | € | ★★★ | ★★★ | ★★★ | ★★ |
| Custom Parser | €€ | ★★★★ | ★★★ | ★★★ | ★★ |
| Hybrid (Recommended) | €€ | ★★★ | ★★★★ | ★★★★ | ★★★ |
| Skip Legacy (MVP) | FREE | ★ | N/A | N/A | ★★★★★ |

**Legend**:
- Cost: € = <€500, €€ = €500-2K, €€€ = €2K-5K, €€€€ = >€5K
- Stars: More stars = better

---

## Sources

- [European Financial Filings Database | FinancialReports.eu](https://financialreports.eu/)
- [Financial Data API | FinancialReports.eu](https://financialreports.eu/api-solutions/)
- [Financial statement reports API - Finnworlds](https://finnworlds.com/financial-data/company-financial-statement-reports-api/)
- [Databases | ECCBSO](https://www.eccbso.org/wba/databases)
- [XBRL Converter Software | ParsePort](https://parseport.com/xbrl-converter/)
- [How to do XBRL tagging for financial reports in 2026 | Prophix](https://www.prophix.com/blog/how-to-do-xbrl-tagging-for-financial-reports/)
- [GitHub - cafr-parsing](https://github.com/OpenTechStrategies/cafr-parsing)
- [GitHub - ONS parsing_company_accounts](https://github.com/ONSBigData/parsing_company_accounts)
- [Ways to Convert Financial Statements to XBRL | Datatracks](https://datatracks.com/my/blog/ways-to-convert-financial-statements-to-the-xbrl-format/)

---

**Status**: Evaluation Complete
**Date**: January 2026
**Recommendation**: Hybrid approach for top 200-1000 companies OR skip for MVP and use third-party provider
