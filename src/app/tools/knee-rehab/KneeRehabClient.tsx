'use client';

import { useState, useEffect } from 'react';
import { css, cx } from '@styled-system/css';
import WeeklyCalendar from '@/components/rehab/WeeklyCalendar';
import DayView from '@/components/rehab/DayView';
import ExerciseEntryForm from '@/components/rehab/ExerciseEntryForm';
import ExerciseEditModal from '@/components/rehab/ExerciseEditModal';

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt: string;
}

interface RehabEntry {
    id: string;
    date: string;
    exercises: { id: string; weight?: string }[];
    isRestDay: boolean;
    vitaminsTaken: boolean;
    proteinShake: boolean;
}

interface SelectedExercise extends Exercise {
    weight?: string;
}

interface KneeRehabClientProps {
    initialExercises: Exercise[];
    initialEntries: RehabEntry[];
}

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

export default function KneeRehabClient({ 
    initialExercises, 
    initialEntries 
}: KneeRehabClientProps) {
    const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
    const [entries, setEntries] = useState<RehabEntry[]>(initialEntries);
    const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(formatDate(new Date()));
    const [showEntryForm, setShowEntryForm] = useState(false);
    const [formExercises, setFormExercises] = useState<SelectedExercise[]>([]);
    const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

    const selectedEntry = entries.find(e => e.date === selectedDate);

    const handlePreviousWeek = () => {
        const newDate = new Date(currentWeekStart);
        newDate.setDate(newDate.getDate() - 7);
        setCurrentWeekStart(newDate);
    };

    const handleNextWeek = () => {
        const newDate = new Date(currentWeekStart);
        newDate.setDate(newDate.getDate() + 7);
        setCurrentWeekStart(newDate);
    };

    const handleDateSelect = (date: string) => {
        if (date === selectedDate) {
            setSelectedDate(null);
        } else {
            setSelectedDate(date);
        }
    };

    const handleToggleRestDay = async () => {
        const newIsRestDay = !selectedEntry?.isRestDay;
        
        try {
            const response = await fetch('/api/rehab/entries', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: selectedDate,
                    isRestDay: newIsRestDay,
                }),
            });

            if (response.ok) {
                const updatedEntry = await response.json();
                setEntries(prev => {
                    const index = prev.findIndex(e => e.date === selectedDate);
                    if (index >= 0) {
                        const newEntries = [...prev];
                        newEntries[index] = updatedEntry;
                        return newEntries;
                    }
                    return [...prev, updatedEntry];
                });
            }
        } catch (error) {
            console.error('Failed to toggle rest day:', error);
        }
    };

    const handleToggleVitamins = async () => {
        const newVitamins = !selectedEntry?.vitaminsTaken;
        
        try {
            const response = await fetch('/api/rehab/entries', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: selectedDate,
                    vitaminsTaken: newVitamins,
                }),
            });

            if (response.ok) {
                const updatedEntry = await response.json();
                setEntries(prev => {
                    const index = prev.findIndex(e => e.date === selectedDate);
                    if (index >= 0) {
                        const newEntries = [...prev];
                        newEntries[index] = updatedEntry;
                        return newEntries;
                    }
                    return [...prev, updatedEntry];
                });
            }
        } catch (error) {
            console.error('Failed to toggle vitamins:', error);
        }
    };

    const handleToggleProtein = async () => {
        const newProtein = !selectedEntry?.proteinShake;
        
        try {
            const response = await fetch('/api/rehab/entries', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: selectedDate,
                    proteinShake: newProtein,
                }),
            });

            if (response.ok) {
                const updatedEntry = await response.json();
                setEntries(prev => {
                    const index = prev.findIndex(e => e.date === selectedDate);
                    if (index >= 0) {
                        const newEntries = [...prev];
                        newEntries[index] = updatedEntry;
                        return newEntries;
                    }
                    return [...prev, updatedEntry];
                });
            }
        } catch (error) {
            console.error('Failed to toggle protein:', error);
        }
    };

    const handleAddExerciseClick = () => {
        const currentExercises = selectedEntry?.exercises.map(entryEx => {
            const fullExercise = exercises.find(ex => ex.id === entryEx.id);
            return fullExercise ? { ...fullExercise, weight: entryEx.weight || '' } : null;
        }).filter(Boolean) as SelectedExercise[] || [];
        
        setFormExercises(currentExercises);
        setShowEntryForm(true);
    };

    const handleFormAddExercise = (exercise: Exercise) => {
        if (!formExercises.find(e => e.id === exercise.id)) {
            setFormExercises(prev => [...prev, { ...exercise, weight: '' }]);
        }
    };

    const handleFormRemoveExercise = (id: string) => {
        setFormExercises(prev => prev.filter(e => e.id !== id));
    };

    const handleFormUpdateWeight = (id: string, weight: string) => {
        setFormExercises(prev => prev.map(e => 
            e.id === id ? { ...e, weight } : e
        ));
    };

    const handleCreateExercise = async (title: string, description: string): Promise<Exercise> => {
        const response = await fetch('/api/rehab/exercises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description }),
        });

        if (!response.ok) {
            throw new Error('Failed to create exercise');
        }

        const newExercise = await response.json();
        setExercises(prev => [...prev, newExercise]);
        return newExercise;
    };

    const handleUpdateExercise = async (id: string, title: string, description: string) => {
        try {
            const response = await fetch('/api/rehab/exercises', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, title, description }),
            });

            if (response.ok) {
                const updatedExercise = await response.json();
                setExercises(prev => prev.map(ex => 
                    ex.id === id ? updatedExercise : ex
                ));
                setEditingExercise(null);
            }
        } catch (error) {
            console.error('Failed to update exercise:', error);
        }
    };

    const handleSaveEntry = async () => {
        try {
            const response = await fetch('/api/rehab/entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: selectedDate,
                    exercises: formExercises.map(e => ({ id: e.id, weight: e.weight })),
                    isRestDay: selectedEntry?.isRestDay || false,
                    vitaminsTaken: selectedEntry?.vitaminsTaken || false,
                    proteinShake: selectedEntry?.proteinShake || false,
                }),
            });

            if (response.ok) {
                const savedEntry = await response.json();
                setEntries(prev => {
                    const index = prev.findIndex(e => e.date === selectedDate);
                    if (index >= 0) {
                        const newEntries = [...prev];
                        newEntries[index] = savedEntry;
                        return newEntries;
                    }
                    return [...prev, savedEntry];
                });
                setShowEntryForm(false);
                setFormExercises([]);
            }
        } catch (error) {
            console.error('Failed to save entry:', error);
        }
    };

    const handleCancelEntry = () => {
        setShowEntryForm(false);
        setFormExercises([]);
    };

    return (
        <div className={cx('knee-rehab-client', css({
            minHeight: '100vh',
            backgroundColor: '#0a0a0a',
            padding: '16px',
            md: {
                padding: '24px',
            }
        }))}>
            <div className={cx('container', css({
                maxWidth: '1200px',
                margin: '0 auto',
            }))}>
                {/* Header */}
                <header className={cx('page-header', css({
                    marginBottom: '32px',
                }))}>
                    <h1 className={cx('page-title', css({
                        color: '#ededed',
                        fontSize: '28px',
                        fontWeight: '700',
                        marginBottom: '8px',
                        md: {
                            fontSize: '32px',
                        }
                    }))}>
                        Knee Rehab Tracker
                    </h1>
                    <p className={cx('page-subtitle', css({
                        color: '#999',
                        fontSize: '14px',
                    }))}>
                        Track your daily rehabilitation exercises
                    </p>
                </header>

                {/* Calendar */}
                <div className={cx('calendar-section', css({
                    marginBottom: '32px',
                }))}>
                    <WeeklyCalendar
                        currentDate={currentWeekStart}
                        entries={entries}
                        exercises={exercises}
                        selectedDate={selectedDate}
                        onDateSelect={handleDateSelect}
                        onPreviousWeek={handlePreviousWeek}
                        onNextWeek={handleNextWeek}
                    />
                </div>

                {/* Day View */}
                {selectedDate && (
                    <div className={cx('day-section', css({}))}>
                        <DayView
                            date={selectedDate}
                            entry={selectedEntry}
                            exercises={exercises}
                            onAddExercise={handleAddExerciseClick}
                            onToggleRestDay={handleToggleRestDay}
                            onToggleVitamins={handleToggleVitamins}
                            onToggleProtein={handleToggleProtein}
                            onEditExercise={setEditingExercise}
                        />
                    </div>
                )}
            </div>

            {/* Entry Form Modal */}
            {showEntryForm && selectedDate && (
                <ExerciseEntryForm
                    date={selectedDate}
                    exercises={exercises}
                    selectedExercises={formExercises}
                    onAddExercise={handleFormAddExercise}
                    onRemoveExercise={handleFormRemoveExercise}
                    onUpdateWeight={handleFormUpdateWeight}
                    onCreateExercise={handleCreateExercise}
                    onSave={handleSaveEntry}
                    onCancel={handleCancelEntry}
                />
            )}

            {/* Edit Exercise Modal */}
            {editingExercise && (
                <ExerciseEditModal
                    exercise={editingExercise}
                    onSave={handleUpdateExercise}
                    onCancel={() => setEditingExercise(null)}
                />
            )}
        </div>
    );
}
