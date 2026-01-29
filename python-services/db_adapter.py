"""
Database Adapter
Inspects actual database structure and adapts queries accordingly
"""

import sqlite3
from typing import Dict, List, Optional, Tuple


class DatabaseAdapter:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.schema_cache = {}
        self._inspect_schema()

    def get_connection(self):
        return sqlite3.connect(self.db_path)

    def _inspect_schema(self):
        """Inspect actual database schema and cache it."""
        conn = self.get_connection()
        cursor = conn.cursor()

        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]

        # Get schema for each table
        for table in tables:
            cursor.execute(f"PRAGMA table_info({table})")
            columns = {row[1]: row[2] for row in cursor.fetchall()}
            self.schema_cache[table] = columns

        conn.close()

        print(f"Found {len(tables)} tables in database")

    def get_company_identifier_column(self) -> Tuple[str, str]:
        """
        Find the stock symbol/ticker column in companies table.
        Returns: (column_name, sample_value)
        """
        companies_schema = self.schema_cache.get('companies', {})

        # Common column names for stock symbols
        symbol_candidates = ['symbol', 'ticker', 'stock_symbol', 'trading_symbol']

        for candidate in symbol_candidates:
            if candidate in companies_schema:
                return candidate, self._get_sample_value('companies', candidate)

        # If not found, list available columns for manual selection
        print(f"Could not auto-detect symbol column. Available columns:")
        print(f"   {list(companies_schema.keys())}")
        raise ValueError("Please specify the symbol column name manually")

    def get_company_pk_column(self) -> str:
        """Find the primary key column in companies table."""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(companies)")

        for row in cursor.fetchall():
            if row[5] == 1:  # pk flag
                conn.close()
                return row[1]

        conn.close()
        return 'id'  # Default assumption

    def _get_sample_value(self, table: str, column: str) -> Optional[str]:
        """Get a sample value from a column."""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute(f"SELECT {column} FROM {table} WHERE {column} IS NOT NULL LIMIT 1")
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None

    def get_companies_for_import(self,
                                  limit: Optional[int] = None,
                                  offset: int = 0,
                                  exclude_imported: bool = True) -> List[Dict]:
        """
        Get companies that need price data imported.
        Adapts to actual database schema.
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        pk_col = self.get_company_pk_column()
        symbol_col, _ = self.get_company_identifier_column()

        # Check if we have an is_active column
        has_active = 'is_active' in self.schema_cache.get('companies', {})

        # Check if price_import_log exists
        has_import_log = 'price_import_log' in self.schema_cache

        # Build query
        sql = f"""
            SELECT c.{pk_col} as id, c.{symbol_col} as symbol
        """

        # Add name if available
        if 'name' in self.schema_cache.get('companies', {}):
            sql += ", c.name"
        elif 'company_name' in self.schema_cache.get('companies', {}):
            sql += ", c.company_name as name"
        else:
            sql += ", NULL as name"

        sql += f" FROM companies c"

        # Exclude already imported if requested and table exists
        if exclude_imported and has_import_log:
            sql += f"""
                LEFT JOIN (
                    SELECT company_id, MAX(completed_at) as last_import
                    FROM price_import_log
                    WHERE status = 'success'
                    GROUP BY company_id
                ) pil ON c.{pk_col} = pil.company_id
            """

        sql += f" WHERE c.{symbol_col} IS NOT NULL AND c.{symbol_col} != ''"

        # Exclude CIK-based symbols (not tradeable on exchanges)
        sql += f" AND c.{symbol_col} NOT LIKE 'CIK_%'"

        if has_active:
            sql += " AND c.is_active = 1"

        if exclude_imported and has_import_log:
            sql += " AND pil.company_id IS NULL"

        sql += f" ORDER BY c.{symbol_col}"

        if limit:
            sql += f" LIMIT {limit} OFFSET {offset}"

        cursor.execute(sql)

        companies = []
        for row in cursor.fetchall():
            companies.append({
                'id': row[0],
                'symbol': row[1],
                'name': row[2]
            })

        conn.close()
        return companies

    def get_total_company_count(self) -> int:
        """Get total count of tradeable companies (excludes CIK-based symbols)."""
        conn = self.get_connection()
        cursor = conn.cursor()

        symbol_col, _ = self.get_company_identifier_column()
        has_active = 'is_active' in self.schema_cache.get('companies', {})

        sql = f"SELECT COUNT(*) FROM companies WHERE {symbol_col} IS NOT NULL AND {symbol_col} != ''"
        sql += f" AND {symbol_col} NOT LIKE 'CIK_%'"
        if has_active:
            sql += " AND is_active = 1"

        cursor.execute(sql)
        count = cursor.fetchone()[0]
        conn.close()
        return count

    def ensure_price_tables_exist(self):
        """Create price tables if they don't exist."""
        conn = self.get_connection()
        cursor = conn.cursor()

        pk_col = self.get_company_pk_column()

        # Check if daily_prices exists (use existing table name)
        has_daily_prices = 'daily_prices' in self.schema_cache

        if not has_daily_prices:
            # Create daily_prices table
            cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS daily_prices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    company_id INTEGER NOT NULL,
                    date DATE NOT NULL,
                    open REAL,
                    high REAL,
                    low REAL,
                    close REAL NOT NULL,
                    adjusted_close REAL,
                    volume INTEGER,
                    source TEXT DEFAULT 'yfinance',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (company_id) REFERENCES companies({pk_col}),
                    UNIQUE(company_id, date)
                )
            """)

            # Create indexes
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_prices_company_date
                ON daily_prices(company_id, date DESC)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_prices_date
                ON daily_prices(date DESC)
            """)

        # Add source column if it doesn't exist
        if has_daily_prices and 'source' not in self.schema_cache.get('daily_prices', {}):
            try:
                cursor.execute("ALTER TABLE daily_prices ADD COLUMN source TEXT DEFAULT 'yfinance'")
            except:
                pass  # Column might already exist

        # Create price_metrics table
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS price_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL UNIQUE,
                last_price REAL,
                last_price_date DATE,
                high_52w REAL,
                high_52w_date DATE,
                low_52w REAL,
                low_52w_date DATE,
                change_1d REAL,
                change_1w REAL,
                change_1m REAL,
                change_3m REAL,
                change_6m REAL,
                change_1y REAL,
                change_ytd REAL,
                sma_50 REAL,
                sma_200 REAL,
                rsi_14 REAL,
                volatility_30d REAL,
                avg_volume_30d INTEGER,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies({pk_col})
            )
        """)

        # Create import log table
        cursor.execute(f"""
            CREATE TABLE IF NOT EXISTS price_import_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                source TEXT NOT NULL,
                status TEXT NOT NULL,
                records_imported INTEGER,
                date_from DATE,
                date_to DATE,
                error_message TEXT,
                retry_count INTEGER DEFAULT 0,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                FOREIGN KEY (company_id) REFERENCES companies({pk_col})
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_import_status
            ON price_import_log(status)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_import_company
            ON price_import_log(company_id)
        """)

        conn.commit()
        conn.close()

        # Refresh schema cache
        self._inspect_schema()
        print("Price tables created/verified")


if __name__ == '__main__':
    # Test the adapter
    import sys
    db_path = sys.argv[1] if len(sys.argv) > 1 else './data/stocks.db'

    adapter = DatabaseAdapter(db_path)
    print(f"\nPrimary key column: {adapter.get_company_pk_column()}")

    symbol_col, sample = adapter.get_company_identifier_column()
    print(f"Symbol column: {symbol_col} (sample: {sample})")

    print(f"Total companies: {adapter.get_total_company_count()}")

    companies = adapter.get_companies_for_import(limit=5)
    print(f"\nSample companies for import:")
    for c in companies:
        print(f"  {c['symbol']}: {c['name']}")
