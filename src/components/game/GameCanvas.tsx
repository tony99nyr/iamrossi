import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { SlashTrail, Particle } from '@/types/game';
import { CANVAS_SETTINGS, PARTICLE_SETTINGS } from '@/lib/game/constants';
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

          ctx.beginPath();
          ctx.moveTo(slash.points[0].x, slash.points[0].y);
          for (let i = 1; i < slash.points.length; i++) {
            ctx.lineTo(slash.points[i].x, slash.points[i].y);
          }
          ctx.stroke();

          // Main slash line
          ctx.strokeStyle = CANVAS_SETTINGS.slashColor.replace('0.8', `${alpha * 0.8}`);
          ctx.lineWidth = CANVAS_SETTINGS.slashLineWidth;
          ctx.shadowBlur = 0;

          ctx.beginPath();
          ctx.moveTo(slash.points[0].x, slash.points[0].y);
          for (let i = 1; i < slash.points.length; i++) {
            ctx.lineTo(slash.points[i].x, slash.points[i].y);
          }
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
