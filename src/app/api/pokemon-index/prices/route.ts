import { NextRequest, NextResponse } from 'next/server';
import { getPokemonIndexSettings } from '@/lib/kv';
import { ensurePokemonIndexUpToDate, getOrBuildPokemonIndexSeries } from '@/lib/pokemon-index-service';
import { logger } from '@/lib/logger';
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
        logger.info('[Pokemon Prices API] Forced refresh requested', {
          isCronRequest,
          cardCount: settings.cards.length,
        });
        series = await ensurePokemonIndexUpToDate(settings);
      } else {
        series = await getOrBuildPokemonIndexSeries(settings);
      }
    } catch (error) {
      logger.apiError('GET', '/api/pokemon-index/prices', error);
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
      logger.info('[Pokemon Prices API] Request completed', {
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
    logger.apiError('GET', '/api/pokemon-index/prices', error);
    logger.error('[Pokemon Prices API] Fatal error', {
      error: error instanceof Error ? error.message : String(error),
      duration: `${duration}ms`,
    });
    return NextResponse.json({ error: 'Failed to fetch Pokemon index data' }, { status: 500 });
  }
}


