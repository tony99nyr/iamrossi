'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ExplosionEffectProps {
  position: { x: number; y: number; z: number };
  onComplete: () => void;
}

export default function ExplosionEffect({ position, onComplete }: ExplosionEffectProps) {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const startTime = useRef<number>(0);
  const duration = 1000; // 1 second explosion
  const [flashOpacity, setFlashOpacity] = useState(1);

  useEffect(() => {
    // Initialize start time when component mounts
    startTime.current = Date.now();
    
    // Create explosion particles
    const particleCount = 50;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      
      // Random direction
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 5 + Math.random() * 10;
      
      velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i3 + 2] = Math.cos(phi) * speed;
      
      // Start at explosion center
      positions[i3] = 0;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = 0;
      
      // Red/orange/yellow colors for fire
      const colorChoice = Math.random();
      if (colorChoice < 0.33) {
        colors[i3] = 1; colors[i3 + 1] = 0; colors[i3 + 2] = 0; // Red
      } else if (colorChoice < 0.66) {
        colors[i3] = 1; colors[i3 + 1] = 0.5; colors[i3 + 2] = 0; // Orange
      } else {
        colors[i3] = 1; colors[i3 + 1] = 1; colors[i3 + 2] = 0; // Yellow
      }
    }

    if (particlesRef.current) {
      const geometry = particlesRef.current.geometry;
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
  }, []);

  useFrame(() => {
    if (!particlesRef.current || startTime.current === 0) return;

    const elapsed = Date.now() - startTime.current;
    const progress = elapsed / duration;

    if (progress >= 1) {
      onComplete();
      return;
    }

    const geometry = particlesRef.current.geometry;
    const positions = geometry.attributes.position.array as Float32Array;
    const velocities = geometry.attributes.velocity.array as Float32Array;

    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += velocities[i] * 0.5;
      positions[i + 1] += velocities[i + 1] * 0.5;
      positions[i + 2] += velocities[i + 2] * 0.5;
      
      // Apply gravity
      velocities[i + 1] -= 0.2;
    }

    geometry.attributes.position.needsUpdate = true;

    // Fade out
    if (particlesRef.current.material) {
      (particlesRef.current.material as THREE.PointsMaterial).opacity = 1 - progress;
    }
    
    // Update flash opacity
    setFlashOpacity(Math.max(0, 1 - elapsed / 300));
  });

  return (
    <group ref={groupRef} position={[position.x, -position.y, position.z]}>
      <points ref={particlesRef}>
        <bufferGeometry />
        <pointsMaterial
          size={8}
          vertexColors
          transparent
          opacity={1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      
      {/* Flash effect */}
      <mesh>
        <sphereGeometry args={[60, 16, 16]} />
        <meshBasicMaterial
          color="#FF6600"
          transparent
          opacity={flashOpacity}
        />
      </mesh>
    </group>
  );
}
