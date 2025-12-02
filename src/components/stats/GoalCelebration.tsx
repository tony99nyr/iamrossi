'use client';

import { useEffect, useRef, useState } from 'react';
import { css } from '@styled-system/css';

interface RainDrop {
    x: number;
    y: number;
    z: number;
    speed: number;
    length: number;
}

interface GoalCelebrationProps {
    active: boolean;
    onComplete?: () => void;
}

export default function GoalCelebration({ active, onComplete }: GoalCelebrationProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rainDropsRef = useRef<RainDrop[]>([]);
    const [showLightning, setShowLightning] = useState(false);
    const animationFrameRef = useRef<number | undefined>(undefined);

    // Handle active state changes
    useEffect(() => {
        if (active) {
            // Trigger lightning sequence
            const flash = () => {
                setShowLightning(true);
                setTimeout(() => setShowLightning(false), 150);
            };

            // Multiple flashes for celebration - wrapped in timeouts to avoid synchronous state updates
            setTimeout(() => flash(), 0);
            setTimeout(flash, 300);
            setTimeout(flash, 1200);
            setTimeout(flash, 1400);

            // Auto-hide after 3 seconds
            const timer = setTimeout(() => {
                if (onComplete) onComplete();
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [active, onComplete]);

    // Initialize rain drops
    useEffect(() => {
        const dropCount = window.innerWidth < 768 ? 20 : 40; // Even fewer drops
        const drops: RainDrop[] = [];
        
        for (let i = 0; i < dropCount; i++) {
            drops.push({
                x: Math.random(),
                y: Math.random(),
                z: Math.random(),
                speed: 0.01 + Math.random() * 0.01, // Even slower
                length: 10 + Math.random() * 15, // Shorter
            });
        }
        
        rainDropsRef.current = drops;
    }, []);

    // Rain animation
    useEffect(() => {
        if (!active) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const drops = rainDropsRef.current;

            drops.forEach((drop) => {
                // Update position
                drop.y += drop.speed;
                if (drop.y > 1) {
                    drop.y = -0.1;
                    drop.x = Math.random();
                }

                // 3D perspective effect
                const scale = 0.3 + drop.z * 0.5;
                const opacity = 0.03 + drop.z * 0.15; // Very subtle

                const x = drop.x * canvas.width;
                const y = drop.y * canvas.height;

                // Draw rain drop
                ctx.strokeStyle = `rgba(200, 220, 255, ${opacity})`;
                ctx.lineWidth = 1.5 * scale; // Slightly thinner
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + drop.length * scale);
                ctx.stroke();
            });

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', resize);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [active]);

    if (!active) return null;

    return (
        <div className={css({
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            zIndex: 9000, // High z-index but below modals if possible, or above everything
            pointerEvents: 'none',
            background: 'rgba(0, 0, 0, 0.3)', // Darken background slightly
            transition: 'opacity 0.5s ease-in-out',
            opacity: 1,
        })}>
            {/* Lightning flash */}
            <div className={css({
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(255, 255, 255, 0.3)', // White flash
                opacity: showLightning ? 1 : 0,
                transition: 'opacity 0.05s ease-out',
                zIndex: 1,
            })} />

            {/* Rain canvas */}
            <canvas
                ref={canvasRef}
                className={css({
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 2,
                })}
            />
        </div>
    );
}
