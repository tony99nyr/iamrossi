'use client';

import { useState, useEffect, useRef } from 'react';
import { css, cx } from '@styled-system/css';
import { StatSession, TeamStats, GameEvent, Player } from '@/types';
import GoalCelebration from './GoalCelebration';
import { v4 as uuidv4 } from 'uuid';

interface StatTrackerProps {
  session: StatSession;
  initialRoster: Player[];

  onExit: () => void;
}

const trackerContainerStyle = css({
  width: '100%',
  maxWidth: '900px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  paddingBottom: '100px', // Space for fixed bottom buttons if needed, or just scrolling
});

const mainGridStyle = css({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.5rem', // Tight gap for mobile
  alignItems: 'start',
});

const teamColumnStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  background: 'rgba(25, 25, 30, 0.6)',
  backdropFilter: 'blur(10px)',
  padding: '0.75rem',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
});

const teamHeaderStyle = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.25rem',
  marginBottom: '0.5rem',
});

const teamNameStyle = css({
  fontSize: '0.9rem',
  fontWeight: '700',
  color: '#ccc',
  textTransform: 'uppercase',
  textAlign: 'center',
  lineHeight: 1.2,
  height: '2.4em', // Fixed height for 2 lines
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const scoreStyle = css({
  fontSize: '3.5rem',
  fontWeight: '800',
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
  marginBottom: '0.5rem',
});

const statRowStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  background: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '12px',
  padding: '0.5rem',
});

const statLabelStyle = css({
  fontSize: '0.75rem',
  color: '#888',
  textTransform: 'uppercase',
  textAlign: 'center',
  fontWeight: '600',
});

const statControlStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.5rem',
});

const statValueStyle = css({
  fontSize: '1.5rem',
  fontWeight: '700',
  fontVariantNumeric: 'tabular-nums',
  minWidth: '1.5ch',
  textAlign: 'center',
});

const miniButtonStyle = css({
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  border: 'none',
  fontSize: '1.25rem',
  fontWeight: '600',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  transition: 'all 0.1s',
  '&:active': { transform: 'scale(0.95)' },
});

const plusBtnStyle = css({
  background: 'rgba(120, 119, 198, 0.2)',
  color: '#a5a4ff',
  '&:hover': { background: 'rgba(120, 119, 198, 0.3)' },
});

const minusBtnStyle = css({
  background: 'rgba(255, 255, 255, 0.05)',
  color: '#888',
  '&:hover': { background: 'rgba(255, 255, 255, 0.1)' },
});

const goalButtonStyle = css({
  width: '100%',
  padding: '0.75rem',
  // background set dynamically
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  fontSize: '1rem',
  fontWeight: '800',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(230, 74, 25, 0.3)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.5rem',
  '&:active': { transform: 'scale(0.98)' },
});

const modalOverlayStyle = css({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.8)',
  backdropFilter: 'blur(5px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10001, // Ensure above animations
  padding: '1rem',
});

const modalContentStyle = css({
  background: '#1a1a1a',
  width: '100%',
  maxWidth: '500px',
  borderRadius: '20px',
  padding: '2rem',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
});

const SAD_EMOJIS = ['😢', '😭', '😞', '😠', '😡', '🤬', '👎', '💔', '😿', '🌧️'];

const StatTracker = ({ initialRoster, session, onExit }: StatTrackerProps) => {
  const [currentSession, setCurrentSession] = useState<StatSession>(session);
  const [roster] = useState(initialRoster);
  const [showGoalModal, setShowGoalModal] = useState<'us' | 'them' | null>(null);
  const [goalPlayerId, setGoalPlayerId] = useState<string>('');
  const [assist1Id, setAssist1Id] = useState<string>('');
  const [assist2Id, setAssist2Id] = useState<string>('');
  const [showAssist1, setShowAssist1] = useState(false);
  const [showAssist2, setShowAssist2] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [currentPeriod, setCurrentPeriod] = useState<string>(session.currentPeriod || '1');
  const [sadEmoji, setSadEmoji] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  
  // Animation keyframes
  const animationStyles = `
    @keyframes excited-bounce {
      0% { transform: scale(1); }
      50% { transform: scale(1.5); }
      100% { transform: scale(1); }
    }
    @keyframes sad-emoji-fade {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
      10% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
      20% { transform: translate(-50%, -50%) scale(1); }
      80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    }
  `;
  const [saving, setSaving] = useState(false);

  const isGameOver = !!currentSession.endTime;

  const handleEventClick = (event: GameEvent) => {
    if (event.type === 'system' || event.type === 'note') return;

    if (!window.confirm(`Delete this ${event.type} event and undo the stat change?`)) {
      return;
    }

    setCurrentSession(prev => {
      const newEvents = prev.events.filter(e => e.id !== event.id);
      const usStats = { ...prev.usStats };
      const themStats = { ...prev.themStats };

      if (event.type === 'goal') {
        if (event.team === 'us') {
          usStats.goals = Math.max(0, usStats.goals - 1);
        } else if (event.team === 'them') {
          themStats.goals = Math.max(0, themStats.goals - 1);
        }
      } else if (event.type === 'shot') {
        if (event.team === 'us') usStats.shots = Math.max(0, usStats.shots - 1);
        else if (event.team === 'them') themStats.shots = Math.max(0, themStats.shots - 1);
      } else if (event.type === 'chance') {
        if (event.team === 'us') usStats.chances = Math.max(0, usStats.chances - 1);
        else if (event.team === 'them') themStats.chances = Math.max(0, themStats.chances - 1);
      } else if (event.type === 'faceoff') {
        if (event.note?.includes('Win')) {
          if (event.team === 'us') usStats.faceoffWins = Math.max(0, usStats.faceoffWins - 1);
          else themStats.faceoffWins = Math.max(0, themStats.faceoffWins - 1);
        } else if (event.note?.includes('Loss')) {
          if (event.team === 'us') usStats.faceoffLosses = Math.max(0, usStats.faceoffLosses - 1);
          else themStats.faceoffLosses = Math.max(0, themStats.faceoffLosses - 1);
        } else if (event.note?.includes('Tie')) {
          if (event.team === 'us') usStats.faceoffTies = Math.max(0, usStats.faceoffTies - 1);
          else themStats.faceoffTies = Math.max(0, themStats.faceoffTies - 1);
        }
      }

      return {
        ...prev,
        usStats,
        themStats,
        events: newEvents
      };
    });
  };

  // Load roster on mount
  useEffect(() => {
    // Roster is now passed as a prop, no need to fetch here
    // fetch('/api/admin/roster')
    //   .then(res => res.json())
    //   .then(data => setRoster(data))
    //   .catch(err => console.error('Failed to load roster', err));
  }, []);

  // Auto-save on changes
  useEffect(() => {
    const saveSession = async () => {
      try {
        await fetch('/api/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentSession),
        });
      } catch (e) {
        console.error('Auto-save failed', e);
      }
    };
    
    if (currentSession.events.length > 0 || currentSession.usStats.shots > 0) {
        saveSession();
    }
  }, [currentSession]);

  // Log session start
  useEffect(() => {
    if (currentSession.events.length === 0) {
        const startEvent: GameEvent = {
            id: uuidv4(),
            type: 'system',
            note: 'Session Started',
            timestamp: Date.now(),
        };
        setCurrentSession(prev => ({
            ...prev,
            events: [startEvent, ...prev.events]
        }));
    }
  }, [currentSession.events.length]);

  useEffect(() => {
    if (sadEmoji) {
      const timer = setTimeout(() => setSadEmoji(null), 1500);
      return () => clearTimeout(timer);
    }
  }, [sadEmoji]);

  const updateStat = (team: 'us' | 'them', stat: keyof TeamStats, delta: number) => {
    setCurrentSession(prev => {
      const teamStats = team === 'us' ? prev.usStats : prev.themStats;
      const newValue = Math.max(0, (teamStats[stat] || 0) + delta);
      
      if (newValue === teamStats[stat]) return prev;

      // Log the stat change if it's an increment
      let newEvents = prev.events;
      if (delta > 0) {
          let eventType: GameEvent['type'] | undefined;
          let note = '';

          if (stat === 'shots') {
              eventType = 'shot';
              note = `Shot (${team === 'us' ? 'Us' : 'Them'})`;
          } else if (stat === 'chances') {
              eventType = 'chance';
              note = `Chance (${team === 'us' ? 'Us' : 'Them'})`;
          } else if (stat === 'faceoffWins') {
              eventType = 'faceoff';
              note = 'Faceoff Win';
          } else if (stat === 'faceoffLosses') {
              eventType = 'faceoff';
              note = 'Faceoff Loss';
          } else if (stat === 'faceoffTies') {
              eventType = 'faceoff';
              note = 'Faceoff Tie';
          }

          if (eventType) {
              const statEvent: GameEvent = {
                  id: uuidv4(),
                  type: eventType,
                  note,
                  timestamp: Date.now(),
                  team,
                  period: currentPeriod
              };
              newEvents = [statEvent, ...prev.events];
          }
      }

      return {
        ...prev,
        [team === 'us' ? 'usStats' : 'themStats']: {
          ...teamStats,
          [stat]: newValue
        },
        events: newEvents
      };
    });
  };

  const handleGoal = (team: 'us' | 'them') => {
    setShowGoalModal(team);
    setGoalPlayerId('');
    setAssist1Id('');
    setAssist2Id('');
    setShowAssist1(false);
    setShowAssist2(false);
  };

  const confirmGoal = () => {
    if (!showGoalModal) return;

    const team = showGoalModal;
    const player = roster.find(p => p.id === goalPlayerId);
    const assist1 = roster.find(p => p.id === assist1Id);
    const assist2 = roster.find(p => p.id === assist2Id);
    
    const newEvent: GameEvent = {
      id: uuidv4(),
      type: 'goal',
      team,
      playerId: team === 'us' ? player?.id : undefined,
      playerName: team === 'us' ? player?.name : undefined,
      assist1Id: team === 'us' ? assist1?.id : undefined,
      assist1Name: team === 'us' ? assist1?.name : undefined,
      assist2Id: team === 'us' ? assist2?.id : undefined,
      assist2Name: team === 'us' ? assist2?.name : undefined,
      timestamp: Date.now(),
      gameTime: new Date().toLocaleTimeString(),
      period: currentPeriod
    };

    setCurrentSession(prev => {
        // Auto-increment shots for the scoring team
        const updatedTeamStats = {
            ...(team === 'us' ? prev.usStats : prev.themStats),
            goals: (team === 'us' ? prev.usStats.goals : prev.themStats.goals) + 1,
            shots: (team === 'us' ? prev.usStats.shots : prev.themStats.shots) + 1
        };

        // Create a shot event as well
        const shotEvent: GameEvent = {
            id: uuidv4(),
            type: 'shot',
            note: `Shot (${team === 'us' ? 'Us' : 'Them'}) - Goal`,
            timestamp: Date.now(),
            team,
            period: currentPeriod
        };

        return {
            ...prev,
            [team === 'us' ? 'usStats' : 'themStats']: updatedTeamStats,
            events: [newEvent, shotEvent, ...prev.events]
        };
    });

    if (team === 'them') {
        const randomEmoji = SAD_EMOJIS[Math.floor(Math.random() * SAD_EMOJIS.length)];
        setSadEmoji(randomEmoji);
    } else if (team === 'us') {
        setCelebrating(true);
    }

    setShowGoalModal(null);
  };

  const handlePeriodChange = (newPeriod: string) => {
    if (newPeriod === currentPeriod) return;

    const periodEvent: GameEvent = {
        id: uuidv4(),
        type: 'system',
        note: `Period Change: ${currentPeriod} -> ${newPeriod}`,
        timestamp: Date.now(),
        period: newPeriod
    };

    setCurrentSession(prev => ({
        ...prev,
        currentPeriod: newPeriod,
        events: [periodEvent, ...prev.events]
    }));
    setCurrentPeriod(newPeriod);
  };

  const addNote = () => {
    if (!noteText.trim()) return;

    const newEvent: GameEvent = {
      id: uuidv4(),
      type: 'note',
      note: noteText,
      timestamp: Date.now(),
    };

    setCurrentSession(prev => ({
      ...prev,
      events: [newEvent, ...prev.events]
    }));

    setNoteText('');
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const endTime = Date.now();
      const endEvent: GameEvent = {
        id: uuidv4(),
        type: 'system',
        note: 'Session Finalized',
        timestamp: endTime,
      };

      await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...currentSession,
            events: [endEvent, ...currentSession.events],
            endTime
        }),
      });
      setCurrentSession(prev => ({ 
          ...prev, 
          events: [endEvent, ...prev.events],
          endTime 
      }));
    } catch {
      alert('Failed to save session');
    } finally {
      setSaving(false);
    }
  };

  const handleResume = async () => {
    setSaving(true);
    try {
      const updatedSession = { ...currentSession };
      delete updatedSession.endTime;
      
      const resumeEvent: GameEvent = {
        id: uuidv4(),
        type: 'system',
        note: 'Session Resumed',
        timestamp: Date.now(),
      };
      updatedSession.events = [resumeEvent, ...updatedSession.events];

      await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSession),
      });
      
      setCurrentSession(updatedSession);
    } catch {
      alert('Failed to resume session');
    } finally {
      setSaving(false);
    }
  };

  if (isGameOver) {
    const periods = ['1', '2', '3', 'OT'];
    const periodStats = periods.map(period => {
        const periodEvents = currentSession.events.filter(e => e.period === period);
        return {
            period,
            usGoals: periodEvents.filter(e => e.type === 'goal' && e.team === 'us').length,
            themGoals: periodEvents.filter(e => e.type === 'goal' && e.team === 'them').length,
            usShots: periodEvents.filter(e => e.type === 'shot' && e.team === 'us').length,
            themShots: periodEvents.filter(e => e.type === 'shot' && e.team === 'them').length,
            usChances: periodEvents.filter(e => e.type === 'chance' && e.team === 'us').length,
            themChances: periodEvents.filter(e => e.type === 'chance' && e.team === 'them').length,
            faceoffWins: periodEvents.filter(e => e.type === 'faceoff' && e.note?.includes('Win')).length,
            faceoffLosses: periodEvents.filter(e => e.type === 'faceoff' && e.note?.includes('Loss')).length,
        };
    }).filter(stat => {
        if (stat.period !== 'OT') return true;
        return (
            stat.usGoals > 0 || stat.themGoals > 0 ||
            stat.usShots > 0 || stat.themShots > 0 ||
            stat.usChances > 0 || stat.themChances > 0 ||
            stat.faceoffWins > 0 || stat.faceoffLosses > 0
        );
    });

    return (
      <div className={trackerContainerStyle}>
        <div className={css({ textAlign: 'center', marginBottom: '1rem' })}>
          <h2 className={css({ fontSize: '2rem', color: '#fff', fontWeight: '800', letterSpacing: '0.1em' })}>FINAL SCORE</h2>
          <div className={css({ color: '#888', fontSize: '0.9rem' })}>
            Ended {new Date(currentSession.endTime!).toLocaleString()}
          </div>
        </div>

        <div className={mainGridStyle}>
          {/* Us Column */}
          <div className={teamColumnStyle}>
            <div className={teamHeaderStyle}>
              <div className={teamNameStyle}>{currentSession.ourTeamName || 'Our Team'}</div>
              <div className={cx(scoreStyle, css({ color: "#991b1b" }))}>{currentSession.usStats.goals}</div>
            </div>
            
            <StatRowReadOnly label="Shots" value={currentSession.usStats.shots} color="#991b1b" />
            <StatRowReadOnly label="Chances" value={currentSession.usStats.chances} color="#991b1b" />
            
            </div>


          {/* Them Column */}
          <div className={teamColumnStyle}>
            <div className={teamHeaderStyle}>
              <div className={teamNameStyle}>{currentSession.opponent}</div>
              <div className={cx(scoreStyle, css({ color: "#7877c6" }))}>{currentSession.themStats.goals}</div>
            </div>
            
            <StatRowReadOnly label="Shots" value={currentSession.themStats.shots} color="#7877c6" />
            <StatRowReadOnly label="Chances" value={currentSession.themStats.chances} color="#7877c6" />
          </div>
        </div>

        {/* Period Breakdown */}
        <div className={css({ 
            background: 'rgba(25, 25, 30, 0.6)', 
            backdropFilter: 'blur(10px)',
            padding: '1rem', 
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginTop: '0.5rem',
            overflowX: 'auto'
        })}>
            <h3 className={css({ color: '#ccc', marginBottom: '0.5rem', fontSize: '1rem', textAlign: 'center' })}>Period Breakdown</h3>
            <table className={css({ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', color: '#ddd' })}>
                <thead>
                    <tr>
                        <th className={css({ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)' })}>Period</th>
                        <th className={css({ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' })}>G (Us/Them)</th>
                        <th className={css({ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' })}>S (Us/Them)</th>
                        <th className={css({ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' })}>C (Us/Them)</th>
                        <th className={css({ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' })}>FO (W/L)</th>
                    </tr>
                </thead>
                <tbody>
                    {periodStats.map(stat => (
                        <tr key={stat.period}>
                            <td className={css({ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' })}>{stat.period}</td>
                            <td className={css({ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' })}>
                                <span className={css({ color: "#991b1b" })}>{stat.usGoals}</span> / <span className={css({ color: "#7877c6" })}>{stat.themGoals}</span>
                            </td>
                            <td className={css({ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' })}>
                                <span className={css({ color: "#991b1b" })}>{stat.usShots}</span> / <span className={css({ color: "#7877c6" })}>{stat.themShots}</span>
                            </td>
                            <td className={css({ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' })}>
                                <span className={css({ color: "#991b1b" })}>{stat.usChances}</span> / <span className={css({ color: "#7877c6" })}>{stat.themChances}</span>
                            </td>
                            <td className={css({ padding: '0.5rem', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' })}>
                                <span className={css({ color: "#4caf50" })}>{stat.faceoffWins}</span> / <span className={css({ color: "#ff6b6b" })}>{stat.faceoffLosses}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {/* Full Width Faceoff Summary */}
        <div className={css({ 
            background: 'rgba(25, 25, 30, 0.6)', 
            backdropFilter: 'blur(10px)',
            padding: '1rem', 
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginTop: '0.5rem'
        })}>
            <div className={statLabelStyle} style={{ marginBottom: '0.5rem' }}>Faceoffs (Us)</div>
            <div className={css({ display: 'flex', justifyContent: 'space-around', alignItems: 'center' })}>
                <div className={css({ textAlign: 'center' })}>
                    <div className={css({ fontSize: '0.8rem', color: '#888', marginBottom: '0.25rem' })}>WINS</div>
                    <div className={css({ fontSize: '1.5rem', fontWeight: 'bold', color: '#4caf50' })}>{currentSession.usStats.faceoffWins}</div>
                </div>
                <div className={css({ textAlign: 'center' })}>
                    <div className={css({ fontSize: '0.8rem', color: '#888', marginBottom: '0.25rem' })}>LOSSES</div>
                    <div className={css({ fontSize: '1.5rem', fontWeight: 'bold', color: '#ff6b6b' })}>{currentSession.usStats.faceoffLosses}</div>
                </div>
                <div className={css({ textAlign: 'center' })}>
                    <div className={css({ fontSize: '0.8rem', color: '#888', marginBottom: '0.25rem' })}>TIES</div>
                    <div className={css({ fontSize: '1.5rem', fontWeight: 'bold', color: '#ccc' })}>{currentSession.usStats.faceoffTies}</div>
                </div>
            </div>
        </div>

        {/* Read-only Event Log */}
        <div className={css({ 
          background: 'rgba(25, 25, 30, 0.6)', 
          padding: '1rem', 
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginTop: '1rem'
        })}>
          <h3 className={css({ color: '#ccc', marginBottom: '0.5rem', fontSize: '1rem' })}>Game Log</h3>
          <div className={css({ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' })}>
            {currentSession.events.map(event => (
              <div key={event.id} className={css({ fontSize: '0.85rem', color: '#ccc', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' })}>
                <span className={css({ color: '#666', marginRight: '0.5rem', fontSize: '0.75rem' })}>
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {event.type === 'goal' ? (
                  <span className={css({ color: event.team === 'us' ? '#991b1b' : '#7877c6', fontWeight: 'bold' })}>
                    GOAL ({event.team === 'us' ? 'Us' : 'Them'}) {event.playerName ? `- ${event.playerName}` : ''}
                  </span>
                ) : event.type === 'system' ? (
                  <span className={css({ color: '#ffd700', fontStyle: 'italic' })}>
                    {event.note}
                  </span>
                ) : event.type === 'shot' ? (
                  <span className={css({ color: '#aaa' })}>
                    {event.note}
                  </span>
                ) : event.type === 'faceoff' ? (
                  <span className={css({ color: '#888', fontStyle: 'italic' })}>
                    {event.note}
                  </span>
                ) : event.type === 'chance' ? (
                  <span className={css({ color: '#fff', fontWeight: 'bold' })}>
                    {event.note}
                  </span>
                ) : (
                  event.note
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={css({ display: 'flex', gap: '0.75rem', marginTop: '1rem' })}>
          <button 
            onClick={onExit}
            className={css({
              flex: 1,
              padding: '1rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '1rem',
              '&:hover': { background: 'rgba(255, 255, 255, 0.15)' }
            })}
          >
            Back to Dashboard
          </button>
          <button 
            onClick={handleResume}
            disabled={saving}
            className={css({
              flex: 1,
              padding: '1rem',
              background: 'rgba(120, 119, 198, 0.2)',
              border: '1px solid rgba(120, 119, 198, 0.3)',
              color: '#a5a4ff',
              borderRadius: '12px',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
              '&:hover': { background: 'rgba(120, 119, 198, 0.3)' }
            })}
          >
            {saving ? 'Resuming...' : 'Edit Stats'}
          </button>
        </div>

        <div className={css({ textAlign: 'center', fontSize: '0.75rem', color: '#666', marginTop: '1rem' })}>
            Created by: {currentSession.recorderName}
        </div>
      </div>
    );
  }

  return (
    <div className={trackerContainerStyle}>
      {/* Period Slider */}
      <div className={css({ 
        background: 'rgba(25, 25, 30, 0.6)', 
        backdropFilter: 'blur(10px)',
        padding: '0.75rem', 
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem'
      })}>
        <div className={statLabelStyle}>PERIOD: {currentPeriod}</div>
        <div className={css({ display: 'flex', gap: '0.5rem', width: '100%' })}>
            {['1', '2', '3', 'OT'].map(p => (
                <button
                    key={p}
                    onClick={() => handlePeriodChange(p)}
                    className={css({
                        flex: 1,
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: currentPeriod === p ? '#a5a4ff' : 'rgba(255,255,255,0.1)',
                        background: currentPeriod === p ? 'rgba(120, 119, 198, 0.3)' : 'transparent',
                        color: currentPeriod === p ? 'white' : '#888',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    })}
                >
                    {p}
                </button>
            ))}
        </div>
      </div>

      <div className={mainGridStyle}>
        {/* Us Column */}
        <div className={teamColumnStyle}>
          <div className={teamHeaderStyle}>
            <div className={teamNameStyle}>{currentSession.ourTeamName || 'Our Team'}</div>
            <AnimatedValue 
                value={currentSession.usStats.goals} 
                className={scoreStyle} 
                color="#991b1b"
            />
          </div>
          
          <button 
            onClick={() => handleGoal('us')} 
            className={goalButtonStyle}
            style={{ background: 'linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%)', boxShadow: '0 4px 12px rgba(153, 27, 27, 0.3)' }}
          >
            GOAL!
          </button>

          <StatRow 
            label="Shots" 
            value={currentSession.usStats.shots} 
            onIncrement={() => updateStat('us', 'shots', 1)}
            onDecrement={() => updateStat('us', 'shots', -1)}
            color="#991b1b"
            animate={true}
          />

          <StatRow 
            label="Chances" 
            value={currentSession.usStats.chances} 
            onIncrement={() => updateStat('us', 'chances', 1)}
            onDecrement={() => updateStat('us', 'chances', -1)}
            color="#991b1b"
            animate={true}
          />

          </div>
        {/* Them Column */}
        <div className={teamColumnStyle}>
          <div className={teamHeaderStyle}>
            <div className={teamNameStyle}>{currentSession.opponent}</div>
            <div className={cx(scoreStyle, css({ color: "#7877c6" }))}>{currentSession.themStats.goals}</div>
          </div>
          
          <button 
            onClick={() => handleGoal('them')} 
            className={goalButtonStyle}
            style={{ background: 'linear-gradient(135deg, #7877c6 0%, #5e5da8 100%)', boxShadow: '0 4px 12px rgba(120, 119, 198, 0.3)' }}
          >
            GOAL!
          </button>

          <StatRow 
            label="Shots" 
            value={currentSession.themStats.shots} 
            onIncrement={() => updateStat('them', 'shots', 1)}
            onDecrement={() => updateStat('them', 'shots', -1)}
            color="#7877c6"
          />

          <StatRow 
            label="Chances" 
            value={currentSession.themStats.chances} 
            onIncrement={() => updateStat('them', 'chances', 1)}
            onDecrement={() => updateStat('them', 'chances', -1)}
            color="#7877c6"
          />
        </div>
      </div>

      {/* Full Width Faceoff Section */}
      <div className={css({ 
        background: 'rgba(25, 25, 30, 0.6)', 
        backdropFilter: 'blur(10px)',
        padding: '1rem', 
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        marginTop: '0.5rem'
      })}>
        <div className={statLabelStyle} style={{ marginBottom: '0.75rem' }}>Faceoffs (Us)</div>
        <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' })}>
          <button 
            onClick={() => updateStat('us', 'faceoffWins', 1)}
            className={css({
              background: 'rgba(76, 175, 80, 0.15)',
              color: '#4caf50',
              border: '1px solid rgba(76, 175, 80, 0.3)',
              borderRadius: '12px',
              padding: '0.25rem',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'all 0.1s',
              '&:active': { transform: 'scale(0.98)', background: 'rgba(76, 175, 80, 0.25)' }
            })}
          >
            <span>WIN</span>
            <AnimatedValue 
                value={currentSession.usStats.faceoffWins} 
                className={css({ fontSize: '1.25rem' })}
            />
          </button>
          <button 
            onClick={() => updateStat('us', 'faceoffLosses', 1)}
            className={css({
              background: 'rgba(244, 67, 54, 0.15)',
              color: '#ff6b6b',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              borderRadius: '12px',
              padding: '0.25rem',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'all 0.1s',
              '&:active': { transform: 'scale(0.98)', background: 'rgba(244, 67, 54, 0.25)' }
            })}
          >
            <span>LOSS</span>
            <span className={css({ fontSize: '1.25rem' })}>{currentSession.usStats.faceoffLosses}</span>
          </button>
          <button 
            onClick={() => updateStat('us', 'faceoffTies', 1)}
            className={css({
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#ccc',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '0.25rem',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'all 0.1s',
              '&:active': { transform: 'scale(0.98)', background: 'rgba(255, 255, 255, 0.1)' }
            })}
          >
            <span>TIE</span>
            <span className={css({ fontSize: '1.25rem' })}>{currentSession.usStats.faceoffTies}</span>
          </button>
        </div>
      </div>

      {/* Notes Section */}
      <div className={css({ 
        background: 'rgba(25, 25, 30, 0.6)', 
        padding: '1rem', 
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)' 
      })}>
        {/* ... (keep notes input and list) */}
        <div className={css({ display: 'flex', gap: '0.5rem', marginBottom: '1rem' })}>
          <input 
            type="text" 
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            className={css({
              flex: 1,
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: 'white',
              fontSize: '0.9rem'
            })}
            onKeyDown={(e) => e.key === 'Enter' && addNote()}
          />
          <button 
            onClick={addNote}
            className={css({
              padding: '0 1rem',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              border: 'none',
              cursor: 'pointer'
            })}
          >
            Add
          </button>
        </div>
        
        <div className={css({ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' })}>
          {currentSession.events.map(event => (
            <div 
              key={event.id} 
              onClick={() => handleEventClick(event)}
              className={css({ 
                fontSize: '0.85rem', 
                color: '#ccc', 
                padding: '0.5rem', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '4px',
                cursor: (event.type === 'system' || event.type === 'note') ? 'default' : 'pointer',
                transition: 'background 0.2s',
                '&:hover': (event.type === 'system' || event.type === 'note') ? {} : { background: 'rgba(255, 0, 0, 0.15)' }
              })}
            >
              <span className={css({ color: '#666', marginRight: '0.5rem', fontSize: '0.75rem' })}>
                {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {event.type === 'goal' ? (
                <span className={css({ color: event.team === 'us' ? '#991b1b' : '#7877c6', fontWeight: 'bold' })}>
                  GOAL ({event.team === 'us' ? 'Us' : 'Them'}) {event.playerName ? `- ${event.playerName}` : ''}
                  {event.assist1Name && (
                    <span className={css({ fontWeight: 'normal', fontSize: '0.75rem', marginLeft: '0.5rem', color: '#888' })}>
                      (A: {event.assist1Name}{event.assist2Name ? `, ${event.assist2Name}` : ''})
                    </span>
                  )}
                </span>
              ) : event.type === 'system' ? (
                <span className={css({ color: '#ffd700', fontStyle: 'italic' })}>
                  {event.note}
                </span>
              ) : event.type === 'shot' ? (
                <span className={css({ color: '#aaa' })}>
                  {event.note}
                </span>
              ) : event.type === 'faceoff' ? (
                <span className={css({ color: '#888', fontStyle: 'italic' })}>
                  {event.note}
                </span>
              ) : event.type === 'chance' ? (
                <span className={css({ color: '#fff', fontWeight: 'bold' })}>
                  {event.note}
                </span>
              ) : (
                event.note
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={css({ display: 'flex', gap: '0.75rem' })}>
        <button 
          onClick={onExit}
          className={css({
            flex: 1,
            padding: '1rem',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#aaa',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '0.9rem'
          })}
        >
          Exit
        </button>
        <button 
          onClick={handleFinish}
          disabled={saving}
          className={css({
            flex: 2,
            padding: '1rem',
            background: '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '1rem'
          })}
        >
          {saving ? 'Saving...' : 'GAME OVER'}
        </button>
      </div>

      <div className={css({ textAlign: 'center', fontSize: '0.75rem', color: '#666', marginTop: '1rem' })}>
        Created by: {currentSession.recorderName}
      </div>

      <GoalCelebration active={celebrating} onComplete={() => setCelebrating(false)} />

      {/* Animation Styles */}
      <style>{animationStyles}</style>

      {/* Sad Emoji Overlay */}
      {sadEmoji && (
        <div className={css({
          position: 'fixed',
          top: '50%',
          left: '50%',
          fontSize: '8rem',
          zIndex: 9999,
          pointerEvents: 'none',
          animation: 'sad-emoji-fade 1.5s forwards'
        })}>
          {sadEmoji}
        </div>
      )}

      {/* Goal Modal (keep existing) */}
      {showGoalModal && (
        <div className={modalOverlayStyle}>
          {/* ... (keep modal content) */}
          <div className={modalContentStyle}>
            <h3 className={css({ fontSize: '1.25rem', marginBottom: '1rem', color: 'white' })}>
              {showGoalModal === 'us' ? '10U Black Goal!' : 'Record Goal (Them)'}
            </h3>
            
            {showGoalModal === 'us' && (
              <div className={css({ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' })}>
                <select 
                  value={goalPlayerId}
                  onChange={(e) => setGoalPlayerId(e.target.value)}
                  className={css({
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'white',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    '& option': { background: '#1a1a1a' }
                  })}
                >
                  <option value="">Select Scorer...</option>
                  {roster.sort((a,b) => parseInt(a.jerseyNumber) - parseInt(b.jerseyNumber)).map(player => (
                    <option key={player.id} value={player.id}>
                      #{player.jerseyNumber} {player.name}
                    </option>
                  ))}
                </select>

                {!showAssist1 && (
                    <button 
                        onClick={() => setShowAssist1(true)}
                        className={css({
                            background: 'transparent',
                            border: '1px dashed rgba(255,255,255,0.3)',
                            color: '#aaa',
                            padding: '0.5rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            '&:hover': { color: 'white', borderColor: 'white' }
                        })}
                    >
                        + Add Assist
                    </button>
                )}

                {showAssist1 && (
                    <div className={css({ display: 'flex', flexDirection: 'column', gap: '0.5rem' })}>
                        <select 
                            value={assist1Id}
                            onChange={(e) => setAssist1Id(e.target.value)}
                            className={css({
                                width: '100%',
                                padding: '0.5rem',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#ddd',
                                borderRadius: '8px',
                                fontSize: '1rem', // Prevent iOS zoom
                                '& option': { background: '#1a1a1a' }
                            })}
                        >
                            <option value="">Select Assist 1...</option>
                            {roster
                                .filter(p => p.id !== goalPlayerId && p.id !== assist2Id)
                                .sort((a,b) => parseInt(a.jerseyNumber) - parseInt(b.jerseyNumber))
                                .map(player => (
                                <option key={player.id} value={player.id}>
                                    #{player.jerseyNumber} {player.name}
                                </option>
                            ))}
                        </select>

                        {!showAssist2 && (
                            <button 
                                onClick={() => setShowAssist2(true)}
                                className={css({
                                    background: 'transparent',
                                    border: '1px dashed rgba(255,255,255,0.3)',
                                    color: '#aaa',
                                    padding: '0.5rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    alignSelf: 'flex-start',
                                    '&:hover': { color: 'white', borderColor: 'white' }
                                })}
                            >
                                + Add 2nd Assist
                            </button>
                        )}
                    </div>
                )}

                {showAssist2 && (
                    <select 
                        value={assist2Id}
                        onChange={(e) => setAssist2Id(e.target.value)}
                        className={css({
                            width: '100%',
                            padding: '0.5rem',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#ddd',
                            borderRadius: '8px',
                            fontSize: '1rem', // Prevent iOS zoom
                            '& option': { background: '#1a1a1a' }
                        })}
                    >
                        <option value="">Select Assist 2...</option>
                        {roster
                            .filter(p => p.id !== goalPlayerId && p.id !== assist1Id)
                            .sort((a,b) => parseInt(a.jerseyNumber) - parseInt(b.jerseyNumber))
                            .map(player => (
                            <option key={player.id} value={player.id}>
                                #{player.jerseyNumber} {player.name}
                            </option>
                        ))}
                    </select>
                )}
              </div>
            )}

            <div className={css({ display: 'flex', gap: '0.75rem' })}>
              <button 
                onClick={() => setShowGoalModal(null)}
                className={css({
                  flex: 1,
                  padding: '0.75rem',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'white',
                  borderRadius: '8px',
                  cursor: 'pointer'
                })}
              >
                Cancel
              </button>
              <button 
                onClick={confirmGoal}
                disabled={showGoalModal === 'us' && !goalPlayerId}
                className={css({
                  flex: 1,
                  padding: '0.75rem',
                  background: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  '&:disabled': { opacity: 0.5 }
                })}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, onIncrement, onDecrement, color, animate }: { 
  label: string; 
  value: number; 
  onIncrement: () => void; 
  onDecrement: () => void;
  color?: string;
  animate?: boolean;
}) {
  return (
    <div className={statRowStyle}>
      <div className={statLabelStyle}>{label}</div>
      <div className={statControlStyle}>
        <button onClick={onDecrement} className={cx(miniButtonStyle, minusBtnStyle)}>
          −
        </button>
        <AnimatedValue value={value} className={statValueStyle} color={color} animate={animate} />
        <button onClick={onIncrement} className={cx(miniButtonStyle, plusBtnStyle)}>
          +
        </button>
      </div>
    </div>
  );
}


function StatRowReadOnly({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className={statRowStyle}>
      <div className={statLabelStyle}>{label}</div>
      <div className={css({ fontSize: '1.5rem', fontWeight: '700', textAlign: 'center', color })}>{value}</div>
    </div>
  );
}

function AnimatedValue({ value, className, color, animate = true }: { value: number; className?: string; color?: string; animate?: boolean }) {
  const [isAnimating, setIsAnimating] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (animate && value > prevValue.current) {
      // Wrap in timeout to avoid synchronous setState in effect
      setTimeout(() => setIsAnimating(true), 0);
      const timer = setTimeout(() => setIsAnimating(false), 400);
      return () => clearTimeout(timer);
    }
    prevValue.current = value;
  }, [value, animate]);

  return (
    <div 
      className={className} 
      style={{ 
        color,
        animation: isAnimating ? 'excited-bounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none',
        display: 'inline-block'
      }}
    >
      {value}
    </div>
  );
}

export default StatTracker;
