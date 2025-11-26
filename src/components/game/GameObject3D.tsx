import { useTexture, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import type { GameObject } from '@/types/game';

interface GameObject3DProps {
  object: GameObject;
}

const TEXTURE_MAP: Record<string, string> = {
  '🍎': '/assets/game/apple.png',
  '🍊': '/assets/game/orange.png',
  '🍉': '/assets/game/watermelon.png',
  '🍓': '/assets/game/strawberry.png',
  '💣': '/assets/game/bomb.png',
  '🍍': '/assets/game/apple.png', // Fallback to apple for pineapple
  '🏒': '/assets/game/apple.png', // Fallback for hockey stick
  '🌀': '/assets/game/apple.png', // Fallback for canes
  '🎵': '/assets/game/apple.png', // Fallback for rick
};

export default function GameObject3D({ object }: GameObject3DProps) {
  const { position, rotation, scale, emoji, type } = object;

  // Load texture if available
  const textureUrl = TEXTURE_MAP[emoji];
  const isTextured = !!textureUrl;

  return (
    <group
      position={[position.x, -position.y, position.z]} // Flip Y to match DOM coordinates
      rotation={[
        THREE.MathUtils.degToRad(rotation.x),
        THREE.MathUtils.degToRad(rotation.y),
        THREE.MathUtils.degToRad(rotation.z)
      ]}
      scale={scale}
    >
      {isTextured ? (
        <TexturedObject textureUrl={textureUrl} type={type} />
      ) : (
        <EmojiObject emoji={emoji} />
      )}
    </group>
  );
}

function TexturedObject({ textureUrl, type }: { textureUrl: string, type: string }) {
  const texture = useTexture(textureUrl);
  const outlineRef = useRef<THREE.Mesh>(null);
  const [pulsePhase, setPulsePhase] = useState(0);
  
  // Animate bomb outline
  useFrame((state, delta) => {
    if (type === 'bomb' && outlineRef.current) {
      setPulsePhase((prev) => prev + delta * 3);
      const scale = 1 + Math.sin(pulsePhase) * 0.15;
      outlineRef.current.scale.setScalar(scale);
    }
  });
  
  const isBomb = type === 'bomb';
  
  return (
    <>
      {/* Main object */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[45, 32, 32]} />
        <meshStandardMaterial 
          map={texture} 
          roughness={0.4} 
          metalness={isBomb ? 0.8 : 0.1} 
        />
      </mesh>
      
      {/* Threatening red outline for bombs */}
      {isBomb && (
        <>
          {/* Outer glow */}
          <mesh ref={outlineRef}>
            <sphereGeometry args={[52, 32, 32]} />
            <meshBasicMaterial
              color="#FF0000"
              transparent
              opacity={0.4}
              side={THREE.BackSide}
            />
          </mesh>
          
          {/* Inner red rim */}
          <mesh>
            <sphereGeometry args={[48, 32, 32]} />
            <meshBasicMaterial
              color="#FF3333"
              transparent
              opacity={0.6}
              side={THREE.BackSide}
            />
          </mesh>
        </>
      )}
    </>
  );
}

function EmojiObject({ emoji }: { emoji: string }) {
  return (
    <Text
      fontSize={80}
      color="white"
      anchorX="center"
      anchorY="middle"
      outlineWidth={2}
      outlineColor="black"
    >
      {emoji}
    </Text>
  );
}
