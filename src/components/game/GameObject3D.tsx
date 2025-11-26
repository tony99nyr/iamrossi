import type { GameObject } from '@/types/game';
import { calculateShadow } from '@/lib/game/physics';
import { css } from '@styled-system/css';

interface GameObject3DProps {
  object: GameObject;
  onSlice?: (id: string) => void;
}

export default function GameObject3D({ object }: GameObject3DProps) {
  const { position, rotation, scale, emoji, type } = object;

  // Calculate dynamic shadow based on rotation
  const shadow = calculateShadow(rotation);

  // Add gentle hover animation for intro objects (tool icons and static fruits)
  const hoverAnimation = type === 'toolIcon'
    ? { animation: 'gentleHover 3s ease-in-out infinite' }
    : type === 'fruit'
    ? { animation: 'gentleHover 3.5s ease-in-out infinite' }
    : {};

  return (
    <div
      data-object-id={object.id}
      className={objectStyle}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `
          translateZ(${position.z}px)
          rotateX(${rotation.x}deg)
          rotateY(${rotation.y}deg)
          rotateZ(${rotation.z}deg)
          scale(${scale})
        `,
        filter: `drop-shadow(${shadow.shadowX}px ${shadow.shadowY}px ${shadow.blur}px rgba(0, 0, 0, 0.6))`,
        willChange: 'transform', // Optimize for animation
        pointerEvents: 'none', // Don't interfere with mouse events
        ...hoverAnimation,
      }}
    >
      <span className={emojiStyle}>{emoji}</span>
    </div>
  );
}

const objectStyle = css({
  position: 'absolute',
  transformStyle: 'preserve-3d',
  transition: 'none', // No CSS transitions, RAF handles animation
  userSelect: 'none',
  WebkitUserSelect: 'none',
});

const emojiStyle = css({
  fontSize: '100px',
  display: 'block',
  lineHeight: '1',
  textAlign: 'center',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  // Center the emoji relative to its position
  transform: 'translate(-50%, -50%)',
});
