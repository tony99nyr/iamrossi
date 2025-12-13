'use client';

import { useState } from 'react';
import { ThunderstormBackground } from '@/components/ThunderstormBackground';
import { cx } from '@styled-system/css';
import { Game } from '@/types';
import type { SyncStatus } from '@/lib/kv';

import HeroSection from './components/HeroSection';
import SocialLinks from './components/SocialLinks';
import UpcomingGamesList from './components/UpcomingGamesList';
import PastGamesSection from './components/PastGamesSection';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import CacheStatusFooter from '@/components/CacheStatusFooter';
import LiveStreamAlert from './components/LiveStreamAlert';
import { containerStyle } from './styles';
import type { EnrichedGame } from '@/utils/videoMatcher';
import type { YouTubeVideo } from '@/lib/youtube-service';
import type { CalendarSyncStatus } from '@/lib/kv';
import type { FeaturedStream } from '@/lib/next-game/featured-stream';

interface NextGameClientProps {
    futureGames: Game[];
    pastGames: Game[];
    settings: {
        mhrTeamId: string;
        mhrYear: string;
        teamName: string;
        identifiers: string[];
    };
    syncStatus: SyncStatus;
    calendarSyncStatus: CalendarSyncStatus;
    liveGames: EnrichedGame[];
    activeLiveStream: YouTubeVideo | null;
    featuredStream: FeaturedStream;
}

export default function NextGameClient({ futureGames, pastGames, settings, syncStatus, calendarSyncStatus, liveGames, activeLiveStream, featuredStream }: NextGameClientProps) {
    // State for accordion - first game expanded by default
    const [expandedGameId, setExpandedGameId] = useState<string | number | null>(
        futureGames.length > 0 ? (futureGames[0].game_nbr ?? null) : null
    );
    // State for cache status modal
    const [isCacheModalOpen, setIsCacheModalOpen] = useState(false);

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
                onInfoClick={() => setIsCacheModalOpen(true)}
            />
            
            {/* Featured stream alert */}
            {featuredStream?.kind === 'youtube' && (
                <LiveStreamAlert liveStream={featuredStream.video} isStandalone={true} />
            )}
            {featuredStream?.kind === 'game' && (
                <LiveStreamAlert liveGame={featuredStream.game} />
            )}

            <SocialLinks streamState={
                featuredStream?.kind === 'youtube' && featuredStream.video.videoType === 'live'
                    ? 'live'
                    : featuredStream?.kind === 'game' && featuredStream.state === 'live'
                        ? 'live'
                        : featuredStream?.kind === 'game' && featuredStream.state === 'upcoming'
                            ? 'upcoming'
                            : null
            } />

            {/* Live stream alert - show if any live games (matched to games) */}
            {liveGames.length > 0 && !activeLiveStream && (
                <LiveStreamAlert liveGame={liveGames[0]} />
            )}

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
            
            <CacheStatusFooter 
                initialYouTubeStatus={syncStatus}
                initialCalendarStatus={calendarSyncStatus}
                isOpen={isCacheModalOpen}
                onClose={() => setIsCacheModalOpen(false)}
            />
            
            <SyncStatusIndicator initialStatus={syncStatus} initialCalendarStatus={calendarSyncStatus} />
        </div>
        </>
    );
}
