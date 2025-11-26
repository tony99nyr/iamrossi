import type { GameObject, FruitVariant, ToolType, BonusVariant } from '@/types/game';
import { GAME_CONFIG, FRUITS, TOOL_ICONS, BONUS_ITEMS, BOMB } from './constants';
import { generateVelocity, generateRotationSpeed, generateSpawnPosition } from './physics';

/**
 * Create a fruit object
 */
export function createFruit(
  variant: FruitVariant,
  screenWidth: number,
  screenHeight: number
): GameObject {
  const fruitData = FRUITS[variant];
  const position = generateSpawnPosition(screenWidth, screenHeight);
  const velocity = generateVelocity(false, screenWidth, screenHeight, position.x);
  const rotationSpeed = generateRotationSpeed();

  return {
    id: `fruit-${Date.now()}-${Math.random()}`,
    type: 'fruit',
    variant,
    position,
    velocity,
    rotation: { x: 0, y: 0, z: 0 },
    rotationSpeed,
    scale: 1,
    radius: GAME_CONFIG.objectRadius,
    sliced: false,
    isOffScreen: false,
    emoji: fruitData.emoji,
    color: fruitData.color,
    points: fruitData.points,
  };
}

/**
 * Create a tool icon object (slower fall speed)
 */
export function createToolIcon(
  toolType: ToolType,
  screenWidth: number,
  screenHeight: number
): GameObject {
  const toolData = TOOL_ICONS[toolType];
  const position = generateSpawnPosition(screenWidth, screenHeight);
  const velocity = generateVelocity(true, screenWidth, screenHeight, position.x); // Tool icons fall slower
  const rotationSpeed = generateRotationSpeed();

  return {
    id: `tool-${toolType}-${Date.now()}`,
    type: 'toolIcon',
    toolType,
    position,
    velocity,
    rotation: { x: 0, y: 0, z: 0 },
    rotationSpeed,
    scale: 1.2, // Slightly larger than fruits
    radius: GAME_CONFIG.objectRadius * 1.2,
    sliced: false,
    isOffScreen: false,
    emoji: toolData.emoji,
    color: '#58a6ff', // Tool icon color
    points: 0, // No points for tool icons
  };
}

/**
 * Create a bomb object
 */
export function createBomb(
  screenWidth: number,
  screenHeight: number
): GameObject {
  const position = generateSpawnPosition(screenWidth, screenHeight);
  const velocity = generateVelocity(false, screenWidth, screenHeight, position.x);
  const rotationSpeed = generateRotationSpeed();

  return {
    id: `bomb-${Date.now()}-${Math.random()}`,
    type: 'bomb',
    position,
    velocity,
    rotation: { x: 0, y: 0, z: 0 },
    rotationSpeed,
    scale: 1,
    radius: GAME_CONFIG.objectRadius,
    sliced: false,
    isOffScreen: false,
    emoji: BOMB.emoji,
    color: BOMB.color,
    points: BOMB.points,
  };
}

/**
 * Create a bonus item object
 */
export function createBonusItem(
  variant: BonusVariant,
  screenWidth: number,
  screenHeight: number
): GameObject {
  const bonusData = BONUS_ITEMS[variant];
  const position = generateSpawnPosition(screenWidth, screenHeight);
  const velocity = generateVelocity(false, screenWidth, screenHeight, position.x);
  const rotationSpeed = generateRotationSpeed();

  return {
    id: `bonus-${variant}-${Date.now()}-${Math.random()}`,
    type: 'bonus',
    variant,
    position,
    velocity,
    rotation: { x: 0, y: 0, z: 0 },
    rotationSpeed,
    scale: 1.1, // Slightly larger for visibility
    radius: GAME_CONFIG.objectRadius * 1.1,
    sliced: false,
    isOffScreen: false,
    emoji: bonusData.emoji,
    color: bonusData.color,
    points: bonusData.points,
  };
}

/**
 * Get random fruit variant
 */
export function getRandomFruit(): FruitVariant {
  const fruits: FruitVariant[] = ['apple', 'watermelon', 'orange', 'pineapple', 'strawberry'];
  return fruits[Math.floor(Math.random() * fruits.length)];
}

/**
 * Spawn a random game object based on weighted probabilities
 */
export function spawnRandomObject(
  screenWidth: number,
  screenHeight: number
): GameObject {
  const rand = Math.random() * 100;

  if (rand < 60) {
    // 60% chance - Fruit
    return createFruit(getRandomFruit(), screenWidth, screenHeight);
  } else if (rand < 75) {
    // 15% chance - Bomb
    return createBomb(screenWidth, screenHeight);
  } else {
    // 10% chance - Bonus (puck, canes, rick)
    const bonuses: BonusVariant[] = ['puck', 'canes', 'rick'];
    const variant = bonuses[Math.floor(Math.random() * bonuses.length)];
    return createBonusItem(variant, screenWidth, screenHeight);
  }
}

/**
 * Spawn initial tool icons for intro phase (static positions with gentle hover)
 */
export function spawnInitialToolIcons(
  screenWidth: number,
  screenHeight: number
): GameObject[] {
  const tools: ToolType[] = ['next-game', 'knee-rehab', 'stat-recording'];

  return tools.map((tool, index) => {
    const toolIcon = createToolIcon(tool, screenWidth, screenHeight);
    // Position horizontally across the screen
    toolIcon.position.x = (screenWidth / 4) * (index + 1);
    // Position in upper third of screen
    toolIcon.position.y = screenHeight * 0.25;
    // No velocity - static position with gentle hover only
    toolIcon.velocity.y = 0;
    toolIcon.velocity.x = 0;
    // Slow, gentle rotation for visual interest
    toolIcon.rotationSpeed.x = 0.5;
    toolIcon.rotationSpeed.y = 0.5;
    toolIcon.rotationSpeed.z = 0.3;
    return toolIcon;
  });
}

/**
 * Spawn initial fruit for intro phase (single fruit at bottom center)
 */
export function spawnInitialFruits(
  screenWidth: number,
  screenHeight: number
): GameObject[] {
  const fruit = createFruit('apple', screenWidth, screenHeight);
  
  // Position at bottom center
  fruit.position.x = screenWidth / 2;
  fruit.position.y = screenHeight * 0.85; // Near bottom
  
  // No velocity - static position
  fruit.velocity.y = 0;
  fruit.velocity.x = 0;
  
  // Gentle rotation for visual interest
  fruit.rotationSpeed.x = 1;
  fruit.rotationSpeed.y = 1;
  fruit.rotationSpeed.z = 0.5;
  
  return [fruit];
}
