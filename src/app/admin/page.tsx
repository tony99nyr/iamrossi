'use client';

import { useState } from 'react';
import styles from './page.module.css';

export default function AdminPage() {
    const [token, setToken] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // Simple mock check for now
        if (token === 'secret-token') {
            setIsAuthenticated(true);
        } else {
            alert('Invalid token');
        }
    };

    if (!isAuthenticated) {
        return (
            <div className={styles.container}>
                <form onSubmit={handleLogin} className={styles.form}>
                    <h1>Admin Access</h1>
                    <input
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="Enter secret token"
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
            <main className={styles.main}>
                <h1>Admin Dashboard</h1>
                <p>Welcome, Admin.</p>
                <div className={styles.section}>
                    <h2>Team Settings</h2>
                    <p>Manage team roster and IDs here.</p>
                    {/* Future functionality placeholders */}
                    <div className={styles.placeholder}>
                        <label>MyHockeyRankings Team ID:</label>
                        <input type="text" className={styles.input} placeholder="Enter ID" />
                    </div>
                </div>
            </main>
        </div>
    );
}
