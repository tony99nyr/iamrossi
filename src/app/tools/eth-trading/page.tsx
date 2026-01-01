import { Suspense } from 'react';
import type { Metadata } from 'next';
import TradingBotClient from '../trading/components/TradingBotClient';

export const metadata: Metadata = {
  title: 'Ethereum Trading Bot - Paper Trading | iamrossi.com',
  description: 'Ethereum paper trading bot with adaptive strategy. Monitor ETH trading signals, portfolio performance, and regime analysis.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  other: {
    'ai-robots': 'noindex, noimageai',
  },
};

// Force dynamic rendering since we're reading from KV
export const dynamic = 'force-dynamic';

export default async function EthTradingBotPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TradingBotClient asset="eth" />
    </Suspense>
  );
}

