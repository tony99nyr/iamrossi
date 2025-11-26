# Fruit Ninja Homepage Game - Documentation

## Overview

The homepage of this site (`/`) is an interactive **Fruit Ninja-style browser game** that serves as both a landing page and navigation hub. Users can slash 3D spinning objects to navigate to tools or play a scoring game.

### Core Concept
- **Intro State**: Static tool icons and fruits hover on screen, slashable for navigation
- **Playing State**: Fast-paced arcade game with fruits, bombs, and bonus items
- **Leaderboard**: Classic arcade-style high score system with smooth scroll reveal

---

## Technical Architecture

### Technology Stack
- **Frontend**: React 19 + Next.js 16 (App Router)
- **Styling**: Panda CSS (Atomic CSS-in-JS)
- **3D Rendering**: CSS 3D Transforms (not WebGL/Three.js)
- **2D Canvas**: HTML5 Canvas for slash trails and particles
- **Backend**: Next.js API Routes
- **Database**: Redis (Vercel KV) for leaderboard storage
- **Physics**: Custom RequestAnimationFrame game loop

### File Structure
```
/src/app/page.tsx                                    # Homepage entry (renders FruitNinjaGame)
/src/components/game/
  ├── FruitNinjaGame.tsx                            # Main game component (game loop, state)
  ├── GameObject3D.tsx                              # Individual 3D spinning object
  ├── GameCanvas.tsx                                # Canvas for slash trails & particles
  ├── WoodBackground.tsx                            # Wood texture background
  ├── LeaderboardDisplay.tsx                        # Arcade-style leaderboard with scroll
  └── animations.css                                # CSS keyframes (gentle hover)

/src/lib/game/
  ├── constants.ts                                  # Game config (physics, speeds, colors)
  ├── physics.ts                                    # Position, velocity, rotation, gravity
  ├── collision.ts                                  # Line-to-circle collision detection
  ├── objects.ts                                    # Object factories (fruit, bomb, bonus, tool icons)
  └── particles.ts                                  # Particle explosion system

/src/types/game.ts                                  # TypeScript type definitions
/src/app/api/game/leaderboard/route.ts             # GET/POST leaderboard endpoints
/src/lib/kv.ts                                      # Redis operations (includes leaderboard functions)
```

---

## Game Mechanics

### Phase 1: Intro (Landing Page)
**What You See:**
- 3 **tool icons** at 25% from top (🏒 Next Game, 🦵 Knee Rehab, 📊 Stat Recording)
- 3 **fruits** at 55% from top (random: 🍎 🍉 🍊 🍍 🍓)
- All objects gently hover and slowly rotate in 3D
- Wood panel background with slash damage marks

**Interactions:**
- **Slash a tool icon** → Navigate to that tool
- **Slash a fruit** → Start the game

### Phase 2: Playing
**Spawning System:**
- Objects toss from bottom of screen with parabolic trajectories
- **60% Fruits** (10 points each)
- **15% Bombs** (💣 lose 1 life)
- **10% Bonus Items** (🏒 20pts, 🌀 30pts, 🎵 50pts)
- Random spawn interval: 800-1500ms
- Max 15 objects on screen at once

**Physics:**
- Gravity: 0.4 pixels/frame²
- Upward velocity: -26 to -32 pixels/frame (reaches top of screen)
- Horizontal velocity: -4 to 4 pixels/frame
- 3D rotation: 0.5-2°/frame (calmed down for visibility)

**Slash Detection:**
- Mouse/touch input creates slash trails (glowing white lines)
- Line-to-circle collision detection
- Real-time rendering (no lag)
- Particles explode on successful slice (12 particles in object's color)

**Win/Lose Conditions:**
- **Game Over**: Hit 3 bombs
- **Scoring**: Slice fruits and bonus items for points

### Phase 3: Game Over & Leaderboard
**Flow:**
1. Game ends → Returns to intro state
2. **Final score displays** in gold at top-left
3. **Rank preview** shows: "You ranked #5!"
4. **Name entry** appears at top-right
5. User enters name → Press Enter or click "Save Score"
6. **Leaderboard appears** scrolled to user's score (highlighted with pulsing gold)
7. After 2 seconds, **smoothly scrolls to top** to reveal champions
8. Close button returns to intro

---

## Implementation Details

### 3D Rendering (CSS Transforms)
**Why CSS 3D instead of WebGL/Three.js?**
- Lighter bundle size (~100KB savings)
- Easier React integration
- Hardware-accelerated
- Good browser support (Chrome, Firefox, Safari last 2 versions)

**How it works:**
```typescript
<div style={{
  position: 'absolute',
  left: `${object.position.x}px`,
  top: `${object.position.y}px`,
  transform: `
    translateZ(${object.position.z}px)
    rotateX(${object.rotation.x}deg)
    rotateY(${object.rotation.y}deg)
    rotateZ(${object.rotation.z}deg)
    scale(${object.scale})
  `,
  filter: `drop-shadow(${shadowX}px ${shadowY}px ${blur}px rgba(0,0,0,0.6))`,
  transformStyle: 'preserve-3d',
}}>
  <span style={{ fontSize: '100px' }}>🍎</span>
</div>
```

**Dynamic Shadows:**
- Shadow offset changes based on Y rotation (simulates light from top-right)
- Calculated every frame: `shadowX = sin(rotationY) * 15`

### Game Loop (RequestAnimationFrame)
**Pattern from `ThunderstormBackground.tsx`:**
```typescript
useEffect(() => {
  const gameLoop = () => {
    const deltaTime = (now - lastFrameTime) / 16.67; // Normalize to 60fps

    // Update physics
    objects.forEach(obj => {
      updateRotation(obj, deltaTime);
      if (gamePhase === 'playing') {
        updatePosition(obj, deltaTime); // Gravity + velocity
      }
    });

    // Check collisions
    const collisions = findSlashCollisions(currentSlash, objects);

    // Render canvas
    clearCanvas();
    renderSlashes(slashes);
    renderParticles(particles);

    requestAnimationFrame(gameLoop);
  };

  gameLoop();
}, [dependencies]);
```

### State Management Strategy
**React State (triggers re-renders):**
- `objects` - Array of game objects (for 3D rendering)
- `gamePhase` - 'intro' | 'playing' | 'gameOver'
- `score`, `lives`, `finalScore`

**Refs (no re-renders - performance):**
- `slashes` - Slash trail data
- `particles` - Particle effects
- `currentSlash` - Active slash being drawn
- `isSlashing` - Boolean flag

**Why this split?**
- Objects need to re-render for position updates (3D transforms)
- Slashes/particles render on canvas (no DOM updates needed)

### Collision Detection
**Algorithm: Line-segment-to-circle intersection**
```typescript
// For each line segment in slash trail
for (let i = 0; i < slashPoints.length - 1; i++) {
  const distance = distanceToLineSegment(
    object.position.x,
    object.position.y,
    slashPoints[i].x,
    slashPoints[i].y,
    slashPoints[i+1].x,
    slashPoints[i+1].y
  );

  if (distance <= object.radius) {
    return true; // Collision!
  }
}
```

**Performance:** Only checks objects in viewport with active slash.

### Leaderboard System (Redis)
**Data Structure: Sorted Set**
```typescript
KEY: 'game:leaderboard'
MEMBER: 'PlayerName:timestamp'
SCORE: score_value

// Operations
ZADD game:leaderboard 1250 "Tony:1700000000000"
ZREVRANGE game:leaderboard 0 9 WITHSCORES  // Top 10
ZREMRANGEBYRANK game:leaderboard 0 -101    // Keep top 100
```

**Rank Calculation:**
```typescript
// Count scores higher than current score
const higherScores = await redis.zCount(
  'game:leaderboard',
  score + 1,
  '+inf'
);
return higherScores + 1; // Rank is 1-indexed
```

---

## Features Implemented

### ✅ Core Gameplay
- [x] 3D spinning objects with realistic shadows
- [x] Mouse & touch slash detection
- [x] Parabolic physics with deceleration/acceleration
- [x] Particle effects on slice
- [x] Multiple object types (fruit, bombs, bonus items, tool icons)
- [x] Score tracking and lives system
- [x] Game over on 3 bomb hits

### ✅ Navigation
- [x] Tool icons as slashable navigation (intro phase)
- [x] Seamless transition from intro → playing → intro
- [x] No blocking modals (can always slash to navigate)

### ✅ Visual Design
- [x] Wood panel background with slash damage marks
- [x] Glowing slash trails with fade animation
- [x] Colorful particle explosions
- [x] Emoji-based objects (rapid prototyping, works great!)
- [x] Gentle hover animation in intro

### ✅ Leaderboard
- [x] Redis-backed persistent storage
- [x] Top 100 scores kept
- [x] Rank preview before saving
- [x] Arcade-style scroll animation (user's score → top)
- [x] Highlighted entry with pulsing animation
- [x] Medals for top 3 (🥇🥈🥉)

---

## Configuration & Tuning

### Physics Constants (`/src/lib/game/constants.ts`)
```typescript
{
  gravity: 0.4,                    // Adjusted for "hang time" at peak
  minVelocityY: -32,               // High enough to reach top of screen
  maxVelocityY: -26,
  minRotationSpeedX: 0.5,          // Calmed down from 2-8
  maxRotationSpeedX: 2,
  slashTrailFadeTime: 200,         // Fast fade for clean screen
  objectRadius: 50,                // Collision circle size
}
```

### Spawn Weights
```typescript
{
  fruit: 60%,    // Most common
  bomb: 15%,     // Dangerous but not too frequent
  bonus: 10%,    // Rare treats
}
```

### Object Points
```typescript
Fruits:       10 pts
Bamboo:       5 pts per segment (multi-slice)
Hockey Puck:  20 pts
Canes Logo:   30 pts
Rick Astley:  50 pts (easter egg)
Bombs:        -1 life
```

---

## Known Issues & Limitations

### Current Status
1. **Bamboo multi-slice not implemented** - Planned but not built yet
2. **Mobile performance** - Not fully optimized for lower-end devices
3. **Asset quality** - Using emoji (works well, but could upgrade to PNGs/SVGs)
4. **Sound effects** - Intentionally excluded (user requested silent game)
5. **Accessibility** - Screen reader support not required (personal/family site with noindex)

### Bug Fixes Applied
- ✅ Cursor leaving screen no longer sticks slash
- ✅ Slash animation lag fixed (real-time rendering)
- ✅ Objects spawn visible on intro (not below screen)
- ✅ Spinning calmed down (was too fast/nauseating)

---

## Future Enhancements & Considerations

### Phase 1: Bamboo Multi-Slice (Not Implemented Yet)
**Concept:** Bamboo objects break into 2-3 segments when sliced. Each segment can be sliced again for additional points.

**Implementation Plan:**
```typescript
// On bamboo slice:
1. Mark original bamboo as sliced
2. Create 2-3 new BambooSegment objects
3. Position segments near original position
4. Give each segment velocity in different directions
5. Each segment is independently slashable (5 pts each)
```

**Files to modify:**
- `/src/lib/game/objects.ts` - Add bamboo spawning logic
- `/src/lib/game/constants.ts` - Add bamboo properties
- `/src/components/game/FruitNinjaGame.tsx` - Handle bamboo slice logic

### Phase 2: Mobile Optimization (Pending)
**Performance concerns:**
- 3D transforms can be heavy on low-end mobile devices
- Particle count should reduce on mobile (<768px)
- Spawn rate should slow down on mobile

**Implementation:**
```typescript
const isMobile = window.innerWidth < 768;

const adjustedParticleCount = isMobile
  ? PARTICLE_SETTINGS.count * 0.6
  : PARTICLE_SETTINGS.count;

const adjustedSpawnInterval = isMobile
  ? spawnInterval * 1.3
  : spawnInterval;
```

### Phase 3: Visual Enhancements (Optional)
**Potential upgrades:**
1. **Replace emoji with PNG images**
   - More consistent across browsers
   - Better visual quality
   - Could add "juice" splatter effects
   - Tools: DALL-E, Midjourney, or Blender renders

2. **Dynamic wood damage**
   - Add slash marks to wood as you slice
   - Fade in new marks, fade out old ones
   - Track slash positions and angles

3. **Combo system**
   - Slice multiple objects rapidly → multiplier
   - Display "2x", "3x" combo indicators
   - Bonus points for combos

4. **Power-ups**
   - Slow motion (⏱️) - Slow down time briefly
   - Double points (💰) - 2x score for 10 seconds
   - Frenzy mode (⚡) - More spawns, faster gameplay

### Phase 4: Advanced Features (Considered but not prioritized)
**Sound effects** (user declined):
- Slice sounds (whoosh)
- Bomb explosions
- Background music toggle
- Audio cues for combo

**Difficulty modes:**
- Easy: Slower spawns, no bombs
- Normal: Current settings
- Hard: Faster spawns, more bombs, less lives

**Weekly/monthly leaderboards:**
- Reset leaderboards periodically
- Show "This Week" vs "All Time"
- Social sharing of high scores

**Animations:**
- Fruit halves falling after slice (with rotation)
- Bomb explosion effect (particles + screen shake)
- Critical hit sparkles on high-value items

### Phase 5: Codebase Polish (Nice to have)
**Testing:**
- Unit tests for physics calculations
- Integration tests for game flow
- Visual regression testing

**Performance monitoring:**
- FPS counter in dev mode
- Track dropped frames
- Memory leak detection

**Code cleanup:**
- Remove debug console.logs
- Add JSDoc comments to complex functions
- Extract magic numbers to constants

---

## Development Notes

### For Future Agents/Contributors

**Understanding the game loop:**
1. Read `/src/components/game/FruitNinjaGame.tsx` first (main orchestrator)
2. Check `/src/lib/game/constants.ts` for tunable values
3. Study `/src/lib/game/physics.ts` for movement logic
4. Review `/src/lib/game/collision.ts` for slash detection

**Adding new object types:**
1. Add variant to `/src/types/game.ts`
2. Add properties to `/src/lib/game/constants.ts`
3. Add factory function to `/src/lib/game/objects.ts`
4. Update spawn weights in `spawnRandomObject()`
5. Handle slice logic in `handleObjectSliced()`

**Debugging tips:**
- Add `console.log` in game loop (temporarily)
- Slow down time by reducing deltaTime
- Increase object spawn radius to see spawn points
- Disable culling to see off-screen objects

**Performance optimization checklist:**
- Use refs for data that doesn't need re-renders
- Batch state updates
- Use `useMemo` for expensive calculations
- Profile with React DevTools
- Monitor RAF frame times

### Browser Compatibility
**Tested on:**
- ✅ Chrome 120+ (Windows/Mac)
- ✅ Firefox 120+ (Windows/Mac)
- ✅ Safari 17+ (Mac)

**Known issues:**
- Safari may have slight CSS transform performance differences
- Mobile Safari touch events work but need testing on older devices

### Environment Setup
**Required environment variables:**
- `REDIS_URL` - Vercel KV connection string (for leaderboard)

**Development:**
```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm test         # Run tests (once implemented)
```

---

## Design Philosophy

### Why This Approach?

**Interactive Landing Page:**
- More engaging than static text
- Memorable first impression
- Shows technical capability
- Fun way to navigate to tools

**No Blocking UI:**
- Can always slash a tool icon to navigate (even during game)
- No "Start Game" button needed
- Seamless flow between states
- Feels fluid and responsive

**Emoji vs Images:**
- Rapid prototyping (zero asset creation time)
- Works well in 3D (unicode supports rotation)
- Consistent size and centering
- Actually looks good with proper shadows
- Easy to swap for images later if desired

**CSS 3D vs WebGL:**
- Simpler implementation
- Easier to debug
- Better React integration
- Sufficient for this use case
- Can always upgrade to Three.js if needed

---

## Conclusion

This game serves as both a **functional landing page** and a **technical showcase**. It demonstrates 3D rendering, physics simulation, real-time collision detection, and persistent storage—all in a fun, interactive package.

The architecture is modular and well-documented, making it easy to add features or modify behavior. The game loop pattern follows React best practices and scales well for this type of interactive experience.

**Current state:** Fully playable MVP with leaderboard integration.

**Next steps:** Mobile optimization and optional bamboo multi-slice feature.

---

*Last updated: 2025-11-26*
*Built with React 19, Next.js 16, Panda CSS, and Redis*
