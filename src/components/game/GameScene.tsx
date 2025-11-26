'use client';

import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import GameObject3D from './GameObject3D';
import ExplosionEffect from './ExplosionEffect';
import type { GameObject } from '@/types/game';
import { Suspense } from 'react';

interface GameSceneProps {
  objects: GameObject[];
  explosions?: Array<{ id: string; position: { x: number; y: number; z: number } }>;
  onExplosionComplete?: (id: string) => void;
}

export default function GameScene({ objects, explosions = [], onExplosionComplete }: GameSceneProps) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
      <Canvas shadows dpr={[1, 2]}>
        <Suspense fallback={null}>
            <GameCamera />
            
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 10]} intensity={1} castShadow />
            <Environment preset="sunset" />

            {objects.map((obj) => (
            <GameObject3D key={obj.id} object={obj} />
            ))}
            
            {explosions.map((explosion) => (
              <ExplosionEffect
                key={explosion.id}
                position={explosion.position}
                onComplete={() => onExplosionComplete?.(explosion.id)}
              />
            ))}
        </Suspense>
      </Canvas>
    </div>
  );
}

function GameCamera() {
  return (
    <OrthographicCamera
      makeDefault
      position={[0, 0, 100]}
      zoom={1}
      near={0.1}
      far={1000}
      onUpdate={c => c.updateProjectionMatrix()}
    >
        {/* We will handle the coordinate mapping in the GameObject3D component or here. 
            The default behavior of OrthographicCamera in R3F/Drei with no args 
            might not automatically set bounds to window size in pixels.
            
            Actually, it's better to let R3F handle the viewport and we just map 
            our pixel coordinates to the camera's view.
            
            If we don't set left/right/top/bottom, it defaults to -1/1.
            
            Let's use a custom resize handler or just use standard R3F units and map 
            our physics pixels to them.
            
            But to keep it simple and robust with the existing physics engine which runs on pixels:
            We should configure the camera to have a view frustum that matches the window dimensions.
        */}
        <ResizeHandler />
    </OrthographicCamera>
  );
}

import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';

function ResizeHandler() {
  const { camera, size } = useThree();
  
  // Compute camera bounds based on size
  const cameraBounds = useMemo(() => ({
    left: 0,
    right: size.width,
    top: 0,
    bottom: -size.height,
  }), [size.width, size.height]);
  
  useEffect(() => {
    if (camera.type === 'OrthographicCamera') {
      const cam = camera as THREE.OrthographicCamera;
      // Configure camera to match DOM coordinates (0,0 at top-left)
      // X: 0 to width
      // Y: 0 to -height (since 3D Y is up, we use negative Y for down)
      Object.assign(cam, cameraBounds);
      cam.updateProjectionMatrix();
    }
  }, [camera, cameraBounds]);
  
  return null;
}
