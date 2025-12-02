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

// const titleStyle = css({
//     fontSize: '3rem',
//     marginBottom: '3rem',
//     textAlign: 'center',
//     fontWeight: '800',
//     background: 'linear-gradient(135deg, #ffffff 0%, #7877c6 50%, #ff8a65 100%)',
//     backgroundClip: 'text',
//     color: 'transparent',
//     letterSpacing: '-0.03em',
//     position: 'relative',
//     zIndex: 1,
//     sm: {
//         fontSize: '2rem',
//         marginBottom: '2rem',
//     },
// });

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

// const mainStyle = css({
//     width: '100%',
//     maxWidth: '900px',
//     display: 'flex',
//     flexDirection: 'column',
//     gap: '2rem',
//     position: 'relative',
//     zIndex: 1,
//     animation: 'fadeIn 0.5s ease-out',
// });

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

// const sectionStyle = css({
//     background: 'rgba(25, 25, 30, 0.6)',
//     backdropFilter: 'blur(20px)',
//     padding: '2.5rem',
//     borderRadius: '20px',
//     border: '1px solid rgba(255, 255, 255, 0.1)',
//     boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
//     transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
//     '&:hover': {
//         borderColor: 'rgba(255, 255, 255, 0.15)',
//         boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
//     },
//     '& h2': {
//         fontSize: '1.5rem',
//         marginBottom: '2rem',
//         color: '#ffffff',
//         fontWeight: '700',
//         letterSpacing: '-0.02em',
//         paddingBottom: '1rem',
//         borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
//     },
//     sm: {
//         padding: '2rem 1.5rem',
//     },
// });

// const fieldStyle = css({
//     marginBottom: '1.5rem',
//     '& label': {
//         display: 'block',
//         marginBottom: '0.75rem',
//         fontSize: '0.9rem',
//         color: 'rgba(255, 255, 255, 0.8)',
//         fontWeight: '600',
//         letterSpacing: '0.02em',
//     },
// });

// const syncButtonStyle = css({
//     width: '100%',
//     padding: '1.25rem',
//     background: 'linear-gradient(135deg, #7877c6 0%, #5e5da8 100%)',
//     color: '#ffffff',
//     border: 'none',
//     fontFamily: 'inherit',
//     fontWeight: '600',
//     cursor: 'pointer',
//     borderRadius: '12px',
//     fontSize: '1rem',
//     transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
//     marginTop: '1.5rem',
//     boxShadow: '0 4px 12px rgba(120, 119, 198, 0.3)',
//     '&:hover:not(:disabled)': {
//         transform: 'translateY(-2px)',
//         boxShadow: '0 6px 20px rgba(120, 119, 198, 0.4)',
//         background: 'linear-gradient(135deg, #8887d7 0%, #6f6eb9 100%)',
//     },
//     '&:active:not(:disabled)': {
//         transform: 'translateY(0)',
//     },
//     '&:disabled': {
//         opacity: 0.5,
//         cursor: 'not-allowed',
//         transform: 'none',
//     },
// });

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

// const placeholderStyle = css({
//     marginTop: '1rem',
//     color: 'rgba(255, 255, 255, 0.5)',
//     fontSize: '0.95rem',
// });

export default function AdminPage() {
    const [secret, setSecret] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [gameCount, setGameCount] = useState<number | null>(null);
    const [teamName, setTeamName] = useState('');
    const [identifiers, setIdentifiers] = useState('');
    const [mhrTeamId, setMhrTeamId] = useState('');
    const [mhrYear, setMhrYear] = useState('');
    const [settingsMessage, setSettingsMessage] = useState('');
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [backupMessage, setBackupMessage] = useState('');
    const [roster, setRoster] = useState<Array<{id: string; jerseyNumber: string; name: string}>>([]);
    const [rosterMessage, setRosterMessage] = useState('');
    const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
    const [newPlayerJersey, setNewPlayerJersey] = useState('');
    const [newPlayerName, setNewPlayerName] = useState('');

    useEffect(() => {
        const auth = sessionStorage.getItem('admin_auth');
        if (auth === 'true') {
            setIsAuthenticated(true);
            fetchSettings();
            fetchRoster();
        }
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/settings');
            if (res.ok) {
                const data = await res.json();
                setTeamName(data.teamName || '');
                setIdentifiers(Array.isArray(data.identifiers) ? data.identifiers.join(', ') : '');
                setMhrTeamId(data.mhrTeamId || '');
                setMhrYear(data.mhrYear || '');
            }
        } catch (_error) {
            console.error('Failed to fetch settings', _error);
        }
    };

    const fetchRoster = async () => {
        try {
            const res = await fetch('/api/admin/roster');
            if (res.ok) {
                const data = await res.json();
                setRoster(data);
            }
        } catch (_error) {
            console.error('Failed to fetch roster', _error);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret }),
            });

            if (res.ok) {
                setIsAuthenticated(true);
                sessionStorage.setItem('admin_auth', 'true');
                sessionStorage.setItem('admin_secret', secret);
                fetchSettings();
                fetchRoster();
            } else {
                alert('Invalid token');
            }
        } catch (error) {
            alert('Authentication failed');
            console.error('Login error:', error);
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSettingsMessage('Saving...');
        try {
            const idList = identifiers.split(',').map(s => s.trim()).filter(Boolean);
            const adminSecret = sessionStorage.getItem('admin_secret');

            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminSecret}`,
                },
                body: JSON.stringify({
                    teamName,
                    identifiers: idList,
                    mhrTeamId,
                    mhrYear
                }),
            });
            if (res.ok) {
                setSettingsMessage('Settings saved successfully!');
            } else {
                const data = await res.json();
                setSettingsMessage(data.error || 'Failed to save settings.');
            }
        } catch {
            setSettingsMessage('Error saving settings.');
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncMessage('Syncing calendar... this may take a moment...');
        setGameCount(null);
        try {
            const adminSecret = sessionStorage.getItem('admin_secret');

            const res = await fetch('/api/admin/sync-schedule', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminSecret}`,
                },
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
        } catch {
            setSyncMessage('Error: Failed to connect to server');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleBackup = async () => {
        setIsBackingUp(true);
        setBackupMessage('Creating backup...');
        try {
            const adminSecret = sessionStorage.getItem('admin_secret');
            
            const res = await fetch('/api/backup', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${adminSecret}`,
                },
            });
            
            const data = await res.json();
            if (res.ok) {
                setBackupMessage(`✅ Backup successful! ${data.stats.exercises} exercises and ${data.stats.entries} entries backed up to Google Drive.`);
            } else {
                setBackupMessage(`❌ Error: ${data.error || 'Backup failed'}`);
            }
        } catch (error) {
            setBackupMessage('❌ Error: Failed to connect to server');
            console.error('Backup error:', error);
        } finally {
            setIsBackingUp(false);
        }
    };

    const saveRosterToBackend = async (updatedRoster: Array<{id: string; jerseyNumber: string; name: string}>) => {
        setRosterMessage('Saving...');
        try {
            const adminSecret = sessionStorage.getItem('admin_secret');
            const res = await fetch('/api/admin/roster', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminSecret}`,
                },
                body: JSON.stringify({ roster: updatedRoster }),
            });

            if (res.ok) {
                setRosterMessage('Saved');
                setTimeout(() => setRosterMessage(''), 2000);
            } else {
                const data = await res.json();
                setRosterMessage(data.error || 'Failed to save roster.');
            }
        } catch {
            setRosterMessage('Error saving roster.');
        }
    };

    const handleAddPlayer = () => {
        if (!newPlayerJersey.trim() || !newPlayerName.trim()) {
            setRosterMessage('Please enter both jersey number and name');
            return;
        }

        const newPlayer = {
            id: Date.now().toString(),
            jerseyNumber: newPlayerJersey.trim(),
            name: newPlayerName.trim(),
        };

        const updatedRoster = [...roster, newPlayer];
        setRoster(updatedRoster);
        setNewPlayerJersey('');
        setNewPlayerName('');
        saveRosterToBackend(updatedRoster);
    };

    const handleDeletePlayer = (id: string) => {
        const updatedRoster = roster.filter(p => p.id !== id);
        setRoster(updatedRoster);
        saveRosterToBackend(updatedRoster);
    };

    const handleEditPlayer = (id: string, field: 'jerseyNumber' | 'name', value: string) => {
        setRoster(roster.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleFinishEditing = () => {
        setEditingPlayerId(null);
        saveRosterToBackend(roster);
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
            <div className={css({ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '2rem', zIndex: 1 })}>
                <div className={headerRowStyle}>
                    <h1 className={headerStyle}>Admin Dashboard</h1>
                    <button onClick={() => {
                        setIsAuthenticated(false);
                        sessionStorage.removeItem('admin_auth');
                        sessionStorage.removeItem('admin_secret');
                    }} className={logoutButtonStyle}>Logout</button>
                </div>

                <div className={cardStyle}>
                    <h2>Team Configuration</h2>
                    <p className={css({ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '1.5rem', lineHeight: '1.5' })}>Configure your team name and identifiers for schedule parsing.</p>
                    
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
                                Keywords used to identify &quot;Us&quot; in calendar events (e.g. &quot;Black&quot; for 10U Black).
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

                        <button type="submit" className={buttonStyle}>Save Settings</button>
                        {settingsMessage && <p className={messageStyle}>{settingsMessage}</p>}
                    </form>
                </div>

                <div className={cardStyle}>
                    <h2>Calendar Sync</h2>
                    <p className={css({ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '1.5rem', lineHeight: '1.5' })}>
                        Sync schedule from Google Calendar. This will fetch the latest events and update the schedule.
                    </p>
                    
                    <div className={css({ display: 'flex', flexDirection: 'column', gap: '1rem' })}>
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

                <div className={cardStyle}>
                    <h2>Database Backup</h2>
                    <p className={css({ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '1.5rem', lineHeight: '1.5' })}>
                        Manually trigger a backup of all rehab data to Google Drive. Backups run automatically daily at 2 AM UTC.
                    </p>
                    
                    <div className={css({ display: 'flex', flexDirection: 'column', gap: '1rem' })}>
                        <button 
                            onClick={handleBackup} 
                            disabled={isBackingUp}
                            className={isBackingUp ? disabledButtonStyle : buttonStyle}
                        >
                            {isBackingUp ? 'Backing up...' : '💾 Backup to Google Drive'}
                        </button>
                        
                        {backupMessage && (
                            <div className={messageStyle}>
                                {backupMessage}
                            </div>
                        )}
                    </div>
                </div>

                <div className={cardStyle}>
                    <h2>Team Roster</h2>
                    <p className={css({ color: 'rgba(255, 255, 255, 0.6)', marginBottom: '1.5rem', lineHeight: '1.5' })}>
                        Manage your team roster with jersey numbers and player names.
                    </p>
                    
                    <div className={css({ display: 'flex', flexDirection: 'column', gap: '1.5rem' })}>
                        {/* Add New Player Form */}
                        <div className={css({ 
                            background: 'rgba(255, 255, 255, 0.03)', 
                            padding: '1.5rem', 
                            borderRadius: '12px',
                            border: '1px solid rgba(255, 255, 255, 0.08)'
                        })}>
                            <h3 className={css({ fontSize: '1.1rem', marginBottom: '1rem', color: '#ffffff' })}>Add New Player</h3>
                            <div className={css({ display: 'flex', gap: '1rem', flexWrap: 'wrap' })}>
                                <input
                                    type="text"
                                    value={newPlayerJersey}
                                    onChange={(e) => setNewPlayerJersey(e.target.value)}
                                    placeholder="Jersey #"
                                    className={cx(inputStyle, css({ flex: '0 0 120px' }))}
                                />
                                <input
                                    type="text"
                                    value={newPlayerName}
                                    onChange={(e) => setNewPlayerName(e.target.value)}
                                    placeholder="Player Name"
                                    className={cx(inputStyle, css({ flex: '1 1 200px' }))}
                                />
                                <button 
                                    onClick={handleAddPlayer}
                                    className={cx(buttonStyle, css({ flex: '0 0 auto' }))}
                                >
                                    Add Player
                                </button>
                            </div>
                        </div>

                        {/* Player List */}
                        {roster.length > 0 ? (
                            <div className={css({ display: 'flex', flexDirection: 'column', gap: '0.75rem' })}>
                                {roster
                                    .sort((a, b) => {
                                        const numA = parseInt(a.jerseyNumber) || 999;
                                        const numB = parseInt(b.jerseyNumber) || 999;
                                        return numA - numB;
                                    })
                                    .map((player) => (
                                    <div 
                                        key={player.id}
                                        className={css({
                                            display: 'flex',
                                            gap: '1rem',
                                            alignItems: 'center',
                                            padding: '1rem',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            borderRadius: '10px',
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            transition: 'all 0.2s',
                                            '&:hover': {
                                                background: 'rgba(255, 255, 255, 0.08)',
                                                borderColor: 'rgba(255, 255, 255, 0.15)',
                                            }
                                        })}
                                    >
                                        {editingPlayerId === player.id ? (
                                            <>
                                                <input
                                                    type="text"
                                                    value={player.jerseyNumber}
                                                    onChange={(e) => handleEditPlayer(player.id, 'jerseyNumber', e.target.value)}
                                                    className={cx(inputStyle, css({ flex: '0 0 100px', padding: '0.5rem 0.75rem' }))}
                                                />
                                                <input
                                                    type="text"
                                                    value={player.name}
                                                    onChange={(e) => handleEditPlayer(player.id, 'name', e.target.value)}
                                                    className={cx(inputStyle, css({ flex: '1', padding: '0.5rem 0.75rem' }))}
                                                />
                                                <button
                                                    onClick={handleFinishEditing}
                                                    className={css({
                                                        padding: '0.5rem 1rem',
                                                        background: 'rgba(120, 119, 198, 0.2)',
                                                        border: '1px solid rgba(120, 119, 198, 0.3)',
                                                        color: '#ffffff',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.85rem',
                                                        transition: 'all 0.2s',
                                                        '&:hover': {
                                                            background: 'rgba(120, 119, 198, 0.3)',
                                                        }
                                                    })}
                                                >
                                                    Done
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <div className={css({ 
                                                    flex: '0 0 60px',
                                                    fontSize: '1.2rem',
                                                    fontWeight: '700',
                                                    color: 'rgba(120, 119, 198, 0.9)',
                                                    textAlign: 'center'
                                                })}>
                                                    #{player.jerseyNumber}
                                                </div>
                                                <div className={css({ flex: '1', fontSize: '1rem', color: '#ffffff' })}>
                                                    {player.name}
                                                </div>
                                                <button
                                                    onClick={() => setEditingPlayerId(player.id)}
                                                    className={css({
                                                        padding: '0.5rem 1rem',
                                                        background: 'rgba(255, 255, 255, 0.1)',
                                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                                        color: '#ffffff',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.85rem',
                                                        transition: 'all 0.2s',
                                                        '&:hover': {
                                                            background: 'rgba(255, 255, 255, 0.15)',
                                                        }
                                                    })}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePlayer(player.id)}
                                                    className={css({
                                                        padding: '0.5rem 1rem',
                                                        background: 'rgba(255, 100, 100, 0.2)',
                                                        border: '1px solid rgba(255, 100, 100, 0.3)',
                                                        color: '#ffffff',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.85rem',
                                                        transition: 'all 0.2s',
                                                        '&:hover': {
                                                            background: 'rgba(255, 100, 100, 0.3)',
                                                        }
                                                    })}
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className={css({ 
                                textAlign: 'center', 
                                color: 'rgba(255, 255, 255, 0.5)', 
                                padding: '2rem',
                                fontStyle: 'italic'
                            })}>
                                No players added yet. Add your first player above.
                            </div>
                        )}

                        {/* Save Button */}


                        {rosterMessage && (
                            <div className={messageStyle}>
                                {rosterMessage}
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
