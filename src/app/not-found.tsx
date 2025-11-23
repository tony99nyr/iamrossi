import { css, cx } from '@styled-system/css';

const containerStyle = css({
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    zIndex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'white',
    backgroundColor: 'black',
});

const videoStyle = css({
    position: 'absolute',
    top: '50%',
    left: '50%',
    minWidth: '100%',
    minHeight: '100%',
    width: 'auto',
    height: 'auto',
    transform: 'translate(-50%, -50%)',
    objectFit: 'cover',
    zIndex: -1,
});

const contentStyle = css({
    textAlign: 'center',
    zIndex: 1,
    textShadow: '0 2px 4px rgba(0, 0, 0, 0.8)',
    '& h1': {
        fontSize: '5rem',
        margin: 0,
    },
    '& p': {
        fontSize: '2rem',
        margin: 0,
    },
});

export default function NotFound() {
    return (
        <div className={cx('not-found-page', containerStyle)}>
            <video autoPlay loop muted playsInline className={videoStyle}>
                <source src="/rick.mp4" type="video/mp4" />
                Your browser does not support the video tag.
            </video>
        </div>
    );
}
