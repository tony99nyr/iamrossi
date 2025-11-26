// Type definitions for Fruit Ninja game

export type GamePhase = 'intro' | 'playing' | 'gameOver';

export type ObjectType = 'fruit' | 'bamboo' | 'bomb' | 'toolIcon' | 'bonus';

export type FruitVariant = 'apple' | 'watermelon' | 'orange' | 'pineapple' | 'strawberry';

export type BonusVariant = 'puck' | 'canes' | 'rick';

export type ToolType = 'next-game' | 'knee-rehab' | 'stat-recording';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface GameObject {
  id: string;
  type: ObjectType;
  variant?: FruitVariant | BonusVariant;
  toolType?: ToolType;
  position: Vector3D;
  velocity: Vector2D;
  rotation: Vector3D;
  rotationSpeed: Vector3D;
  scale: number;
  radius: number; // For collision detection (2D circle)
  sliced: boolean;
  isOffScreen: boolean;
  emoji: string; // Visual representation (🍎, 💣, etc.)
  color?: string; // Fallback color for particles
  points: number; // Points awarded when sliced
}

export interface BambooSegment extends GameObject {
  type: 'bamboo';
  segmentIndex: number;
  parentId?: string;
}

export interface SlashPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface SlashTrail {
  points: SlashPoint[];
  startTime: number;
  fadeOutTime: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number; // 0-1, decreases over time
  gravity: number;
}

export interface GameState {
  objects: GameObject[];
  slashes: SlashTrail[];
  particles: Particle[];
  score: number;
  lives: number;
  phase: GamePhase;
  lastSpawnTime: number;
  spawnInterval: number;
  objectsSliced: number;
  bombsHit: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  timestamp: number;
  date: string; // Formatted date string
}

export interface GameConfig {
  // Physics
  gravity: number;
  // Spawning
  minSpawnInterval: number;
  maxSpawnInterval: number;
  // Velocities
  minVelocityX: number;
  maxVelocityX: number;
  minVelocityY: number;
  maxVelocityY: number;
  toolIconVelocityYMultiplier: number; // Slower fall for tool icons
  // Rotation
  minRotationSpeedX: number;
  maxRotationSpeedX: number;
  minRotationSpeedY: number;
  maxRotationSpeedY: number;
  minRotationSpeedZ: number;
  maxRotationSpeedZ: number;
  // Collision
  objectRadius: number;
  slashTrailFadeTime: number;
  slashTrailMaxAge: number;
  // Gameplay
  maxLives: number;
  maxObjectsOnScreen: number;
  // Perspective
  perspectiveValue: number;
}

export interface ShadowConfig {
  shadowX: number;
  shadowY: number;
  blur: number;
}
