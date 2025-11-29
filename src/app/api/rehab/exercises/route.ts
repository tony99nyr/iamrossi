import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';
import { getExercises, setExercises, Exercise } from '@/lib/kv';

export async function GET() {
    try {
        const exercises = await getExercises();
        return NextResponse.json(exercises);
    } catch (error) {
        console.error('Error reading exercises:', error);
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
        const { title, description } = await request.json();
        
        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const exercises = await getExercises();
        
        const newExercise: Exercise = {
            id: `ex-${Date.now()}`,
            title,
            description: description || '',
            createdAt: new Date().toISOString(),
        };

        exercises.push(newExercise);
        await setExercises(exercises);

        return NextResponse.json(newExercise, { status: 201 });
    } catch (error) {
        console.error('Error creating exercise:', error);
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
        const { id, title, description } = await request.json();
        
        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

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

        return NextResponse.json(updatedExercise);
    } catch (error) {
        console.error('Error updating exercise:', error);
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
        const { id } = await request.json();
        
        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const exercises = await getExercises();
        const exerciseIndex = exercises.findIndex(e => e.id === id);

        if (exerciseIndex === -1) {
            return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
        }

        // Remove the exercise
        exercises.splice(exerciseIndex, 1);
        await setExercises(exercises);

        return NextResponse.json({ success: true, id });
    } catch (error) {
        console.error('Error deleting exercise:', error);
        return NextResponse.json({ error: 'Failed to delete exercise' }, { status: 500 });
    }
}
