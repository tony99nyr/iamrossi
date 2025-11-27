'use client';

import { css, cx } from '@styled-system/css';
import ExerciseCard from './ExerciseCard';

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

interface DayViewProps {
    date: string;
    entry: RehabEntry | undefined;
    exercises: Exercise[];
    onAddExercise: () => void;
    onToggleRestDay: () => void;
    onToggleVitamins: () => void;
    onToggleProtein: () => void;
    onEditExercise: (exercise: Exercise) => void;
    onBack?: () => void;
}

function formatDateHeader(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
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
    onAddExercise,
    onToggleRestDay,
    onToggleVitamins,
    onToggleProtein,
    onEditExercise,
    onBack,
}: DayViewProps) {
    const dayExercises = entry?.exercises.map(entryEx => {
        const fullExercise = exercises.find(ex => ex.id === entryEx.id);
        return fullExercise ? { ...fullExercise, weight: entryEx.weight } : null;
    }).filter(Boolean) as Exercise[] || [];

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

            {/* Exercises Section */}
            <div className={cx('exercises-section', css({
                marginBottom: '24px',
            }))}>
                <div className={cx('section-header', css({
                    display: 'flex',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                    marginBottom: '16px',
                }))}>

                    <button
                        onClick={onAddExercise}
                        className={cx('add-button', css({
                            padding: '8px 16px',
                            backgroundColor: '#2563eb',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#000',
                            fontSize: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            tapHighlightColor: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 10px rgba(37, 99, 235, 0.3)',
                            _hover: {
                                boxShadow: '0 0 15px rgba(37, 99, 235, 0.5)',

                            }
                        }))}
                        title="Add Exercise"
                    >
                        💪
                    </button>
                </div>

                {dayExercises.length > 0 ? (
                    <div className={cx('exercises-list', css({
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }))}>
                        {dayExercises.map((exercise) => (
                            <ExerciseCard 
                                key={exercise.id} 
                                exercise={exercise}
                                onEdit={() => onEditExercise(exercise)}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
