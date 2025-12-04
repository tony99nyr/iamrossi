import { NextResponse } from 'next/server';
import { isOuraConfigured } from '@/lib/oura-service';

/**
 * Check Oura configuration status
 * GET /api/oura/status
 */
export async function GET() {
  try {
    const configured = isOuraConfigured();
    return NextResponse.json({ connected: configured, configured });
  } catch (error) {
    console.error('Error checking Oura status:', error);
    return NextResponse.json(
      { error: 'Failed to check configuration status' },
      { status: 500 }
    );
  }
}
