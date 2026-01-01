import { Suspense } from 'react';
import type { Metadata } from 'next';
import TradingBotClient from '../trading/components/TradingBotClient';

export const metadata: Metadata = {
  title: 'Bitcoin Trading Bot - Paper Trading | iamrossi.com',
  description: 'Bitcoin paper trading bot with adaptive strategy. Monitor BTC trading signals, portfolio performance, and regime analysis.',
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

export default async function BtcTradingPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TradingBotClient asset="btc" />
    </Suspense>
  );
}

