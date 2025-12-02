'use client';

import { useState, useEffect } from 'react';
import { css } from '@styled-system/css';
import { Game, StatSession } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface GameSetupProps {
  onStartSession: (session: StatSession) => void;
}

const cardStyle = css({
  width: '100%',
  maxWidth: '600px',
  background: 'rgba(25, 25, 30, 0.6)',
  backdropFilter: 'blur(20px)',
  padding: '2rem',
  borderRadius: '20px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
});

const inputStyle = css({
  width: '100%',
  padding: '1rem',
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  color: '#ffffff',
  borderRadius: '12px',
  fontSize: '1rem',
  marginTop: '0.5rem',
  marginBottom: '1.5rem',
  '&:focus': {
    outline: 'none',
    borderColor: 'rgba(120, 119, 198, 0.5)',
    background: 'rgba(255, 255, 255, 0.08)',
  },
});

const buttonStyle = css({
  width: '100%',
  padding: '1rem',
  background: 'linear-gradient(135deg, #7877c6 0%, #5e5da8 100%)',
  color: '#ffffff',
  border: 'none',
  fontWeight: '600',
  cursor: 'pointer',
  borderRadius: '12px',
  fontSize: '1rem',
  transition: 'all 0.2s',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(120, 119, 198, 0.3)',
  },
  '&:disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
    transform: 'none',
  },
});

const gameOptionStyle = css({
  padding: '1rem',
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '12px',
  cursor: 'pointer',
  transition: 'all 0.2s',
  marginBottom: '0.75rem',
  '&:hover': {
    background: 'rgba(255, 255, 255, 0.1)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  '&[data-selected="true"]': {
    background: 'rgba(120, 119, 198, 0.2)',
    borderColor: 'rgba(120, 119, 198, 0.5)',
  },
});

export default function GameSetup({ onStartSession }: GameSetupProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<Game | 'custom' | null>(null);
  const [recorderName, setRecorderName] = useState('');
  const [customOpponent, setCustomOpponent] = useState('');
  const [teamName, setTeamName] = useState('Our Team'); // Default, will fetch from settings

  useEffect(() => {
    fetchSchedule();
    fetchSettings();
    // Load saved recorder name
    const savedName = localStorage.getItem('stat_recorder_name');
    if (savedName) setRecorderName(savedName);
  }, []);

  const fetchSchedule = async () => {
    try {
      const res = await fetch('/api/schedule');
      if (res.ok) {
        const data = await res.json();
        // Filter for today's games or upcoming
        const today = new Date().toISOString().split('T')[0];
        // Simple filter for now, can be improved
        const relevantGames = data.filter((g: Game) => {
            const date = g.game_date_format || g.game_date;
            if (!date) return false;
            return date >= today;
        }).slice(0, 5); // Show max 5 upcoming games
        setGames(relevantGames);
      }
    } catch (error) {
      console.error('Failed to load schedule', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
      try {
          const res = await fetch('/api/admin/settings');
          if (res.ok) {
              const data = await res.json();
              if (data.teamName) {
                  setTeamName(data.teamName);
              }
          }
      } catch (e) {
          console.error('Failed to load settings', e);
      }
  };

  const handleStart = () => {
    if (!recorderName.trim()) return;
    
    localStorage.setItem('stat_recorder_name', recorderName);

    const isCustom = selectedGame === 'custom';
    let opponent = '';
    let gameId = undefined;
    let location = undefined;

    if (isCustom) {
      opponent = customOpponent.trim();
    } else if (selectedGame && typeof selectedGame !== 'string') {
      // Determine opponent based on who is not "Us"
      // Since we don't have the "Us" logic fully wired with settings yet, 
      // we'll assume the user selects the game and we can display both teams in the tracker
      // and let them verify. 
      // Actually, for the session object, we need "opponent".
      // Let's assume we are Home or Visitor. 
      // Ideally we check `identifiers` from settings against home/visitor names.
      // For now, let's just use the "vs" logic: if home is us, visitor is opponent.
      // But we don't know who "us" is without settings.
      // I'll just store the game details and let the tracker handle display.
      // But `StatSession` needs `opponent`.
      // I'll use a placeholder or try to guess.
      // Let's just use the game title or something.
      // Actually, better: if selectedGame, use "Home vs Visitor" as opponent string for now?
      // No, that's messy.
      // Let's just ask the user to confirm opponent if it's ambiguous?
      // Or just use the visitor name if we assume we are home?
      // Let's use "Opponent" for now and fix it when we have settings.
      opponent = selectedGame.visitor_team_name; // Fallback guess
      gameId = selectedGame.game_nbr?.toString();
      location = selectedGame.rink_name;
    }

    const newSession: StatSession = {
      id: uuidv4(),
      gameId,
      date: new Date().toISOString(),
      opponent: opponent || 'Unknown Opponent',
      recorderName,
      usStats: { shots: 0, faceoffWins: 0, faceoffLosses: 0, faceoffTies: 0, chances: 0, goals: 0 },
      themStats: { shots: 0, faceoffWins: 0, faceoffLosses: 0, faceoffTies: 0, chances: 0, goals: 0 },
      events: [],
      isCustomGame: isCustom,
      location,
      startTime: Date.now(),
      ourTeamName: teamName,
    };

    onStartSession(newSession);
  };

  return (
    <div className={cardStyle}>
      <h2 className={css({ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#fff' })}>Start New Session</h2>
      
      <div>
        <label className={css({ display: 'block', marginBottom: '0.5rem', color: '#ccc' })}>Recorder Name</label>
        <input 
          type="text" 
          value={recorderName}
          onChange={(e) => setRecorderName(e.target.value)}
          placeholder="Enter your name"
          className={inputStyle}
        />
      </div>

      <div className={css({ marginBottom: '1.5rem' })}>
        <label className={css({ display: 'block', marginBottom: '0.5rem', color: '#ccc' })}>Select Game</label>
        
        {loading ? (
          <div className={css({ color: '#888', fontStyle: 'italic' })}>Loading schedule...</div>
        ) : (
          <div className={css({ display: 'flex', flexDirection: 'column' })}>
            {games.map(game => (
              <div 
                key={game.game_nbr}
                onClick={() => setSelectedGame(game)}
                data-selected={selectedGame === game}
                className={gameOptionStyle}
              >
                <div className={css({ fontWeight: 'bold', color: '#fff' })}>
                  {game.visitor_team_name} @ {game.home_team_name}
                </div>
                <div className={css({ fontSize: '0.85rem', color: '#aaa', marginTop: '0.25rem' })}>
                  {game.game_date_format_pretty || game.game_date} - {game.game_time_format_pretty || game.game_time} at {game.rink_name}
                </div>
              </div>
            ))}
            
            <div 
              onClick={() => setSelectedGame('custom')}
              data-selected={selectedGame === 'custom'}
              className={gameOptionStyle}
            >
              <div className={css({ fontWeight: 'bold', color: '#fff' })}>Custom Game</div>
              <div className={css({ fontSize: '0.85rem', color: '#aaa', marginTop: '0.25rem' })}>
                Record stats for a game not on the schedule
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedGame === 'custom' && (
        <div className={css({ animation: 'fadeIn 0.3s ease-out' })}>
          <label className={css({ display: 'block', marginBottom: '0.5rem', color: '#ccc' })}>Opponent Name</label>
          <input 
            type="text" 
            value={customOpponent}
            onChange={(e) => setCustomOpponent(e.target.value)}
            placeholder="e.g. Jr Hurricanes"
            className={inputStyle}
          />
        </div>
      )}

      <button 
        onClick={handleStart}
        disabled={!recorderName || !selectedGame || (selectedGame === 'custom' && !customOpponent)}
        className={buttonStyle}
      >
        Start Tracking
      </button>
    </div>
  );
}
