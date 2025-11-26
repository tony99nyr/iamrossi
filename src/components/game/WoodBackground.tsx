import { css } from '@styled-system/css';

export default function WoodBackground() {
  return (
    <div className={backgroundStyle}>
      <div className={slashMark1} />
      <div className={slashMark2} />
      <div className={slashMark3} />
    </div>
  );
}

const backgroundStyle = css({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  background: 'linear-gradient(135deg, #8B4513 0%, #A0522D 25%, #8B4513 50%, #654321 75%, #8B4513 100%)',
  backgroundSize: '200% 200%',
  zIndex: -1,
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: `
      repeating-linear-gradient(
        90deg,
        transparent,
        transparent 50px,
        rgba(139, 69, 19, 0.3) 50px,
        rgba(139, 69, 19, 0.3) 52px
      ),
      repeating-linear-gradient(
        0deg,
        transparent,
        transparent 200px,
        rgba(101, 67, 33, 0.2) 200px,
        rgba(101, 67, 33, 0.2) 202px
      )
    `,
    opacity: 0.5,
  },
});

// Slash damage marks on the wood
const slashMark1 = css({
  position: 'absolute',
  top: '20%',
  left: '15%',
  width: '200px',
  height: '4px',
  background: 'rgba(0, 0, 0, 0.3)',
  transform: 'rotate(-35deg)',
  boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '-1px',
    left: 0,
    width: '100%',
    height: '6px',
    background: 'linear-gradient(90deg, transparent, rgba(139, 69, 19, 0.8), transparent)',
  },
});

const slashMark2 = css({
  position: 'absolute',
  top: '60%',
  right: '20%',
  width: '250px',
  height: '5px',
  background: 'rgba(0, 0, 0, 0.3)',
  transform: 'rotate(25deg)',
  boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '-1px',
    left: 0,
    width: '100%',
    height: '7px',
    background: 'linear-gradient(90deg, transparent, rgba(139, 69, 19, 0.7), transparent)',
  },
});

const slashMark3 = css({
  position: 'absolute',
  bottom: '30%',
  left: '50%',
  width: '180px',
  height: '4px',
  background: 'rgba(0, 0, 0, 0.3)',
  transform: 'translateX(-50%) rotate(-15deg)',
  boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: '-1px',
    left: 0,
    width: '100%',
    height: '6px',
    background: 'linear-gradient(90deg, transparent, rgba(139, 69, 19, 0.8), transparent)',
  },
});
