'use client';

import { css, cx } from '@styled-system/css';
import type { ExerciseEntry } from '@/types';

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt?: string;
}

interface ExerciseCardProps {
    exercise: Exercise & Partial<ExerciseEntry>;
    onRemove?: () => void;
    onUpdate?: (data: Partial<Omit<ExerciseEntry, 'id'>>) => void;
    showRemove?: boolean;
    editable?: boolean; // New prop to control if fields are editable
}

function formatTimestamp(timestamp: string): string {
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    } catch {
        return '';
    }
}

export default function ExerciseCard({ 
    exercise, 
    onRemove, 
    onUpdate,
    showRemove = false,
    editable = false 
}: ExerciseCardProps) {
    const handleFieldChange = (field: keyof Omit<ExerciseEntry, 'id'>, value: string | number | boolean | null | undefined) => {
        if (onUpdate && editable) {
            onUpdate({ [field]: value });
        }
    };

    return (
        <div className={cx('exercise-card', css({
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            transition: 'all 0.2s ease',
        }))}>
            {/* Header with title and remove button */}
            <div className={css({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' })}>
                <div className={css({ flex: 1, minWidth: 0 })}>
                    <div className={css({ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' })}>
                        <div className={css({
                            color: '#ededed',
                            fontSize: '19px',
                            fontWeight: '500',
                        })}>
                            {exercise.title}
                        </div>
                        {exercise.timestamp && (
                            <div className={css({
                                color: '#666',
                                fontSize: '13px',
                                fontWeight: '400',
                            })}>
                                {formatTimestamp(exercise.timestamp)}
                            </div>
                        )}
                    </div>
                    {exercise.description && (
                        <div className={css({
                            color: '#999',
                            fontSize: '15px',
                            lineHeight: '1.4',
                        })}>
                            {exercise.description}
                        </div>
                    )}
                </div>
                
                {showRemove && onRemove && (
                    <button
                        onClick={onRemove}
                        className={css({
                            background: 'transparent',
                            border: 'none',
                            color: '#999',
                            cursor: 'pointer',
                            fontSize: '24px',
                            padding: '4px',
                            lineHeight: '1',
                            transition: 'color 0.2s ease',
                            tapHighlightColor: 'transparent',
                            _hover: {
                                color: '#ff6b6b',
                            }
                        })}
                        aria-label="Remove exercise"
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Form fields - only show if editable */}
            {editable && (
                <>
                    {/* All inputs in one row: Time, Weight, Reps, Sets */}
                    <div className={css({ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr 1fr 1fr',
                        gap: '8px',
                    })}>
                        <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px' })}>
                            <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500' })}>
                                Time
                            </label>
                            <input
                                type="text"
                                value={exercise.timeElapsed || ''}
                                onChange={(e) => handleFieldChange('timeElapsed', e.target.value)}
                                placeholder="Min"
                                className={css({
                                    backgroundColor: '#0a0a0a',
                                    border: '1px solid #333',
                                    borderRadius: '4px',
                                    color: '#ededed',
                                    fontSize: '15px',
                                    padding: '6px 10px',
                                    outline: 'none',
                                    transition: 'border-color 0.2s ease',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    _focus: { borderColor: '#2563eb' }
                                })}
                            />
                        </div>

                        <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px' })}>
                            <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500' })}>
                                Weight
                            </label>
                            <input
                                type="text"
                                value={exercise.weight || ''}
                                onChange={(e) => handleFieldChange('weight', e.target.value)}
                                placeholder="Lbs"
                                className={css({
                                    backgroundColor: '#0a0a0a',
                                    border: '1px solid #333',
                                    borderRadius: '4px',
                                    color: '#ededed',
                                    fontSize: '15px',
                                    padding: '6px 10px',
                                    outline: 'none',
                                    transition: 'border-color 0.2s ease',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    _focus: { borderColor: '#2563eb' }
                                })}
                            />
                        </div>

                        <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px' })}>
                            <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500' })}>
                                Reps
                            </label>
                            <input
                                type="number"
                                value={exercise.reps || ''}
                                onChange={(e) => handleFieldChange('reps', e.target.value ? parseInt(e.target.value) : undefined)}
                                placeholder="12"
                                className={css({
                                    backgroundColor: '#0a0a0a',
                                    border: '1px solid #333',
                                    borderRadius: '4px',
                                    color: '#ededed',
                                    fontSize: '15px',
                                    padding: '6px 10px',
                                    outline: 'none',
                                    transition: 'border-color 0.2s ease',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    _focus: { borderColor: '#2563eb' }
                                })}
                            />
                        </div>

                        <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px' })}>
                            <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500' })}>
                                Sets
                            </label>
                            <input
                                type="number"
                                value={exercise.sets || ''}
                                onChange={(e) => handleFieldChange('sets', e.target.value ? parseInt(e.target.value) : undefined)}
                                placeholder="4"
                                className={css({
                                    backgroundColor: '#0a0a0a',
                                    border: '1px solid #333',
                                    borderRadius: '4px',
                                    color: '#ededed',
                                    fontSize: '15px',
                                    padding: '6px 10px',
                                    outline: 'none',
                                    transition: 'border-color 0.2s ease',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    _focus: { borderColor: '#2563eb' }
                                })}
                            />
                        </div>
                    </div>

                    {/* BFR Checkbox */}
                    <div>
                        <label className={css({
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            color: '#ededed',
                            fontSize: '14px',
                            fontWeight: '500',
                        })}>
                            <input
                                type="checkbox"
                                checked={exercise.bfr || false}
                                onChange={(e) => handleFieldChange('bfr', e.target.checked)}
                                className={css({
                                    width: '18px',
                                    height: '18px',
                                    cursor: 'pointer',
                                })}
                            />
                            Blood Flow Restriction (BFR)
                        </label>
                    </div>

                    {/* Pain Level - Optional */}
                    {exercise.painLevel !== null && exercise.painLevel !== undefined ? (
                        <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px' })}>
                            <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500', display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                                <span>Pain Level</span>
                                <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
                                    <span className={css({ color: '#ededed' })}>{exercise.painLevel}/10</span>
                                    <button
                                        onClick={() => handleFieldChange('painLevel', null)}
                                        className={css({
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#666',
                                            cursor: 'pointer',
                                            fontSize: '18px',
                                            padding: '0',
                                            lineHeight: '1',
                                            _hover: { color: '#999' }
                                        })}
                                        title="Remove pain tracking"
                                    >
                                        ×
                                    </button>
                                </div>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="10"
                                value={exercise.painLevel}
                                onChange={(e) => handleFieldChange('painLevel', parseInt(e.target.value))}
                                className={css({
                                    width: '100%',
                                    height: '6px',
                                    borderRadius: '3px',
                                    outline: 'none',
                                    background: 'linear-gradient(to right, #10b981 0%, #f59e0b 50%, #ef4444 100%)',
                                    WebkitAppearance: 'none',
                                    '&::-webkit-slider-thumb': {
                                        appearance: 'none',
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        background: '#ededed',
                                        cursor: 'pointer',
                                    },
                                    '&::-moz-range-thumb': {
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        background: '#ededed',
                                        cursor: 'pointer',
                                        border: 'none',
                                    }
                                })}
                            />
                        </div>
                    ) : (
                        <button
                            onClick={() => handleFieldChange('painLevel', 0)}
                            className={css({
                                padding: '8px 12px',
                                backgroundColor: 'transparent',
                                border: '1px solid #333',
                                borderRadius: '6px',
                                color: '#999',
                                fontSize: '14px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                _hover: {
                                    borderColor: '#2563eb',
                                    color: '#ededed',
                                }
                            })}
                        >
                            + Track Pain Level
                        </button>
                    )}

                    {/* Difficulty Level - Optional */}
                    {exercise.difficultyLevel !== null && exercise.difficultyLevel !== undefined ? (
                        <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px' })}>
                            <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500', display: 'flex', justifyContent: 'space-between', alignItems: 'center' })}>
                                <span>Difficulty</span>
                                <div className={css({ display: 'flex', alignItems: 'center', gap: '8px' })}>
                                    <span className={css({ color: '#ededed' })}>{exercise.difficultyLevel}/10</span>
                                    <button
                                        onClick={() => handleFieldChange('difficultyLevel', null)}
                                        className={css({
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#666',
                                            cursor: 'pointer',
                                            fontSize: '18px',
                                            padding: '0',
                                            lineHeight: '1',
                                            _hover: { color: '#999' }
                                        })}
                                        title="Remove difficulty tracking"
                                    >
                                        ×
                                    </button>
                                </div>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                value={exercise.difficultyLevel}
                                onChange={(e) => handleFieldChange('difficultyLevel', parseInt(e.target.value))}
                                className={css({
                                    width: '100%',
                                    height: '6px',
                                    borderRadius: '3px',
                                    outline: 'none',
                                    background: 'linear-gradient(to right, #10b981 0%, #3b82f6 50%, #8b5cf6 100%)',
                                    WebkitAppearance: 'none',
                                    '&::-webkit-slider-thumb': {
                                        appearance: 'none',
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        background: '#ededed',
                                        cursor: 'pointer',
                                    },
                                    '&::-moz-range-thumb': {
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        background: '#ededed',
                                        cursor: 'pointer',
                                        border: 'none',
                                    }
                                })}
                            />
                        </div>
                    ) : (
                        <button
                            onClick={() => handleFieldChange('difficultyLevel', 1)}
                            className={css({
                                padding: '8px 12px',
                                backgroundColor: 'transparent',
                                border: '1px solid #333',
                                borderRadius: '6px',
                                color: '#999',
                                fontSize: '14px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                _hover: {
                                    borderColor: '#2563eb',
                                    color: '#ededed',
                                }
                            })}
                        >
                            + Track Difficulty
                        </button>
                    )}
                </>
            )}

            {/* Display-only view (when not editable) */}
            {!editable && (() => {
                const parts: string[] = [];
                
                if (exercise.timeElapsed) {
                    parts.push(`${exercise.timeElapsed} minutes`);
                }
                
                if (exercise.weight) {
                    parts.push(`${exercise.weight} lbs`);
                }
                
                if (exercise.reps && exercise.sets) {
                    parts.push(`${exercise.reps}x${exercise.sets}`);
                } else if (exercise.reps) {
                    parts.push(`${exercise.reps}x`);
                } else if (exercise.sets) {
                    parts.push(`x${exercise.sets}`);
                }
                
                const displayText = parts.join(' ');
                const isBFR = exercise.bfr === true;
                const hasPain = exercise.painLevel !== null && exercise.painLevel !== undefined && exercise.painLevel > 0;
                const hasDifficulty = exercise.difficultyLevel !== null && exercise.difficultyLevel !== undefined;
                
                return (
                    <div className={css({ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' })}>
                        {displayText && (
                            <div className={css({
                                color: isBFR ? '#ef4444' : '#60a5fa',
                                fontSize: '16px',
                                fontWeight: '600',
                                display: 'inline-block',
                                backgroundColor: isBFR ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                                padding: '3px 10px',
                                borderRadius: '4px',
                            })}>
                                {isBFR && 'BFR '}
                                {displayText}
                            </div>
                        )}

                        {hasPain && (
                            <div className={css({
                                color: exercise.painLevel! <= 3 ? '#10b981' : exercise.painLevel! <= 6 ? '#f59e0b' : '#ef4444',
                                fontSize: '14px',
                                fontWeight: '600',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                            })}>
                                Pain: {exercise.painLevel}/10
                            </div>
                        )}

                        {hasDifficulty && (
                            <div className={css({
                                color: '#a78bfa',
                                fontSize: '14px',
                                fontWeight: '600',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                            })}>
                                Diff: {exercise.difficultyLevel}/10
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}
