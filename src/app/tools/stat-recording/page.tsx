'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { css } from '@styled-system/css';
import { StatSession } from '@/types';
import GameSetup from '@/components/stats/GameSetup';
import SessionHistory from '@/components/stats/SessionHistory';
import LiveSessionSelector from '@/components/stats/LiveSessionSelector';
import HeroSection from '../next-game/components/HeroSection';
import CacheStatusFooter from '@/components/CacheStatusFooter';
import SyncStatusIndicator from '@/components/SyncStatusIndicator';
import { ThunderstormBackground } from '@/components/ThunderstormBackground';
import type { SyncStatus, CalendarSyncStatus } from '@/lib/kv';

const containerStyle = css({
  minHeight: '100vh',
  padding: '2rem 1rem',
  color: '#ffffff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2rem',
  position: 'relative', // Ensure proper stacking context
});



export default function StatRecordingPage() {
  const [view, setView] = useState<'setup' | 'history'>('setup');
  const [settings, setSettings] = useState({
      teamName: 'Jr Canes 10U Black',
      mhrTeamId: '19758',
      mhrYear: '2025'
  });
  const [youtubeStatus, setYoutubeStatus] = useState<SyncStatus>({
    lastSyncTime: null,
    isRevalidating: false,
    lastError: null
  });
  const [calendarStatus, setCalendarStatus] = useState<CalendarSyncStatus>({
    lastSyncTime: null,
    isRevalidating: false,
    lastError: null
  });
  const [isCacheModalOpen, setIsCacheModalOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
      fetch('/api/admin/settings')
          .then(res => res.json())
          .then(data => {
              if (data) {
                  setSettings({
                      teamName: data.teamName || 'Jr Canes 10U Black',
                      mhrTeamId: data.mhrTeamId || '19758',
                      mhrYear: data.mhrYear || '2025'
                  });
              }
          })
          .catch(err => console.error('Failed to load settings', err));

      // Fetch sync statuses
      Promise.all([
        fetch('/api/admin/sync-youtube').then(res => res.ok ? res.json() : null),
        fetch('/api/admin/sync-schedule-status').then(res => res.ok ? res.json() : null)
      ]).then(([youtube, calendar]) => {
        if (youtube) setYoutubeStatus(youtube);
        if (calendar) setCalendarStatus(calendar);
      }).catch(err => console.error('Failed to load sync status', err));
  }, []);

  const handleStartSession = async (session: StatSession) => {
    // Save initial session before redirecting
    try {
      await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
      router.push(`/tools/stat-recording/${session.id}`);
    } catch (error) {
      console.error('Failed to start session', error);
      alert('Failed to start session. Please try again.');
    }
  };

  return (
    <>
      <ThunderstormBackground />
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
      <div className={containerStyle}>
      <HeroSection 
          teamName={settings.teamName}
          mhrTeamId={settings.mhrTeamId}
          mhrYear={settings.mhrYear}
          subtitle="Stat Tracker"
          description="Record live game statistics, track player performance, and manage game sessions. Start a new session or view history below."
          onInfoClick={() => setIsCacheModalOpen(true)}
      />

      {view === 'setup' && (
        <>
          <GameSetup onStartSession={handleStartSession} />
          <LiveSessionSelector />
          <div className={css({ width: '100%', maxWidth: '800px', marginTop: '2rem' })}>
            <SessionHistory showTitle={true} />
          </div>
        </>
      )}

      {view === 'history' && (
        <div className={css({ width: '100%', maxWidth: '800px' })}>
          <button 
            onClick={() => setView('setup')}
            className={css({
              marginBottom: '1.5rem',
              padding: '0.75rem 1.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              '&:hover': { background: 'rgba(255, 255, 255, 0.15)' }
            })}
          >
            ← Back to Setup
          </button>
          <SessionHistory />
        </div>
      )}

      <CacheStatusFooter 
        initialYouTubeStatus={youtubeStatus}
        initialCalendarStatus={calendarStatus}
        isOpen={isCacheModalOpen}
        onClose={() => setIsCacheModalOpen(false)}
      />
      
      <SyncStatusIndicator 
        initialStatus={youtubeStatus} 
        initialCalendarStatus={calendarStatus} 
      />
      </div>
    </>
  );
}
