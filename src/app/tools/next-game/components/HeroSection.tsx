import { AnimatedLogo } from '@/components/AnimatedLogo';
import { cx } from '@styled-system/css';
import {
    heroSectionStyle,
    logoContainerStyle,
    teamNameStyle,
    subtitleStyle,
    descriptionStyle,
} from '../styles';

interface HeroSectionProps {
    teamName: string;
    mhrTeamId: string;
    mhrYear: string;
    subtitle?: string;
    description?: string;
}

export default function HeroSection({ 
    teamName, 
    mhrTeamId, 
    mhrYear,
    subtitle = "Game Schedule",
    description = "Track upcoming games, view past results, and access detailed team statistics. Click any game to expand and see full details including team records, ratings, and game previews."
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
            <p className={cx('subtitle', subtitleStyle)}>{subtitle}</p>
            <p className={cx('description', descriptionStyle)}>
                {description}
            </p>
        </div>
    );
}
