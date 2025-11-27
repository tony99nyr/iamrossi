import { css, cx } from '@styled-system/css';

const socialLinksContainerStyle = css({
    textAlign: 'center',
    marginBottom: '3rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    alignItems: 'center',
});

const linkStyle = css({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    borderRadius: '100px',
    textDecoration: 'none',
    fontSize: '0.9rem',
    fontWeight: '600',
    transition: 'all 0.2s ease',
});

const youtubeLinkStyle = css({
    background: 'rgba(255, 0, 0, 0.1)',
    border: '1px solid rgba(255, 0, 0, 0.2)',
    color: '#ff4444',
    '&:hover': {
        background: 'rgba(255, 0, 0, 0.2)',
        transform: 'translateY(-1px)',
    },
});

const instagramLinkStyle = css({
    background: 'rgba(225, 48, 108, 0.1)',
    border: '1px solid rgba(225, 48, 108, 0.2)',
    color: '#e1306c',
    '&:hover': {
        background: 'rgba(225, 48, 108, 0.2)',
        transform: 'translateY(-1px)',
    },
});

export default function SocialLinks() {
    return (
        <div className={socialLinksContainerStyle}>
            <a 
                href="https://www.youtube.com/@2015JuniorCanes" 
                target="_blank" 
                rel="noopener noreferrer"
                className={cx('youtube-link', linkStyle, youtubeLinkStyle)}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/>
                </svg>
                Visit YouTube Channel
            </a>
            
            <a 
                href="https://www.instagram.com/juniorcanes10ublack/" 
                target="_blank" 
                rel="noopener noreferrer"
                className={cx('instagram-link', linkStyle, instagramLinkStyle)}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                Follow on Instagram
            </a>
        </div>
    );
}
