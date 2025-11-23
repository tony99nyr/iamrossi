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

export function ThunderstormBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const mouseRef = useRef({ x: 0.5, y: 0.5 });
    const rainDropsRef = useRef<RainDrop[]>([]);
    const [showLightning, setShowLightning] = useState(false);
    const animationFrameRef = useRef<number | undefined>(undefined);

    // Initialize rain drops
    useEffect(() => {
        const dropCount = window.innerWidth < 768 ? 50 : 100; // Fewer drops on mobile
        const drops: RainDrop[] = [];
        
        for (let i = 0; i < dropCount; i++) {
            drops.push({
                x: Math.random(),
                y: Math.random(),
                z: Math.random(),
                speed: 0.01 + Math.random() * 0.01,
                length: 20 + Math.random() * 30,
            });
        }
        
        rainDropsRef.current = drops;
    }, []);

    // Mouse movement handler (throttled)
    useEffect(() => {
        let lastUpdate = 0;
        const throttleMs = 100;

        const handleMouseMove = (e: MouseEvent) => {
            const now = Date.now();
            if (now - lastUpdate < throttleMs) return;
            lastUpdate = now;

            mouseRef.current = {
                x: e.clientX / window.innerWidth,
                y: e.clientY / window.innerHeight,
            };
        };

        // Only add mouse listener on non-mobile devices
        if (window.innerWidth >= 768) {
            window.addEventListener('mousemove', handleMouseMove);
            return () => window.removeEventListener('mousemove', handleMouseMove);
        }
    }, []);

    // Rain animation
    useEffect(() => {
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
            const mouse = mouseRef.current;

            // Calculate tilt based on mouse position
            const tiltX = (mouse.x - 0.5) * 30; // Max 15px tilt
            const tiltY = (mouse.y - 0.5) * 20; // Max 10px tilt

            drops.forEach((drop) => {
                // Update position
                drop.y += drop.speed;
                if (drop.y > 1) {
                    drop.y = -0.1;
                    drop.x = Math.random();
                }

                // 3D perspective effect
                const scale = 0.3 + drop.z * 0.5;
                const opacity = 0.05 + drop.z * 0.2;

                // Apply mouse tilt
                const x = (drop.x * canvas.width) + (tiltX * drop.z);
                const y = (drop.y * canvas.height) + (tiltY * drop.z);

                // Draw rain drop
                ctx.strokeStyle = `rgba(200, 220, 255, ${opacity})`;
                ctx.lineWidth = 1 * scale;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + drop.length * scale);
                ctx.stroke();
            });

            animationFrameRef.current = requestAnimationFrame(animate);
        };

        // Check for reduced motion preference
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!prefersReducedMotion) {
            animate();
        }

        return () => {
            window.removeEventListener('resize', resize);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    // Lightning effect
    useEffect(() => {
        const triggerLightning = () => {
            setShowLightning(true);
            setTimeout(() => setShowLightning(false), 200);

            // Schedule next lightning
            const nextFlash = 8000 + Math.random() * 7000; // 8-15 seconds
            setTimeout(triggerLightning, nextFlash);
        };

        // Initial delay
        const initialDelay = 5000 + Math.random() * 5000;
        const timeout = setTimeout(triggerLightning, initialDelay);

        return () => clearTimeout(timeout);
    }, []);

    return (
        <div className={css({
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            zIndex: -1,
            pointerEvents: 'none',
        })}>
            {/* Lightning flash */}
            <div className={css({
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'radial-gradient(ellipse at 50% 30%, rgba(255, 255, 255, 0.2) 0%, transparent 50%)',
                opacity: showLightning ? 1 : 0,
                transition: 'opacity 0.1s ease-out',
                zIndex: 1,
            })} />

            {/* Cloud layers */}
            <div className={css({
                position: 'absolute',
                top: '-10%',
                left: '-10%',
                width: '120%',
                height: '60%',
                background: 'radial-gradient(ellipse at 30% 40%, rgba(40, 45, 55, 0.9) 0%, transparent 70%)',
                filter: 'blur(60px)',
                animation: 'cloudDrift1 40s ease-in-out infinite',
                zIndex: 3,
            })} />

            <div className={css({
                position: 'absolute',
                top: '-5%',
                right: '-10%',
                width: '120%',
                height: '50%',
                background: 'radial-gradient(ellipse at 70% 30%, rgba(35, 40, 50, 0.5) 0%, transparent 70%)',
                filter: 'blur(80px)',
                animation: 'cloudDrift2 50s ease-in-out infinite',
                zIndex: 2,
            })} />

            <div className={css({
                position: 'absolute',
                top: '5%',
                left: '10%',
                width: '100%',
                height: '55%',
                background: 'radial-gradient(ellipse at 40% 50%, rgba(45, 50, 60, 0.4) 0%, transparent 65%)',
                filter: 'blur(70px)',
                animation: 'cloudDrift3 45s ease-in-out infinite',
                zIndex: 2,
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
                    zIndex: 4,
                })}
            />

            {/* Keyframe animations */}
            <style>{`
                @keyframes cloudDrift1 {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    50% { transform: translate(-5%, 3%) scale(1.05); }
                }

                @keyframes cloudDrift2 {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    50% { transform: translate(5%, -2%) scale(1.08); }
                }

                @keyframes cloudDrift3 {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    50% { transform: translate(-3%, 4%) scale(1.06); }
                }

                @media (prefers-reduced-motion: reduce) {
                    * {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                    }
                }
            `}</style>
        </div>
    );
}
