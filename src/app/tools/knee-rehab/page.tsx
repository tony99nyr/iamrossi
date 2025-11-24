import { Metadata } from 'next';
import KneeRehabClient from './KneeRehabClient';
import { getExercises, getEntries } from '@/lib/kv';

// Force dynamic rendering since we're reading from KV
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Knee Rehab Tracker | iamrossi.com',
    description: 'Track your daily knee rehabilitation exercises, monitor progress, and maintain consistency with your recovery routine.',
    openGraph: {
        title: 'Knee Rehab Tracker',
        description: 'Track your daily knee rehabilitation exercises and monitor your recovery progress.',
        url: 'https://iamrossi.com/tools/knee-rehab',
        siteName: 'iamrossi.com',
        type: 'website',
    },
    robots: {
        index: false,
        follow: false,
        nocache: true,
    },
    other: {
        'ai-robots': 'noindex, noimageai',
    }
};

export default async function KneeRehabPage() {
    const exercises = await getExercises();
    const entries = await getEntries();

    return <KneeRehabClient initialExercises={exercises} initialEntries={entries} />;
}
