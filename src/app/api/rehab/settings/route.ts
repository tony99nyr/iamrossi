import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { createClient } from 'redis';
import type { RehabSettings } from '@/types';

const redis = createClient({
  url: process.env.REDIS_URL
});

let isConnected = false;

async function ensureConnected(): Promise<void> {
  if (isConnected) return;
  
  try {
    if (!redis.isOpen) {
      await redis.connect();
    }
    isConnected = true;
  } catch (error) {
    console.error('Redis connection failed:', error);
    throw error;
  }
}

const SETTINGS_KEY = 'rehab:settings';

export async function GET() {
  try {
    await ensureConnected();
    const data = await redis.get(SETTINGS_KEY);
    
    if (!data) {
      // Return default settings
      const defaultSettings: RehabSettings = {
        vitamins: [],
        proteinShake: {
          ingredients: [],
          servingSize: '',
        },
      };
      return NextResponse.json(defaultSettings);
    }
    
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading settings:', error);
    return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Verify authentication
  const isAuthenticated = await verifyAuthToken(request);
  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings: RehabSettings = await request.json();
    
    await ensureConnected();
    await redis.set(SETTINGS_KEY, JSON.stringify(settings));
    
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
