import EthTradingBotClient from './EthTradingBotClient';

// Force dynamic rendering since we're reading from KV
export const dynamic = 'force-dynamic';

export default async function EthTradingBotPage() {
  return <EthTradingBotClient />;
}

