'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useAnimation } from 'framer-motion';
import styles from './AnimatedLogo.module.css';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  initialX: number;
  initialY: number;
}

export default function AnimatedLogo() {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();

  // Generate particles on mount
  useEffect(() => {
    const particleCount = 40;
    const newParticles: Particle[] = [];
    
    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 2,
        delay: Math.random() * 2,
        initialX: Math.random() * 100,
        initialY: Math.random() * 100,
      });
    }
    
    setParticles(newParticles);
  }, []);

  // Track mouse position for hover effects
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    
    setMousePosition({ x, y });
  };

  // SVG path data for ROSSI text with graffiti spray paint style
  const pathData = {
    // R - angular graffiti style with diagonal leg
    R: "M15,15 L15,85 M15,15 L55,15 Q68,15 68,32 Q68,45 55,48 L15,48 M50,48 L75,85",
    // O - bold rounded with slight tilt
    O: "M95,20 Q95,12 110,12 Q125,12 130,20 L132,70 Q132,85 117,85 Q102,85 97,70 Z",
    // S - proper graffiti S (not backwards!)
    S: "M165,20 Q165,12 180,12 Q195,12 198,22 Q198,35 185,42 Q172,48 172,58 Q172,70 185,75 Q198,80 198,75",
    // S2 - second S with slight variation
    S2: "M220,20 Q220,12 235,12 Q250,12 253,22 Q253,35 240,42 Q227,48 227,58 Q227,70 240,75 Q253,80 253,75",
    // I - bold vertical with serifs
    I: "M275,15 L275,85 M265,15 L285,15 M265,85 L285,85",
  };

  const drips = [
    { x: 25, y: 85, height: 18, delay: 1.5 },
    { x: 45, y: 85, height: 12, delay: 1.7 },
    { x: 115, y: 85, height: 22, delay: 1.9 },
    { x: 180, y: 85, height: 16, delay: 2.1 },
    { x: 235, y: 85, height: 20, delay: 2.3 },
    { x: 275, y: 85, height: 25, delay: 1.8 },
  ];

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Particles */}
      <div className={styles.particlesContainer}>
        {particles.map((particle) => {
          const dx = mousePosition.x * 50 - (particle.x - 50);
          const dy = mousePosition.y * 50 - (particle.y - 50);
          const distance = Math.sqrt(dx * dx + dy * dy);
          const force = isHovered ? Math.max(0, 20 - distance) / 20 : 0;
          
          const offsetX = force * -dx * 0.5;
          const offsetY = force * -dy * 0.5;

          return (
            <motion.div
              key={particle.id}
              className={styles.particle}
              initial={{ 
                opacity: 0, 
                scale: 0,
                left: `${particle.initialX}%`,
                top: `${particle.initialY}%`,
              }}
              animate={{
                opacity: [0, 1, 1],
                scale: [0, 1.2, 1],
                left: `${particle.x + offsetX}%`,
                top: `${particle.y + offsetY}%`,
              }}
              transition={{
                opacity: { delay: particle.delay, duration: 0.3 },
                scale: { delay: particle.delay, duration: 0.4 },
                left: { type: 'spring', stiffness: 150, damping: 15 },
                top: { type: 'spring', stiffness: 150, damping: 15 },
              }}
              style={{
                width: particle.size,
                height: particle.size,
              }}
            />
          );
        })}
      </div>

      {/* Logo SVG */}
      <motion.div
        className={styles.logoWrapper}
        style={{
          transform: isHovered
            ? `perspective(1000px) rotateX(${-mousePosition.y * 5}deg) rotateY(${mousePosition.x * 5}deg)`
            : 'perspective(1000px) rotateX(0deg) rotateY(0deg)',
        }}
        transition={{ type: 'spring', stiffness: 100, damping: 15 }}
      >
        {/* Shimmer overlay */}
        {isHovered && (
          <motion.div
            className={styles.shimmer}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}

        <svg
          viewBox="0 0 300 110"
          className={styles.logo}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Main letter paths */}
          {Object.entries(pathData).map(([letter, path], index) => (
            <motion.path
              key={letter}
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                pathLength: { delay: index * 0.3, duration: 0.8, ease: 'easeInOut' },
                opacity: { delay: index * 0.3, duration: 0.2 },
              }}
            />
          ))}

          {/* Drip effects */}
          {drips.map((drip, index) => (
            <motion.line
              key={`drip-${index}`}
              x1={drip.x}
              y1={drip.y}
              x2={drip.x}
              y2={drip.y + drip.height}
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                delay: drip.delay,
                duration: 0.5,
                ease: 'easeOut',
              }}
            />
          ))}
        </svg>
      </motion.div>
    </div>
  );
}
