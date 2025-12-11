import { useState, useEffect, useRef, useCallback } from 'react';
import type { Exercise, RehabEntry, ExerciseEntry, RehabSettings, OuraScores, GoogleFitHeartRate } from '@/types';
import { ROSSI_SHAKE, ROSSI_VITAMINS } from '@/data/rehab-defaults';

interface UseRehabStateProps {
    initialExercises: Exercise[];
    initialEntries: RehabEntry[];
}

export function useRehabState({ initialExercises, initialEntries }: UseRehabStateProps) {
    const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
    const [entries, setEntries] = useState<RehabEntry[]>(initialEntries);
    const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [hasUnsavedNotes, setHasUnsavedNotes] = useState(false);

    const [settings, setSettings] = useState<RehabSettings>({ vitamins: ROSSI_VITAMINS, proteinShake: ROSSI_SHAKE });
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    
    // Oura integration state
    const [ouraScores, setOuraScores] = useState<Record<string, OuraScores>>({});
    
    // Google Fit heart rate integration state
    const [heartRates, setHeartRates] = useState<Record<string, GoogleFitHeartRate>>({});
    
    // PIN authentication state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

    // Debounce timer for auto-save
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Check for date in URL params on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const dateParam = params.get('date');
            if (dateParam) {
                // Validate date format (YYYY-MM-DD)
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
                    // Use setTimeout to avoid synchronous setState in effect
                    setTimeout(() => {
                        setSelectedDate(dateParam);
                        // Set week start to the week containing this date
                        const date = new Date(`${dateParam}T00:00:00`);
                        const day = date.getDay();
                        const diff = date.getDate() - day;
                        const weekStart = new Date(date);
                        weekStart.setDate(diff);
                        setCurrentWeekStart(weekStart);
                    }, 0);
                }
            }
        }
    }, []);

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

    // Helper functions for date formatting
    const getWeekDates = (date: Date): Date[] => {
        const week: Date[] = [];
        const current = new Date(date);
        const day = current.getDay();
        const diff = current.getDate() - day;
        current.setDate(diff);
        for (let i = 0; i < 7; i++) {
            week.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        return week;
    };

    const formatDate = (date: Date): string => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Fetch Oura scores for the current week when week changes
    useEffect(() => {
        const fetchOuraScores = async () => {
            try {
                // Check if Oura is configured
                const statusResponse = await fetch('/api/oura/status');
                if (!statusResponse.ok) return;
                
                const status = await statusResponse.json();
                if (!status.configured) return;

                // Get all dates in current week
                const weekDates = getWeekDates(currentWeekStart);
                const scores: Record<string, OuraScores> = {};
                
                // Only fetch for past and current dates, not future
                const today = new Date();
                const todayStr = formatDate(today);

                // Fetch scores for each day in parallel (only past/current dates)
                await Promise.all(
                    weekDates
                        .filter(date => formatDate(date) <= todayStr) // Compare date strings, not Date objects
                        .map(async (date) => {
                            const dateStr = formatDate(date);
                            try {
                                const response = await fetch(`/api/oura/scores?date=${dateStr}`);
                                if (response.ok) {
                                    const data = await response.json();
                                    scores[dateStr] = data;
                                }
                            } catch (error) {
                                console.error(`Failed to fetch Oura scores for ${dateStr}:`, error);
                            }
                        })
                );

                setOuraScores(scores);
            } catch (error) {
                console.error('Failed to fetch Oura scores:', error);
            }
        };
        fetchOuraScores();
    }, [currentWeekStart]);

    // Fetch Google Fit heart rate data for the current week when week changes
    useEffect(() => {
        const fetchHeartRates = async () => {
            try {
                // Check if Google Fit is configured
                const statusResponse = await fetch('/api/google-fit/status');
                if (!statusResponse.ok) return;
                
                const status = await statusResponse.json();
                if (!status.configured) return;

                // Get all dates in current week
                const weekDates = getWeekDates(currentWeekStart);
                const rates: Record<string, GoogleFitHeartRate> = {};
                
                // Only fetch for past and current dates, not future
                const today = new Date();
                const todayStr = formatDate(today);

                // Fetch heart rate for each day in parallel (only past/current dates, skip rest days)
                await Promise.all(
                    weekDates
                        .filter(date => {
                            const dateStr = formatDate(date);
                            // Skip future dates and rest days
                            const entry = entries.find(e => e.date === dateStr);
                            return dateStr <= todayStr && !entry?.isRestDay;
                        })
                        .map(async (date) => {
                            const dateStr = formatDate(date);
                            try {
                                const response = await fetch(`/api/google-fit/heart-rate?date=${dateStr}`, {
                                    credentials: 'include', // Include cookies for authentication
                                });
                                if (response.ok) {
                                    const data = await response.json();
                                    rates[dateStr] = data;
                                }
                            } catch (error) {
                                console.error(`Failed to fetch Google Fit heart rate for ${dateStr}:`, error);
                            }
                        })
                );

                setHeartRates(rates);
            } catch (error) {
                console.error('Failed to fetch Google Fit heart rate:', error);
            }
        };
        fetchHeartRates();
    }, [currentWeekStart, entries]);

    const selectedEntry = entries.find(e => e.date === selectedDate);

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
                // Reset unsaved notes flag when switching dates
                setHasUnsavedNotes(false);
                // Scroll to top to show the day view
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    };

    const handleBackToCalendar = () => {
        setSelectedDate(null);
        // Reset unsaved notes flag when going back to calendar
        setHasUnsavedNotes(false);
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

        // Mark as having unsaved changes
        setHasUnsavedNotes(true);
    }, [selectedDate]);

    const handleSaveNotes = useCallback(() => {
        if (!selectedDate) return;

        const currentEntry = entries.find(e => e.date === selectedDate);
        const notes = currentEntry?.notes || '';

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
                    // Clear unsaved flag after successful save
                    setHasUnsavedNotes(false);
                }
            } catch (error) {
                console.error('Failed to save notes:', error);
            }
        });
    }, [selectedDate, entries, requireAuth]);

    const handleAddExercise = useCallback((exercise: Exercise) => {
        if (!selectedDate) return;
        
        requireAuth(async () => {
            try {
                const currentEntry = entries.find(e => e.date === selectedDate);
                const newExerciseEntry = {
                    id: exercise.id,
                    painLevel: null,
                    difficultyLevel: null,
                    timestamp: new Date().toISOString(),
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

    const handleGoToToday = useCallback(() => {
        const today = new Date();
        setCurrentWeekStart(today);
        setSelectedDate(null);
        
        // Scroll to today's card after a brief delay to allow rendering
        setTimeout(() => {
            const todayStr = formatDate(today);
            const todayCard = document.querySelector(`[data-date="${todayStr}"]`);
            if (todayCard) {
                todayCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }, []);

    return {
        exercises,
        entries,
        currentWeekStart,
        selectedDate,
        hasUnsavedNotes,
        settings,
        showSettingsModal,
        setShowSettingsModal,
        ouraScores,
        heartRates,
        isAuthenticated,
        showPinModal,
        setShowPinModal,
        selectedEntry,
        requireAuth,
        handlePinSuccess,
        handlePinCancel,
        handleSaveSettings,
        handlePreviousWeek,
        handleNextWeek,
        handleDateSelect,
        handleBackToCalendar,
        handleToggleRestDay,
        handleToggleVitamins,
        handleToggleProtein,
        handleUpdateNotes,
        handleSaveNotes,
        handleAddExercise,
        handleUpdateExercise,
        handleRemoveExercise,
        handleCreateExercise,
        handleUpdateExerciseDefinition,
        handleDeleteExercise,
        handleGoToToday,
    };
}
