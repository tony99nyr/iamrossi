'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { css, cx } from '@styled-system/css';
import WeeklyCalendar from '@/components/rehab/WeeklyCalendar';
import DayView from '@/components/rehab/DayView';
import PinEntryModal from '@/components/rehab/PinEntryModal';
import SettingsModal from '@/components/rehab/SettingsModal';
import type { Exercise, RehabEntry, ExerciseEntry, RehabSettings } from '@/types';



import { ROSSI_SHAKE, ROSSI_VITAMINS } from '@/data/rehab-defaults';

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

    const [settings, setSettings] = useState<RehabSettings>({ vitamins: ROSSI_VITAMINS, proteinShake: ROSSI_SHAKE });
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    
    // PIN authentication state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

    // Debounce timer for auto-save
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

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
                    // If fetched data has no ingredients, keep the default ROSSI_SHAKE
                    if (!data.proteinShake || !data.proteinShake.ingredients || data.proteinShake.ingredients.length === 0) {
                        data.proteinShake = ROSSI_SHAKE;
                    }
                    
                    // If fetched data has no vitamins, keep the default ROSSI_VITAMINS
                    if (!data.vitamins || data.vitamins.length === 0) {
                        data.vitamins = ROSSI_VITAMINS;
                    }

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
        // Require auth when selecting a day (simplified auth flow)
        requireAuth(async () => {
            if (date === selectedDate) {
                setSelectedDate(null);
            } else {
                setSelectedDate(date);
                // Scroll to top to show the day view
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    };

    const handleBackToCalendar = () => {
        setSelectedDate(null);
    };

    // Authentication wrapper for protected actions
    const requireAuth = useCallback(async (action: () => Promise<void>) => {
        if (!isAuthenticated) {
            setPendingAction(() => action);
            setShowPinModal(true);
            return;
        }
        await action();
    }, [isAuthenticated]);

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

    const handleToggleRestDay = useCallback(() => {
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
    }, [selectedDate, selectedEntry, requireAuth]);

    const handleToggleVitamins = useCallback(() => {
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
    }, [selectedDate, selectedEntry, requireAuth]);

    const handleToggleProtein = useCallback(() => {
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
    }, [selectedDate, selectedEntry, requireAuth]);

    const handleUpdateNotes = useCallback((notes: string) => {
        if (!selectedDate) return;

        // Update local state immediately for responsive UI
        setEntries(prev => {
            const index = prev.findIndex(e => e.date === selectedDate);
            if (index >= 0) {
                const newEntries = [...prev];
                newEntries[index] = { ...newEntries[index], notes };
                return newEntries;
            }
            // Create new entry if it doesn't exist
            return [...prev, {
                id: 'temp-' + Date.now(),
                date: selectedDate,
                exercises: [],
                isRestDay: false,
                vitaminsTaken: false,
                proteinShake: false,
                notes,
            }];
        });

        // Clear existing timer
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }

        // Debounce the API call
        saveTimerRef.current = setTimeout(() => {
            requireAuth(async () => {
                try {
                    const response = await fetch('/api/rehab/entries', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            date: selectedDate,
                            notes,
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
                    console.error('Failed to update notes:', error);
                }
            });
        }, 300); // 300ms debounce
    }, [selectedDate, requireAuth]);

    // Inline exercise handlers
    const handleAddExercise = useCallback((exercise: Exercise) => {
        console.log('KneeRehabClient: handleAddExercise called', exercise);
        if (!selectedDate) {
            console.log('KneeRehabClient: No selectedDate');
            return;
        }
        
        requireAuth(async () => {
            console.log('KneeRehabClient: Executing auth action');
            try {
                const currentEntry = entries.find(e => e.date === selectedDate);
                const newExerciseEntry = {
                    id: exercise.id,
                    painLevel: null,
                    difficultyLevel: null,
                };

                const updatedExercises = [
                    ...(currentEntry?.exercises || []),
                    newExerciseEntry
                ];

                // Optimistic update
                const optimisticEntry: RehabEntry = currentEntry 
                    ? { ...currentEntry, exercises: updatedExercises }
                    : {
                        id: 'temp-' + Date.now(),
                        date: selectedDate,
                        exercises: updatedExercises,
                        isRestDay: false,
                        vitaminsTaken: false,
                        proteinShake: false,
                        notes: '',
                    };

                setEntries(prev => {
                    const index = prev.findIndex(e => e.date === selectedDate);
                    if (index >= 0) {
                        const newEntries = [...prev];
                        newEntries[index] = optimisticEntry;
                        return newEntries;
                    }
                    return [...prev, optimisticEntry];
                });

                const response = await fetch('/api/rehab/entries', {
                    method: currentEntry ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: selectedDate,
                        exercises: updatedExercises,
                        isRestDay: currentEntry?.isRestDay || false,
                        vitaminsTaken: currentEntry?.vitaminsTaken || false,
                        proteinShake: currentEntry?.proteinShake || false,
                        notes: currentEntry?.notes || '',
                    }),
                });

                if (response.status === 401) {
                    setIsAuthenticated(false);
                    setShowPinModal(true);
                    // Revert optimistic update if needed, but for now we just return
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
                console.error('Failed to add exercise:', error);
            }
        });
    }, [selectedDate, entries, requireAuth]);

    const handleUpdateExercise = useCallback((exerciseId: string, data: Partial<Omit<ExerciseEntry, 'id'>>) => {
        if (!selectedDate) return;

        // Clear existing timer
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }

        // Update local state immediately for responsive UI
        setEntries(prev => {
            const entryIndex = prev.findIndex(e => e.date === selectedDate);
            if (entryIndex < 0) return prev;

            const newEntries = [...prev];
            const entry = { ...newEntries[entryIndex] };
            const exerciseIndex = entry.exercises.findIndex(e => e.id === exerciseId);
            
            if (exerciseIndex >= 0) {
                entry.exercises = [...entry.exercises];
                entry.exercises[exerciseIndex] = {
                    ...entry.exercises[exerciseIndex],
                    ...data,
                };
                newEntries[entryIndex] = entry;
            }

            return newEntries;
        });

        // Debounce the API call
        saveTimerRef.current = setTimeout(() => {
            const currentEntry = entries.find(e => e.date === selectedDate);
            if (!currentEntry) return;

            const updatedExercises = currentEntry.exercises.map(e =>
                e.id === exerciseId ? { ...e, ...data } : e
            );

            fetch('/api/rehab/entries', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: selectedDate,
                    exercises: updatedExercises,
                }),
            }).then(response => {
                if (response.status === 401) {
                    setIsAuthenticated(false);
                    setShowPinModal(true);
                    return;
                }
                if (!response.ok) {
                    console.error('Failed to update exercise');
                }
            }).catch(error => {
                console.error('Failed to update exercise:', error);
            });
        }, 300); // 300ms debounce
    }, [selectedDate, entries]);

    const handleRemoveExercise = useCallback((exerciseId: string) => {
        if (!selectedDate) return;

        requireAuth(async () => {
            try {
                const currentEntry = entries.find(e => e.date === selectedDate);
                if (!currentEntry) return;

                const updatedExercises = currentEntry.exercises.filter(e => e.id !== exerciseId);

                const response = await fetch('/api/rehab/entries', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: selectedDate,
                        exercises: updatedExercises,
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
                        return prev;
                    });
                }
            } catch (error) {
                console.error('Failed to remove exercise:', error);
            }
        });
    }, [selectedDate, entries, requireAuth]);

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

    const handleUpdateExerciseDefinition = async (id: string, title: string, description: string) => {
        return requireAuth(async () => {
            try {
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
                }
            } catch (error) {
                console.error('Failed to update exercise definition:', error);
            }
        });
    };

    const handleDeleteExercise = async (id: string) => {
        return requireAuth(async () => {
            try {
                const response = await fetch('/api/rehab/exercises', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id }),
                });

                if (response.status === 401) {
                    setIsAuthenticated(false);
                    setShowPinModal(true);
                    return;
                }

                if (response.ok) {
                    setExercises(prev => prev.filter(ex => ex.id !== id));
                }
            } catch (error) {
                console.error('Failed to delete exercise:', error);
            }
        });
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
                        onSettingsClick={() => requireAuth(async () => setShowSettingsModal(true))}
                    />
                </div>

                {/* Day View */}
                {selectedDate && (
                    <div className={cx('day-section', css({}))}>
                        <DayView
                            date={selectedDate}
                            entry={selectedEntry}
                            exercises={exercises}
                            entries={entries}
                            onAddExercise={handleAddExercise}
                            onUpdateExercise={handleUpdateExercise}
                            onRemoveExercise={handleRemoveExercise}
                            onToggleRestDay={handleToggleRestDay}
                            onToggleVitamins={handleToggleVitamins}
                            onToggleProtein={handleToggleProtein}
                            onUpdateNotes={handleUpdateNotes}
                            onCreateExercise={handleCreateExercise}
                            onBack={handleBackToCalendar}
                        />
                    </div>
                )}
            </div>



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
                    exercises={exercises}
                    onSave={handleSaveSettings}
                    onUpdateExercise={handleUpdateExerciseDefinition}
                    onDeleteExercise={handleDeleteExercise}
                    onClose={() => setShowSettingsModal(false)}
                />
            )}
        </div>
    );
}
