'use client';

import { css, cx } from '@styled-system/css';
import { useState } from 'react';
import SmartAutocomplete from './SmartAutocomplete';
import ExerciseCard from './ExerciseCard';
import OuraDayScores from '@/components/oura/OuraDayScores';
import type { Exercise, ExerciseEntry, RehabEntry, OuraScores } from '@/types';

interface DayViewProps {
    date: string;
    entry: RehabEntry | undefined;
    exercises: Exercise[];
    entries: RehabEntry[]; // For showing averages in autocomplete
    onAddExercise: (exercise: Exercise) => void;
    onUpdateExercise: (exerciseId: string, data: Partial<Omit<ExerciseEntry, 'id'>>) => void;
    onRemoveExercise: (exerciseId: string) => void;
    onToggleRestDay: () => void;
    onToggleVitamins: () => void;
    onToggleProtein: () => void;
    onUpdateNotes: (notes: string) => void;
    onSaveNotes: () => void;
    hasUnsavedNotes: boolean;
    onCreateExercise: (title: string, description: string) => Promise<Exercise>;
    onBack?: () => void;
    ouraScores?: OuraScores;
}

function formatDateHeader(dateStr: string): string {
    // Parse as local time to match East Coast timezone
    // dateStr is in format "YYYY-MM-DD"
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
    });
}

export default function DayView({
    date,
    entry,
    exercises,
    entries,
    onAddExercise,
    onUpdateExercise,
    onRemoveExercise,
    onToggleRestDay,
    onToggleVitamins,
    onToggleProtein,
    onUpdateNotes,
    onSaveNotes,
    hasUnsavedNotes,
    onCreateExercise,
    onBack,
    ouraScores,
}: DayViewProps) {
    const [exerciseToDelete, setExerciseToDelete] = useState<{id: string, title: string} | null>(null);

    const dayExercises = entry?.exercises.map(entryEx => {
        const fullExercise = exercises.find(ex => ex.id === entryEx.id);
        if (!fullExercise) return null;
        
        // Merge exercise definition with entry data
        return {
            ...fullExercise,
            ...entryEx,
        };
    }).filter(Boolean) as (Exercise & Partial<ExerciseEntry>)[] || [];

    return (
        <div className={cx('day-view', css({
            width: '100%',
        }))}>
            {/* Date Header */}
            <div className={cx('day-header', css({
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
            }))}>
                {onBack && (
                    <button
                        onClick={onBack}
                        className={cx('back-button', css({
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '8px 12px',
                            marginBottom: '0',
                            backgroundColor: 'transparent',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            fontSize: '24px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            tapHighlightColor: 'transparent',
                            md: {
                                display: 'none',
                            },
                            _hover: {
                                borderColor: '#7877c6',
                                backgroundColor: '#1a1a1a',
                            }
                        }))}
                        title="Back to Calendar"
                    >
                        📅
                    </button>
                )}
                <h2 
                    onClick={onBack}
                    className={cx('date-title', css({
                        color: '#ededed',
                        fontSize: '24px',
                        fontWeight: '600',
                        marginBottom: '0',
                        cursor: 'pointer',
                        transition: 'opacity 0.2s ease',
                        _hover: {
                            opacity: 0.8,
                        }
                    }))}
                >
                    {formatDateHeader(date)}
                </h2>
            </div>

            {/* Oura Scores Section */}
            {ouraScores && (
                <div className={css({ marginBottom: '24px' })}>
                    <OuraDayScores scores={ouraScores} />
                </div>
            )}

            {/* Daily Tracking Row */}
            <div className={cx('daily-tracking', css({
                marginBottom: '24px',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
            }))}>
                {/* Rest Day Toggle */}
                <button
                    onClick={onToggleRestDay}
                    className={cx('rest-day-toggle', css({
                        padding: '8px 16px',
                        backgroundColor: entry?.isRestDay ? '#2a2a2a' : 'transparent',
                        border: '1px solid',
                        borderColor: entry?.isRestDay ? '#2563eb' : '#333',
                        borderRadius: '8px',
                        fontSize: '24px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        tapHighlightColor: 'transparent',
                        opacity: entry?.isRestDay ? 1 : 0.5,
                        _hover: {
                            borderColor: '#2563eb',
                            opacity: 1,
                        }
                    }))}
                    title={entry?.isRestDay ? "Marked as Rest Day" : "Mark as Rest Day"}
                >
                    😴
                </button>

                <button
                    onClick={onToggleVitamins}
                    className={cx('tracking-toggle', css({
                        padding: '8px 16px',
                        backgroundColor: entry?.vitaminsTaken ? '#2a2a2a' : 'transparent',
                        border: '1px solid',
                        borderColor: entry?.vitaminsTaken ? '#4ade80' : '#333',
                        borderRadius: '8px',
                        fontSize: '24px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        tapHighlightColor: 'transparent',
                        opacity: entry?.vitaminsTaken ? 1 : 0.5,
                        _hover: {
                            borderColor: '#4ade80',
                            opacity: 1,
                        }
                    }))}
                    title={entry?.vitaminsTaken ? "Vitamins Taken" : "Mark Vitamins Taken"}
                >
                    💊
                </button>

                <button
                    onClick={onToggleProtein}
                    className={cx('tracking-toggle', css({
                        padding: '8px 16px',
                        backgroundColor: entry?.proteinShake ? '#2a2a2a' : 'transparent',
                        border: '1px solid',
                        borderColor: entry?.proteinShake ? '#60a5fa' : '#333',
                        borderRadius: '8px',
                        fontSize: '24px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        tapHighlightColor: 'transparent',
                        opacity: entry?.proteinShake ? 1 : 0.5,
                        _hover: {
                            borderColor: '#60a5fa',
                            opacity: 1,
                        }
                    }))}
                    title={entry?.proteinShake ? "Protein Shake Taken" : "Mark Protein Shake Taken"}
                >
                    🥤
                </button>
            </div>

            {/* General Notes Section */}
            <div className={cx('notes-section', css({
                marginBottom: '24px',
            }))}>
                <label 
                    htmlFor="daily-notes"
                    className={cx('notes-label', css({
                        display: 'block',
                        color: '#ededed',
                        fontSize: '16px',
                        fontWeight: '500',
                        marginBottom: '8px',
                    }))}
                >
                    General Notes
                </label>
                <textarea
                    id="daily-notes"
                    value={entry?.notes || ''}
                    onChange={(e) => onUpdateNotes(e.target.value)}
                    placeholder="Add any thoughts, concerns, pain notes, or observations about your day..."
                    className={cx('notes-textarea', css({
                        width: '100%',
                        minHeight: '100px',
                        padding: '12px',
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        color: '#ededed',
                        fontSize: '16px',
                        lineHeight: '1.5',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        transition: 'border-color 0.2s ease',
                        _focus: {
                            outline: 'none',
                            borderColor: '#2563eb',
                        },
                        _placeholder: {
                            color: '#666',
                        }
                    }))}
                />
                {hasUnsavedNotes && (
                    <button
                        onClick={onSaveNotes}
                        className={cx('save-notes-button', css({
                            marginTop: '12px',
                            padding: '8px 16px',
                            backgroundColor: '#2563eb',
                            border: '1px solid #2563eb',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            _hover: {
                                backgroundColor: '#3b82f6',
                                borderColor: '#3b82f6',
                            }
                        }))}
                    >
                        💾 Save Notes
                    </button>
                )}
            </div>

            {/* Exercises Section */}
            <div className={cx('exercises-section', css({
                marginBottom: '24px',
            }))}>
                {/* Inline Search/Add Exercise */}
                <div className={css({ marginBottom: '16px' })}>
                    <SmartAutocomplete
                        exercises={exercises}
                        entries={entries}
                        onSelect={onAddExercise}
                        onCreateNew={onCreateExercise}
                        placeholder="Search or add exercise..."
                    />
                </div>

                {/* Exercise List with Inline Editing */}
                {dayExercises.length > 0 && (
                    <div className={cx('exercises-list', css({
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                    }))}>
                        {dayExercises.map((exercise) => (
                            <ExerciseCard 
                                key={exercise.id} 
                                exercise={exercise}
                                editable={true}
                                showRemove={true}
                                onUpdate={(data) => onUpdateExercise(exercise.id, data)}
                                onRemove={() => setExerciseToDelete({ id: exercise.id, title: exercise.title })}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {exerciseToDelete && (
                <div className={css({
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '16px',
                })}>
                    <div className={css({
                        backgroundColor: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '400px',
                        width: '100%',
                        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
                    })}>
                        <h3 className={css({
                            color: '#ededed',
                            fontSize: '20px',
                            fontWeight: '600',
                            marginBottom: '12px',
                        })}>
                            Remove Exercise?
                        </h3>
                        <p className={css({
                            color: '#999',
                            fontSize: '16px',
                            marginBottom: '24px',
                            lineHeight: '1.5',
                        })}>
                            Are you sure you want to remove <span className={css({ color: '#ededed', fontWeight: '500' })}>{exerciseToDelete.title}</span>? This action cannot be undone.
                        </p>
                        <div className={css({
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'flex-end',
                        })}>
                            <button
                                onClick={() => setExerciseToDelete(null)}
                                className={css({
                                    padding: '8px 16px',
                                    backgroundColor: 'transparent',
                                    border: '1px solid #333',
                                    borderRadius: '8px',
                                    color: '#ededed',
                                    fontSize: '16px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    _hover: {
                                        backgroundColor: '#333',
                                    }
                                })}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    onRemoveExercise(exerciseToDelete.id);
                                    setExerciseToDelete(null);
                                }}
                                className={css({
                                    padding: '8px 16px',
                                    backgroundColor: '#ef4444',
                                    border: '1px solid #ef4444',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '16px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    _hover: {
                                        backgroundColor: '#dc2626',
                                        borderColor: '#dc2626',
                                    }
                                })}
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
