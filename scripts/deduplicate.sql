-- Financial Data Deduplication SQL Script
-- Keeps the most complete record (longest data field) for each duplicate group
-- Run with: sqlite3 data/stocks.db < scripts/deduplicate.sql

-- First, create a temp table with the records to keep
CREATE TEMP TABLE keep_records AS
SELECT MIN(id) as keep_id
FROM (
  SELECT id, company_id, fiscal_year, fiscal_period, period_type, statement_type,
         LENGTH(COALESCE(data, '')) as data_len,
         ROW_NUMBER() OVER (
           PARTITION BY company_id, fiscal_year, fiscal_period, period_type, statement_type
           ORDER BY LENGTH(COALESCE(data, '')) DESC, id DESC
         ) as rn
  FROM financial_data
)
WHERE rn = 1
GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type;

-- Create index for faster lookup
CREATE INDEX temp.idx_keep ON keep_records(keep_id);

-- Delete all records not in the keep list
DELETE FROM financial_data
WHERE id NOT IN (SELECT keep_id FROM keep_records);

-- Drop the temp table
DROP TABLE keep_records;

-- Vacuum to reclaim space
VACUUM;

-- Show final count
SELECT 'Remaining duplicates: ' || COUNT(*)
FROM (
  SELECT company_id, fiscal_year, fiscal_period, period_type, statement_type
  FROM financial_data
  GROUP BY company_id, fiscal_year, fiscal_period, period_type, statement_type
  HAVING COUNT(*) > 1
);
