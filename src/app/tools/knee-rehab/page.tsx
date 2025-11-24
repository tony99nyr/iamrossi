import fs from 'fs';
import path from 'path';
import { Metadata } from 'next';
import KneeRehabClient from './KneeRehabClient';

export const metadata: Metadata = {
    title: 'Knee Rehab Tracker | iamrossi.com',
    description: 'Track your daily knee rehabilitation exercises, monitor progress, and maintain consistency with your recovery routine.',
    keywords: ['knee rehab', 'rehabilitation tracker', 'exercise log', 'recovery tracking', 'physical therapy'],
    openGraph: {
        title: 'Knee Rehab Tracker',
        description: 'Track your daily knee rehabilitation exercises and monitor your recovery progress.',
        url: 'https://iamrossi.com/tools/knee-rehab',
        siteName: 'iamrossi.com',
        type: 'website',
    },
    robots: {
        index: true,
        follow: true,
    },
};

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt: string;
}

interface RehabEntry {
    id: string;
    date: string;
    exercises: string[];
    isRestDay: boolean;
    vitaminsTaken: boolean;
    proteinShake: boolean;
}

function readExercises(): Exercise[] {
    const filePath = path.join(process.cwd(), 'src/data/exercises.json');
    if (!fs.existsSync(filePath)) {
        return [];
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading exercises:', error);
        return [];
    }
}

function readEntries(): RehabEntry[] {
    const filePath = path.join(process.cwd(), 'src/data/rehab-entries.json');
    if (!fs.existsSync(filePath)) {
        return [];
    }
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading entries:', error);
        return [];
    }
}

export default function KneeRehabPage() {
    const exercises = readExercises();
    const entries = readEntries();

    return <KneeRehabClient initialExercises={exercises} initialEntries={entries} />;
}
