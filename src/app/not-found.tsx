import styles from './not-found.module.css';

export default function NotFound() {
    return (
        <div className={styles.container}>
            <video autoPlay loop muted playsInline className={styles.video}>
                <source src="/rick.mp4" type="video/mp4" />
                Your browser does not support the video tag.
            </video>
        </div>
    );
}
