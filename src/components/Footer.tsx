'use client';

import Link from 'next/link';
import Image from 'next/image';
import { css } from '@styled-system/css';

export default function Footer() {
    return (
        <footer className={footerStyle}>
            <Link href="/" className={logoLinkStyle} aria-label="Return to homepage">
                <Image
                    src="/logo_rossi_steet_transparent.png"
                    alt="iamrossi logo"
                    width={200}
                    height={60}
                    className={logoImageStyle}
                    priority={false}
                />
            </Link>
        </footer>
    );
}

const footerStyle = css({
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: '2rem',
    paddingLeft: '1.5rem',
    paddingRight: '1.5rem',
    paddingBottom: { 
        base: 'max(3rem, calc(3rem + env(safe-area-inset-bottom, 0px)))', 
        md: '2rem' 
    }, // Extra bottom padding on mobile for browser "chin" and safe area
    background: '#000000',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
});

const logoLinkStyle = css({
    display: 'block',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    
    '&:hover': {
        transform: 'scale(1.05)',
        opacity: 0.8,
    },
});

const logoImageStyle = css({
    filter: 'invert(1)',
    width: 'auto',
    height: { base: '40px', md: '50px' },
    maxWidth: '200px',
});
