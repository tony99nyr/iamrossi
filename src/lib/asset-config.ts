/**
 * Asset Configuration
 * 
 * Centralized configuration for trading assets (ETH, BTC, etc.)
 * Provides asset-specific constants, symbols, and configuration.
 */

export type TradingAsset = 'eth' | 'btc';

export interface AssetConfig {
  id: TradingAsset;
  name: string;
  symbol: string; // Binance symbol (e.g., 'ETHUSDT', 'BTCUSDT')
  displayName: string; // Human-readable name (e.g., 'Ethereum', 'Bitcoin')
  defaultTimeframe: '4h' | '8h' | '12h' | '1d';
  priceMultiplier: number; // Typical price multiplier vs ETH (for synthetic data generation)
  typicalCorrelation: number; // Typical correlation with ETH (0-1)
}

/**
 * Asset configurations
 */
export const ASSET_CONFIGS: Record<TradingAsset, AssetConfig> = {
  eth: {
    id: 'eth',
    name: 'Ethereum',
    symbol: 'ETHUSDT',
    displayName: 'Ethereum',
    defaultTimeframe: '8h',
    priceMultiplier: 1.0,
    typicalCorrelation: 1.0,
  },
  btc: {
    id: 'btc',
    name: 'Bitcoin',
    symbol: 'BTCUSDT',
    displayName: 'Bitcoin',
    defaultTimeframe: '8h', // Updated to 8h based on comprehensive backfill analysis
    priceMultiplier: 18.0, // BTC typically 15-20x ETH price
    typicalCorrelation: 0.8, // Typical ETH-BTC correlation
  },
};

/**
 * Get asset configuration by ID
 */
export function getAssetConfig(asset: TradingAsset): AssetConfig {
  return ASSET_CONFIGS[asset];
}

/**
 * Get asset configuration by symbol
 */
export function getAssetConfigBySymbol(symbol: string): AssetConfig | null {
  const asset = Object.values(ASSET_CONFIGS).find(config => config.symbol === symbol.toUpperCase());
  return asset || null;
}

/**
 * Get asset ID from symbol
 */
export function getAssetFromSymbol(symbol: string): TradingAsset | null {
  const config = getAssetConfigBySymbol(symbol);
  return config?.id || null;
}

/**
 * Validate asset ID
 */
export function isValidAsset(asset: string): asset is TradingAsset {
  return asset === 'eth' || asset === 'btc';
}

/**
 * Get Redis key prefix for an asset
 */
export function getAssetKeyPrefix(asset: TradingAsset): string {
  return `${asset}:`;
}

/**
 * Get paper trading session key for an asset
 */
export function getPaperSessionKey(asset: TradingAsset): string {
  return `${asset}:paper:session:active`;
}

/**
 * Get strategy config key for an asset
 */
export function getStrategyConfigKey(asset: TradingAsset): string {
  return `${asset}:adaptive:strategy:config`;
}

/**
 * Get price cache prefix for an asset
 */
export function getPriceCachePrefix(asset: TradingAsset): string {
  return `${asset}:price:cache:`;
}

