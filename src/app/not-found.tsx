import { head } from '@vercel/blob';
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

const VIDEO_BLOB_PATH = process.env.RICK_ROLL_BLOB_PATH ?? 'rick.mp4';

async function resolveVideoSource() {
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (!token) {
        console.warn('BLOB_READ_WRITE_TOKEN missing; falling back to static 404 background.');
        return null;
    }

    try {
        const { downloadUrl } = await head(VIDEO_BLOB_PATH, { token });
        return downloadUrl;
    } catch (error) {
        console.error('Failed to resolve Blob video for 404 page:', error);
        return null;
    }
}

export default async function NotFound() {
    const videoSrc = await resolveVideoSource();

    return (
        <div className={cx('not-found-page', containerStyle)}>
            {videoSrc ? (
                <video autoPlay loop muted playsInline className={videoStyle}>
                    <source src={videoSrc} type="video/mp4" />
                    Your browser does not support the video tag.
                </video>
            ) : null}
        </div>
    );
}
