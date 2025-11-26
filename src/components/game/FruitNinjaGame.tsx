'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { GameObject, GamePhase, SlashTrail, Particle, SlashPoint } from '@/types/game';
import { GAME_CONFIG } from '@/lib/game/constants';
import {
  updatePosition,
  updateRotation,
  isOffScreen,
  calculateSpawnInterval,
} from '@/lib/game/physics';
import { findSlashCollisions } from '@/lib/game/collision';
import {
  spawnInitialFruits,
  spawnRandomObject,
} from '@/lib/game/objects';
import { createParticleExplosion } from '@/lib/game/particles';
import GameScene from './GameScene';
import GameCanvas, { type GameCanvasHandle } from './GameCanvas';
import WoodBackground from './WoodBackground';
import LeaderboardDisplay from './LeaderboardDisplay';
import NavigationMenu from './NavigationMenu';
import { css } from '@styled-system/css';
import './animations.css';

type LeaderboardApiResponse = {
  success: boolean;
  leaderboard: Array<{
    score: number;
  }>;
};

export default function FruitNinjaGame() {
  const router = useRouter();

  // Canvas ref
  const canvasRef = useRef<GameCanvasHandle>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(Date.now());

  // Game state
  const [objects, setObjects] = useState<GameObject[]>([]);
  const [gamePhase, setGamePhase] = useState<GamePhase>('intro');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(GAME_CONFIG.maxLives);
  const [finalScore, setFinalScore] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [predictedRank, setPredictedRank] = useState<number | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [savedRank, setSavedRank] = useState<number | null>(null);
  const [explosions, setExplosions] = useState<Array<{ id: string; position: { x: number; y: number; z: number } }>>([]);
  const [livesShaking, setLivesShaking] = useState(false);

  // Refs for performance-critical data (no re-renders)
  const gameStateRef = useRef({
    slashes: [] as SlashTrail[],
    particles: [] as Particle[],
    lastSpawnTime: 0,
    spawnInterval: calculateSpawnInterval(),
    isSlashing: false,
    currentSlash: [] as SlashPoint[],
  });
  const handleObjectSlicedRef = useRef<(object: GameObject) => void>(() => {});
  const objectsRef = useRef<GameObject[]>([]);
  const scoreRef = useRef(0);

  // Screen dimensions
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);
  
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // Set screen dimensions and spawn initial objects
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Spawn initial fruit on mount (single fruit at bottom center)
  useEffect(() => {
    if (dimensions.width === 0 || gamePhase !== 'intro') return;

    const fruits = spawnInitialFruits(dimensions.width, dimensions.height);
    setObjects(fruits);
  }, [dimensions.width, dimensions.height, gamePhase]);

  // Fetch predicted rank when final score is set
  useEffect(() => {
    if (finalScore <= 0 || predictedRank) return;

    const fetchPredictedRank = async () => {
      try {
        const response = await fetch(`/api/game/leaderboard?limit=100`);
        const data = (await response.json()) as LeaderboardApiResponse;

        if (data.success) {
          const higherScores = data.leaderboard.filter((entry) => entry.score > finalScore);
          setPredictedRank(higherScores.length + 1);
        }
      } catch (error) {
        console.error('Failed to fetch predicted rank:', error);
      }
    };

    fetchPredictedRank();
  }, [finalScore, predictedRank]);

  // Main game loop
  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return;

    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = (now - lastFrameTimeRef.current) / 16.67; // Normalize to 60fps
      lastFrameTimeRef.current = now;

      // Update objects
      setObjects((prevObjects) => {
        const updated = prevObjects.map((obj) => {
          // Only update rotation (not position) during intro phase
          updateRotation(obj, deltaTime);

          // Update physics (position + gravity) only during playing phase
          if (gamePhase === 'playing') {
            updatePosition(obj, deltaTime);
            // Check if off screen
            obj.isOffScreen = isOffScreen(obj, dimensions.width, dimensions.height);
          }

          return obj;
        });

        // Remove off-screen objects and penalize missed fruits (only during playing phase)
        if (gamePhase === 'playing') {
          const offScreenObjects = updated.filter((obj) => obj.isOffScreen);
          
          // Check for missed fruits (not sliced and went off screen)
          offScreenObjects.forEach((obj) => {
            if ((obj.type === 'fruit' || obj.type === 'bonus') && !obj.sliced) {
              // Missed a fruit - lose a life
              setLives((prev) => {
                const newLives = prev - 1;
                setLivesShaking(true);
                setTimeout(() => setLivesShaking(false), 600);
                
                if (newLives <= 0) {
                  // Game over
                  setFinalScore(scoreRef.current);
                  setGamePhase('intro');
                  setObjects([]);
                  
                  setTimeout(() => {
                    if (dimensions.width > 0) {
                      const fruits = spawnInitialFruits(dimensions.width, dimensions.height);
                      setObjects(fruits);
                    }
                  }, 100);
                }
                
                return newLives;
              });
            }
          });
          
          return updated.filter((obj) => !obj.isOffScreen);
        }

        return updated;
      });

      // Update particles
      gameStateRef.current.particles = gameStateRef.current.particles
        .map((particle) => {
          particle.vy += particle.gravity * deltaTime;
          particle.x += particle.vx * deltaTime;
          particle.y += particle.vy * deltaTime;
          particle.alpha -= 0.02 * deltaTime;
          particle.life -= 0.02 * deltaTime;
          return particle;
        })
        .filter((p) => p.life > 0);

      const activeObjects = objectsRef.current;

      // Check collisions with current slash
      if (gameStateRef.current.currentSlash.length > 1) {
        const collisions = findSlashCollisions(gameStateRef.current.currentSlash, activeObjects);

        if (collisions.length > 0) {
          // Handle side effects (scoring, particles, navigation) OUTSIDE the state updater
          collisions.forEach(hit => {
             // Only process if not already sliced (though activeObjects should filter them, double check)
             if (!hit.sliced) {
                handleObjectSlicedRef.current(hit);
             }
          });

          // Update state to mark objects as sliced
          setObjects((prev) =>
            prev.map((obj) => {
              const hit = collisions.find((c) => c.id === obj.id);
              if (hit) {
                return { ...obj, sliced: true };
              }
              return obj;
            })
          );
        }
      }

      // Update slashes (fade out)
      gameStateRef.current.slashes = gameStateRef.current.slashes.filter((slash) => {
        const age = now - slash.startTime;
        return age < GAME_CONFIG.slashTrailMaxAge;
      });

      // Spawn new objects (only during playing phase)
      if (
        gamePhase === 'playing' &&
        now - gameStateRef.current.lastSpawnTime > gameStateRef.current.spawnInterval &&
        activeObjects.length < GAME_CONFIG.maxObjectsOnScreen
      ) {
        const newObject = spawnRandomObject(dimensions.width, dimensions.height);
        setObjects((prev) => [...prev, newObject]);
        gameStateRef.current.lastSpawnTime = now;
        gameStateRef.current.spawnInterval = calculateSpawnInterval();
      }

      // Render canvas
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();

        // Render saved slash trails
        canvasRef.current.renderSlashes(gameStateRef.current.slashes);

        // Render current active slash (the one being drawn right now)
        if (gameStateRef.current.isSlashing && gameStateRef.current.currentSlash.length > 1) {
          canvasRef.current.renderSlashes([{
            points: gameStateRef.current.currentSlash,
            startTime: now,
            fadeOutTime: GAME_CONFIG.slashTrailFadeTime,
          }]);
        }

        canvasRef.current.renderParticles(gameStateRef.current.particles);
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [dimensions.width, dimensions.height, gamePhase]);

  // Handle object sliced
  const handleObjectSliced = (object: GameObject) => {
    // Create particle effect for visual feedback
    const particles = createParticleExplosion(object);
    gameStateRef.current.particles.push(...particles);

    if (object.type === 'bomb') {
      // Hit a bomb - create explosion and lose a life
      const explosionId = `explosion-${Date.now()}`;
      setExplosions((prev) => [...prev, {
        id: explosionId,
        position: { x: object.position.x, y: object.position.y, z: object.position.z },
      }]);
      
      setLives((prev) => {
        const newLives = prev - 1;
        if (newLives <= 0) {
          // Game over - save final score and return to intro
          setFinalScore(scoreRef.current);
          setGamePhase('intro');
          setObjects([]);

          // Respawn intro objects after a brief delay
          setTimeout(() => {
            if (dimensions.width > 0) {
              const fruits = spawnInitialFruits(dimensions.width, dimensions.height);
              setObjects(fruits);
            }
          }, 100);
        }
        return newLives;
      });
    } else if (object.type === 'fruit' && gamePhase === 'intro') {
      // Start a new game
      setGamePhase('playing');
      setScore(0);
      setLives(GAME_CONFIG.maxLives);
      setFinalScore(0); // Clear previous final score
      setObjects([]);
      gameStateRef.current.lastSpawnTime = Date.now();
    } else if (object.type === 'fruit' && gamePhase === 'playing') {
      // Add points
      setScore((prev) => prev + object.points);
    } else if (object.type === 'bonus' && gamePhase === 'playing') {
      // Bonus item - extra points
      setScore((prev) => prev + object.points);
    }
  };
  handleObjectSlicedRef.current = handleObjectSliced;

  // Mouse/touch slash handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    gameStateRef.current.isSlashing = true;
    gameStateRef.current.currentSlash = [
      {
        x: e.clientX,
        y: e.clientY,
        timestamp: Date.now(),
      },
    ];
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!gameStateRef.current.isSlashing) return;

    gameStateRef.current.currentSlash.push({
      x: e.clientX,
      y: e.clientY,
      timestamp: Date.now(),
    });

    // Keep only recent points (prevent memory leak)
    if (gameStateRef.current.currentSlash.length > 50) {
      gameStateRef.current.currentSlash.shift();
    }
  };

  const handlePointerUp = () => {
    if (gameStateRef.current.isSlashing && gameStateRef.current.currentSlash.length > 1) {
      // Add slash to trails for visual effect
      gameStateRef.current.slashes.push({
        points: [...gameStateRef.current.currentSlash],
        startTime: Date.now(),
        fadeOutTime: GAME_CONFIG.slashTrailFadeTime,
      });
      
      // Check if slash intersects with any menu items (only in intro phase)
      if (gamePhase === 'intro') {
        checkMenuSlash(gameStateRef.current.currentSlash);
      }
    }

    gameStateRef.current.isSlashing = false;
    gameStateRef.current.currentSlash = [];
  };
  
  // Check if slash intersects with menu items
  const checkMenuSlash = (slashPoints: SlashPoint[]) => {
    // Get menu item elements and check for intersection
    const menuButtons = document.querySelectorAll('[data-menu-item]');
    
    menuButtons.forEach((button) => {
      const rect = button.getBoundingClientRect();
      const intersects = slashPoints.some(point => 
        point.x >= rect.left && 
        point.x <= rect.right && 
        point.y >= rect.top && 
        point.y <= rect.bottom
      );
      
      if (intersects) {
        const path = button.getAttribute('data-path');
        if (path) {
          router.push(path);
        }
      }
    });
  };
  
  const handleExplosionComplete = (id: string) => {
    setExplosions((prev) => prev.filter((exp) => exp.id !== id));
  };

  return (
    <>
      {/* Wood background */}
      <WoodBackground isIntro={gamePhase === 'intro'} />

      <div
        className={gameContainerStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Navigation Menu (only in intro phase) */}
        {gamePhase === 'intro' && <NavigationMenu />}
        
        {/* 3D Scene */}
        <GameScene 
          objects={objects.filter(obj => !obj.sliced)} 
          explosions={explosions}
          onExplosionComplete={handleExplosionComplete}
        />

        {/* 2D Canvas Overlay for Slashes */}
        <GameCanvas ref={canvasRef} width={dimensions.width} height={dimensions.height} />

        {/* Score display during game */}
        {gamePhase === 'playing' && (
          <div className={scoreStyle}>
            Score: {score} | <span className={livesStyle} data-shaking={livesShaking}>Lives: {lives}</span>
          </div>
        )}

        {/* Final score display in intro after game over */}
        {gamePhase === 'intro' && finalScore > 0 && !showLeaderboard && (
          <>
            <div className={finalScoreStyle}>
              Final Score: {finalScore}
              {predictedRank && (
                <div className={rankPreviewStyle}>
                  You ranked #{predictedRank}!
                </div>
              )}
            </div>

            {/* Name entry for score submission */}
            <div className={nameEntryStyle}>
              <input
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                className={nameInputStyle}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && playerName.trim()) {
                    handleSubmitScore();
                  }
                }}
              />
              <button
                onClick={handleSubmitScore}
                disabled={!playerName.trim()}
                className={submitButtonStyle}
              >
                Save Score
              </button>
            </div>
          </>
        )}

        {/* Leaderboard display after saving */}
        {showLeaderboard && savedRank && (
          <LeaderboardDisplay
            highlightRank={savedRank}
            onScrollComplete={() => {
              // After scroll animation, can close or keep open
            }}
          />
        )}

        {/* Close leaderboard button */}
        {showLeaderboard && (
          <button
            onClick={() => {
              setShowLeaderboard(false);
              setFinalScore(0);
              setPredictedRank(null);
              setSavedRank(null);
            }}
            className={closeLeaderboardButtonStyle}
          >
            Close
          </button>
        )}
      </div>
    </>
  );

  // Handle score submission
  async function handleSubmitScore() {
    if (!playerName.trim() || finalScore === 0) return;

    try {
      const response = await fetch('/api/game/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: playerName.trim(),
          score: finalScore,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSavedRank(data.rank);
        setShowLeaderboard(true);
        setPlayerName('');
      }
    } catch (error) {
      console.error('Failed to submit score:', error);
    }
  }
}

// Styles
const gameContainerStyle = css({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  touchAction: 'none', // Prevent scrolling on touch
});

const scoreStyle = css({
  position: 'fixed',
  top: '2rem',
  left: '2rem',
  fontSize: '2rem',
  fontWeight: 'bold',
  color: '#fff',
  textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
  zIndex: 50,
});

const livesStyle = css({
  display: 'inline-block',
  transition: 'color 0.1s ease',
  
  '&[data-shaking="true"]': {
    animation: 'shake 0.6s ease-in-out, blink 0.6s ease-in-out',
  },
});

const finalScoreStyle = css({
  position: 'fixed',
  top: '2rem',
  left: '2rem',
  fontSize: '2.5rem',
  fontWeight: 'bold',
  color: '#FFD700', // Gold color for final score
  textShadow: '3px 3px 6px rgba(0, 0, 0, 0.9)',
  zIndex: 50,
});

const rankPreviewStyle = css({
  fontSize: '1.5rem',
  color: '#FFA500',
  marginTop: '0.5rem',
});

const nameEntryStyle = css({
  position: 'fixed',
  top: '2rem',
  right: '2rem',
  display: 'flex',
  gap: '1rem',
  alignItems: 'center',
  zIndex: 50,
});

const nameInputStyle = css({
  fontSize: '1.2rem',
  padding: '0.75rem 1rem',
  backgroundColor: 'rgba(255, 255, 255, 0.9)',
  color: '#333',
  border: '2px solid #FFD700',
  borderRadius: '8px',
  fontWeight: '500',
  outline: 'none',
  width: '200px',
  '&::placeholder': {
    color: '#666',
  },
  '&:focus': {
    backgroundColor: '#fff',
    borderColor: '#FFA500',
  },
});

const submitButtonStyle = css({
  fontSize: '1.2rem',
  padding: '0.75rem 1.5rem',
  backgroundColor: '#FFD700',
  color: '#333',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
  transition: 'all 0.2s',
  '&:hover': {
    backgroundColor: '#FFA500',
    transform: 'scale(1.05)',
  },
  '&:active': {
    transform: 'scale(0.95)',
  },
  '&:disabled': {
    backgroundColor: '#999',
    cursor: 'not-allowed',
    transform: 'none',
  },
});

const closeLeaderboardButtonStyle = css({
  position: 'fixed',
  bottom: '2rem',
  left: '50%',
  transform: 'translateX(-50%)',
  fontSize: '1.2rem',
  padding: '0.75rem 2rem',
  backgroundColor: '#FF3B30',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
  zIndex: 250,
  transition: 'all 0.2s',
  '&:hover': {
    backgroundColor: '#FF6B60',
    transform: 'translateX(-50%) scale(1.05)',
  },
  '&:active': {
    transform: 'translateX(-50%) scale(0.95)',
  },
});
