'use client';

import { useState } from 'react';
import { ThunderstormBackground } from '@/components/ThunderstormBackground';
import { cx } from '@styled-system/css';
import { Game } from '@/types';

import HeroSection from './components/HeroSection';
import SocialLinks from './components/SocialLinks';
import UpcomingGamesList from './components/UpcomingGamesList';
import PastGamesSection from './components/PastGamesSection';
import { containerStyle } from './styles';

interface NextGameClientProps {
    futureGames: Game[];
    pastGames?: Game[];
    settings: { mhrTeamId: string; mhrYear: string };
}

export default function NextGameClient({ futureGames, pastGames = [], settings }: NextGameClientProps) {
    // State for accordion - first game expanded by default
    const [expandedGameId, setExpandedGameId] = useState<string | number | null>(
        futureGames.length > 0 ? (futureGames[0].game_nbr ?? null) : null
    );

    const handleGameClick = (gameId: string | number | undefined, event: React.MouseEvent<HTMLDivElement>) => {
        if (gameId === undefined) return;
        // Toggle accordion - if clicking the same game, collapse it; otherwise expand the new one
        setExpandedGameId(expandedGameId === gameId ? null : gameId);
        
        // Scroll the clicked item into view
        const target = event.currentTarget;
        setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    };

    return (
        <>
            <ThunderstormBackground />
            <div className={cx('next-game-client', containerStyle)}>
                <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                @keyframes fadeInDown {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
            
            <HeroSection 
                teamName="Junior Canes 10U Black"
                mhrTeamId={settings.mhrTeamId}
                mhrYear={settings.mhrYear}
            />
            
            <SocialLinks />

            <UpcomingGamesList
                games={futureGames}
                expandedGameId={expandedGameId}
                onGameClick={handleGameClick}
                mhrTeamId={settings.mhrTeamId}
            />

            <PastGamesSection
                games={pastGames}
                expandedGameId={expandedGameId}
                onGameClick={handleGameClick}
                mhrTeamId={settings.mhrTeamId}
            />
            </div>
        </>
    );
}
