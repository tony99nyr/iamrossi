'use client';

import { useState, useEffect } from 'react';
import { css, cx } from '@styled-system/css';

const containerStyle = css({
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '3rem 2rem',
    background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0f0f0f 100%)',
    color: '#ffffff',
    position: 'relative',
    overflowX: 'hidden',
    '&::before': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255, 138, 101, 0.1) 0%, transparent 50%)',
        pointerEvents: 'none',
    },
    sm: {
        padding: '2rem 1rem',
    },
});

const titleStyle = css({
    fontSize: '3rem',
    marginBottom: '3rem',
    textAlign: 'center',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #ffffff 0%, #7877c6 50%, #ff8a65 100%)',
    backgroundClip: 'text',
    color: 'transparent',
    letterSpacing: '-0.03em',
    position: 'relative',
    zIndex: 1,
    sm: {
        fontSize: '2rem',
        marginBottom: '2rem',
    },
});

const formStyle = css({
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    background: 'rgba(25, 25, 30, 0.8)',
    backdropFilter: 'blur(20px)',
    padding: '3rem 2.5rem',
    borderRadius: '20px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    position: 'relative',
    zIndex: 1,
    animation: 'fadeIn 0.5s ease-out',
    sm: {
        padding: '2.5rem 2rem',
    },
});

const mainStyle = css({
    width: '100%',
    maxWidth: '900px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
    position: 'relative',
    zIndex: 1,
    animation: 'fadeIn 0.5s ease-out',
});

const inputStyle = css({
    padding: '1rem 1.25rem',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
    fontFamily: 'inherit',
    borderRadius: '12px',
    fontSize: '1rem',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    '&::placeholder': {
        color: 'rgba(255, 255, 255, 0.4)',
    },
    '&:focus': {
        outline: 'none',
        borderColor: 'rgba(120, 119, 198, 0.5)',
        background: 'rgba(255, 255, 255, 0.08)',
        boxShadow: '0 0 0 3px rgba(120, 119, 198, 0.1)',
    },
    '&:hover:not(:focus)': {
        borderColor: 'rgba(255, 255, 255, 0.2)',
        background: 'rgba(255, 255, 255, 0.07)',
    },
});

const buttonStyle = css({
    padding: '1rem 1.5rem',
    background: 'linear-gradient(135deg, #7877c6 0%, #5e5da8 100%)',
    color: '#ffffff',
    border: 'none',
    fontFamily: 'inherit',
    fontWeight: '600',
    cursor: 'pointer',
    borderRadius: '12px',
    fontSize: '1rem',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 12px rgba(120, 119, 198, 0.3)',
    '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: '0 6px 20px rgba(120, 119, 198, 0.4)',
        background: 'linear-gradient(135deg, #8887d7 0%, #6f6eb9 100%)',
    },
    '&:active': {
        transform: 'translateY(0)',
    },
});

const sectionStyle = css({
    background: 'rgba(25, 25, 30, 0.6)',
    backdropFilter: 'blur(20px)',
    padding: '2.5rem',
    borderRadius: '20px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': {
        borderColor: 'rgba(255, 255, 255, 0.15)',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
    },
    '& h2': {
        fontSize: '1.5rem',
        marginBottom: '2rem',
        color: '#ffffff',
        fontWeight: '700',
        letterSpacing: '-0.02em',
        paddingBottom: '1rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },
    sm: {
        padding: '2rem 1.5rem',
    },
});

const fieldStyle = css({
    marginBottom: '1.5rem',
    '& label': {
        display: 'block',
        marginBottom: '0.75rem',
        fontSize: '0.9rem',
        color: 'rgba(255, 255, 255, 0.8)',
        fontWeight: '600',
        letterSpacing: '0.02em',
    },
});

const syncButtonStyle = css({
    width: '100%',
    padding: '1.25rem',
    background: 'linear-gradient(135deg, #7877c6 0%, #5e5da8 100%)',
    color: '#ffffff',
    border: 'none',
    fontFamily: 'inherit',
    fontWeight: '600',
    cursor: 'pointer',
    borderRadius: '12px',
    fontSize: '1rem',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    marginTop: '1.5rem',
    boxShadow: '0 4px 12px rgba(120, 119, 198, 0.3)',
    '&:hover:not(:disabled)': {
        transform: 'translateY(-2px)',
        boxShadow: '0 6px 20px rgba(120, 119, 198, 0.4)',
        background: 'linear-gradient(135deg, #8887d7 0%, #6f6eb9 100%)',
    },
    '&:active:not(:disabled)': {
        transform: 'translateY(0)',
    },
    '&:disabled': {
        opacity: 0.5,
        cursor: 'not-allowed',
        transform: 'none',
    },
});

const messageStyle = css({
    marginTop: '1.5rem',
    fontSize: '0.95rem',
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    padding: '1rem',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    animation: 'slideIn 0.3s ease-out',
});

const placeholderStyle = css({
    marginTop: '1rem',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '0.95rem',
});

export default function AdminPage() {
    const [secret, setSecret] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [gameCount, setGameCount] = useState<number | null>(null);
    const [teamName, setTeamName] = useState('');
    const [identifiers, setIdentifiers] = useState('');
    const [teamLogo, setTeamLogo] = useState('');
    const [mhrTeamId, setMhrTeamId] = useState('');
    const [mhrYear, setMhrYear] = useState('');
    const [settingsMessage, setSettingsMessage] = useState('');

    useEffect(() => {
        const auth = sessionStorage.getItem('admin_auth');
        if (auth === 'true') {
            setIsAuthenticated(true);
            fetchSettings();
        }
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings');
            if (res.ok) {
                const data = await res.json();
                setTeamName(data.teamName || '');
                setIdentifiers(Array.isArray(data.identifiers) ? data.identifiers.join(', ') : '');
                setTeamLogo(data.teamLogo || '');
                setMhrTeamId(data.mhrTeamId || '');
                setMhrYear(data.mhrYear || '');
            }
        } catch (error) {
            console.error('Failed to fetch settings', error);
        }
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (secret === 'secret-token') {
            setIsAuthenticated(true);
            sessionStorage.setItem('admin_auth', 'true');
            fetchSettings();
        } else {
            alert('Invalid token');
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSettingsMessage('Saving...');
        try {
            const idList = identifiers.split(',').map(s => s.trim()).filter(Boolean);
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    teamName, 
                    identifiers: idList, 
                    teamLogo,
                    mhrTeamId,
                    mhrYear
                }),
            });
            if (res.ok) {
                setSettingsMessage('Settings saved successfully!');
            } else {
                setSettingsMessage('Failed to save settings.');
            }
        } catch (error) {
            setSettingsMessage('Error saving settings.');
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncMessage('Syncing calendar... this may take a moment...');
        setGameCount(null);
        try {
            const res = await fetch('/api/admin/sync-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (res.ok) {
                setSyncMessage(`Success: ${data.message}`);
                setGameCount(data.count || null);
            } else {
                setSyncMessage(`Error: ${data.error || 'Unknown error'}`);
                if (data.details) {
                    console.error('Sync error details:', data.details);
                }
            }
        } catch (error) {
            setSyncMessage('Error: Failed to connect to server');
        } finally {
            setIsSyncing(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className={cx('admin-page', containerStyle)}>
                <div className={loginBoxStyle}>
                    <h1 className={headerStyle}>Admin Access</h1>
                    <form onSubmit={handleLogin} className={formStyle}>
                        <input
                            type="password"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            placeholder="Enter Secret Token"
                            className={inputStyle}
                        />
                        <button type="submit" className={buttonStyle}>Login</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className={cx('admin-page', containerStyle)}>
            <div className={dashboardStyle}>
                <div className={headerRowStyle}>
                    <h1 className={headerStyle}>Admin Dashboard</h1>
                    <button onClick={() => {
                        setIsAuthenticated(false);
                        sessionStorage.removeItem('admin_auth');
                    }} className={logoutButtonStyle}>Logout</button>
                </div>

                <div className={cardStyle}>
                    <h2>Team Configuration</h2>
                    <p className={descriptionStyle}>Configure your team name and identifiers for schedule parsing.</p>
                    
                    <form onSubmit={handleSaveSettings} className={formStyle}>
                        <div className={inputGroupStyle}>
                            <label>Team Name (Official)</label>
                            <input
                                type="text"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                className={inputStyle}
                                placeholder="e.g. Carolina Junior Canes (Black) 10U AA"
                            />
                        </div>
                        
                        <div className={inputGroupStyle}>
                            <label>Team Identifiers (comma separated)</label>
                            <input
                                type="text"
                                value={identifiers}
                                onChange={(e) => setIdentifiers(e.target.value)}
                                className={inputStyle}
                                placeholder="e.g. Black, Jr Canes, Carolina"
                            />
                            <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                                Keywords used to identify "Us" in calendar events (e.g. "Black" for 10U Black).
                            </small>
                        </div>

                        <div className={inputGroupStyle}>
                            <label>MHR Team ID</label>
                            <input
                                type="text"
                                value={mhrTeamId}
                                onChange={(e) => setMhrTeamId(e.target.value)}
                                className={inputStyle}
                                placeholder="e.g. 19758"
                            />
                        </div>

                        <div className={inputGroupStyle}>
                            <label>MHR Year</label>
                            <input
                                type="text"
                                value={mhrYear}
                                onChange={(e) => setMhrYear(e.target.value)}
                                className={inputStyle}
                                placeholder="e.g. 2025"
                            />
                        </div>

                        <div className={inputGroupStyle}>
                            <label>Team Logo URL</label>
                            <input
                                type="text"
                                value={teamLogo}
                                onChange={(e) => setTeamLogo(e.target.value)}
                                className={inputStyle}
                                placeholder="https://..."
                            />
                        </div>

                        <button type="submit" className={buttonStyle}>Save Settings</button>
                        {settingsMessage && <p className={messageStyle}>{settingsMessage}</p>}
                    </form>
                </div>

                <div className={cardStyle}>
                    <h2>Calendar Sync</h2>
                    <p className={descriptionStyle}>
                        Sync schedule from Google Calendar. This will fetch the latest events and update the schedule.
                    </p>
                    
                    <div className={syncSectionStyle}>
                        <button 
                            onClick={handleSync} 
                            disabled={isSyncing}
                            className={isSyncing ? disabledButtonStyle : buttonStyle}
                        >
                            {isSyncing ? 'Syncing...' : 'Sync Schedule from Calendar'}
                        </button>
                        
                        {syncMessage && (
                            <div className={messageStyle}>
                                {syncMessage}
                            </div>
                        )}
                        
                        {gameCount !== null && (
                            <div className={statsStyle}>
                                <strong>{gameCount}</strong> games synced successfully
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const loginBoxStyle = css({
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2rem',
    zIndex: 1,
});

const headerStyle = css({
    fontSize: '2.5rem',
    fontWeight: '800',
    background: 'linear-gradient(135deg, #ffffff 0%, #7877c6 50%, #ff8a65 100%)',
    backgroundClip: 'text',
    color: 'transparent',
    letterSpacing: '-0.03em',
    margin: 0,
});

const dashboardStyle = css({
    width: '100%',
    maxWidth: '800px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
    zIndex: 1,
});

const headerRowStyle = css({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    gap: '1rem',
});

const logoutButtonStyle = css({
    padding: '0.5rem 1rem',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    color: '#ffffff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'all 0.2s',
    '&:hover': {
        background: 'rgba(255, 255, 255, 0.2)',
    },
});

const cardStyle = css({
    background: 'rgba(25, 25, 30, 0.6)',
    backdropFilter: 'blur(20px)',
    padding: '2rem',
    borderRadius: '20px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
    '& h2': {
        fontSize: '1.5rem',
        marginBottom: '1rem',
        color: '#ffffff',
        fontWeight: '700',
    },
});

const descriptionStyle = css({
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: '1.5rem',
    lineHeight: '1.5',
});

const inputGroupStyle = css({
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    '& label': {
        fontSize: '0.9rem',
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.8)',
    },
});

const syncSectionStyle = css({
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
});

const disabledButtonStyle = css({
    padding: '1rem 1.5rem',
    background: 'rgba(120, 119, 198, 0.3)',
    color: 'rgba(255, 255, 255, 0.5)',
    border: 'none',
    borderRadius: '12px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'not-allowed',
    width: '100%',
});

const statsStyle = css({
    textAlign: 'center',
    color: 'rgba(120, 119, 198, 0.9)',
    fontSize: '0.95rem',
    marginTop: '0.5rem',
    padding: '0.75rem',
    background: 'rgba(120, 119, 198, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(120, 119, 198, 0.2)',
});
