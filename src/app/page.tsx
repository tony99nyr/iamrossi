import Link from 'next/link';
import Image from 'next/image';
import styles from './page.module.css';

export default function Home() {
    return (
        <div className={styles.container}>
            <main className={styles.main}>
                <article className={styles.markdown}>
                    <div className={styles.logoContainer}>
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
