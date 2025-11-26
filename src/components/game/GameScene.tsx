'use client';

import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import GameObject3D from './GameObject3D';
import type { GameObject } from '@/types/game';
import { Suspense } from 'react';

interface GameSceneProps {
  objects: GameObject[];
}

export default function GameScene({ objects }: GameSceneProps) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
      <Canvas shadows dpr={[1, 2]}>
        <Suspense fallback={null}>
            {/* Orthographic camera to match pixel coordinates 1:1. 
                Zoom is 1. Position is centered. 
                We need to configure it to match window size, but R3F's default OrthographicCamera 
                might need manual adjustment or we can just map coordinates.
                
                Actually, the easiest way to keep existing physics (pixels) working is to use 
                an Orthographic camera where the view size matches the window size.
                
                However, R3F's default camera is Perspective. 
                Let's use OrthographicCamera makeDefault and set zoom to 1.
                We need to handle resize to keep coordinate system consistent if we want 1 unit = 1 pixel.
                
                Alternatively, we can just map the pixel coordinates to a normalized -1 to 1 space 
                or a fixed world space.
                
                Let's try to map pixel coordinates to world space.
                If we use OrthographicCamera with zoom=1, 
                left = -width/2, right = width/2, top = height/2, bottom = -height/2.
                
                Our game physics uses (0,0) as top-left (standard DOM).
                So we need to transform:
                x_3d = x_phys - width/2
                y_3d = -(y_phys - height/2)  (flip Y)
            */}
            <GameCamera />
            
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 10]} intensity={1} castShadow />
            <Environment preset="sunset" />

            {objects.map((obj) => (
            <GameObject3D key={obj.id} object={obj} />
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
import { useEffect } from 'react';

function ResizeHandler() {
  const { camera, size } = useThree();
  
  useEffect(() => {
    if (camera.type === 'OrthographicCamera') {
      const cam = camera as THREE.OrthographicCamera;
      // Configure camera to match DOM coordinates (0,0 at top-left)
      // X: 0 to width
      // Y: 0 to -height (since 3D Y is up, we use negative Y for down)
      cam.left = 0;
      cam.right = size.width;
      cam.top = 0;
      cam.bottom = -size.height;
      cam.updateProjectionMatrix();
    }
  }, [camera, size]);
  
  return null;
}
