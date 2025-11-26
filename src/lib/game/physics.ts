import type { GameObject, Vector3D, Vector2D, ShadowConfig } from '@/types/game';
import { GAME_CONFIG } from './constants';

/**
 * Generate a random number between min and max
 */
export function random(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Generate random velocity for object spawn
 */
export function generateVelocity(isToolIcon: boolean = false): Vector2D {
  const velocityY = random(GAME_CONFIG.minVelocityY, GAME_CONFIG.maxVelocityY);

  return {
    x: random(GAME_CONFIG.minVelocityX, GAME_CONFIG.maxVelocityX),
    y: isToolIcon ? velocityY * GAME_CONFIG.toolIconVelocityYMultiplier : velocityY,
  };
}

/**
 * Generate random rotation speed for 3D tumbling effect
 */
export function generateRotationSpeed(): Vector3D {
  return {
    x: random(GAME_CONFIG.minRotationSpeedX, GAME_CONFIG.maxRotationSpeedX) * (Math.random() > 0.5 ? 1 : -1),
    y: random(GAME_CONFIG.minRotationSpeedY, GAME_CONFIG.maxRotationSpeedY) * (Math.random() > 0.5 ? 1 : -1),
    z: random(GAME_CONFIG.minRotationSpeedZ, GAME_CONFIG.maxRotationSpeedZ) * (Math.random() > 0.5 ? 1 : -1),
  };
}

/**
 * Update object position based on velocity and gravity
 * Uses parabolic motion: y = y0 + vy*t + 0.5*g*t²
 */
export function updatePosition(object: GameObject, deltaTime: number = 1): void {
  // Apply gravity to velocity
  object.velocity.y += GAME_CONFIG.gravity * deltaTime;

  // Update position
  object.position.x += object.velocity.x * deltaTime;
  object.position.y += object.velocity.y * deltaTime;
}

/**
 * Update object 3D rotation
 */
export function updateRotation(object: GameObject, deltaTime: number = 1): void {
  object.rotation.x += object.rotationSpeed.x * deltaTime;
  object.rotation.y += object.rotationSpeed.y * deltaTime;
  object.rotation.z += object.rotationSpeed.z * deltaTime;

  // Keep rotation in 0-360 range for cleaner values
  object.rotation.x %= 360;
  object.rotation.y %= 360;
  object.rotation.z %= 360;
}

/**
 * Calculate dynamic shadow based on 3D rotation
 * Shadow offset changes based on object rotation to simulate light from top-right
 */
export function calculateShadow(rotation: Vector3D): ShadowConfig {
  // Convert degrees to radians
  const rotX = (rotation.x * Math.PI) / 180;
  const rotY = (rotation.y * Math.PI) / 180;

  // Shadow moves horizontally based on Y rotation
  const shadowX = Math.sin(rotY) * 15;

  // Shadow moves vertically based on X rotation
  const shadowY = 10 + Math.sin(rotX) * 5;

  // Blur stays constant
  const blur = 15;

  return { shadowX, shadowY, blur };
}

/**
 * Check if object is off screen (including buffer zone)
 */
export function isOffScreen(object: GameObject, width: number, height: number): boolean {
  const buffer = 200; // Buffer zone beyond screen edges

  return (
    object.position.x < -buffer ||
    object.position.x > width + buffer ||
    object.position.y > height + buffer
  );
}

/**
 * Generate spawn position at bottom of screen
 */
export function generateSpawnPosition(screenWidth: number, screenHeight: number): Vector3D {
  return {
    x: random(100, screenWidth - 100), // Spawn within horizontal bounds
    y: screenHeight + 50, // Just below screen
    z: 0, // No depth offset for spawn
  };
}

/**
 * Calculate distance between two points
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normalize rotation to 0-360 range
 */
export function normalizeRotation(rotation: number): number {
  while (rotation < 0) rotation += 360;
  while (rotation >= 360) rotation -= 360;
  return rotation;
}

/**
 * Calculate spawn interval with some randomness
 */
export function calculateSpawnInterval(): number {
  return random(GAME_CONFIG.minSpawnInterval, GAME_CONFIG.maxSpawnInterval);
}
