/**
 * Daily Trading Summary
 * 
 * Generates and sends a comprehensive daily summary of trading status
 * for all active trading sessions (ETH and BTC).
 */

import { PaperTradingService } from './paper-trading-enhanced';
import { ASSET_CONFIGS, type TradingAsset } from './asset-config';
import { getNextAction } from './next-action-utils';
import { isNotificationsEnabled } from './notifications';
import type { EnhancedPaperTradingSession } from './paper-trading-enhanced';

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
  embeds?: DiscordEmbed[];
}

const COLORS = {
  green: 0x22c55e,
  blue: 0x3b82f6,
  yellow: 0xeab308,
  red: 0xef4444,
};

function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const ageMs = now - timestamp;
  const ageHours = ageMs / (1000 * 60 * 60);
  const ageDays = ageHours / 24;
  
  if (ageDays >= 1) {
    return `${ageDays.toFixed(1)} days ago`;
  }
  if (ageHours >= 1) {
    return `${ageHours.toFixed(1)} hours ago`;
  }
  const ageMinutes = ageMs / (1000 * 60);
  return `${ageMinutes.toFixed(0)} minutes ago`;
}

function calculateWinRate(session: EnhancedPaperTradingSession): number {
  const sellTrades = session.trades.filter(t => t.type === 'sell' && t.pnl !== undefined);
  if (sellTrades.length === 0) return 0;
  const winningTrades = sellTrades.filter(t => (t.pnl || 0) > 0);
  return (winningTrades.length / sellTrades.length) * 100;
}

function getTradesLast24Hours(session: EnhancedPaperTradingSession): number {
  const now = Date.now();
  const dayAgo = now - (24 * 60 * 60 * 1000);
  return session.trades.filter(t => t.timestamp >= dayAgo).length;
}

function getHealthStatus(session: EnhancedPaperTradingSession | null): {
  status: string;
  color: number;
  issues: string[];
} {
  if (!session || !session.isActive) {
    return { status: 'Inactive', color: COLORS.yellow, issues: ['Session not active'] };
  }

  const issues: string[] = [];
  const now = Date.now();
  const lastUpdateAge = now - session.lastUpdate;
  const lastUpdateHours = lastUpdateAge / (1000 * 60 * 60);

  if (lastUpdateHours > 2) {
    issues.push(`Last update: ${formatTimeAgo(session.lastUpdate)}`);
  }

  if (session.isEmergencyStopped) {
    issues.push('Emergency stopped');
  }

  if (session.drawdownInfo?.isPaused) {
    issues.push(`Drawdown protection active (${(session.drawdownInfo.currentDrawdown * 100).toFixed(1)}%)`);
  }

  if (session.dataQuality && !session.dataQuality.isValid) {
    issues.push('Data quality issues detected');
  }

  const status = issues.length === 0 ? 'Healthy' : issues.length === 1 ? 'Warning' : 'Issues';
  const color = issues.length === 0 ? COLORS.green : issues.length === 1 ? COLORS.yellow : COLORS.red;

  return { status, color, issues };
}

function formatAssetSummary(
  session: EnhancedPaperTradingSession | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _asset: TradingAsset
): string {
  if (!session || !session.isActive) {
    return `**Status**: Inactive\n**No active session**`;
  }

  const health = getHealthStatus(session);
  const nextAction = getNextAction(session);
  const winRate = calculateWinRate(session);
  const trades24h = getTradesLast24Hours(session);
  const lastTrade = session.trades.length > 0 ? session.trades[session.trades.length - 1] : null;
  const hoursSinceLastTrade = lastTrade ? (Date.now() - lastTrade.timestamp) / (1000 * 60 * 60) : (Date.now() - session.startedAt) / (1000 * 60 * 60);

  let summary = `**Status**: ${health.status}\n`;
  summary += `**Portfolio**: ${formatUsd(session.portfolio.totalValue)} (${formatPercent(session.portfolio.totalReturn)})\n`;
  summary += `**Price**: ${formatUsd(session.lastPrice)}\n`;
  summary += `**Regime**: ${session.currentRegime.regime.toUpperCase()} (${(session.currentRegime.confidence * 100).toFixed(0)}%)\n`;
  
  if (nextAction) {
    summary += `**Next Action**: ${nextAction.message}\n`;
  }

  summary += `**Trades (24h)**: ${trades24h}\n`;
  
  if (session.trades.length > 0) {
    summary += `**Total Trades**: ${session.trades.length}\n`;
    summary += `**Win Rate**: ${winRate.toFixed(1)}%\n`;
  } else {
    summary += `**No trades yet** (${(hoursSinceLastTrade / 24).toFixed(1)} days since start)\n`;
  }

  if (session.drawdownInfo) {
    const drawdownPct = session.drawdownInfo.currentDrawdown * 100;
    summary += `**Drawdown**: ${drawdownPct.toFixed(1)}%${session.drawdownInfo.isPaused ? ' (PAUSED)' : ''}\n`;
  }

  if (health.issues.length > 0) {
    summary += `\n**Issues**:\n${health.issues.map(i => `• ${i}`).join('\n')}`;
  }

  return summary;
}

export async function sendDailySummary(): Promise<boolean> {
  if (!isNotificationsEnabled()) {
    console.warn('[Daily Summary] Notifications disabled');
    return false;
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[Daily Summary] Discord webhook URL not configured');
    return false;
  }

  try {
    const sessions: Record<TradingAsset, EnhancedPaperTradingSession | null> = {
      eth: null,
      btc: null,
    };

    for (const asset of ['eth', 'btc'] as TradingAsset[]) {
      try {
        const session = await PaperTradingService.getActiveSession(asset);
        sessions[asset] = session;
      } catch (error) {
        console.warn(`[Daily Summary] Failed to fetch ${asset} session:`, error);
      }
    }

    const now = new Date();
    const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dateStr = etDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const fields: DiscordEmbed['fields'] = [];

    for (const asset of ['eth', 'btc'] as TradingAsset[]) {
      const session = sessions[asset];
      const summary = formatAssetSummary(session, asset);
      const config = ASSET_CONFIGS[asset]; // Used in field name below

      fields.push({
        name: `${config.displayName} (${asset.toUpperCase()})`,
        value: summary,
        inline: false,
      });
    }

    const embed: DiscordEmbed = {
      title: '📊 Daily Trading Summary',
      description: `**${dateStr}** - Trading status for all assets`,
      color: COLORS.blue,
      fields,
      footer: {
        text: 'Trading Bot • Daily Summary',
      },
      timestamp: now.toISOString(),
    };

    const payload: DiscordWebhookPayload = {
      username: 'Trading Bot',
      embeds: [embed],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('[Daily Summary] Discord webhook failed:', response.status, await response.text());
      return false;
    }

    console.log('[Daily Summary] Successfully sent daily summary');
    return true;
  } catch (error) {
    console.error('[Daily Summary] Failed to send daily summary:', error instanceof Error ? error.message : error);
    return false;
  }
}

