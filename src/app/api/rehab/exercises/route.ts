import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const EXERCISES_FILE = path.join(process.cwd(), 'src/data/exercises.json');

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt: string;
}

function readExercises(): Exercise[] {
    if (!fs.existsSync(EXERCISES_FILE)) {
        return [];
    }
    const data = fs.readFileSync(EXERCISES_FILE, 'utf8');
    return JSON.parse(data);
}

function writeExercises(exercises: Exercise[]): void {
    fs.writeFileSync(EXERCISES_FILE, JSON.stringify(exercises, null, 2));
}

export async function GET() {
    try {
        const exercises = readExercises();
        return NextResponse.json(exercises);
    } catch (error) {
        console.error('Error reading exercises:', error);
        return NextResponse.json({ error: 'Failed to read exercises' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { title, description } = await request.json();
        
        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const exercises = readExercises();
        
        const newExercise: Exercise = {
            id: `ex-${Date.now()}`,
            title,
            description: description || '',
            createdAt: new Date().toISOString(),
        };

        exercises.push(newExercise);
        writeExercises(exercises);

        return NextResponse.json(newExercise, { status: 201 });
    } catch (error) {
        console.error('Error creating exercise:', error);
        return NextResponse.json({ error: 'Failed to create exercise' }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const { id, title, description } = await request.json();
        
        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const exercises = readExercises();
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
        writeExercises(exercises);

        return NextResponse.json(updatedExercise);
    } catch (error) {
        console.error('Error updating exercise:', error);
        return NextResponse.json({ error: 'Failed to update exercise' }, { status: 500 });
    }
}
