'use client';

import React from 'react';
import NextImage from 'next/image';

export const AnimatedLogo = () => {
  return (
    <div style={{ width: '100%', maxWidth: '500px', margin: '0 auto', position: 'relative' }}>
      <style>{`
        @keyframes windAnimation {
          0% {
            --seed: 0;
          }
          100% {
            --seed: 100;
          }
        }
        
        .wind-turbulence {
          animation: windAnimation 8s linear infinite;
        }
      `}</style>
      
      {/* Container for the layered images */}
      <div style={{ position: 'relative', width: '100%', paddingBottom: '100%' }}>
        
        {/* Layer 1: Animated Flags (Bottom) */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          <svg
            viewBox="0 0 500 500"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
          >
            <defs>
              <filter id="windFilterFlags" x="-50%" y="-50%" width="200%" height="200%">
                 {/* Realistic flag wave motion */}
                 <feTurbulence
                    className="wind-turbulence"
                    type="turbulence"
                    baseFrequency="0.008 0.001"
                    numOctaves="3"
                    seed="0"
                    result="noise"
                  >
                    <animate
                      attributeName="seed"
                      from="0"
                      to="200"
                      dur="30s"
                      repeatCount="indefinite"
                    />
                  </feTurbulence>
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="noise"
                    scale="5" 
                    xChannelSelector="R"
                    yChannelSelector="G"
                  />
              </filter>
            </defs>

            <image
              href="/assets/logo-flags.png"
              width="500"
              height="500"
              filter="url(#windFilterFlags)"
            />
          </svg>
        </div>

        {/* Layer 2: Static Stick (Top) */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
           <NextImage 
             src="/assets/logo-stick.png" 
             alt="Logo Stick" 
             fill
             sizes="(max-width: 768px) 240px, (max-width: 1200px) 360px, 500px"
             style={{ objectFit: 'contain' }} 
           />
        </div>

      </div>
    </div>
  );
};
