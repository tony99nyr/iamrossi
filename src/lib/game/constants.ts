import type { GameConfig, FruitVariant, BonusVariant, ToolType } from '@/types/game';

// Game configuration constants
export const GAME_CONFIG: GameConfig = {
  // Physics
  gravity: 0.4, // pixels/frame² (slightly reduced for more hang time at peak)

  // Spawning
  minSpawnInterval: 800, // ms
  maxSpawnInterval: 1500, // ms

  // Velocities (pixels/frame)
  minVelocityX: -4,
  maxVelocityX: 4,
  minVelocityY: -32, // Negative = upward (much higher to reach top of screen)
  maxVelocityY: -26,
  toolIconVelocityYMultiplier: 0.6, // Tool icons fall 40% slower

  // Rotation speeds (degrees/frame) - calmed down for better visibility
  minRotationSpeedX: 0.5,
  maxRotationSpeedX: 2,
  minRotationSpeedY: 0.5,
  maxRotationSpeedY: 2,
  minRotationSpeedZ: 0.3,
  maxRotationSpeedZ: 1.5,

  // Collision
  objectRadius: 50, // pixels (2D collision circle)
  slashTrailFadeTime: 200, // ms (faster fade)
  slashTrailMaxAge: 400, // ms (shorter lifetime)

  // Gameplay
  maxLives: 3,
  maxObjectsOnScreen: 15,

  // 3D Perspective
  perspectiveValue: 1200, // px
};

// Fruit emoji and properties
export const FRUITS: Record<FruitVariant, { emoji: string; color: string; points: number }> = {
  apple: { emoji: '🍎', color: '#FF3B30', points: 10 },
  watermelon: { emoji: '🍉', color: '#34C759', points: 10 },
  orange: { emoji: '🍊', color: '#FF9500', points: 10 },
  pineapple: { emoji: '🍍', color: '#FFCC00', points: 10 },
  strawberry: { emoji: '🍓', color: '#FF2D55', points: 10 },
};

// Bonus item properties
export const BONUS_ITEMS: Record<BonusVariant, { emoji: string; color: string; points: number }> = {
  puck: { emoji: '🏒', color: '#000000', points: 20 },
  canes: { emoji: '🌀', color: '#CC0000', points: 30 }, // Placeholder, replace with actual logo
  rick: { emoji: '🎵', color: '#FF69B4', points: 50 },
};

// Bomb properties
export const BOMB = {
  emoji: '💣',
  color: '#8E8E93',
  points: 0, // No points, loses a life
};

// Bamboo properties
export const BAMBOO = {
  emoji: '🎋',
  color: '#32D74B',
  points: 5, // Points per segment sliced
  segments: 3, // Number of pieces it breaks into
};

// Tool icons
export const TOOL_ICONS: Record<ToolType, { emoji: string; path: string; label: string }> = {
  'next-game': { emoji: '🏒', path: '/tools/next-game', label: 'Next Game' },
  'knee-rehab': { emoji: '🦵', path: '/tools/knee-rehab', label: 'Knee Rehab' },
  'stat-recording': { emoji: '📊', path: '/tools/stat-recording', label: 'Stats' },
};

// Object spawn weights (higher = more likely)
export const SPAWN_WEIGHTS = {
  fruit: 60,
  bamboo: 15,
  bomb: 15,
  bonus: 10,
};

// Canvas settings
export const CANVAS_SETTINGS = {
  slashLineWidth: 5,
  slashColor: 'rgba(255, 255, 255, 0.8)',
  slashGlowColor: 'rgba(200, 230, 255, 0.6)',
  slashGlowBlur: 15,
};

// Particle settings
export const PARTICLE_SETTINGS = {
  count: 12, // Particles per slice
  minSpeed: 2,
  maxSpeed: 8,
  minSize: 3,
  maxSize: 8,
  gravity: 0.3,
  fadeSpeed: 0.02, // Alpha decrease per frame
};

// Mobile settings
export const MOBILE_BREAKPOINT = 768; // px

export const MOBILE_ADJUSTMENTS = {
  spawnIntervalMultiplier: 1.3, // Slower spawning
  particleCountMultiplier: 0.6, // Fewer particles
  maxObjectsOnScreen: 10,
};
