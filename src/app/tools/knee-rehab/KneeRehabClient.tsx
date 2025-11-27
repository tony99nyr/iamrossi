'use client';

import { useState, useEffect } from 'react';
import { css, cx } from '@styled-system/css';
import WeeklyCalendar from '@/components/rehab/WeeklyCalendar';
import DayView from '@/components/rehab/DayView';
import ExerciseEntryForm from '@/components/rehab/ExerciseEntryForm';
import ExerciseEditModal from '@/components/rehab/ExerciseEditModal';
import PinEntryModal from '@/components/rehab/PinEntryModal';
import SettingsModal from '@/components/rehab/SettingsModal';
import type { Exercise, RehabEntry, ExerciseEntry, RehabSettings } from '@/types';

interface SelectedExercise extends Exercise, Omit<ExerciseEntry, 'id'> {}

interface KneeRehabClientProps {
    initialExercises: Exercise[];
    initialEntries: RehabEntry[];
}



export default function KneeRehabClient({ 
    initialExercises, 
    initialEntries 
}: KneeRehabClientProps) {
    const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
    const [entries, setEntries] = useState<RehabEntry[]>(initialEntries);
    const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showEntryForm, setShowEntryForm] = useState(false);
    const [formExercises, setFormExercises] = useState<SelectedExercise[]>([]);
    const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [settings, setSettings] = useState<RehabSettings>({ vitamins: [], proteinShake: { ingredients: [], servingSize: '' } });
    
    // PIN authentication state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

    // Check for existing auth cookie on mount
    useEffect(() => {
        const checkAuth = async () => {
            try {
                await fetch('/api/rehab/entries');
                // If we can read, we're good. Auth is only needed for mutations.
                setIsAuthenticated(true);
            } catch (error) {
                console.error('Auth check failed:', error);
            }
        };
        checkAuth();
    }, []);

    // Fetch settings on mount
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch('/api/rehab/settings');
                if (response.ok) {
                    const data = await response.json();
                    setSettings(data);
                }
            } catch (error) {
                console.error('Failed to fetch settings:', error);
            }
        };
        fetchSettings();
    }, []);

    const selectedEntry = entries.find(e => e.date === selectedDate);

    const handleSaveSettings = (newSettings: RehabSettings) => {
        requireAuth(async () => {
            try {
                const response = await fetch('/api/rehab/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newSettings),
                });

                if (response.status === 401) {
                    setIsAuthenticated(false);
                    setShowPinModal(true);
                    return;
                }

                if (response.ok) {
                    const savedSettings = await response.json();
                    setSettings(savedSettings);
                }
            } catch (error) {
                console.error('Failed to save settings:', error);
            }
        });
    };

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

    const handleBackToCalendar = () => {
        setSelectedDate(null);
    };

    // Authentication wrapper for protected actions
    const requireAuth = async (action: () => Promise<void>) => {
        if (isAuthenticated) {
            await action();
        } else {
            setPendingAction(() => action);
            setShowPinModal(true);
        }
    };

    const handlePinSuccess = () => {
        // setAuthToken(token); // Unused
        setIsAuthenticated(true);
        setShowPinModal(false);
        
        // Execute pending action if any
        if (pendingAction) {
            pendingAction();
            setPendingAction(null);
        }
    };

    const handlePinCancel = () => {
        setShowPinModal(false);
        setPendingAction(null);
    };

    const handleToggleRestDay = () => {
        requireAuth(async () => {
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

                if (response.status === 401) {
                    setIsAuthenticated(false);
                    setShowPinModal(true);
                    return;
                }

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
        });
    };

    const handleToggleVitamins = () => {
        requireAuth(async () => {
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

                if (response.status === 401) {
                    setIsAuthenticated(false);
                    setShowPinModal(true);
                    return;
                }

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
        });
    };

    const handleToggleProtein = () => {
        requireAuth(async () => {
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

                if (response.status === 401) {
                    setIsAuthenticated(false);
                    setShowPinModal(true);
                    return;
                }

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
        });
    };

    const handleAddExerciseClick = () => {
        const currentExercises = selectedEntry?.exercises.map(entryEx => {
            const fullExercise = exercises.find(ex => ex.id === entryEx.id);
            if (!fullExercise) return null;
            return {
                ...fullExercise,
                timeElapsed: entryEx.timeElapsed,
                weight: entryEx.weight,
                reps: entryEx.reps,
                sets: entryEx.sets,
                painLevel: entryEx.painLevel,
                difficultyLevel: entryEx.difficultyLevel,
            };
        }).filter(Boolean) as SelectedExercise[] || [];
        
        setFormExercises(currentExercises);
        setShowEntryForm(true);
    };

    const handleFormAddExercise = (exercise: Exercise) => {
        if (!formExercises.find(e => e.id === exercise.id)) {
            setFormExercises(prev => [...prev, { ...exercise }]);
        }
    };

    const handleFormRemoveExercise = (id: string) => {
        setFormExercises(prev => prev.filter(e => e.id !== id));
    };

    const handleFormUpdateExerciseData = (id: string, data: Partial<Omit<ExerciseEntry, 'id'>>) => {
        setFormExercises(prev => prev.map(e => 
            e.id === id ? { ...e, ...data } : e
        ));
    };

    const handleFormReorder = (newOrder: SelectedExercise[]) => {
        setFormExercises(newOrder);
    };

    const handleCreateExercise = async (title: string, description: string): Promise<Exercise> => {
        return new Promise((resolve, reject) => {
            requireAuth(async () => {
                try {
                    const response = await fetch('/api/rehab/exercises', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, description }),
                    });

                    if (response.status === 401) {
                        setIsAuthenticated(false);
                        setShowPinModal(true);
                        reject(new Error('Unauthorized'));
                        return;
                    }

                    if (!response.ok) {
                        reject(new Error('Failed to create exercise'));
                        return;
                    }

                    const newExercise = await response.json();
                    setExercises(prev => [...prev, newExercise]);
                    resolve(newExercise);
                } catch (error) {
                    reject(error);
                }
            });
        });
    };

    const handleUpdateExercise = async (id: string, title: string, description: string, weight?: string) => {
        return requireAuth(async () => {
            try {
                // 1. Update exercise definition
                const response = await fetch('/api/rehab/exercises', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, title, description }),
                });

                if (response.status === 401) {
                    setIsAuthenticated(false);
                    setShowPinModal(true);
                    return;
                }

                if (response.ok) {
                    const updatedExercise = await response.json();
                    setExercises(prev => prev.map(ex => 
                        ex.id === id ? updatedExercise : ex
                    ));
                    
                    // 2. Update entry weight if provided and we have a selected date
                    if (weight !== undefined && selectedDate && selectedEntry) {
                        const updatedExercises = selectedEntry.exercises.map(ex => 
                            ex.id === id ? { ...ex, weight } : ex
                        );

                        const entryResponse = await fetch('/api/rehab/entries', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                date: selectedDate,
                                exercises: updatedExercises,
                                isRestDay: selectedEntry.isRestDay,
                                vitaminsTaken: selectedEntry.vitaminsTaken,
                                proteinShake: selectedEntry.proteinShake,
                            }),
                        });

                        if (entryResponse.ok) {
                            const savedEntry = await entryResponse.json();
                            setEntries(prev => {
                                const index = prev.findIndex(e => e.date === selectedDate);
                                if (index >= 0) {
                                    const newEntries = [...prev];
                                    newEntries[index] = savedEntry;
                                    return newEntries;
                                }
                                return [...prev, savedEntry];
                            });
                        }
                    }

                    setEditingExercise(null);
                }
            } catch (error) {
                console.error('Failed to update exercise:', error);
            }
        });
    };

    const handleSaveEntry = () => {
        requireAuth(async () => {
            try {
                const response = await fetch('/api/rehab/entries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: selectedDate,
                        exercises: formExercises.map(e => ({
                            id: e.id,
                            timeElapsed: e.timeElapsed,
                            weight: e.weight,
                            reps: e.reps,
                            sets: e.sets,
                            painLevel: e.painLevel,
                            difficultyLevel: e.difficultyLevel,
                        })),
                        isRestDay: selectedEntry?.isRestDay || false,
                        vitaminsTaken: selectedEntry?.vitaminsTaken || false,
                        proteinShake: selectedEntry?.proteinShake || false,
                    }),
                });

                if (response.status === 401) {
                    setIsAuthenticated(false);
                    setShowPinModal(true);
                    return;
                }

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
        });
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
                maxWidth: '1440px',
                margin: '0 auto',
            }))}>


                {/* Calendar */}
                <div className={cx('calendar-section', css({
                    marginBottom: '32px',
                    display: selectedDate ? 'none' : 'block',
                    md: {
                        display: 'block',
                    }
                }))}>
                    <WeeklyCalendar
                        currentDate={currentWeekStart}
                        entries={entries}
                        exercises={exercises}
                        selectedDate={selectedDate}
                        onDateSelect={handleDateSelect}
                        onPreviousWeek={handlePreviousWeek}
                        onNextWeek={handleNextWeek}
                        onSettingsClick={() => setShowSettingsModal(true)}
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
                            onBack={handleBackToCalendar}
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
                    onUpdateExerciseData={handleFormUpdateExerciseData}
                    onReorder={handleFormReorder}
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

            {/* PIN Entry Modal */}
            {showPinModal && (
                <PinEntryModal
                    onSuccess={handlePinSuccess}
                    onCancel={handlePinCancel}
                />
            )}

            {/* Settings Modal */}
            {showSettingsModal && (
                <SettingsModal
                    settings={settings}
                    onSave={handleSaveSettings}
                    onClose={() => setShowSettingsModal(false)}
                />
            )}
        </div>
    );
}
