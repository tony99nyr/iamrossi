import Link from 'next/link';
import Image from 'next/image';
import { css, cx } from '@styled-system/css';

const containerStyle = css({
    minHeight: '100vh',
    padding: '0 2rem',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d1117',
    color: '#c9d1d9',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'",
});

const mainStyle = css({
    maxWidth: '800px',
    width: '100%',
    padding: '2rem',
    border: '1px solid #30363d',
    borderRadius: '6px',
    backgroundColor: '#0d1117',
});

const markdownStyle = css({
    lineHeight: '1.6',
    '& h1': {
        fontSize: '2em',
        borderBottom: '1px solid #21262d',
        paddingBottom: '0.3em',
        marginBottom: '1em',
    },
    '& h2': {
        fontSize: '1.5em',
        borderBottom: '1px solid #21262d',
        paddingBottom: '0.3em',
        marginTop: '1.5em',
        marginBottom: '1em',
    },
    '& ul': {
        paddingLeft: '2em',
        marginBottom: '1em',
    },
    '& li': {
        marginBottom: '0.25em',
    },
    '& a': {
        color: '#58a6ff',
        textDecoration: 'none',
        '&:hover': {
            textDecoration: 'underline',
        },
    },
    '& strong': {
        fontWeight: '600',
    },
});

const logoContainerStyle = css({
    marginBottom: '2em',
    paddingBottom: '1em',
    borderBottom: '1px solid #21262d',
    display: 'flex',
    '& img': {
        maxWidth: '100%',
        height: 'auto',
    },
});

export default function Home() {
    return (
        <div className={cx('home-page-container', containerStyle)}>
            <main className={cx('home-page-main', mainStyle)}>
                <article className={markdownStyle}>
                    <div className={logoContainerStyle}>
                        <Image 
                            src="/logo_rossi_transparent_1763691277543_white.svg" 
                            alt="ROSSI Logo" 
                            width={260}
                            height={100}
                            priority
                            
                        />
                    </div>
                    <p>Use the menu in the top right to navigate to the available tools.</p>

                    <h2>Tools</h2>
                    <ul>
                        <li>
                            <Link href="/tools/next-game">
                                <strong>Next Game</strong>
                            </Link>
                            : Track my son's hockey schedule.
                        </li>
                        <li>
                            <Link href="/tools/knee-rehab">
                                <strong>Knee Rehab</strong>
                            </Link>
                            : Track my rehab progress.
                        </li>
                        <li>
                            <Link href="/tools/stat-recording">
                                <strong>Stat Recording</strong>
                            </Link>
                            : Record hockey stats in real-time.
                        </li>
                    </ul>
                </article>
            </main>
        </div>
    );
}
