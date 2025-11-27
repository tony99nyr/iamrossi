import { GAME_CONFIG, SPAWN_WEIGHTS } from './constants';

export interface DifficultyConfig {
  tier: number;
  name: string;
  color: string;
  minSpawnInterval: number;
  maxSpawnInterval: number;
  maxObjectsOnScreen: number;
  multiSpawnChances: {
    double: number;
    triple: number;
    quad: number;
  };
  bombWeight: number;
  velocityMultiplier: number;
}

const DIFFICULTY_TIERS: DifficultyConfig[] = [
  // Tier 1: 0-499
  {
    tier: 1,
    name: "Warm Up",
    color: "#4CAF50", // Green
    minSpawnInterval: 800,
    maxSpawnInterval: 1500,
    maxObjectsOnScreen: 15,
    multiSpawnChances: { double: 0, triple: 0, quad: 0 },
    bombWeight: 15,
    velocityMultiplier: 1.0,
  },
  // Tier 2: 500-999
  {
    tier: 2,
    name: "Heating Up",
    color: "#FFC107", // Amber
    minSpawnInterval: 700,
    maxSpawnInterval: 1300,
    maxObjectsOnScreen: 15,
    multiSpawnChances: { double: 0.1, triple: 0, quad: 0 },
    bombWeight: 18,
    velocityMultiplier: 1.0,
  },
  // Tier 3: 1000-1499
  {
    tier: 3,
    name: "Spicy",
    color: "#FF9800", // Orange
    minSpawnInterval: 600,
    maxSpawnInterval: 1100,
    maxObjectsOnScreen: 18,
    multiSpawnChances: { double: 0.2, triple: 0.05, quad: 0 },
    bombWeight: 20,
    velocityMultiplier: 1.1,
  },
  // Tier 4: 1500-1999
  {
    tier: 4,
    name: "On Fire",
    color: "#FF5722", // Deep Orange
    minSpawnInterval: 500,
    maxSpawnInterval: 900,
    maxObjectsOnScreen: 20,
    multiSpawnChances: { double: 0.3, triple: 0.1, quad: 0 },
    bombWeight: 22,
    velocityMultiplier: 1.2,
  },
  // Tier 5: 2000+
  {
    tier: 5,
    name: "INFERNO",
    color: "#FF0000", // Red
    minSpawnInterval: 400,
    maxSpawnInterval: 700,
    maxObjectsOnScreen: 25,
    multiSpawnChances: { double: 0.4, triple: 0.15, quad: 0.03 },
    bombWeight: 25,
    velocityMultiplier: 1.3,
  },
];

/**
 * Calculate difficulty configuration based on current score
 * Difficulty increases every 500 points
 */
export function calculateDifficulty(score: number): DifficultyConfig {
  const tierIndex = Math.min(Math.floor(score / 500), DIFFICULTY_TIERS.length - 1);
  return DIFFICULTY_TIERS[tierIndex];
}
