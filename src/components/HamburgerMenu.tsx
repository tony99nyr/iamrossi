'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function HamburgerMenu() {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    return (
        <div className="hamburger-menu-container">
            <button onClick={toggleMenu} className="hamburger-button" aria-label="Toggle menu">
                <div className={`bar ${isOpen ? 'open' : ''}`}></div>
                <div className={`bar ${isOpen ? 'open' : ''}`}></div>
                <div className={`bar ${isOpen ? 'open' : ''}`}></div>
            </button>
            {isOpen && (
                <nav className="menu-dropdown">
                    <ul>
                        <li>
                            <Link href="/" onClick={toggleMenu}>
                                Home
                            </Link>
                        </li>
                        <li>
                            <Link href="/tools/next-game" onClick={toggleMenu}>
                                Next Game
                            </Link>
                        </li>
                        <li>
                            <Link href="/tools/knee-rehab" onClick={toggleMenu}>
                                Knee Rehab
                            </Link>
                        </li>
                        <li>
                            <Link href="/tools/stat-recording" onClick={toggleMenu}>
                                Stat Recording
                            </Link>
                        </li>
                        <li>
                            <Link href="/admin" onClick={toggleMenu}>
                                Admin
                            </Link>
                        </li>
                    </ul>
                </nav>
            )}
            <style jsx>{`
                .hamburger-menu-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 1000;
                }
                .hamburger-button {
                    background: none;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-around;
                    width: 30px;
                    height: 25px;
                    padding: 0;
                }
                .bar {
                    width: 100%;
                    height: 3px;
                    background-color: #333;
                    transition: all 0.3s ease;
                }
                .bar.open:nth-child(1) {
                    transform: rotate(45deg) translate(5px, 5px);
                }
                .bar.open:nth-child(2) {
                    opacity: 0;
                }
                .bar.open:nth-child(3) {
                    transform: rotate(-45deg) translate(5px, -5px);
                }
                .menu-dropdown {
                    position: absolute;
                    top: 40px;
                    right: 0;
                    background-color: white;
                    border: 1px solid #ccc;
                    border-radius: 5px;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                    width: 200px;
                }
                ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                li {
                    border-bottom: 1px solid #eee;
                }
                li:last-child {
                    border-bottom: none;
                }
                li :global(a) {
                    display: block;
                    padding: 10px 15px;
                    text-decoration: none;
                    color: #333;
                }
                li :global(a):hover {
                    background-color: #f0f0f0;
                }
            `}</style>
        </div>
    );
}
