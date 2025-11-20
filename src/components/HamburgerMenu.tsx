'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './HamburgerMenu.module.css';

const menuItems = [
    { href: '/', label: 'Home' },
    { href: '/tools/next-game', label: 'Next Game' },
    { href: '/tools/knee-rehab', label: 'Knee Rehab' },
    { href: '/tools/stat-recording', label: 'Stat Recording' },
    { href: '/admin', label: 'Admin' },
];

export default function HamburgerMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const navRef = useRef<HTMLElement>(null);

    const toggleMenu = () => setIsOpen(!isOpen);

    // Prevent scrolling when menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Handle Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
                buttonRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    // Focus trap (simple version)
    useEffect(() => {
        if (isOpen && navRef.current) {
            const links = navRef.current.querySelectorAll('a');
            if (links.length > 0) {
                (links[0] as HTMLElement).focus();
            }
        }
    }, [isOpen]);

    return (
        <>
            <button
                ref={buttonRef}
                onClick={toggleMenu}
                className={styles.hamburgerButton}
                aria-label={isOpen ? "Close menu" : "Open menu"}
                aria-expanded={isOpen}
                aria-controls="main-navigation"
            >
                <motion.span
                    animate={isOpen ? { rotate: 45, y: 8 } : { rotate: 0, y: 0 }}
                    className={styles.bar}
                    transition={{ duration: 0.3 }}
                />
                <motion.span
                    animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
                    className={styles.bar}
                    transition={{ duration: 0.3 }}
                />
                <motion.span
                    animate={isOpen ? { rotate: -45, y: -8 } : { rotate: 0, y: 0 }}
                    className={styles.bar}
                    transition={{ duration: 0.3 }}
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.nav
                        id="main-navigation"
                        ref={navRef}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className={styles.menuOverlay}
                    >
                        <motion.ul
                            className={styles.menuList}
                            initial="closed"
                            animate="open"
                            exit="closed"
                            variants={{
                                open: {
                                    transition: { staggerChildren: 0.1, delayChildren: 0.2 }
                                },
                                closed: {
                                    transition: { staggerChildren: 0.05, staggerDirection: -1 }
                                }
                            }}
                        >
                            {menuItems.map((item) => (
                                <motion.li
                                    key={item.href}
                                    variants={{
                                        open: { y: 0, opacity: 1 },
                                        closed: { y: 20, opacity: 0 }
                                    }}
                                    transition={{ duration: 0.4, ease: "easeOut" }}
                                    className={styles.menuItem}
                                >
                                    <Link
                                        href={item.href}
                                        onClick={toggleMenu}
                                        className={styles.menuLink}
                                    >
                                        {item.label}
                                        <span className={styles.underline} />
                                    </Link>
                                </motion.li>
                            ))}
                        </motion.ul>
                    </motion.nav>
                )}
            </AnimatePresence>
        </>
    );
}
