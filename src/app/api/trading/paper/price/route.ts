import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { fetchLatestPrice } from '@/lib/eth-price-service';

// Simple in-memory cache for price (5 minutes)
let cachedPrice: { price: number; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/trading/paper/price
 * Get latest ETH price (cached for 5 minutes)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check cache
    const now = Date.now();
    if (cachedPrice && (now - cachedPrice.timestamp) < CACHE_TTL) {
      return NextResponse.json({ 
        price: cachedPrice.price,
        cached: true,
        timestamp: cachedPrice.timestamp
      });
    }

    // Fetch latest price
    const price = await fetchLatestPrice('ETHUSDT');
    
    // Update cache
    cachedPrice = { price, timestamp: now };

    return NextResponse.json({ 
      price,
      cached: false,
      timestamp: now
    });
  } catch (error) {
    console.error('Error fetching ETH price:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ETH price' },
      { status: 500 }
    );
  }
}

