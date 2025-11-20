import styles from './page.module.css';

export default function Home() {
    return (
        <div className={styles.container}>
            <main className={styles.main}>
                <article className={styles.markdown}>
                    <h1>README.md</h1>
                    <h2>About Me</h2>
                    <p>
                        Welcome to <strong>iamrossi.com</strong>. This site serves as a hub for my personal tools and projects.
                    </p>
                    <p>Use the menu in the top right to navigate to the available tools.</p>

                    <h2>Tools</h2>
                    <ul>
                        <li>
                            <strong>Next Game</strong>: Track my son's hockey schedule.
                        </li>
                        <li>
                            <strong>Knee Rehab</strong>: Track my rehab progress.
                        </li>
                        <li>
                            <strong>Stat Recording</strong>: Record hockey stats in real-time.
                        </li>
                    </ul>

                    <h2>Contact</h2>
                    <p>
                        You can reach me at <a href="mailto:rossi@example.com">rossi@example.com</a>.
                    </p>
                </article>
            </main>
        </div>
    );
}
