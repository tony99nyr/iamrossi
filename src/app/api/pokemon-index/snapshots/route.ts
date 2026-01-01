import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getPokemonCardPriceSnapshots, setPokemonCardPriceSnapshots, getPokemonIndexSettings } from '@/lib/kv';
import { ensurePokemonIndexUpToDate } from '@/lib/pokemon-index-service';
import { logError } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const settings = await getPokemonIndexSettings();
    const snapshots = await getPokemonCardPriceSnapshots();
    
    // Debug logging
    console.log(`[Pokemon API] getPokemonCardPriceSnapshots returned ${snapshots.length} snapshots`);

    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get('cardId');
    const daysParam = searchParams.get('days');
    // If days=0, return all snapshots (no filtering)
    const days = daysParam ? Number.parseInt(daysParam, 10) : 90;

    const filteredSnapshots = snapshots
      .filter((snap) => !cardId || snap.cardId === cardId)
      .sort((a, b) => a.date.localeCompare(b.date));

    // If days=0, return all snapshots (no filtering)
    // If days > 0, filter to last N days from the most recent date
    const limitedSnapshots =
      days === 0
        ? filteredSnapshots
        : days > 0
        ? filteredSnapshots.filter((snap) => {
            if (!filteredSnapshots.length) return true;
            const lastDate = filteredSnapshots[filteredSnapshots.length - 1]!.date;
            const cutoff = new Date(lastDate);
            cutoff.setDate(cutoff.getDate() - days + 1);
            return snap.date >= cutoff.toISOString().slice(0, 10);
          })
        : filteredSnapshots;

    return NextResponse.json({
      settings: settings ?? { cards: [], refreshIntervalHours: 24 },
      snapshots: limitedSnapshots,
    });
  } catch (error) {
    logError('API Error', error, { method: 'GET', path: '/api/pokemon-index/snapshots' });
    return NextResponse.json({ error: 'Failed to fetch Pokemon price snapshots' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  // Verify authentication (PIN-protected)
  const isAuthenticated = await verifyAuthToken(request);
  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'Date parameter is required' }, { status: 400 });
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    const snapshots = await getPokemonCardPriceSnapshots();
    const beforeCount = snapshots.length;
    
    // Filter out snapshots for the specified date
    const filteredSnapshots = snapshots.filter((snap) => snap.date !== date);
    const deletedCount = beforeCount - filteredSnapshots.length;

    if (deletedCount === 0) {
      return NextResponse.json({ 
        message: `No snapshots found for date ${date}`,
        deletedCount: 0 
      });
    }

    // Save the filtered snapshots
    await setPokemonCardPriceSnapshots(filteredSnapshots);

    // Rebuild the index series without the deleted snapshots
    const settings = await getPokemonIndexSettings();
    if (settings) {
      await ensurePokemonIndexUpToDate(settings);
    }

    return NextResponse.json({
      message: `Deleted ${deletedCount} snapshot(s) for date ${date}`,
      deletedCount,
      remainingSnapshots: filteredSnapshots.length,
    });
  } catch (error) {
    logError('API Error', error, { method: 'DELETE', path: '/api/pokemon-index/snapshots' });
    return NextResponse.json({ error: 'Failed to delete Pokemon price snapshots' }, { status: 500 });
  }
}


