import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getExercises, setExercises, Exercise } from '@/lib/kv';
import { exerciseSchema, exerciseUpdateSchema, exerciseDeleteSchema, safeValidateRequest } from '@/lib/validation';
import { logError } from '@/lib/logger';

import { revalidatePath } from 'next/cache';

export async function GET() {
    try {
        const exercises = await getExercises();
        return NextResponse.json(exercises);
    } catch (error) {
        logError('API Error', error, { method: 'GET', path: '/api/rehab/exercises' });
        return NextResponse.json({ error: 'Failed to read exercises' }, { status: 500 });
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
        const validation = safeValidateRequest(exerciseSchema, body);

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { title, description } = validation.data;
        const exercises = await getExercises();

        const newExercise: Exercise = {
            id: `ex-${Date.now()}`,
            title,
            description: description || '',
            createdAt: new Date().toISOString(),
        };

        exercises.push(newExercise);
        await setExercises(exercises);

        // Revalidate the AI page to show fresh data
        revalidatePath('/tools/knee-rehab/ai');

        return NextResponse.json(newExercise, { status: 201 });
    } catch (error) {
        logError('API Error', error, { method: 'POST', path: '/api/rehab/exercises' });
        return NextResponse.json({ error: 'Failed to create exercise' }, { status: 500 });
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
        const validation = safeValidateRequest(exerciseUpdateSchema, body);

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { id, title, description } = validation.data;
        const exercises = await getExercises();
        const exerciseIndex = exercises.findIndex(e => e.id === id);

        if (exerciseIndex === -1) {
            return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
        }

        const updatedExercise = {
            ...exercises[exerciseIndex],
            ...(title && { title }),
            ...(description !== undefined && { description }),
        };

        exercises[exerciseIndex] = updatedExercise;
        await setExercises(exercises);

        // Revalidate the AI page to show fresh data
        revalidatePath('/tools/knee-rehab/ai');

        return NextResponse.json(updatedExercise);
    } catch (error) {
        logError('API Error', error, { method: 'PATCH', path: '/api/rehab/exercises' });
        return NextResponse.json({ error: 'Failed to update exercise' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    // Verify authentication
    const isAuthenticated = await verifyAuthToken(request);
    if (!isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const validation = safeValidateRequest(exerciseDeleteSchema, body);

        if (!validation.success) {
            return NextResponse.json(
                { error: validation.issues[0]?.message || 'Invalid request body' },
                { status: 400 }
            );
        }

        const { id } = validation.data;
        const exercises = await getExercises();
        const exerciseIndex = exercises.findIndex(e => e.id === id);

        if (exerciseIndex === -1) {
            return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
        }

        // Remove the exercise
        exercises.splice(exerciseIndex, 1);
        await setExercises(exercises);

        // Revalidate the AI page to show fresh data
        revalidatePath('/tools/knee-rehab/ai');

        return NextResponse.json({ success: true, id });
    } catch (error) {
        logError('API Error', error, { method: 'DELETE', path: '/api/rehab/exercises' });
        return NextResponse.json({ error: 'Failed to delete exercise' }, { status: 500 });
    }
}
