#!/usr/bin/env npx tsx
/**
 * Comprehensive Strategy Analysis
 * 
 * Analyzes strategy performance across:
 * - Walk-forward optimization results
 * - Out-of-sample validation results
 * - Comprehensive backfill test results
 * - Stress test results (when available)
 * 
 * Provides overall strategy score and recommendations.
 * 
 * Usage:
 *   pnpm tsx scripts/comprehensive-strategy-analysis.ts [asset]
 */

import * as fs from 'fs';
import * as path from 'path';
import { runBacktest } from './backfill-test';
import type { TradingAsset } from '@/lib/asset-config';
import { getAllTestPeriods } from './ml-strategy-optimizer';
import { disconnectRedis } from '@/lib/kv';

interface StrategyScore {
  overall: number; // 0-10
  robustness: number; // 0-10
  generalization: number; // 0-10
  riskManagement: number; // 0-10
  consistency: number; // 0-10
}

interface AnalysisResult {
  asset: TradingAsset;
  score: StrategyScore;
  strengths: string[];
  weaknesses: string[];
  recommendations: {
    paperTrading: string[];
    testing: string[];
    strategy: string[];
  };
  metrics: {
    averageReturn: number;
    winRate: number;
    maxDrawdown: number;
    sharpeRatio: number;
    overfittingScore: number;
    walkForwardImprovement: number;
  };
}

/**
 * Calculate strategy score based on various metrics
 */
function calculateStrategyScore(
  metrics: AnalysisResult['metrics'],
  overfittingDetected: boolean,
  walkForwardImprovement: number
): StrategyScore {
  // Robustness: Based on consistency across periods
  const robustness = Math.min(10, metrics.winRate * 10 + (metrics.sharpeRatio > 0 ? 2 : 0));
  
  // Generalization: Penalize overfitting
  let generalization = 10;
  if (overfittingDetected) {
    if (metrics.overfittingScore > 20) {
      generalization = 4; // Severe overfitting
    } else if (metrics.overfittingScore > 10) {
      generalization = 6; // Moderate overfitting
    } else {
      generalization = 8; // Mild overfitting
    }
  }
  
  // Risk Management: Based on drawdown and Sharpe
  const riskManagement = Math.min(10, 
    (1 - metrics.maxDrawdown / 50) * 5 + // Lower drawdown = better (50% max = 0 points)
    (metrics.sharpeRatio > 1 ? 3 : metrics.sharpeRatio > 0 ? 2 : 0) + // Sharpe bonus
    (metrics.maxDrawdown < 20 ? 2 : metrics.maxDrawdown < 30 ? 1 : 0) // Drawdown bonus
  );
  
  // Consistency: Based on walk-forward improvement
  const consistency = Math.min(10, 
    5 + (walkForwardImprovement > 0 ? 3 : walkForwardImprovement > -5 ? 2 : 0) // Walk-forward bonus
  );
  
  // Overall: Weighted average
  const overall = (
    robustness * 0.25 +
    generalization * 0.30 +
    riskManagement * 0.25 +
    consistency * 0.20
  );
  
  return {
    overall: Math.round(overall * 10) / 10,
    robustness: Math.round(robustness * 10) / 10,
    generalization: Math.round(generalization * 10) / 10,
    riskManagement: Math.round(riskManagement * 10) / 10,
    consistency: Math.round(consistency * 10) / 10,
  };
}

/**
 * Analyze comprehensive backfill test results
 */
async function analyzeBackfillResults(
  asset: TradingAsset
): Promise<{
  averageReturn: number;
  winRate: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalTrades: number;
  periods: Array<{ name: string; return: number; trades: number }>;
}> {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Analyzing Comprehensive Backfill Test Results');
  console.log(`${'='.repeat(60)}`);
  
  const allPeriods = getAllTestPeriods();
  const results: Array<{ name: string; return: number; trades: number; sharpe: number; drawdown: number; winRate: number }> = [];
  
  // Test ALL periods to properly detect overfitting and assess consistency
  // This is critical for understanding strategy robustness across all market conditions
  console.log(`   Testing ${allPeriods.length} periods (comprehensive overfitting detection)...`);
  
  for (const period of allPeriods) {
    try {
      const result = await runBacktest(
        period.startDate,
        period.endDate,
        period.isSynthetic,
        undefined,
        undefined,
        undefined,
        asset
      );
      
      results.push({
        name: period.name,
        return: result.totalReturnPct,
        trades: result.totalTrades,
        sharpe: result.sharpeRatio,
        drawdown: result.maxDrawdownPct,
        winRate: result.winTrades / Math.max(1, result.totalTrades),
      });
    } catch (error) {
      console.warn(`   ⚠️  Failed to test ${period.name}: ${error}`);
    }
  }
  
  const averageReturn = results.reduce((sum, r) => sum + r.return, 0) / results.length;
  const totalTrades = results.reduce((sum, r) => sum + r.trades, 0);
  const totalWins = results.reduce((sum, r) => sum + r.trades * r.winRate, 0);
  const winRate = totalTrades > 0 ? totalWins / totalTrades : 0;
  const maxDrawdown = Math.max(...results.map(r => r.drawdown));
  const averageSharpe = results.reduce((sum, r) => sum + r.sharpe, 0) / results.length;
  
  console.log(`\n   Results:`);
  console.log(`     Average Return: ${averageReturn.toFixed(2)}%`);
  console.log(`     Win Rate: ${(winRate * 100).toFixed(1)}%`);
  console.log(`     Max Drawdown: ${maxDrawdown.toFixed(2)}%`);
  console.log(`     Average Sharpe: ${averageSharpe.toFixed(2)}`);
  console.log(`     Total Trades: ${totalTrades}`);
  
  return {
    averageReturn,
    winRate,
    maxDrawdown,
    sharpeRatio: averageSharpe,
    totalTrades,
    periods: results.map(r => ({ name: r.name, return: r.return, trades: r.trades })),
  };
}

/**
 * Read latest walk-forward optimization report
 */
function readWalkForwardReport(asset: TradingAsset): {
  averageImprovement: number;
  improvementRate: number;
} | null {
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  const files = fs.readdirSync(reportDir)
    .filter(f => f.includes('walk-forward-optimization') && f.includes(asset))
    .sort()
    .reverse();
  
  if (files.length === 0) return null;
  
  const latestFile = path.join(reportDir, files[0]!);
  const content = fs.readFileSync(latestFile, 'utf-8');
  
  // Parse improvement rate
  const improvementMatch = content.match(/Improvement Rate.*?(\d+(?:\.\d+)?)\/(\d+)/);
  const avgImprovementMatch = content.match(/Average Out-of-Sample Improvement.*?([+-]?\d+\.\d+)%/);
  
  if (!improvementMatch || !avgImprovementMatch) return null;
  
  const improvementRate = parseFloat(improvementMatch[1]!) / parseFloat(improvementMatch[2]!);
  const averageImprovement = parseFloat(avgImprovementMatch[1]!);
  
  return { averageImprovement, improvementRate };
}

/**
 * Read latest out-of-sample validation report
 */
function readOutOfSampleReport(asset: TradingAsset): {
  overfittingScore: number;
  trainReturn: number;
  validationReturn: number;
  overfittingDetected: boolean;
} | null {
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  const files = fs.readdirSync(reportDir)
    .filter(f => f.includes('out-of-sample-validation') && f.includes(asset))
    .sort()
    .reverse();
  
  if (files.length === 0) return null;
  
  const latestFile = path.join(reportDir, files[0]!);
  const content = fs.readFileSync(latestFile, 'utf-8');
  
  // Parse overfitting score
  const overfittingMatch = content.match(/Overfitting Score.*?([+-]?\d+\.\d+)%/);
  const trainMatch = content.match(/Training Set Performance[\s\S]*?Return.*?(\d+\.\d+)%/);
  const validationMatch = content.match(/Validation Set Performance[\s\S]*?Return.*?(\d+\.\d+)%/);
  const detectedMatch = content.match(/(✅|⚠️).*?overfitting/i);
  
  if (!overfittingMatch || !trainMatch || !validationMatch) return null;
  
  const overfittingScore = parseFloat(overfittingMatch[1]!);
  const trainReturn = parseFloat(trainMatch[1]!);
  const validationReturn = parseFloat(validationMatch[1]!);
  const overfittingDetected = detectedMatch ? detectedMatch[0]!.includes('⚠️') : overfittingScore > 10;
  
  return {
    overfittingScore,
    trainReturn,
    validationReturn,
    overfittingDetected,
  };
}

/**
 * Generate comprehensive analysis
 */
async function analyzeStrategy(asset: TradingAsset): Promise<AnalysisResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Comprehensive Strategy Analysis for ${asset.toUpperCase()}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Analyze backfill results
  const backfillResults = await analyzeBackfillResults(asset);
  
  // Read walk-forward report
  const walkForward = readWalkForwardReport(asset);
  
  // Read out-of-sample report
  const outOfSample = readOutOfSampleReport(asset);
  
  // Calculate metrics
  const metrics = {
    averageReturn: backfillResults.averageReturn,
    winRate: backfillResults.winRate,
    maxDrawdown: backfillResults.maxDrawdown,
    sharpeRatio: backfillResults.sharpeRatio,
    overfittingScore: outOfSample?.overfittingScore ?? 0,
    walkForwardImprovement: walkForward?.averageImprovement ?? 0,
  };
  
  // Calculate score
  const score = calculateStrategyScore(
    metrics,
    outOfSample?.overfittingDetected ?? false,
    walkForward?.averageImprovement ?? 0
  );
  
  // Identify strengths and weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  
  if (metrics.averageReturn > 30) {
    strengths.push(`Strong average returns (${metrics.averageReturn.toFixed(2)}%)`);
  } else if (metrics.averageReturn < 10) {
    weaknesses.push(`Low average returns (${metrics.averageReturn.toFixed(2)}%)`);
  }
  
  if (metrics.winRate > 0.6) {
    strengths.push(`High win rate (${(metrics.winRate * 100).toFixed(1)}%)`);
  } else if (metrics.winRate < 0.4) {
    weaknesses.push(`Low win rate (${(metrics.winRate * 100).toFixed(1)}%)`);
  }
  
  if (metrics.maxDrawdown < 20) {
    strengths.push(`Controlled drawdown (${metrics.maxDrawdown.toFixed(2)}%)`);
  } else if (metrics.maxDrawdown > 30) {
    weaknesses.push(`High drawdown risk (${metrics.maxDrawdown.toFixed(2)}%)`);
  }
  
  if (outOfSample?.overfittingDetected) {
    weaknesses.push(`Overfitting detected (${metrics.overfittingScore.toFixed(2)}% train/validation gap)`);
  } else {
    strengths.push(`Good generalization (low overfitting)`);
  }
  
  if (walkForward && walkForward.averageImprovement > 0) {
    strengths.push(`Walk-forward optimization shows improvement`);
  } else if (walkForward && walkForward.averageImprovement <= 0) {
    weaknesses.push(`Walk-forward optimization not improving performance`);
  }
  
  // Generate recommendations
  const recommendations = {
    paperTrading: [] as string[],
    testing: [] as string[],
    strategy: [] as string[],
  };
  
  if (outOfSample?.overfittingDetected && metrics.overfittingScore > 15) {
    recommendations.strategy.push('Reduce strategy complexity to prevent overfitting');
    recommendations.strategy.push('Consider simpler parameter sets with fewer degrees of freedom');
    recommendations.testing.push('Increase validation set size to better detect overfitting');
  }
  
  if (metrics.maxDrawdown > 25) {
    recommendations.strategy.push('Tighten risk management parameters (lower position sizes, tighter stops)');
    recommendations.paperTrading.push('Monitor drawdown closely in paper trading');
  }
  
  if (walkForward && walkForward.averageImprovement <= 0) {
    recommendations.strategy.push('Current optimization approach may not be generalizing well');
    recommendations.strategy.push('Consider using simpler, more robust parameter sets');
  }
  
  if (metrics.winRate < 0.5) {
    recommendations.strategy.push('Improve entry/exit criteria to increase win rate');
    recommendations.testing.push('Analyze losing trades to identify patterns');
  }
  
  if (metrics.sharpeRatio < 0.5) {
    recommendations.strategy.push('Improve risk-adjusted returns (Sharpe ratio)');
    recommendations.strategy.push('Consider reducing volatility or improving consistency');
  }
  
  return {
    asset,
    score,
    strengths,
    weaknesses,
    recommendations,
    metrics,
  };
}

/**
 * Generate report
 */
function generateReport(result: AnalysisResult): string {
  let report = '# Comprehensive Strategy Analysis\n\n';
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Asset**: ${result.asset.toUpperCase()}\n\n`;
  
  report += `## Overall Strategy Score: ${result.score.overall}/10\n\n`;
  
  report += `### Score Breakdown\n\n`;
  report += `- **Overall**: ${result.score.overall}/10\n`;
  report += `- **Robustness**: ${result.score.robustness}/10 (consistency across periods)\n`;
  report += `- **Generalization**: ${result.score.generalization}/10 (low overfitting)\n`;
  report += `- **Risk Management**: ${result.score.riskManagement}/10 (drawdown control)\n`;
  report += `- **Consistency**: ${result.score.consistency}/10 (walk-forward performance)\n\n`;
  
  report += `## Key Metrics\n\n`;
  report += `- **Average Return**: ${result.metrics.averageReturn.toFixed(2)}%\n`;
  report += `- **Win Rate**: ${(result.metrics.winRate * 100).toFixed(1)}%\n`;
  report += `- **Max Drawdown**: ${result.metrics.maxDrawdown.toFixed(2)}%\n`;
  report += `- **Sharpe Ratio**: ${result.metrics.sharpeRatio.toFixed(2)}\n`;
  report += `- **Overfitting Score**: ${result.metrics.overfittingScore > 0 ? '+' : ''}${result.metrics.overfittingScore.toFixed(2)}%\n`;
  report += `- **Walk-Forward Improvement**: ${result.metrics.walkForwardImprovement > 0 ? '+' : ''}${result.metrics.walkForwardImprovement.toFixed(2)}%\n\n`;
  
  report += `## Strengths\n\n`;
  if (result.strengths.length === 0) {
    report += `- None identified\n\n`;
  } else {
    result.strengths.forEach(s => report += `- ✅ ${s}\n`);
    report += `\n`;
  }
  
  report += `## Weaknesses\n\n`;
  if (result.weaknesses.length === 0) {
    report += `- None identified\n\n`;
  } else {
    result.weaknesses.forEach(w => report += `- ⚠️  ${w}\n`);
    report += `\n`;
  }
  
  report += `## Recommendations\n\n`;
  
  report += `### Paper Trading\n\n`;
  if (result.recommendations.paperTrading.length === 0) {
    report += `- No specific recommendations\n\n`;
  } else {
    result.recommendations.paperTrading.forEach(r => report += `- ${r}\n`);
    report += `\n`;
  }
  
  report += `### Testing\n\n`;
  if (result.recommendations.testing.length === 0) {
    report += `- No specific recommendations\n\n`;
  } else {
    result.recommendations.testing.forEach(r => report += `- ${r}\n`);
    report += `\n`;
  }
  
  report += `### Strategy Adjustments\n\n`;
  if (result.recommendations.strategy.length === 0) {
    report += `- No specific recommendations\n\n`;
  } else {
    result.recommendations.strategy.forEach(r => report += `- ${r}\n`);
    report += `\n`;
  }
  
  // Overall assessment
  report += `## Overall Assessment\n\n`;
  if (result.score.overall >= 8) {
    report += `✅ **Excellent** - Strategy is robust and ready for paper trading with confidence.\n\n`;
  } else if (result.score.overall >= 6) {
    report += `✅ **Good** - Strategy is solid but has some areas for improvement.\n\n`;
  } else if (result.score.overall >= 4) {
    report += `⚠️  **Fair** - Strategy needs improvements before paper trading.\n\n`;
  } else {
    report += `❌ **Poor** - Strategy requires significant work before deployment.\n\n`;
  }
  
  return report;
}

async function main() {
  const asset = (process.argv[2] as TradingAsset) || 'eth';
  
  const result = await analyzeStrategy(asset);
  
  // Generate report
  const report = generateReport(result);
  console.log(`\n${'='.repeat(60)}`);
  console.log('COMPREHENSIVE ANALYSIS REPORT');
  console.log(`${'='.repeat(60)}\n`);
  console.log(report);
  
  // Save report
  const reportDir = path.join(process.cwd(), 'data', 'backfill-reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  const reportFile = path.join(
    reportDir,
    `comprehensive-strategy-analysis-${asset}-${Date.now()}.md`
  );
  fs.writeFileSync(reportFile, report);
  console.log(`\n📄 Report saved to: ${reportFile}`);
}

if (require.main === module) {
  main()
    .then(async () => {
      try {
        await disconnectRedis();
      } catch (error) {
        // Ignore disconnect errors
      }
      setImmediate(() => process.exit(0));
    })
    .catch(async (error) => {
      console.error('Error:', error);
      try {
        await disconnectRedis();
      } catch {
        // Ignore disconnect errors
      }
      setImmediate(() => process.exit(1));
    });
}

