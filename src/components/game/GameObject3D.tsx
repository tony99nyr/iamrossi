import { useTexture, Text } from '@react-three/drei';
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
};

export default function GameObject3D({ object }: GameObject3DProps) {
  const { position, rotation, scale, emoji, type } = object;

  // Load texture if available
  const textureUrl = TEXTURE_MAP[emoji];
  // We can't conditionally call hooks, so we need a strategy.
  // We can use a separate component for TexturedObject vs TextObject, 
  // or just useTexture inside a sub-component.
  // Let's split it.
  
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
  
  // Geometry based on type?
  // Fruits -> Sphere
  // Bomb -> Sphere
  // Banana -> Cylinder (if we had it)
  
  return (
    <mesh castShadow receiveShadow>
      <sphereGeometry args={[45, 32, 32]} />
      <meshStandardMaterial 
        map={texture} 
        roughness={0.4} 
        metalness={type === 'bomb' ? 0.8 : 0.1} 
      />
    </mesh>
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

