import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { SlashTrail, Particle } from '@/types/game';
import { CANVAS_SETTINGS } from '@/lib/game/constants';
import { css } from '@styled-system/css';

export interface GameCanvasHandle {
  clearCanvas: () => void;
  renderSlashes: (slashes: SlashTrail[]) => void;
  renderParticles: (particles: Particle[]) => void;
}

interface GameCanvasProps {
  width: number;
  height: number;
}

const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(
  ({ width, height }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Expose canvas methods to parent via ref
    useImperativeHandle(ref, () => ({
      clearCanvas: () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      },

      renderSlashes: (slashes: SlashTrail[]) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const now = Date.now();

        slashes.forEach((slash) => {
          if (slash.points.length < 2) return;

          // Calculate fade based on age
          const age = now - slash.startTime;
          const fadeProgress = Math.min(age / slash.fadeOutTime, 1);
          const alpha = 1 - fadeProgress;

          if (alpha <= 0) return;

          // Draw slash trail with glow effect
          ctx.save();

          // Glow layer
          ctx.strokeStyle = CANVAS_SETTINGS.slashGlowColor.replace('0.6', `${alpha * 0.6}`);
          ctx.lineWidth = CANVAS_SETTINGS.slashLineWidth + 10;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowBlur = CANVAS_SETTINGS.slashGlowBlur;
          ctx.shadowColor = CANVAS_SETTINGS.slashGlowColor;

          drawJaggedLine(ctx, slash.points);
          ctx.stroke();

          // Main slash line
          ctx.strokeStyle = CANVAS_SETTINGS.slashColor.replace('0.8', `${alpha * 0.8}`);
          ctx.lineWidth = CANVAS_SETTINGS.slashLineWidth;
          ctx.shadowBlur = 0;

          drawJaggedLine(ctx, slash.points);
          ctx.stroke();

          ctx.restore();
        });
      },

      renderParticles: (particles: Particle[]) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        particles.forEach((particle) => {
          if (particle.alpha <= 0) return;

          ctx.save();
          ctx.globalAlpha = particle.alpha;
          ctx.fillStyle = particle.color;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      },
    }));

    // Set canvas size on mount and window resize
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = width;
      canvas.height = height;
    }, [width, height]);

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={canvasStyle}
      />
    );
  }
);

GameCanvas.displayName = 'GameCanvas';

export default GameCanvas;

const canvasStyle = css({
  position: 'absolute',
  top: 0,
  left: 0,
  pointerEvents: 'none', // Allow events to pass through to objects below
  zIndex: 10, // Above 3D objects
});

// Helper to draw a jagged line between points
function drawJaggedLine(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    
    // Distance between points
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // If points are far enough, add a jagged intermediate point
    if (dist > 10) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      
      // Perpendicular offset
      const perpX = -dy / dist;
      const perpY = dx / dist;
      
      // Random offset amount (jaggedness)
      const offset = (Math.random() - 0.5) * 10;
      
      ctx.lineTo(midX + perpX * offset, midY + perpY * offset);
    }
    
    ctx.lineTo(p2.x, p2.y);
  }
}
