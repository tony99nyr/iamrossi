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

interface KneeRehabPageProps {
    searchParams?: {
        date?: string;
    };
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export default async function KneeRehabPage({ searchParams }: KneeRehabPageProps) {
    const exercises = await getExercises();
    const entries = await getEntries();

    const urlDate = searchParams?.date;
    const initialSelectedDate = urlDate && DATE_REGEX.test(urlDate) ? urlDate : null;

    return (
        <KneeRehabClient
            initialExercises={exercises}
            initialEntries={entries}
            initialSelectedDate={initialSelectedDate}
        />
    );
}
