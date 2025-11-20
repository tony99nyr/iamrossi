'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function AdminPage() {
    const [secret, setSecret] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [teamId, setTeamId] = useState('19758');
    const [year, setYear] = useState('2025');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');

    useEffect(() => {
        // Check if already authenticated (simple session check)
        const auth = sessionStorage.getItem('admin_auth');
        if (auth === 'true') {
            setIsAuthenticated(true);
            fetchSettings();
        }
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/admin/sync-schedule');
            if (res.ok) {
                const data = await res.json();
                setTeamId(data.teamId || '19758');
                setYear(data.year || '2025');
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

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncMessage('Syncing schedule... this may take a minute...');
        try {
            const res = await fetch('/api/admin/sync-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamId, year }),
            });
            const data = await res.json();
            if (res.ok) {
                setSyncMessage('Success: ' + data.message);
            } else {
                setSyncMessage('Error: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            setSyncMessage('Error: Failed to connect to server');
        } finally {
            setIsSyncing(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className={styles.container}>
                <h1 className={styles.title}>Admin Access</h1>
                <form onSubmit={handleLogin} className={styles.form}>
                    <input
                        type="password"
                        placeholder="Enter Secret Token"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        className={styles.input}
                    />
                    <button type="submit" className={styles.button}>
                        Login
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Admin Dashboard</h1>
            
            <div className={styles.main}>
                <div className={styles.section}>
                    <h2>MyHockeyRankings Settings</h2>
                    <div className={styles.field}>
                        <label>Team ID:</label>
                        <input 
                            type="text" 
                            value={teamId} 
                            onChange={(e) => setTeamId(e.target.value)} 
                            className={styles.input}
                        />
                    </div>
                    <div className={styles.field}>
                        <label>Year:</label>
                        <input 
                            type="text" 
                            value={year} 
                            onChange={(e) => setYear(e.target.value)} 
                            className={styles.input}
                        />
                    </div>
                    <button 
                        onClick={handleSync} 
                        disabled={isSyncing} 
                        className={styles.syncButton}
                    >
                        {isSyncing ? 'Syncing...' : 'Sync Schedule'}
                    </button>
                    {syncMessage && <p className={styles.message}>{syncMessage}</p>}
                </div>

                <div className={styles.section}>
                    <h2>Team Settings</h2>
                    <p className={styles.placeholder}>Placeholder for other team settings.</p>
                </div>
            </div>
        </div>
    );
}
