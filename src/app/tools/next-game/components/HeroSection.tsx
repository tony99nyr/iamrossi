import { AnimatedLogo } from '@/components/AnimatedLogo';
import { cx, css } from '@styled-system/css';
import {
    heroSectionStyle,
    logoContainerStyle,
    teamNameStyle,
    descriptionStyle,
} from '../styles';

interface HeroSectionProps {
    teamName: string;
    mhrTeamId: string;
    mhrYear: string;
    subtitle?: string;
    description?: string;
    onInfoClick?: () => void;
}

export default function HeroSection({ 
    teamName, 
    mhrTeamId, 
    mhrYear,
    subtitle = "Game Schedule",
    description = "Track upcoming games, view past results, and access detailed team statistics. Click any game to expand and see full details including team records, ratings, and game previews.",
    onInfoClick
}: HeroSectionProps) {
    return (
        <div className={cx('hero-section', heroSectionStyle)}>
            <div className={cx('logo-container', logoContainerStyle)}>
                <AnimatedLogo />
            </div>
            <a 
                href={`https://myhockeyrankings.com/team-info/${mhrTeamId}/${mhrYear}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className={cx('team-name', teamNameStyle)}
            >
                <h1 style={{ 
                    fontSize: 'inherit', 
                    fontWeight: 'inherit', 
                    margin: 0, 
                    background: 'inherit', 
                    backgroundClip: 'inherit', 
                    color: 'inherit', 
                    letterSpacing: 'inherit' 
                }}>
                    {teamName}
                </h1>
            </a>
            <div className={css({
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                marginBottom: '1.5rem',
                animation: 'fadeIn 1s ease-out 0.5s backwards',
            })}>
                <p className={css({
                    fontSize: '1rem',
                    color: '#888',
                    textTransform: 'uppercase',
                    letterSpacing: '2px',
                    fontWeight: '600',
                    margin: 0,
                })}>{subtitle}</p>
                {onInfoClick && (
                    <button
                        onClick={onInfoClick}
                        className={css({
                            backgroundColor: 'transparent',
                            border: 'none',
                            borderRadius: '50%',
                            width: '18px',
                            height: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#888',
                            transition: 'all 0.2s ease',
                            padding: 0,
                            flexShrink: 0,
                            _hover: {
                                color: 'rgba(255, 255, 255, 0.7)',
                            },
                        })}
                        title="Cache & Sync Status"
                    >
                        <svg 
                            width="14" 
                            height="14" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                        >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                    </button>
                )}
            </div>
            <p className={cx('description', descriptionStyle)}>
                {description}
            </p>
        </div>
    );
}
