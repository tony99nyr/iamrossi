import { css } from '@styled-system/css';

interface WoodBackgroundProps {
  isIntro?: boolean;
}

export default function WoodBackground({ isIntro = false }: WoodBackgroundProps) {
  return (
    <div className={backgroundStyle} data-intro={isIntro}>
      <div className={overlayStyle} data-intro={isIntro} />
    </div>
  );
}

const backgroundStyle = css({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  backgroundImage: 'url(/assets/game/wood-bg.png)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  zIndex: -1,
  transition: 'filter 0.5s ease, opacity 0.5s ease',
  
  '&[data-intro="true"]': {
    filter: 'blur(8px)',
    opacity: 0.4,
  },
  
  '&[data-intro="false"]': {
    filter: 'blur(0px)',
    opacity: 1,
  },
});

const overlayStyle = css({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: 'radial-gradient(circle at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)',
  pointerEvents: 'none',
  transition: 'background 0.5s ease',
  
  '&[data-intro="true"]': {
    background: 'radial-gradient(circle at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 100%)',
  },
});
