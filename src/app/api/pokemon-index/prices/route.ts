import { NextRequest, NextResponse } from 'next/server';
import { getPokemonIndexSettings } from '@/lib/kv';
import { ensurePokemonIndexUpToDate, getOrBuildPokemonIndexSeries } from '@/lib/pokemon-index-service';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const settings = await getPokemonIndexSettings();
    if (!settings || settings.cards.length === 0) {
      return NextResponse.json({
        settings: settings ?? { cards: [], refreshIntervalHours: 24 },
        series: [],
        summary: null,
      });
    }

    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === '1';

    let series: any[];
    try {
      series = forceRefresh
        ? await ensurePokemonIndexUpToDate(settings)
        : await getOrBuildPokemonIndexSeries(settings);
    } catch (error) {
      logger.apiError('GET', '/api/pokemon-index/prices', error);
      // If refresh fails, try to get existing series
      console.error('[Pokemon API] Error during refresh, falling back to existing series:', error);
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

    return NextResponse.json({
      settings,
      series,
      summary,
    });
  } catch (error) {
    logger.apiError('GET', '/api/pokemon-index/prices', error);
    return NextResponse.json({ error: 'Failed to fetch Pokemon index data' }, { status: 500 });
  }
}


