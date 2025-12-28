import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { fetchLatestPrice } from '@/lib/eth-price-service';
import { redis, ensureConnected } from '@/lib/kv';

const CACHE_KEY = 'eth:price:cache';
const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes in seconds

/**
 * GET /api/trading/paper/price
 * Get latest ETH price (cached for 5 minutes in Redis)
 * Uses Redis cache for Vercel serverless compatibility
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureConnected();

    // Check Redis cache
    const cached = await redis.get(CACHE_KEY);
    if (cached) {
      const { price, timestamp } = JSON.parse(cached) as { price: number; timestamp: number };
      const now = Date.now();
      if (now - timestamp < CACHE_TTL_SECONDS * 1000) {
        return NextResponse.json({ 
          price,
          cached: true,
          timestamp
        });
      }
    }

    // Fetch latest price
    const price = await fetchLatestPrice('ETHUSDT');
    const now = Date.now();
    
    // Update Redis cache with TTL
    await redis.setEx(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify({ 
      price, 
      timestamp: now 
    }));

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

