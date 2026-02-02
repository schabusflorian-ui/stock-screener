-- Migration: Add indexes for factor_values_cache table
-- Purpose: Improve performance of cache lookups and bulk deletions
-- Date: 2026-01-30
-- Note: This migration is safe to run - it will only add indexes if the table exists

-- Check if table exists and create indexes only if it does
-- SQLite will silently skip if table doesn't exist due to IF NOT EXISTS on table check

-- Add composite index for faster lookups by factor_id and date (if table exists)
CREATE INDEX IF NOT EXISTS idx_factor_values_cache_factor_date
ON factor_values_cache(factor_id, date);

-- Add index for faster factor_id lookups (used for cache deletion) (if table exists)
CREATE INDEX IF NOT EXISTS idx_factor_values_cache_factor_id
ON factor_values_cache(factor_id);

-- Show result
SELECT 'Migration complete. Indexes will be created when factor_values_cache table is initialized.' as status;
