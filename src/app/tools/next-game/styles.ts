import { css } from '@styled-system/css';

// Container
export const containerStyle = css({
    maxWidth: '800px',
    margin: '0 auto',
    padding: '2rem 2rem 6rem',
    fontFamily: 'var(--font-geist-sans)',
    minHeight: '100vh',
    color: '#fff',
});

// Hero Section
export const heroSectionStyle = css({
    textAlign: 'center',
    marginBottom: '4rem',
    paddingTop: '2rem',
});

export const logoContainerStyle = css({
    maxWidth: '200px',
    margin: '0 auto 2rem',
    animation: 'fadeInDown 0.8s ease-out',
});

export const teamNameStyle = css({
    fontSize: '2.5rem',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #dc2626, #991b1b)',
    backgroundClip: 'text',
    color: 'transparent',
    letterSpacing: '-0.03em',
    marginBottom: '0.5rem',
    animation: 'fadeIn 1s ease-out 0.3s backwards',
    textDecoration: 'none',
    display: 'inline-block',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, opacity 0.2s ease',
    '&:hover': {
        transform: 'translateY(-2px)',
        opacity: 0.8,
    },
});

export const subtitleStyle = css({
    fontSize: '1rem',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    fontWeight: '600',
    marginBottom: '1.5rem',
    animation: 'fadeIn 1s ease-out 0.5s backwards',
});

export const descriptionStyle = css({
    fontSize: '0.95rem',
    color: '#aaa',
    lineHeight: '1.6',
    maxWidth: '600px',
    margin: '0 auto',
    animation: 'fadeIn 1s ease-out 0.7s backwards',
});

// Schedule Section
export const fullScheduleStyle = css({
    marginTop: '4rem',
    paddingTop: '2rem',
    '& h2': {
        fontSize: '1.5rem',
        color: '#fff',
        marginBottom: '1.5rem',
        fontWeight: '600',
        letterSpacing: '-0.02em',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        paddingBottom: '1rem',
    },
});

// Game List Items
export const listItemStyle = css({
    display: 'flex',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: { base: '0.5rem 0.75rem', sm: '0.75rem 1rem' },
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    gap: { base: '0.5rem', sm: '1rem' },
    minWidth: 0, // Allow flex items to shrink below their content size
    overflow: 'hidden',
    '&:hover': {
        background: 'rgba(255, 255, 255, 0.05)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
});

export const listItemActiveStyle = css({
    background: 'rgba(220, 38, 38, 0.15)',
    borderLeft: '3px solid #991b1b',
    borderBottom: 'none',
    borderBottomLeftRadius: '0',
    borderBottomRightRadius: '0',
    paddingLeft: 'calc(1rem - 3px)',
    '&:hover': {
        background: 'rgba(220, 38, 38, 0.2)',
    },
});

export const dateStyle = css({
    color: '#888',
    fontFamily: 'var(--font-geist-mono)',
    fontSize: { base: '0.8rem', sm: '0.9rem' },
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: '1.2',
    flexShrink: 0,
});

export const opponentStyle = css({
    color: '#eee',
    flex: 1,
    padding: { base: '0', sm: '0 1rem' },
    fontWeight: '500',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: { base: '0.25rem', sm: '0.5rem' },
    fontSize: { base: '0.85rem', sm: '1rem' },
    minWidth: 0,
    overflow: 'hidden',
    '& > span:first-child': {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
});

export const timeStyle = css({
    color: '#888',
    fontFamily: 'var(--font-geist-mono)',
    fontSize: { base: '0.8rem', sm: '0.9rem' },
    whiteSpace: 'nowrap',
    flexShrink: 0,
    textAlign: 'right',
});

// Badges
export const homeBadgeSmallStyle = css({
    display: 'inline-block',
    background: 'linear-gradient(135deg, #dc2626, #991b1b)',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: '700',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    letterSpacing: '0.5px',
});

export const localBadgeSmallStyle = css({
    display: 'inline-block',
    background: 'rgba(74, 222, 128, 0.2)',
    color: '#4ade80',
    fontSize: '0.65rem',
    fontWeight: '700',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    letterSpacing: '0.5px',
    border: '1px solid rgba(74, 222, 128, 0.3)',
});

export const badgesContainerStyle = css({
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
});

export const placeholderBadgeStyle = css({
    display: 'inline-block',
    background: 'rgba(156, 163, 175, 0.2)',
    color: '#9ca3af',
    fontSize: '0.65rem',
    fontWeight: '700',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    letterSpacing: '0.5px',
    border: '1px solid rgba(156, 163, 175, 0.3)',
});

export const listItemPlaceholderStyle = css({
    background: 'rgba(60, 20, 20, 0.6)',
    borderColor: 'rgba(255, 100, 100, 0.15)',
    cursor: 'default',
    '&:hover': {
        background: 'rgba(60, 20, 20, 0.7)',
        borderColor: 'rgba(255, 100, 100, 0.25)',
    },
});
