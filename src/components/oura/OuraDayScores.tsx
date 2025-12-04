'use client';

import OuraScoreCompact from './OuraScoreCompact';
import type { OuraScores } from '@/types';

interface OuraDayScoresProps {
  scores: OuraScores;
}

/**
 * Display all three Oura scores for a single day
 */
export default function OuraDayScores({ scores }: OuraDayScoresProps) {
  return <OuraScoreCompact scores={scores} />;
}
