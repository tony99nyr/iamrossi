/**
 * Multi-Source Price Verification
 * 
 * Compares prices across multiple sources (Binance, CoinGecko, Coinbase)
 * to ensure price accuracy before trading. Alerts on significant deviations (>5%).
 */

import { sendErrorAlert } from './notifications';
import { isNotificationsEnabled } from './notifications';

const BINANCE_API_URL = process.env.BINANCE_API_URL || 'https://api.binance.com/api/v3';
const COINGECKO_API_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
const COINBASE_API_URL = process.env.COINBASE_API_URL || 'https://api.coinbase.com/v2';

interface PriceSource {
  name: string;
  price: number;
  timestamp: number;
}

interface PriceVerificationResult {
  primaryPrice: number;
  sources: PriceSource[];
  averagePrice: number;
  maxDeviation: number;
  maxDeviationPercent: number;
  isConsistent: boolean;
  warnings: string[];
}

// Maximum allowed price deviation between sources (5%)
const MAX_DEVIATION_PERCENT = 0.05;

// Timeout for each API call (5 seconds)
const API_TIMEOUT = 5000;

/**
 * Fetch price from Binance
 */
async function fetchBinancePrice(symbol: string): Promise<PriceSource | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
    
    const url = `${BINANCE_API_URL}/ticker/price?symbol=${symbol}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return {
      name: 'Binance',
      price: parseFloat(data.price),
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch price from CoinGecko
 */
async function fetchCoinGeckoPrice(symbol: string): Promise<PriceSource | null> {
  try {
    const coinIdMap: Record<string, string> = {
      'ETHUSDT': 'ethereum',
      'BTCUSDT': 'bitcoin',
    };
    
    const coinId = coinIdMap[symbol.toUpperCase()] || 'ethereum';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
    
    const url = `${COINGECKO_API_URL}/simple/price?ids=${coinId}&vs_currencies=usd`;
    const apiKey = process.env.COINGECKO_API_KEY;
    const headers: HeadersInit = {};
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }
    
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const price = data[coinId]?.usd;
    if (!price) {
      return null;
    }
    
    return {
      name: 'CoinGecko',
      price: parseFloat(price),
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch price from Coinbase
 */
async function fetchCoinbasePrice(symbol: string): Promise<PriceSource | null> {
  try {
    const pairMap: Record<string, string> = {
      'ETHUSDT': 'ETH-USD',
      'BTCUSDT': 'BTC-USD',
    };
    
    const pair = pairMap[symbol.toUpperCase()] || 'ETH-USD';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
    
    const url = `${COINBASE_API_URL}/prices/${pair}/spot`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const price = parseFloat(data.data.amount);
    if (!price || isNaN(price)) {
      return null;
    }
    
    return {
      name: 'Coinbase',
      price,
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Verify price across multiple sources
 * 
 * Fetches prices from Binance, CoinGecko, and Coinbase, then compares them
 * to detect inconsistencies. Sends Discord alert if deviation exceeds 5%.
 * 
 * @param symbol - Trading symbol (e.g., 'ETHUSDT', 'BTCUSDT')
 * @param primaryPrice - Primary price to verify (usually from Binance)
 * @returns Verification result with average price, deviation, and warnings
 */
export async function verifyPrice(
  symbol: string,
  primaryPrice: number
): Promise<PriceVerificationResult> {
  // Fetch prices from all sources in parallel
  const [binancePrice, coinGeckoPrice, coinbasePrice] = await Promise.all([
    fetchBinancePrice(symbol),
    fetchCoinGeckoPrice(symbol),
    fetchCoinbasePrice(symbol),
  ]);

  const sources: PriceSource[] = [];
  if (binancePrice) sources.push(binancePrice);
  if (coinGeckoPrice) sources.push(coinGeckoPrice);
  if (coinbasePrice) sources.push(coinbasePrice);

  // Calculate average price from all sources
  const allPrices = [primaryPrice, ...sources.map(s => s.price)];
  const averagePrice = allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length;

  // Calculate maximum deviation
  let maxDeviation = 0;
  let maxDeviationPercent = 0;
  
  for (const price of allPrices) {
    const deviation = Math.abs(price - averagePrice);
    const deviationPercent = deviation / averagePrice;
    if (deviation > maxDeviation) {
      maxDeviation = deviation;
      maxDeviationPercent = deviationPercent;
    }
  }

  // Check consistency
  const isConsistent = maxDeviationPercent <= MAX_DEVIATION_PERCENT;
  
  // Generate warnings
  const warnings: string[] = [];
  if (!isConsistent) {
    warnings.push(`Price deviation exceeds ${(MAX_DEVIATION_PERCENT * 100).toFixed(1)}%: ${(maxDeviationPercent * 100).toFixed(2)}%`);
  }
  
  if (sources.length < 2) {
    warnings.push(`Only ${sources.length + 1} price source(s) available (recommended: 3+)`);
  }

  // Send alert if prices are inconsistent
  if (!isConsistent && isNotificationsEnabled()) {
    await sendErrorAlert({
      type: 'data_quality',
      severity: 'medium',
      message: `Price verification failed for ${symbol}: ${(maxDeviationPercent * 100).toFixed(2)}% deviation`,
      context: `Primary: $${primaryPrice.toFixed(2)}, Average: $${averagePrice.toFixed(2)}, Sources: ${sources.map(s => `${s.name}: $${s.price.toFixed(2)}`).join(', ')}`,
      timestamp: Date.now(),
    });
  }

  return {
    primaryPrice,
    sources,
    averagePrice,
    maxDeviation,
    maxDeviationPercent,
    isConsistent,
    warnings,
  };
}

/**
 * Quick price verification (non-blocking, for logging only)
 * 
 * Runs price verification in the background without blocking the calling function.
 * Errors are logged but don't affect the main operation.
 * 
 * @param symbol - Trading symbol (e.g., 'ETHUSDT', 'BTCUSDT')
 * @param price - Price to verify
 */
export async function quickPriceVerification(
  symbol: string,
  price: number
): Promise<void> {
  // Run verification in background (don't block trading)
  verifyPrice(symbol, price).catch(error => {
    console.warn('[Price Verification] Failed:', error);
  });
}

