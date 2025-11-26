import { css } from '@styled-system/css';

export default function WoodBackground() {
  return (
    <div className={backgroundStyle}>
      <div className={overlayStyle} />
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
});

const overlayStyle = css({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: 'radial-gradient(circle at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 100%)',
  pointerEvents: 'none',
});

