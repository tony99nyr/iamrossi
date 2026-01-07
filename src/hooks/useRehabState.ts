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
    // Initialize with today's date normalized to midnight in local timezone
    const [currentWeekStart, setCurrentWeekStart] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    });
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
    
    // Ref to track latest entries for use in callbacks (avoids stale closures)
    const entriesRef = useRef<RehabEntry[]>(initialEntries);
    
    // Keep ref in sync with state
    useEffect(() => {
        entriesRef.current = entries;
    }, [entries]);

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

    // Get today's date in local timezone, normalized to midnight
    // This ensures we always get the correct local date regardless of timezone
    // Wrapped in useCallback to provide stable reference for dependency arrays
    const getToday = useCallback((): Date => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }, []);

    const getTodayStr = useCallback((): string => {
        return formatDate(getToday());
    }, [getToday]);

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
                const todayStr = getTodayStr();

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
    }, [currentWeekStart, getTodayStr]);

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
                
                // Only fetch for past and current dates, not future
                const todayStr = getTodayStr();

                // Fetch heart rate for each day in parallel (only past/current dates)
                // Don't skip rest days - we should still try to fetch (API will return empty if no workouts)
                const fetchPromises = weekDates
                    .filter(date => {
                        const dateStr = formatDate(date);
                        // Skip future dates
                        return dateStr <= todayStr;
                    })
                    .map(async (date) => {
                        const dateStr = formatDate(date);
                        try {
                            // For today, force refresh to get latest data (workout may have been logged after initial fetch)
                            const url = dateStr === todayStr 
                                ? `/api/google-fit/heart-rate?date=${dateStr}&forceRefresh=true`
                                : `/api/google-fit/heart-rate?date=${dateStr}`;
                            const response = await fetch(url);
                            if (response.ok) {
                                const data = await response.json();
                                // Store the data even if empty (so we know we've checked)
                                // Only return if it has actual heart rate data for display purposes
                                return { dateStr, data, hasData: data.avgBpm !== undefined || data.maxBpm !== undefined };
                            }
                        } catch (error) {
                            console.error(`Failed to fetch Google Fit heart rate for ${dateStr}:`, error);
                        }
                        return null;
                    });

                const results = await Promise.all(fetchPromises);
                
                // Merge new data with existing heart rates (don't replace)
                setHeartRates(prev => {
                    const updated = { ...prev };
                    results.forEach(result => {
                        if (result) {
                            if (result.hasData) {
                                console.log(`[Rehab] Storing HR data for ${result.dateStr}: avg=${result.data.avgBpm}, max=${result.data.maxBpm}`);
                                updated[result.dateStr] = result.data;
                            } else {
                                console.log(`[Rehab] No HR data for ${result.dateStr} (empty response)`);
                            }
                        }
                    });
                    return updated;
                });
            } catch (error) {
                console.error('Failed to fetch Google Fit heart rate:', error);
            }
        };
        fetchHeartRates();
    }, [currentWeekStart, entries, getTodayStr]);

    // Fetch heart rate data for selected date if not already loaded
    useEffect(() => {
        if (!selectedDate) return;
        
        // Check if we already have data for this date
        const hasData = heartRates[selectedDate] && 
            (heartRates[selectedDate].avgBpm !== undefined || heartRates[selectedDate].maxBpm !== undefined);
        if (hasData) return;
        
        const fetchHeartRateForDate = async () => {
            try {
                // Check if Google Fit is configured
                const statusResponse = await fetch('/api/google-fit/status');
                if (!statusResponse.ok) return;
                
                const status = await statusResponse.json();
                if (!status.configured) return;

                const todayStr = getTodayStr();
                
                // Skip future dates
                if (selectedDate > todayStr) return;

                // Fetch heart rate for this specific date
                const url = selectedDate === todayStr 
                    ? `/api/google-fit/heart-rate?date=${selectedDate}&forceRefresh=true`
                    : `/api/google-fit/heart-rate?date=${selectedDate}`;
                
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    // Store the data if it has actual heart rate values
                    if (data.avgBpm !== undefined || data.maxBpm !== undefined) {
                        setHeartRates(prev => ({
                            ...prev,
                            [selectedDate]: data,
                        }));
                    }
                }
            } catch (error) {
                console.error(`Failed to fetch Google Fit heart rate for ${selectedDate}:`, error);
            }
        };
        
        fetchHeartRateForDate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate]); // Only depend on selectedDate - check heartRates inside the effect

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

    const handlePinSuccess = async () => {
        setIsAuthenticated(true);
        setShowPinModal(false);
        
        // Execute pending action if any
        if (pendingAction) {
            const action = pendingAction;
            setPendingAction(null);
            await action();
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
            // Use ref to get latest entries (avoids stale closure)
            const currentEntry = entriesRef.current.find(e => e.date === selectedDate);
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
    }, [selectedDate]);

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
        const today = getToday();
        setCurrentWeekStart(today);
        setSelectedDate(null);
        
        // Scroll to today's card after a brief delay to allow rendering
        setTimeout(() => {
            const todayStr = getTodayStr();
            const todayCard = document.querySelector(`[data-date="${todayStr}"]`);
            if (todayCard) {
                todayCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }, [getToday, getTodayStr]);

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
