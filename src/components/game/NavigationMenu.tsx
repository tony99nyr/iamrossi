'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { css } from '@styled-system/css';

interface NavigationMenuItem {
  label: string;
  path: string;
}

const MENU_ITEMS: NavigationMenuItem[] = [
  { label: 'Jr Canes Schedule', path: '/tools/next-game' },
  { label: 'Game Stats', path: '/tools/stat-recording' },
  { label: 'Rehab', path: '/tools/knee-rehab' },
];

interface NavigationMenuProps {
  onNavigate?: (path: string) => void;
}

export default function NavigationMenu({ onNavigate }: NavigationMenuProps) {
  const router = useRouter();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleClick = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      router.push(path);
    }
  };

  return (
    <nav className={navContainerStyle}>
      {MENU_ITEMS.map((item, index) => (
        <button
          key={item.path}
          className={menuItemStyle}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          onClick={() => handleClick(item.path)}
          data-hovered={hoveredIndex === index}
          data-menu-item="true"
          data-path={item.path}
        >
          <span className={textWrapperStyle} data-hovered={hoveredIndex === index}>
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  );
}

const navContainerStyle = css({
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  display: 'flex',
  flexDirection: 'column',
  gap: { base: '1rem', md: '1.5rem' },
  zIndex: 10,
  pointerEvents: 'auto',
  // Move up slightly on mobile to avoid fruit overlap
  marginTop: { base: '-4rem', md: '0' },
});

const menuItemStyle = css({
  fontSize: { base: '1.75rem', md: '2.5rem' },
  fontWeight: '300',
  color: 'rgba(255, 255, 255, 0.95)',
  textShadow: '0 2px 8px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 255, 255, 0.2)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: { base: '0.5rem 1rem', md: '0.75rem 1.5rem' },
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  position: 'relative',
  letterSpacing: '0.02em',
  textAlign: 'center',

  '&[data-hovered="true"]': {
    color: '#58a6ff',
    textShadow: '0 2px 12px rgba(88, 166, 255, 0.6), 0 0 40px rgba(88, 166, 255, 0.4)',
    transform: 'scale(1.05) translateY(-2px)',
  },

  '&:active': {
    transform: 'scale(1.02) translateY(-1px)',
  },
});

const textWrapperStyle = css({
  display: 'inline-block',
  position: 'relative',
  
  '&::after': {
    content: '""',
    position: 'absolute',
    bottom: '-4px',
    left: 0,
    right: 0,
    height: '1px',
    background: '#58a6ff',
    transform: 'scaleX(0)',
    transition: 'transform 0.3s ease',
  },
  
  '&[data-hovered="true"]::after': {
    transform: 'scaleX(1)',
  },
});
