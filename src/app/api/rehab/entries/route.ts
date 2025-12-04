import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getEntries, setEntries, RehabEntry } from '@/lib/kv';
import { rehabEntrySchema, rehabEntryPatchSchema, safeValidateRequest } from '@/lib/validation';
import { logger } from '@/lib/logger';

import { revalidatePath } from 'next/cache';

export async function GET() {
    try {
        const entries = await getEntries();
        return NextResponse.json(entries);
    } catch (error) {
        logger.apiError('GET', '/api/rehab/entries', error);
        return NextResponse.json({ error: 'Failed to read entries' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    // Verify authentication
    const isAuthenticated = await verifyAuthToken(request);
    if (!isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const validation = safeValidateRequest(rehabEntrySchema, body);

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { date, exercises, isRestDay, vitaminsTaken, proteinShake, notes } = validation.data;

        const entries = await getEntries();
        const existingEntryIndex = entries.findIndex(e => e.date === date);

        const newEntry: RehabEntry = {
            id: existingEntryIndex !== -1 ? entries[existingEntryIndex].id : crypto.randomUUID(),
            date,
            exercises: exercises || [], // Array of { id: string, weight?: string }
            isRestDay: isRestDay || false,
            vitaminsTaken: vitaminsTaken || false,
            proteinShake: proteinShake || false,
            notes: notes || '',
        };

        if (existingEntryIndex !== -1) {
            entries[existingEntryIndex] = newEntry;
        } else {
            entries.push(newEntry);
        }

        await setEntries(entries);
        
        // Revalidate the AI page to show fresh data
        revalidatePath('/tools/knee-rehab/ai');

        return NextResponse.json(newEntry, { status: existingEntryIndex !== -1 ? 200 : 201 });
    } catch (error) {
        logger.apiError('POST', '/api/rehab/entries', error);
        return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    // Verify authentication
    const isAuthenticated = await verifyAuthToken(request);
    if (!isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const validation = safeValidateRequest(rehabEntryPatchSchema, body);

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { date, isRestDay, vitaminsTaken, proteinShake, exercises, notes } = validation.data;

        const entries = await getEntries();
        const existingIndex = entries.findIndex(e => e.date === date);

        if (existingIndex >= 0) {
            // Update existing entry
            if (isRestDay !== undefined) entries[existingIndex].isRestDay = isRestDay;
            if (vitaminsTaken !== undefined) entries[existingIndex].vitaminsTaken = vitaminsTaken;
            if (proteinShake !== undefined) entries[existingIndex].proteinShake = proteinShake;
            if (exercises !== undefined) entries[existingIndex].exercises = exercises;
            if (notes !== undefined) entries[existingIndex].notes = notes;

        } else {
            // Create new entry with flags
            entries.push({
                id: `entry-${Date.now()}`,
                date,
                exercises: [],
                isRestDay: isRestDay || false,
                vitaminsTaken: vitaminsTaken || false,
                proteinShake: proteinShake || false,
                notes: notes || '',
            });
        }

        await setEntries(entries);
        
        // Revalidate the AI page to show fresh data
        revalidatePath('/tools/knee-rehab/ai');
        
        return NextResponse.json(entries.find(e => e.date === date));
    } catch (error) {
        logger.apiError('PATCH', '/api/rehab/entries', error);
        return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
    }
}
