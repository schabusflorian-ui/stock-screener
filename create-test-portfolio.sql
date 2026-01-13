-- create-test-portfolio.sql
-- Creates a test portfolio with high-volatility stocks to demonstrate fat-tail warnings

-- Create the portfolio
INSERT INTO portfolios (name, description, initial_cash, initial_date, current_cash, portfolio_type)
VALUES (
  'Fat Tail Test Portfolio',
  'High-volatility tech stocks to demonstrate heavy-tailed distribution warnings',
  100000,
  date('now', '-90 days'),
  5000,
  'manual'
);

-- Get the newly created portfolio ID and display it
SELECT
  'Created Portfolio ID: ' || id as result,
  name,
  initial_cash
FROM portfolios
WHERE name = 'Fat Tail Test Portfolio'
ORDER BY id DESC
LIMIT 1;
