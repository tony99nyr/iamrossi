import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ENTRIES_FILE = path.join(process.cwd(), 'src/data/rehab-entries.json');

interface RehabEntry {
    id: string;
    date: string;
    exercises: string[];
    isRestDay: boolean;
    vitaminsTaken: boolean;
    proteinShake: boolean;
}

function readEntries(): RehabEntry[] {
    if (!fs.existsSync(ENTRIES_FILE)) {
        return [];
    }
    const data = fs.readFileSync(ENTRIES_FILE, 'utf8');
    return JSON.parse(data);
}

function writeEntries(entries: RehabEntry[]): void {
    fs.writeFileSync(ENTRIES_FILE, JSON.stringify(entries, null, 2));
}

export async function GET() {
    try {
        const entries = readEntries();
        return NextResponse.json(entries);
    } catch (error) {
        console.error('Error reading entries:', error);
        return NextResponse.json({ error: 'Failed to read entries' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { date, exercises, isRestDay, vitaminsTaken, proteinShake } = await request.json();

        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        const entries = readEntries();
        const existingEntryIndex = entries.findIndex(e => e.date === date);

        const newEntry = {
            id: existingEntryIndex !== -1 ? entries[existingEntryIndex].id : crypto.randomUUID(),
            date,
            exercises: exercises || [], // Array of { id: string, weight?: string }
            isRestDay: isRestDay || false,
            vitaminsTaken: vitaminsTaken || false,
            proteinShake: proteinShake || false,
        };

        if (existingEntryIndex !== -1) {
            entries[existingEntryIndex] = newEntry;
        } else {
            entries.push(newEntry);
        }

        writeEntries(entries);

        return NextResponse.json(newEntry, { status: existingEntryIndex !== -1 ? 200 : 201 });
    } catch (error) {
        console.error('Error saving entry:', error);
        return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const { date, isRestDay, vitaminsTaken, proteinShake } = await request.json();
        
        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        const entries = readEntries();
        const existingIndex = entries.findIndex(e => e.date === date);

        if (existingIndex >= 0) {
            // Update existing entry
            if (isRestDay !== undefined) entries[existingIndex].isRestDay = isRestDay;
            if (vitaminsTaken !== undefined) entries[existingIndex].vitaminsTaken = vitaminsTaken;
            if (proteinShake !== undefined) entries[existingIndex].proteinShake = proteinShake;
        } else {
            // Create new entry with flags
            entries.push({
                id: `entry-${Date.now()}`,
                date,
                exercises: [],
                isRestDay: isRestDay || false,
                vitaminsTaken: vitaminsTaken || false,
                proteinShake: proteinShake || false,
            });
        }

        writeEntries(entries);
        return NextResponse.json(entries.find(e => e.date === date));
    } catch (error) {
        console.error('Error updating entry:', error);
        return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
    }
}
