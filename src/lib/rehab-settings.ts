import { ROSSI_SHAKE, ROSSI_VITAMINS } from '@/data/rehab-defaults';
import { kvGet } from '@/lib/kv';
import type { RehabSettings } from '@/types';

const SETTINGS_KEY = 'rehab:settings';

/**
 * Fetch rehab settings from KV and ensure defaults are present so that
 * downstream pages always have a complete vitamin + shake profile.
 */
export async function getRehabSettingsWithDefaults(): Promise<RehabSettings> {
  try {
    const stored = await kvGet<RehabSettings>(SETTINGS_KEY);

    const vitamins =
      stored?.vitamins && stored.vitamins.length > 0 ? stored.vitamins : ROSSI_VITAMINS;

    const proteinShake =
      stored?.proteinShake?.ingredients &&
      stored.proteinShake.ingredients.length > 0
        ? {
            ingredients: stored.proteinShake.ingredients,
            servingSize: stored.proteinShake.servingSize || ROSSI_SHAKE.servingSize,
          }
        : ROSSI_SHAKE;

    return {
      vitamins,
      proteinShake,
    };
  } catch (error) {
    console.error('Failed to load rehab settings, using defaults', error);
    return {
      vitamins: ROSSI_VITAMINS,
      proteinShake: ROSSI_SHAKE,
    };
  }
}
