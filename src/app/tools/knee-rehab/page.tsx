import { css, cx } from '@styled-system/css';

export default function KneeRehabPage() {
    return (
        <div className={cx('knee-rehab-page', css({ padding: '2rem' }))}>
            <h1>Knee Rehab Tracker</h1>
            <p>This tool will track your daily knee rehab exercises.</p>
            <p>
                <em>Coming Soon...</em>
            </p>
        </div>
    );
}
