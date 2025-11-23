'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { css, cx } from '@styled-system/css';

const menuItems = [
    { href: '/', label: 'Home' },
    { href: '/tools/next-game', label: 'Next Game' },
    { href: '/tools/knee-rehab', label: 'Knee Rehab' },
    { href: '/tools/stat-recording', label: 'Stat Recording' },
    { href: '/admin', label: 'Admin' },
];

const hamburgerButtonStyle = css({
    position: 'fixed',
    top: '1.5rem',
    right: '1.5rem',
    zIndex: 50,
    width: '3rem',
    height: '3rem',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.375rem',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    tapHighlightColor: 'transparent',
    '&:focus': {
        outline: '2px solid #58a6ff',
        outlineOffset: '2px',
    },
});

const barStyle = css({
    width: '2rem',
    height: '0.125rem',
    backgroundColor: 'white',
    display: 'block',
});

const menuOverlayStyle = css({
    position: 'fixed',
    inset: 0,
    zIndex: 40,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(10px) saturate(180%)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
});

const menuListStyle = css({
    listStyle: 'none',
    padding: 0,
    margin: 0,
    textAlign: 'center',
});

const menuItemStyle = css({
    margin: '1.5rem 0',
});

const menuLinkStyle = css({
    fontSize: '2rem',
    fontWeight: '300',
    color: 'white',
    textDecoration: 'none',
    transition: 'color 0.2s ease',
    position: 'relative',
    display: 'inline-block',
    padding: '0.5rem 1rem',
    WebkitTapHighlightColor: 'transparent',
    tapHighlightColor: 'transparent',
    '&:hover': {
        color: '#58a6ff',
    },
    md: {
        fontSize: '2.5rem',
    },
});

const underlineStyle = css({
    position: 'absolute',
    bottom: 0,
    left: '50%',
    width: 0,
    height: '1px',
    backgroundColor: '#58a6ff',
    transition: 'all 0.3s ease',
    transform: 'translateX(-50%)',
    'a:hover &': {
        width: '100%',
    },
});

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
                className={cx('hamburger-menu-button', hamburgerButtonStyle)}
                aria-label={isOpen ? "Close menu" : "Open menu"}
                aria-expanded={isOpen}
                aria-controls="main-navigation"
            >
                <motion.span
                    animate={isOpen ? { rotate: 45, y: 8 } : { rotate: 0, y: 0 }}
                    className={cx('menu-bar', barStyle)}
                    transition={{ duration: 0.15 }}
                />
                <motion.span
                    animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
                    className={cx('menu-bar', barStyle)}
                    transition={{ duration: 0.15 }}
                />
                <motion.span
                    animate={isOpen ? { rotate: -45, y: -8 } : { rotate: 0, y: 0 }}
                    className={cx('menu-bar', barStyle)}
                    transition={{ duration: 0.15 }}
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
                        transition={{ duration: 0.2 }}
                        className={cx('hamburger-menu-overlay', menuOverlayStyle)}
                    >
                        <motion.ul
                            className={cx('menu-list', menuListStyle)}
                            initial="closed"
                            animate="open"
                            exit="closed"
                            variants={{
                                open: {
                                    transition: { staggerChildren: 0.05, delayChildren: 0.1 }
                                },
                                closed: {
                                    transition: { staggerChildren: 0.03, staggerDirection: -1 }
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
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                    className={cx('menu-item', menuItemStyle)}
                                >
                                    <Link
                                        href={item.href}
                                        onClick={toggleMenu}
                                        className={cx('menu-link', menuLinkStyle)}
                                    >
                                        {item.label}
                                        <span className={cx('menu-underline', underlineStyle)} />
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
