'use client';

import { useState, useEffect, useRef } from 'react';
import { css, cx } from '@styled-system/css';
import { StatSession, TeamStats, GameEvent, Player } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface StatTrackerProps {
  session: StatSession;
  onFinish: () => void;
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

const goalButtonStyle = css({
  width: '100%',
  padding: '0.75rem',
  background: 'linear-gradient(135deg, #ff8a65 0%, #e64a19 100%)',
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

// ... (keep modal styles)

export default function StatTracker({ session, onFinish, onExit }: StatTrackerProps) {
  // ... (keep state and logic)

  return (
    <div className={trackerContainerStyle}>
      <div className={mainGridStyle}>
        {/* Us Column */}
        <div className={teamColumnStyle}>
          <div className={teamHeaderStyle}>
            <div className={teamNameStyle}>Our Team</div>
            <div className={scoreStyle} style={{ color: '#a5a4ff' }}>{currentSession.usStats.goals}</div>
          </div>
          
          <button onClick={() => handleGoal('us')} className={goalButtonStyle}>
            GOAL!
          </button>

          <StatRow 
            label="Shots" 
            value={currentSession.usStats.shots} 
            onIncrement={() => updateStat('us', 'shots', 1)}
            onDecrement={() => updateStat('us', 'shots', -1)}
            color="#a5a4ff"
          />
          <StatRow 
            label="Faceoffs" 
            value={currentSession.usStats.faceoffs} 
            onIncrement={() => updateStat('us', 'faceoffs', 1)}
            onDecrement={() => updateStat('us', 'faceoffs', -1)}
            color="#a5a4ff"
          />
          <StatRow 
            label="Chances" 
            value={currentSession.usStats.chances} 
            onIncrement={() => updateStat('us', 'chances', 1)}
            onDecrement={() => updateStat('us', 'chances', -1)}
            color="#a5a4ff"
          />
        </div>

        {/* Them Column */}
        <div className={teamColumnStyle}>
          <div className={teamHeaderStyle}>
            <div className={teamNameStyle}>{currentSession.opponent}</div>
            <div className={scoreStyle} style={{ color: '#ff8a65' }}>{currentSession.themStats.goals}</div>
          </div>
          
          <button onClick={() => handleGoal('them')} className={goalButtonStyle}>
            GOAL!
          </button>

          <StatRow 
            label="Shots" 
            value={currentSession.themStats.shots} 
            onIncrement={() => updateStat('them', 'shots', 1)}
            onDecrement={() => updateStat('them', 'shots', -1)}
            color="#ff8a65"
          />
          <StatRow 
            label="Faceoffs" 
            value={currentSession.themStats.faceoffs} 
            onIncrement={() => updateStat('them', 'faceoffs', 1)}
            onDecrement={() => updateStat('them', 'faceoffs', -1)}
            color="#ff8a65"
          />
          <StatRow 
            label="Chances" 
            value={currentSession.themStats.chances} 
            onIncrement={() => updateStat('them', 'chances', 1)}
            onDecrement={() => updateStat('them', 'chances', -1)}
            color="#ff8a65"
          />
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
            <div key={event.id} className={css({ fontSize: '0.85rem', color: '#ccc', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' })}>
              <span className={css({ color: '#666', marginRight: '0.5rem', fontSize: '0.75rem' })}>
                {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {event.type === 'goal' ? (
                <span className={css({ color: event.team === 'us' ? '#a5a4ff' : '#ff8a65', fontWeight: 'bold' })}>
                  GOAL ({event.team === 'us' ? 'Us' : 'Them'}) {event.playerName ? `- ${event.playerName}` : ''}
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
          {saving ? 'Saving...' : 'Finish Game'}
        </button>
      </div>

      {/* Goal Modal (keep existing) */}
      {showGoalModal && (
        <div className={modalOverlayStyle}>
          {/* ... (keep modal content) */}
          <div className={modalContentStyle}>
            <h3 className={css({ fontSize: '1.25rem', marginBottom: '1rem', color: 'white' })}>
              Record Goal
            </h3>
            
            {showGoalModal === 'us' && (
              <div className={css({ marginBottom: '1rem' })}>
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

function StatRow({ label, value, onIncrement, onDecrement, color }: { 
  label: string; 
  value: number; 
  onIncrement: () => void; 
  onDecrement: () => void;
  color?: string;
}) {
  return (
    <div className={statRowStyle}>
      <div className={statLabelStyle}>{label}</div>
      <div className={statControlStyle}>
        <button onClick={onDecrement} className={cx(miniButtonStyle, minusBtnStyle)}>
          −
        </button>
        <div className={statValueStyle} style={{ color }}>{value}</div>
        <button onClick={onIncrement} className={cx(miniButtonStyle, plusBtnStyle)}>
          +
        </button>
      </div>
    </div>
  );
}

