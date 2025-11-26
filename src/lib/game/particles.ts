import type { Particle, GameObject } from '@/types/game';
import { PARTICLE_SETTINGS } from './constants';

/**
 * Create particle explosion when an object is sliced
 */
export function createParticleExplosion(
  object: GameObject,
  count: number = PARTICLE_SETTINGS.count
): Particle[] {
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    // Random angle for particle direction
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = PARTICLE_SETTINGS.minSpeed + Math.random() * (PARTICLE_SETTINGS.maxSpeed - PARTICLE_SETTINGS.minSpeed);

    particles.push({
      x: object.position.x,
      y: object.position.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: PARTICLE_SETTINGS.minSize + Math.random() * (PARTICLE_SETTINGS.maxSize - PARTICLE_SETTINGS.minSize),
      color: object.color || '#FF3B30',
      alpha: 1,
      life: 1,
      gravity: PARTICLE_SETTINGS.gravity,
    });
  }

  return particles;
}

/**
 * Update a single particle
 */
export function updateParticle(particle: Particle, deltaTime: number): Particle {
  particle.vy += particle.gravity * deltaTime;
  particle.x += particle.vx * deltaTime;
  particle.y += particle.vy * deltaTime;
  particle.alpha -= PARTICLE_SETTINGS.fadeSpeed * deltaTime;
  particle.life -= PARTICLE_SETTINGS.fadeSpeed * deltaTime;

  return particle;
}
