import { describe, it, expect } from 'vitest';
import type { PokemonCardPriceSnapshot, PokemonIndexSettings } from '@/types';
import { buildIndexSeriesFromSnapshots } from '@/lib/pokemon-index-service';

describe('pokemon-index-service', () => {
  const settings: PokemonIndexSettings = {
    cards: [
      {
        id: 'card-1',
        name: 'Charizard',
        conditionType: 'ungraded',
        weight: 1,
        source: 'pricecharting',
      },
      {
        id: 'card-2',
        name: 'Blastoise',
        conditionType: 'psa10',
        weight: 2,
        source: 'pricecharting',
      },
    ],
    refreshIntervalHours: 24,
  };

  const snapshots: PokemonCardPriceSnapshot[] = [
    {
      cardId: 'card-1',
      date: '2025-01-01',
      ungradedPrice: 100,
      psa10Price: undefined,
      source: 'pricecharting',
      currency: 'USD',
    },
    {
      cardId: 'card-2',
      date: '2025-01-01',
      ungradedPrice: undefined,
      psa10Price: 300,
      source: 'pricecharting',
      currency: 'USD',
    },
    {
      cardId: 'card-1',
      date: '2025-01-02',
      ungradedPrice: 110,
      psa10Price: undefined,
      source: 'pricecharting',
      currency: 'USD',
    },
    {
      cardId: 'card-2',
      date: '2025-01-02',
      ungradedPrice: undefined,
      psa10Price: 330,
      source: 'pricecharting',
      currency: 'USD',
    },
  ];

  it('builds index series normalized to 100 on first day', () => {
    const series = buildIndexSeriesFromSnapshots(snapshots, settings);
    expect(series.length).toBeGreaterThan(0);
    expect(series[0].date).toBe('2025-01-01');
    expect(series[0].indexValue).toBeCloseTo(100);
  });

  it('computes moving averages', () => {
    const series = buildIndexSeriesFromSnapshots(snapshots, settings);
    for (const point of series) {
      expect(point.ma30).toBeDefined();
      expect(point.ma120).toBeDefined();
    }
  });
});







