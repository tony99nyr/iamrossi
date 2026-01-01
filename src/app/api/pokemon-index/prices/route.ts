import { NextRequest, NextResponse } from 'next/server';
import { getPokemonIndexSettings } from '@/lib/kv';
import { ensurePokemonIndexUpToDate, getOrBuildPokemonIndexSeries } from '@/lib/pokemon-index-service';
import { logError, logInfo } from '@/lib/logger';
import type { PokemonIndexPoint } from '@/types';

// Allow up to 5 minutes for the cron job to complete (Vercel Pro plan allows up to 300s)
// This is necessary because scraping 7+ cards with delays can take several minutes
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === '1';
  
  // Check if this is a cron job request (Vercel sends Authorization header with CRON_SECRET)
  const authHeader = request.headers.get('authorization');
  const isCronRequest = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  try {
    const settings = await getPokemonIndexSettings();
    if (!settings || settings.cards.length === 0) {
      return NextResponse.json({
        settings: settings ?? { cards: [], refreshIntervalHours: 24 },
        series: [],
        summary: null,
      });
    }

    let series: PokemonIndexPoint[];
    try {
      if (forceRefresh) {
        logInfo('[Pokemon Prices API] Forced refresh requested', {
          isCronRequest,
          cardCount: settings.cards.length,
        });
        // Pass time tracking options for timeout handling
        const maxDurationMs = maxDuration * 1000; // Convert seconds to milliseconds
        // Reserve 10 seconds for saving and building series at the end
        const effectiveMaxDuration = maxDurationMs - 10000;
        series = await ensurePokemonIndexUpToDate(settings, {
          startTime,
          maxDuration: effectiveMaxDuration,
        });
      } else {
        series = await getOrBuildPokemonIndexSeries(settings);
      }
    } catch (error) {
      logError('API Error', error, { method: 'GET', path: '/api/pokemon-index/prices' });
      // If refresh fails, try to get existing series
      series = await getOrBuildPokemonIndexSeries(settings);
    }

    const latest = series[series.length - 1] ?? null;
    const summary = latest
      ? {
          latestDate: latest.date,
          latestValue: latest.indexValue,
          ma30: latest.ma30 ?? null,
          ma120: latest.ma120 ?? null,
        }
      : null;

    const duration = Date.now() - startTime;
    if (forceRefresh || duration > 1000) {
      logInfo('[Pokemon Prices API] Request completed', {
        duration: `${duration}ms`,
        seriesLength: series.length,
        forceRefresh,
        isCronRequest,
      });
    }

    return NextResponse.json({
      settings,
      series,
      summary,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('API Error', error, { method: 'GET', path: '/api/pokemon-index/prices' });
    logError('[Pokemon Prices API] Fatal error', undefined, {
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
    });
    return NextResponse.json({ error: 'Failed to fetch Pokemon index data' }, { status: 500 });
  }
}


