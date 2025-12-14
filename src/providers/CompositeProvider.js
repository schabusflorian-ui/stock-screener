// src/providers/CompositeProvider.js

/**
 * Composite Provider
 * 
 * Orchestrates multiple data providers
 * Features:
 * - Automatic fallback (if one fails, try another)
 * - Priority-based selection (use best source for each data type)
 * - Intelligent routing (SEC for financials, Alpha for prices)
 * - Unified interface
 */
class CompositeProvider {
  constructor() {
    this.providers = [];
    console.log('✅ Composite Provider initialized');
  }
  
  /**
   * Register a provider
   */
  addProvider(provider) {
    this.providers.push(provider);
    this.providers.sort((a, b) => a.priority - b.priority); // Sort by priority (lower = higher priority)
    console.log(`   ✓ Registered: ${provider.name} (priority: ${provider.priority})`);
  }
  
  /**
   * Get all registered providers
   */
  getProviders() {
    return this.providers;
  }
  
  /**
   * Find best provider for a data type
   */
  findBestProvider(dataType, symbol) {
    for (const provider of this.providers) {
      if (provider.canProvide(dataType, symbol)) {
        return provider;
      }
    }
    return null;
  }
  
  /**
   * Get all providers that can handle this request (for fallback)
   */
  findAllProviders(dataType, symbol) {
    return this.providers.filter(p => p.canProvide(dataType, symbol));
  }
  
  /**
   * Execute with automatic fallback
   */
  async executeWithFallback(dataType, symbol, operation) {
    const eligibleProviders = this.findAllProviders(dataType, symbol);
    
    if (eligibleProviders.length === 0) {
      throw new Error(`No provider available for ${dataType} (${symbol})`);
    }
    
    console.log(`\n📡 Fetching ${dataType} for ${symbol}...`);
    console.log(`   Available providers: ${eligibleProviders.map(p => p.name).join(', ')}`);
    
    const errors = [];
    
    for (const provider of eligibleProviders) {
      try {
        console.log(`   → Trying ${provider.name}...`);
        const result = await operation(provider);
        console.log(`   ✓ Success with ${provider.name}`);
        return result;
        
      } catch (error) {
        console.log(`   ✗ ${provider.name} failed: ${error.message}`);
        errors.push({
          provider: provider.name,
          error: error.message
        });
        
        // Continue to next provider
      }
    }
    
    // All providers failed
    throw new Error(
      `All providers failed for ${dataType} (${symbol})\n` +
      errors.map(e => `  - ${e.provider}: ${e.error}`).join('\n')
    );
  }
  
  /**
   * Get company overview with fallback
   */
  async getCompanyOverview(symbol) {
    return this.executeWithFallback(
      'overview',
      symbol,
      provider => provider.getCompanyOverview(symbol)
    );
  }
  
  /**
   * Get balance sheet with fallback
   */
  async getBalanceSheet(symbol) {
    return this.executeWithFallback(
      'balance_sheet',
      symbol,
      provider => provider.getBalanceSheet(symbol)
    );
  }
  
  /**
   * Get income statement with fallback
   */
  async getIncomeStatement(symbol) {
    return this.executeWithFallback(
      'income_statement',
      symbol,
      provider => provider.getIncomeStatement(symbol)
    );
  }
  
  /**
   * Get cash flow with fallback
   */
  async getCashFlow(symbol) {
    return this.executeWithFallback(
      'cash_flow',
      symbol,
      provider => provider.getCashFlow(symbol)
    );
  }
  
  /**
   * Get quote with fallback
   */
  async getQuote(symbol) {
    return this.executeWithFallback(
      'quote',
      symbol,
      provider => provider.getQuote(symbol)
    );
  }
  
  /**
   * Get historical prices with fallback
   */
  async getHistoricalPrices(symbol, interval = 'daily') {
    return this.executeWithFallback(
      'prices',
      symbol,
      provider => provider.getHistoricalPrices(symbol, interval)
    );
  }
  
  /**
   * Fetch all data for a symbol (complete import)
   * Uses intelligent routing: SEC for financials, Alpha for prices
   */
  async fetchAllData(symbol) {
    console.log(`\n📦 Fetching complete data for ${symbol}...`);
    console.log('━'.repeat(50));
    
    try {
      // Fetch all financial data (will use best provider for each)
      const overview = await this.getCompanyOverview(symbol);
      const balanceSheet = await this.getBalanceSheet(symbol);
      const incomeStatement = await this.getIncomeStatement(symbol);
      const cashFlow = await this.getCashFlow(symbol);
      
      console.log('━'.repeat(50));
      console.log(`✅ Successfully fetched all data for ${symbol}\n`);
      
      return {
        overview,
        balanceSheet,
        incomeStatement,
        cashFlow
      };
      
    } catch (error) {
      console.log('━'.repeat(50));
      console.log(`❌ Failed to fetch data for ${symbol}: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Fetch all data in parallel (faster but more API calls)
   */
  async fetchAllDataParallel(symbol) {
    console.log(`\n📦 Fetching complete data for ${symbol} (parallel)...`);
    console.log('━'.repeat(50));
    
    try {
      const [overview, balanceSheet, incomeStatement, cashFlow] = await Promise.all([
        this.getCompanyOverview(symbol),
        this.getBalanceSheet(symbol),
        this.getIncomeStatement(symbol),
        this.getCashFlow(symbol)
      ]);
      
      console.log('━'.repeat(50));
      console.log(`✅ Successfully fetched all data for ${symbol}\n`);
      
      return {
        overview,
        balanceSheet,
        incomeStatement,
        cashFlow
      };
      
    } catch (error) {
      console.log('━'.repeat(50));
      console.log(`❌ Failed to fetch data for ${symbol}: ${error.message}\n`);
      throw error;
    }
  }
  
  /**
   * Health check all providers
   */
  async healthCheckAll() {
    console.log('\n🏥 Running health checks...\n');
    
    const results = [];
    
    for (const provider of this.providers) {
      console.log(`   Checking ${provider.name}...`);
      const isHealthy = await provider.healthCheck();
      results.push({
        name: provider.name,
        healthy: isHealthy,
        priority: provider.priority,
        enabled: provider.enabled
      });
      
      console.log(`   ${isHealthy ? '✓' : '✗'} ${provider.name}: ${isHealthy ? 'Healthy' : 'Unhealthy'}`);
    }
    
    console.log('');
    
    const healthyCount = results.filter(r => r.healthy).length;
    console.log(`Summary: ${healthyCount}/${results.length} providers healthy\n`);
    
    return results;
  }
  
  /**
   * Get statistics from all providers
   */
  getStats() {
    return {
      totalProviders: this.providers.length,
      providers: this.providers.map(p => p.getStats())
    };
  }
  
  /**
   * Test provider priority and fallback
   */
  async testProviderSelection(symbol, dataType) {
    console.log(`\n🧪 Testing provider selection for ${dataType} (${symbol})...\n`);
    
    const providers = this.findAllProviders(dataType, symbol);
    
    if (providers.length === 0) {
      console.log(`   ❌ No providers available for ${dataType}`);
      return;
    }
    
    console.log(`   Available providers (in priority order):`);
    providers.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name} (priority: ${p.priority})`);
    });
    
    console.log(`\n   → Will try: ${providers[0].name} first\n`);
  }
  
  /**
   * Clear all caches across providers
   */
  clearAllCaches() {
    console.log('\n🗑️  Clearing all provider caches...\n');
    
    for (const provider of this.providers) {
      if (typeof provider.clearCache === 'function') {
        provider.clearCache();
        console.log(`   ✓ Cleared cache for ${provider.name}`);
      }
    }
    
    console.log('');
  }
  
  /**
   * Disable a provider by name
   */
  disableProvider(providerName) {
    const provider = this.providers.find(p => p.name === providerName);
    if (provider) {
      provider.enabled = false;
      console.log(`   ⚠️  Disabled provider: ${providerName}`);
    }
  }
  
  /**
   * Enable a provider by name
   */
  enableProvider(providerName) {
    const provider = this.providers.find(p => p.name === providerName);
    if (provider) {
      provider.enabled = true;
      console.log(`   ✓ Enabled provider: ${providerName}`);
    }
  }
  
  /**
   * Get provider by name
   */
  getProvider(providerName) {
    return this.providers.find(p => p.name === providerName);
  }
}

module.exports = CompositeProvider;