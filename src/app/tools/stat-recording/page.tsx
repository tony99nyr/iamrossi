import { css, cx } from '@styled-system/css';

export default function StatRecordingPage() {
    return (
        <div className={cx('stat-recording-page', css({ padding: '2rem' }))}>
            <h1>Stat Recording</h1>
            <p>This tool will allow you to record hockey stats in real-time.</p>
            <p>
                <em>Coming Soon...</em>
            </p>
        </div>
    );
}
