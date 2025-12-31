#!/usr/bin/env npx tsx
/**
 * Generate comprehensive trade audit report
 * Analyzes all trades with detailed breakdown of when, why, and how successful
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Trade, TradeAudit } from '@/types';

interface AuditReport {
  summary: {
    totalTrades: number;
    buyTrades: number;
    sellTrades: number;
    winTrades: number;
    lossTrades: number;
    winRate: number;
    totalProfit: number;
    totalLoss: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
  };
  tradesByRegime: {
    bullish: Trade[];
    bearish: Trade[];
    neutral: Trade[];
  };
  tradesByOutcome: {
    wins: Trade[];
    losses: Trade[];
    breakeven: Trade[];
    pending: Trade[];
  };
  tradesByStrategy: Record<string, Trade[]>;
}

/**
 * Load trades from session or file
 */
function loadTrades(tradesPath: string): Trade[] {
  try {
    const data = fs.readFileSync(tradesPath, 'utf-8');
    return JSON.parse(data) as Trade[];
  } catch (error) {
    console.error(`Failed to load trades from ${tradesPath}:`, error);
    return [];
  }
}

/**
 * Analyze trades and generate report data
 */
function analyzeTrades(trades: Trade[]): AuditReport {
  const sellTrades = trades.filter(t => t.type === 'sell' && t.audit);
  const buyTrades = trades.filter(t => t.type === 'buy');
  
  const wins = sellTrades.filter(t => t.audit?.outcome === 'win');
  const losses = sellTrades.filter(t => t.audit?.outcome === 'loss');
  const breakeven = sellTrades.filter(t => t.audit?.outcome === 'breakeven');
  const pending = buyTrades.filter(t => !t.fullySold);

  const totalProfit = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));

  const tradesByRegime = {
    bullish: trades.filter(t => t.audit?.regime === 'bullish'),
    bearish: trades.filter(t => t.audit?.regime === 'bearish'),
    neutral: trades.filter(t => t.audit?.regime === 'neutral'),
  };

  const tradesByStrategy: Record<string, Trade[]> = {};
  trades.forEach(trade => {
    if (trade.audit?.activeStrategy) {
      const strategy = trade.audit.activeStrategy;
      if (!tradesByStrategy[strategy]) {
        tradesByStrategy[strategy] = [];
      }
      tradesByStrategy[strategy].push(trade);
    }
  });

  return {
    summary: {
      totalTrades: trades.length,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      winTrades: wins.length,
      lossTrades: losses.length,
      winRate: sellTrades.length > 0 ? (wins.length / sellTrades.length) * 100 : 0,
      totalProfit,
      totalLoss,
      profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0,
      avgWin: wins.length > 0 ? totalProfit / wins.length : 0,
      avgLoss: losses.length > 0 ? totalLoss / losses.length : 0,
    },
    tradesByRegime,
    tradesByOutcome: {
      wins,
      losses,
      breakeven,
      pending,
    },
    tradesByStrategy,
  };
}

/**
 * Format trade audit details
 */
function formatTradeAudit(trade: Trade, index: number): string {
  const audit = trade.audit;
  if (!audit) {
    return `## Trade ${index + 1}: ${trade.type.toUpperCase()} (No Audit Data)\n\n`;
  }

  let md = `## Trade ${index + 1}: ${trade.type.toUpperCase()} - ${audit.outcome.toUpperCase()}\n\n`;
  
  md += `### When\n\n`;
  md += `- **Date**: ${audit.date}\n`;
  md += `- **Time**: ${new Date(trade.timestamp).toISOString()}\n`;
  md += `- **Timeframe**: ${audit.timeframe}\n\n`;

  md += `### Why - Signal Details\n\n`;
  md += `- **Regime**: ${audit.regime} (confidence: ${(audit.regimeConfidence * 100).toFixed(1)}%)\n`;
  md += `- **Active Strategy**: ${audit.activeStrategy}\n`;
  md += `- **Momentum Confirmed**: ${audit.momentumConfirmed ? 'Yes' : 'No'}\n`;
  md += `- **Signal Strength**: ${(trade.signal * 100).toFixed(1)}%\n`;
  md += `- **Confidence**: ${(trade.confidence * 100).toFixed(1)}%\n\n`;

  md += `### Why - Indicator Breakdown\n\n`;
  Object.entries(audit.indicatorSignals).forEach(([indicator, value]) => {
    md += `- **${indicator}**: ${(value * 100).toFixed(1)}%\n`;
  });
  md += `- **Buy Threshold**: ${audit.buyThreshold}\n`;
  md += `- **Sell Threshold**: ${audit.sellThreshold}\n\n`;

  md += `### Why - Market Context\n\n`;
  md += `- **Price at Trade**: $${audit.priceAtTrade.toFixed(2)}\n`;
  md += `- **Volatility**: ${audit.volatility.toFixed(2)}% (${audit.marketConditions.volatility})\n`;
  md += `- **Volume**: ${audit.volume.toLocaleString()}\n`;
  if (audit.priceChange24h !== undefined) {
    md += `- **24h Price Change**: ${audit.priceChange24h > 0 ? '+' : ''}${audit.priceChange24h.toFixed(2)}%\n`;
  }
  md += `- **Trend**: ${audit.marketConditions.trend}\n`;
  md += `- **Momentum**: ${audit.marketConditions.momentum}\n\n`;

  md += `### Why - Risk Management\n\n`;
  md += `- **Volatility Filter**: ${audit.riskFilters.volatilityFilter ? 'Active' : 'Passed'}\n`;
  md += `- **Whipsaw Detection**: ${audit.riskFilters.whipsawDetection ? 'Detected' : 'Passed'}\n`;
  md += `- **Circuit Breaker**: ${audit.riskFilters.circuitBreaker ? 'Active' : 'Passed'}\n`;
  md += `- **Regime Persistence**: ${audit.riskFilters.regimePersistence ? 'Passed' : 'Failed'}\n\n`;

  md += `### Why - Position Sizing\n\n`;
  md += `- **Position Size**: ${audit.positionSizePct.toFixed(2)}% of portfolio\n`;
  md += `- **Position Multiplier**: ${audit.positionSizeMultiplier.toFixed(2)}x\n`;
  md += `- **Max Position Allowed**: ${audit.maxPositionAllowed.toFixed(2)}%\n`;
  md += `- **ETH Amount**: ${trade.ethAmount.toFixed(6)} ETH\n`;
  md += `- **USDC Amount**: $${trade.usdcAmount.toFixed(2)}\n\n`;

  md += `### How Successful - Trade Performance\n\n`;
  if (trade.type === 'sell') {
    md += `- **P&L**: $${(trade.pnl || 0).toFixed(2)}\n`;
    if (audit.roi !== undefined) {
      md += `- **ROI**: ${audit.roi > 0 ? '+' : ''}${audit.roi.toFixed(2)}%\n`;
    }
    md += `- **Outcome**: ${audit.outcome.toUpperCase()}\n`;
  } else {
    md += `- **Status**: PENDING (not yet sold)\n`;
  }
  
  if (audit.holdingPeriod !== undefined) {
    md += `- **Holding Period**: ${audit.holdingPeriod} days\n`;
  }
  if (audit.maxFavorableExcursion !== undefined) {
    md += `- **Max Favorable Excursion**: +${audit.maxFavorableExcursion.toFixed(2)}%\n`;
  }
  if (audit.maxAdverseExcursion !== undefined) {
    md += `- **Max Adverse Excursion**: -${audit.maxAdverseExcursion.toFixed(2)}%\n`;
  }
  if (audit.exitReason) {
    md += `- **Exit Reason**: ${audit.exitReason}\n`;
  }
  md += `\n`;

  return md;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report: AuditReport, trades: Trade[]): string {
  const timestamp = new Date().toISOString();
  
  let md = `# Trade Audit Report\n\n`;
  md += `**Generated**: ${timestamp}\n`;
  md += `**Total Trades**: ${report.summary.totalTrades}\n\n`;

  md += `## Summary\n\n`;
  md += `- **Buy Trades**: ${report.summary.buyTrades}\n`;
  md += `- **Sell Trades**: ${report.summary.sellTrades}\n`;
  md += `- **Win Trades**: ${report.summary.winTrades}\n`;
  md += `- **Loss Trades**: ${report.summary.lossTrades}\n`;
  md += `- **Win Rate**: ${report.summary.winRate.toFixed(2)}%\n`;
  md += `- **Total Profit**: $${report.summary.totalProfit.toFixed(2)}\n`;
  md += `- **Total Loss**: $${report.summary.totalLoss.toFixed(2)}\n`;
  md += `- **Profit Factor**: ${report.summary.profitFactor === Infinity ? '∞' : report.summary.profitFactor.toFixed(2)}\n`;
  md += `- **Average Win**: $${report.summary.avgWin.toFixed(2)}\n`;
  md += `- **Average Loss**: $${report.summary.avgLoss.toFixed(2)}\n\n`;

  md += `## Trades by Regime\n\n`;
  md += `- **Bullish**: ${report.tradesByRegime.bullish.length} trades\n`;
  md += `- **Bearish**: ${report.tradesByRegime.bearish.length} trades\n`;
  md += `- **Neutral**: ${report.tradesByRegime.neutral.length} trades\n\n`;

  md += `## Trades by Strategy\n\n`;
  Object.entries(report.tradesByStrategy).forEach(([strategy, strategyTrades]) => {
    md += `- **${strategy}**: ${strategyTrades.length} trades\n`;
  });
  md += `\n`;

  md += `## Trade-by-Trade Analysis\n\n`;
  trades.forEach((trade, index) => {
    md += formatTradeAudit(trade, index);
  });

  return md;
}

/**
 * Main function
 */
async function main() {
  const tradesPath = process.argv[2];
  
  if (!tradesPath) {
    console.error('Usage: pnpm tsx scripts/generate-trade-audit-report.ts <trades-file.json>');
    console.error('   or: pnpm tsx scripts/generate-trade-audit-report.ts <session-id>');
    process.exit(1);
  }

  let trades: Trade[] = [];

  // Try to load from file first
  if (fs.existsSync(tradesPath)) {
    trades = loadTrades(tradesPath);
  } else {
    // Try to load from session (would need Redis access)
    console.error('Session loading not yet implemented. Please provide trades file path.');
    process.exit(1);
  }

  if (trades.length === 0) {
    console.error('No trades found');
    process.exit(1);
  }

  console.log(`📊 Analyzing ${trades.length} trades...`);

  // Analyze trades
  const report = analyzeTrades(trades);

  // Generate markdown
  const markdown = generateMarkdownReport(report, trades);

  // Save report
  const reportDir = path.join(process.cwd(), 'data', 'trade-audits');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, `audit-${Date.now()}.md`);
  fs.writeFileSync(reportFile, markdown);

  console.log(`✅ Report generated: ${reportFile}`);
  console.log(`\nSummary:`);
  console.log(`  Win Rate: ${report.summary.winRate.toFixed(2)}%`);
  console.log(`  Profit Factor: ${report.summary.profitFactor === Infinity ? '∞' : report.summary.profitFactor.toFixed(2)}`);
  console.log(`  Total Profit: $${report.summary.totalProfit.toFixed(2)}`);
}

main().catch((error) => {
  console.error('❌ Error generating audit report:', error);
  process.exit(1);
});

