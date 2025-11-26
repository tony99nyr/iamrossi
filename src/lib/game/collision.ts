import type { GameObject, SlashPoint } from '@/types/game';

/**
 * Check if a point is within a circle (for simple collision)
 */
export function pointInCircle(px: number, py: number, cx: number, cy: number, radius: number): boolean {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Calculate distance from a point to a line segment
 * Used for line-to-circle collision detection
 */
export function distanceToLineSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    // Line segment is a point
    const dpx = px - x1;
    const dpy = py - y1;
    return Math.sqrt(dpx * dpx + dpy * dpy);
  }

  // Calculate projection parameter t
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]

  // Find closest point on line segment
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  // Calculate distance from point to closest point
  const distX = px - closestX;
  const distY = py - closestY;
  return Math.sqrt(distX * distX + distY * distY);
}

/**
 * Check if a slash trail intersects with a game object
 * Uses line-to-circle collision detection
 */
export function checkSlashCollision(slashPoints: SlashPoint[], object: GameObject): boolean {
  if (slashPoints.length < 2) return false;

  // Check each line segment of the slash against the object's circular hitbox
  for (let i = 0; i < slashPoints.length - 1; i++) {
    const p1 = slashPoints[i];
    const p2 = slashPoints[i + 1];

    const distance = distanceToLineSegment(
      object.position.x,
      object.position.y,
      p1.x,
      p1.y,
      p2.x,
      p2.y
    );

    if (distance <= object.radius) {
      return true;
    }
  }

  return false;
}

/**
 * Find all objects that collide with any active slash trail
 */
export function findSlashCollisions(
  slashPoints: SlashPoint[],
  objects: GameObject[]
): GameObject[] {
  return objects.filter((obj) => !obj.sliced && checkSlashCollision(slashPoints, obj));
}
