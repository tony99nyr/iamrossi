import Link from 'next/link';
import AnimatedLogo from '@/components/AnimatedLogo';
import styles from './page.module.css';

export default function Home() {
    return (
        <div className={styles.container}>
            <main className={styles.main}>
                <article className={styles.markdown}>
                    <div className={styles.logoContainer}>
                        <AnimatedLogo />
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
