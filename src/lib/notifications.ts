/**
 * Notification Service
 * 
 * Sends real-time alerts for trading signals via Discord webhooks.
 * Extensible to support other notification channels in the future.
 */

import type { Trade } from '@/types';

export interface TradeNotification {
  type: 'buy' | 'sell';
  symbol: string;
  price: number;
  amount: number;
  usdcAmount: number;
  regime: string;
  confidence: number;
  signal: number;
  portfolioValue: number;
  pnl?: number;
  timestamp: number;
}

export interface RegimeChangeNotification {
  previousRegime: string;
  newRegime: string;
  confidence: number;
  timestamp: number;
}

export interface StopLossNotification {
  type: 'triggered' | 'updated';
  symbol: string;
  price: number;
  stopLossPrice: number;
  pnl?: number;
  reason?: string;
  timestamp: number;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

// Color constants for Discord embeds (decimal values)
const COLORS = {
  green: 0x22c55e,  // Buy/Bullish
  red: 0xef4444,    // Sell/Bearish
  yellow: 0xeab308, // Warning/Neutral
  blue: 0x3b82f6,   // Info
  purple: 0xa855f7, // Stop loss
};

/**
 * Get Discord webhook URL from environment
 */
function getWebhookUrl(): string | null {
  return process.env.DISCORD_WEBHOOK_URL || null;
}

/**
 * Send a message to Discord via webhook
 */
async function sendDiscordWebhook(payload: DiscordWebhookPayload): Promise<boolean> {
  const webhookUrl = getWebhookUrl();
  
  if (!webhookUrl) {
    console.warn('[Notifications] Discord webhook URL not configured');
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('[Notifications] Discord webhook failed:', response.status, await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Notifications] Failed to send Discord notification:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Format currency value
 */
function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format asset amount (ETH or BTC)
 */
function formatAsset(value: number, symbol: string): string {
  const decimals = symbol === 'BTCUSDT' ? 8 : 6; // BTC uses 8 decimals, ETH uses 6
  const assetName = symbol === 'BTCUSDT' ? 'BTC' : 'ETH';
  return `${value.toFixed(decimals)} ${assetName}`;
}

/**
 * Format percentage
 */
function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
}

/**
 * Send trade execution alert to Discord
 */
export async function sendTradeAlert(notification: TradeNotification): Promise<boolean> {
  const isBuy = notification.type === 'buy';
  const emoji = isBuy ? '🟢' : '🔴';
  const action = isBuy ? 'BUY' : 'SELL';
  
  const fields: DiscordEmbed['fields'] = [
    { name: '💰 Price', value: formatUsd(notification.price), inline: true },
    { name: '📊 Amount', value: formatAsset(notification.amount, notification.symbol), inline: true },
    { name: '💵 Value', value: formatUsd(notification.usdcAmount), inline: true },
    { name: '📈 Signal', value: formatPercent(notification.signal), inline: true },
    { name: '🎯 Confidence', value: formatPercent(notification.confidence), inline: true },
    { name: '🌡️ Regime', value: notification.regime.charAt(0).toUpperCase() + notification.regime.slice(1), inline: true },
    { name: '💼 Portfolio', value: formatUsd(notification.portfolioValue), inline: true },
  ];
  
  // Add P&L for sell trades
  if (notification.type === 'sell' && notification.pnl !== undefined) {
    const pnlEmoji = notification.pnl >= 0 ? '✅' : '❌';
    fields.push({
      name: `${pnlEmoji} P&L`,
      value: formatUsd(notification.pnl),
      inline: true,
    });
  }

  const embed: DiscordEmbed = {
    title: `${emoji} ${action} ${notification.symbol}`,
    color: isBuy ? COLORS.green : COLORS.red,
    fields,
    footer: {
      text: `${notification.symbol === 'BTCUSDT' ? 'BTC' : 'ETH'} Trading Bot • Paper Trading`,
    },
    timestamp: new Date(notification.timestamp).toISOString(),
  };

  return sendDiscordWebhook({
    username: 'ETH Trading Bot',
    embeds: [embed],
  });
}

/**
 * Send regime change alert to Discord
 */
export async function sendRegimeChangeAlert(notification: RegimeChangeNotification): Promise<boolean> {
  const regimeEmojis: Record<string, string> = {
    bullish: '🟢',
    bearish: '🔴',
    neutral: '⚪',
  };

  const regimeColors: Record<string, number> = {
    bullish: COLORS.green,
    bearish: COLORS.red,
    neutral: COLORS.yellow,
  };

  const fromEmoji = regimeEmojis[notification.previousRegime] || '❓';
  const toEmoji = regimeEmojis[notification.newRegime] || '❓';
  const color = regimeColors[notification.newRegime] || COLORS.blue;

  const embed: DiscordEmbed = {
    title: '🔄 Market Regime Change',
    description: `${fromEmoji} ${notification.previousRegime.toUpperCase()} → ${toEmoji} ${notification.newRegime.toUpperCase()}`,
    color,
    fields: [
      { name: '🎯 Confidence', value: formatPercent(notification.confidence), inline: true },
    ],
    footer: {
      text: 'Trading Bot • Regime Detection',
    },
    timestamp: new Date(notification.timestamp).toISOString(),
  };

  return sendDiscordWebhook({
    username: 'ETH Trading Bot',
    embeds: [embed],
  });
}

/**
 * Send stop loss alert to Discord
 */
export async function sendStopLossAlert(notification: StopLossNotification): Promise<boolean> {
  const isTriggered = notification.type === 'triggered';
  
  const title = isTriggered 
    ? `🛑 Stop Loss Triggered - ${notification.symbol}`
    : `📍 Stop Loss Updated - ${notification.symbol}`;
  
  const fields: DiscordEmbed['fields'] = [
    { name: '💰 Price', value: formatUsd(notification.price), inline: true },
    { name: '🛑 Stop', value: formatUsd(notification.stopLossPrice), inline: true },
  ];

  if (isTriggered) {
    if (notification.reason) {
      fields.push({ name: '📝 Reason', value: notification.reason, inline: true });
    }
    if (notification.pnl !== undefined) {
      const pnlEmoji = notification.pnl >= 0 ? '✅' : '❌';
      fields.push({ name: `${pnlEmoji} P&L`, value: formatUsd(notification.pnl), inline: true });
    }
  }

  const assetName = notification.symbol === 'BTCUSDT' ? 'BTC' : 'ETH';
  const embed: DiscordEmbed = {
    title,
    color: isTriggered ? COLORS.red : COLORS.purple,
    fields,
    footer: {
      text: `${assetName} Trading Bot • Risk Management`,
    },
    timestamp: new Date(notification.timestamp).toISOString(),
  };

  return sendDiscordWebhook({
    username: `${assetName} Trading Bot`,
    embeds: [embed],
  });
}

/**
 * Send session start/stop notification
 */
export async function sendSessionAlert(
  type: 'start' | 'stop',
  sessionName?: string,
  portfolioValue?: number,
  asset?: 'eth' | 'btc'
): Promise<boolean> {
  const isStart = type === 'start';
  const emoji = isStart ? '🚀' : '🛬';
  const title = isStart ? 'Paper Trading Started' : 'Paper Trading Stopped';
  const assetName = asset === 'btc' ? 'BTC' : 'ETH';
  
  const fields: DiscordEmbed['fields'] = [];
  
  if (sessionName) {
    fields.push({ name: '📛 Session', value: sessionName, inline: true });
  }
  
  if (portfolioValue !== undefined) {
    fields.push({ name: '💼 Portfolio', value: formatUsd(portfolioValue), inline: true });
  }

  const embed: DiscordEmbed = {
    title: `${emoji} ${title}`,
    color: isStart ? COLORS.blue : COLORS.yellow,
    fields: fields.length > 0 ? fields : [],
    footer: {
      text: `${assetName} Trading Bot`,
    },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordWebhook({
    username: `${assetName} Trading Bot`,
    embeds: [embed],
  });
}

/**
 * Create TradeNotification from a Trade object
 */
export function createTradeNotification(
  trade: Trade,
  regime: string,
  portfolioValue: number,
  symbol: string = 'ETHUSDT'
): TradeNotification {
  return {
    type: trade.type,
    symbol,
    price: trade.ethPrice,
    amount: trade.ethAmount,
    usdcAmount: trade.usdcAmount,
    regime,
    confidence: trade.confidence,
    signal: trade.signal,
    portfolioValue,
    pnl: trade.pnl,
    timestamp: trade.timestamp,
  };
}

/**
 * Check if notifications are enabled
 */
export function isNotificationsEnabled(): boolean {
  return !!getWebhookUrl();
}

