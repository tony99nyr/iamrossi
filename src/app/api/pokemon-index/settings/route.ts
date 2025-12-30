import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getPokemonIndexSettings, setPokemonIndexSettings } from '@/lib/kv';
import { pokemonIndexSettingsSchema, safeValidateRequest } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const settings = await getPokemonIndexSettings();
    if (!settings) {
      // Default: no cards configured, 24h refresh interval
      return NextResponse.json({
        cards: [],
        refreshIntervalHours: 24,
      });
    }
    return NextResponse.json(settings);
  } catch (error) {
    logger.apiError('GET', '/api/pokemon-index/settings', error);
    return NextResponse.json({ error: 'Failed to read Pokemon index settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const isAuthenticated = await verifyAuthToken(request);
  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = safeValidateRequest(pokemonIndexSettingsSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid settings format' },
        { status: 400 },
      );
    }

    await setPokemonIndexSettings(validation.data);
    return NextResponse.json(validation.data);
  } catch (error) {
    logger.apiError('POST', '/api/pokemon-index/settings', error);
    return NextResponse.json({ error: 'Failed to save Pokemon index settings' }, { status: 500 });
  }
}






