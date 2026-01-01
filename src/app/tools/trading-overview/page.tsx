import { Suspense } from 'react';
import type { Metadata } from 'next';
import TradingOverviewClient from './TradingOverviewClient';

export const metadata: Metadata = {
  title: 'Trading Overview - Paper Trading | iamrossi.com',
  description: 'Multi-asset trading dashboard with ETH and BTC paper trading strategies. Monitor portfolio performance, regime analysis, and trading signals.',
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

export default async function TradingOverviewPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TradingOverviewClient />
    </Suspense>
  );
}

