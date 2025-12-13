import Link from 'next/link';
import Image from 'next/image';
import { AnimatedLogo } from '@/components/AnimatedLogo';
import { css } from '@styled-system/css';
import { getSettings } from '@/lib/kv';

// This page reads from Redis/KV at request time, so it must not be statically prerendered.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
    // Fetch team name from settings
    const settingsData = await getSettings();
    const teamName = settingsData?.teamName || 'Jr Canes 10U Black';

    return (
        <div className={containerStyle}>
            <main className={css({ maxWidth: '900px', margin: '0 auto' })}>
                <div className={css({ display: 'flex', justifyContent: 'center', marginBottom: '3rem' })}>
                    <Image
                        src="/logo_rossi_steet_transparent.png"
                        alt="iamrossi"
                        width={300}
                        height={90}
                        className={css({ filter: 'invert(1)', width: 'auto', height: { base: '50px', md: '70px' }, maxWidth: '300px' })}
                        priority
                    />
                </div>

                <section className={css({ marginBottom: '2rem' })}>
                    <h2 className={sectionHeaderStyle}>Tools</h2>
                    
                    <ul className={toolsListStyle}>
                        <li>
                            <Link href="/tools/next-game" className={toolLinkStyle}>
                                <div className={toolIconStyle}>
                                    <AnimatedLogo />
                                </div>
                                <div className={css({ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 })}>
                                    <strong className={toolNameStyle}>{teamName} - Schedule</strong>
                                    <span className={toolDescStyle}>Schedule and game information</span>
                                </div>
                            </Link>
                        </li>

                         <li>
                            <Link href="/tools/stat-recording" className={toolLinkStyle}>
                                <span className={toolIconStyle}><AnimatedLogo /></span>
                                <div className={css({ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 })}>
                                    <strong className={toolNameStyle}>{teamName} - Game Stats</strong>
                                    <span className={toolDescStyle}>Game statistics recording tool</span>
                                </div>
                            </Link>
                        </li>

                        <li>
                            <Link href="/tools/knee-rehab" className={toolLinkStyle}>
                                <span className={toolIconStyle}>🦵</span>
                                <div className={css({ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 })}>
                                    <strong className={toolNameStyle}>Physical Therapy</strong>
                                    <span className={toolDescStyle}>Knee rehabilitation tracker</span>
                                </div>
                            </Link>
                        </li>

                       
                    </ul>
                </section>

                <section className={css({ marginBottom: '2rem' })}>
                    <h2 className={sectionHeaderStyle}>Games</h2>
                    
                    <ul className={toolsListStyle}>
                        <li>
                            <Link href="/games/fruit-ninja" className={toolLinkStyle}>
                                <span className={toolIconStyle}>🍎</span>
                                <div className={css({ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 })}>
                                    <strong className={toolNameStyle}>Fruit Ninja</strong>
                                    <span className={toolDescStyle}>Slice fruits to score points</span>
                                </div>
                            </Link>
                        </li>
                    </ul>
                </section>
            </main>

            <Link href="/admin" className={settingsCogStyle} aria-label="Admin Settings">
                ⚙️
            </Link>
        </div>
    );
}

const containerStyle = css({
    minHeight: '100vh',
    background: '#0d1117',
    color: '#c9d1d9',
    padding: { base: '2rem 1.5rem', md: '3rem 2rem' },
    position: 'relative',
});



const sectionHeaderStyle = css({
    fontSize: { base: '1.25rem', md: '1.5rem' },
    fontWeight: '600',
    color: '#e6edf3',
    marginBottom: '1rem',
    borderBottom: '1px solid #21262d',
    paddingBottom: '0.5rem',
});

const toolsListStyle = css({
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
});

const toolLinkStyle = css({
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
    padding: '1rem',
    borderRadius: '6px',
    textDecoration: 'none',
    color: 'inherit',
    border: '1px solid transparent',
    transition: 'all 0.2s ease',
    
    '&:hover': {
        backgroundColor: '#161b22',
        borderColor: '#30363d',
    },
});

const toolIconStyle = css({
    fontSize: '1.5rem',
    flexShrink: 0,
    marginTop: '0.125rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '2.5rem',
    height: '2.5rem',
});



const toolNameStyle = css({
    fontSize: { base: '1rem', md: '1.125rem' },
    color: '#58a6ff',
    fontWeight: '600',
    
    'a:hover &': {
        textDecoration: 'underline',
    },
});

const toolDescStyle = css({
    fontSize: { base: '0.875rem', md: '0.9375rem' },
    color: '#7d8590',
    lineHeight: '1.5',
});

const settingsCogStyle = css({
    position: 'fixed',
    bottom: '1.5rem',
    right: '1.5rem',
    fontSize: '1.25rem',
    opacity: 0.3,
    transition: 'all 0.3s ease',
    textDecoration: 'none',
    cursor: 'pointer',
    zIndex: 40,
    
    '&:hover': {
        opacity: 0.6,
        transform: 'rotate(90deg)',
    },
});
