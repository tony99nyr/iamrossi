'use client';

import { useState, useEffect } from 'react';
import { css, cx } from '@styled-system/css';
import { Reorder, useDragControls } from 'framer-motion';
import SmartAutocomplete from './SmartAutocomplete';
import ExerciseCard from './ExerciseCard';
import type { Exercise, ExerciseEntry } from '@/types';

interface SelectedExercise extends Exercise, Omit<ExerciseEntry, 'id'> {}

interface ExerciseEntryFormProps {
    date: string;
    exercises: Exercise[];
    selectedExercises: SelectedExercise[];
    onAddExercise: (exercise: Exercise) => void;
    onRemoveExercise: (id: string) => void;
    onUpdateExerciseData: (id: string, data: Partial<Omit<ExerciseEntry, 'id'>>) => void;
    onReorder: (exercises: SelectedExercise[]) => void;
    onCreateExercise: (title: string, description: string) => Promise<Exercise>;
    onSave: () => void;
    onCancel: () => void;
}

function formatDateForInput(dateStr: string): string {
    return dateStr;
}

interface ReorderableExerciseItemProps {
    exercise: SelectedExercise;
    onRemove: (id: string) => void;
    onUpdateExerciseData: (id: string, data: Partial<Omit<ExerciseEntry, 'id'>>) => void;
}

function ReorderableExerciseItem({ exercise, onRemove, onUpdateExerciseData }: ReorderableExerciseItemProps) {
    const dragControls = useDragControls();

    return (
        <Reorder.Item
            key={exercise.id}
            value={exercise}
            dragListener={false}
            dragControls={dragControls}
            dragElastic={0.05}
            dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
            className={cx('exercise-item', css({
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                backgroundColor: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '12px',
                cursor: 'default',
                position: 'relative',
                touchAction: 'pan-y',
            }))}
        >
            <div
                className={cx('drag-handle', css({
                    position: 'absolute',
                    left: '50%',
                    top: '4px',
                    transform: 'translateX(-50%)',
                    width: '60px',
                    height: '28px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    cursor: 'grab',
                    touchAction: 'none',
                    _active: { cursor: 'grabbing' }
                }))}
                onPointerDown={(e) => dragControls.start(e)}
            >
                <div className={css({
                    width: '32px',
                    height: '4px',
                    borderRadius: '2px',
                    backgroundColor: '#666',
                })} />
            </div>

            <div className={css({ paddingTop: '8px' })}>
                <ExerciseCard
                    exercise={exercise}
                    onRemove={() => onRemove(exercise.id)}
                    showRemove
                />
            </div>
            
            {/* Exercise Data Inputs */}
            <div className={cx('exercise-data-inputs', css({
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                paddingLeft: '4px',
            }))}>
                {/* Time Elapsed */}
                <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px' })}>
                    <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500' })}>
                        Time
                    </label>
                    <input
                        type="text"
                        value={exercise.timeElapsed || ''}
                        onChange={(e) => onUpdateExerciseData(exercise.id, { timeElapsed: e.target.value })}
                        placeholder="Minutes"
                        className={cx('time-input', css({
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '4px',
                            color: '#ededed',
                            fontSize: '15px',
                            padding: '6px 10px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease',
                            _focus: { borderColor: '#2563eb' }
                        }))}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* Weight */}
                <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px' })}>
                    <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500' })}>
                        Weight
                    </label>
                    <input
                        type="text"
                        value={exercise.weight || ''}
                        onChange={(e) => onUpdateExerciseData(exercise.id, { weight: e.target.value })}
                        placeholder="Pounds"
                        className={cx('weight-input', css({
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '4px',
                            color: '#ededed',
                            fontSize: '15px',
                            padding: '6px 10px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease',
                            _focus: { borderColor: '#2563eb' }
                        }))}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* Reps */}
                <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px' })}>
                    <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500' })}>
                        Reps
                    </label>
                    <input
                        type="number"
                        value={exercise.reps || ''}
                        onChange={(e) => onUpdateExerciseData(exercise.id, { reps: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="12"
                        className={cx('reps-input', css({
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '4px',
                            color: '#ededed',
                            fontSize: '15px',
                            padding: '6px 10px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease',
                            _focus: { borderColor: '#2563eb' }
                        }))}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* Sets */}
                <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px' })}>
                    <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500' })}>
                        Sets
                    </label>
                    <input
                        type="number"
                        value={exercise.sets || ''}
                        onChange={(e) => onUpdateExerciseData(exercise.id, { sets: e.target.value ? parseInt(e.target.value) : undefined })}
                        placeholder="4"
                        className={cx('sets-input', css({
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '4px',
                            color: '#ededed',
                            fontSize: '15px',
                            padding: '6px 10px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease',
                            _focus: { borderColor: '#2563eb' }
                        }))}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* BFR Checkbox */}
                <div className={css({ gridColumn: '1 / -1', marginTop: '4px' })}>
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
                            onChange={(e) => onUpdateExerciseData(exercise.id, { bfr: e.target.checked })}
                            className={css({
                                width: '18px',
                                height: '18px',
                                cursor: 'pointer',
                            })}
                            onPointerDown={(e) => e.stopPropagation()}
                        />
                        Blood Flow Restriction (BFR)
                    </label>
                </div>

                {/* Pain Level */}
                <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' })}>
                    <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500', display: 'flex', justifyContent: 'space-between' })}>
                        <span>Pain Level</span>
                        <span className={css({ color: '#ededed' })}>{exercise.painLevel ?? 0}/10</span>
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="10"
                        value={exercise.painLevel || 0}
                        onChange={(e) => onUpdateExerciseData(exercise.id, { painLevel: parseInt(e.target.value) })}
                        className={cx('pain-slider', css({
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
                        }))}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                </div>

                {/* Difficulty Level */}
                <div className={css({ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' })}>
                    <label className={css({ color: '#999', fontSize: '14px', fontWeight: '500', display: 'flex', justifyContent: 'space-between' })}>
                        <span>Difficulty</span>
                        <span className={css({ color: '#ededed' })}>{exercise.difficultyLevel ?? 1}/10</span>
                    </label>
                    <input
                        type="range"
                        min="1"
                        max="10"
                        value={exercise.difficultyLevel || 1}
                        onChange={(e) => onUpdateExerciseData(exercise.id, { difficultyLevel: parseInt(e.target.value) })}
                        className={cx('difficulty-slider', css({
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
                        }))}
                        onPointerDown={(e) => e.stopPropagation()}
                    />
                </div>
            </div>
        </Reorder.Item>
    );
}

export default function ExerciseEntryForm({
    date,
    exercises,
    selectedExercises,
    onAddExercise,
    onRemoveExercise,
    onUpdateExerciseData,
    onReorder,
    onCreateExercise,
    onSave,
    onCancel,
}: ExerciseEntryFormProps) {
    const [entryDate, setEntryDate] = useState(formatDateForInput(date));

    // Prevent background scrolling when modal is open
    useEffect(() => {
        // Save current scroll position
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;
        
        // Apply fixed positioning to body
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = `-${scrollX}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';

        // Cleanup: restore scrolling on unmount
        return () => {
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.left = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
            
            // Restore scroll position
            window.scrollTo(scrollX, scrollY);
        };
    }, []);

    const handleCreateNew = async (title: string, description: string) => {
        const newExercise = await onCreateExercise(title, description);
        onAddExercise(newExercise);
    };

    return (
        <div className={cx('exercise-entry-form', css({
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'flex-end',
            md: {
                alignItems: 'center',
                justifyContent: 'center',
            }
        }))}>
            <div className={cx('form-container', css({
                backgroundColor: '#0a0a0a',
                width: '100%',
                maxWidth: '600px',
                borderRadius: '16px 16px 0 0',
                padding: '24px',
                maxHeight: '90vh',
                overflowY: 'auto',
                animation: 'slideIn 0.3s ease-out',
                position: 'relative',
                md: {
                    borderRadius: '16px',
                }
            }))}>
                {/* Close Button */}
                <button
                    onClick={onCancel}
                    className={cx('close-btn', css({
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.6)',
                        fontSize: '28px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        lineHeight: '1',
                        transition: 'all 0.2s ease',
                        userSelect: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        _hover: {
                            color: '#fff',
                            transform: 'scale(1.1)',
                        },
                        _active: {
                            transform: 'scale(0.95)',
                        },
                    }))}
                    aria-label="Close"
                >
                    ✕
                </button>

                {/* Header */}
                <div className={cx('form-header', css({
                    marginBottom: '24px',
                }))}>
                    <h2 className={cx('form-title', css({
                        color: '#ededed',
                        fontSize: '22px',
                        fontWeight: '600',
                        marginBottom: '16px',
                    }))}>
                        Log Exercise
                    </h2>

                    {/* Date Picker */}
                    <div className={cx('date-field', css({
                        marginBottom: '16px',
                    }))}>
                        <label className={cx('field-label', css({
                            display: 'block',
                            color: '#999',
                            fontSize: '17px',
                            fontWeight: '500',
                            marginBottom: '8px',
                        }))}>
                            Date
                        </label>
                        <input
                            type="date"
                            value={entryDate}
                            onChange={(e) => setEntryDate(e.target.value)}
                            onFocus={(e) => {
                                setTimeout(() => {
                                    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 300);
                            }}
                            className={cx('date-input', css({
                                width: '100%',
                                padding: '14px 16px',
                                fontSize: '17px',
                                backgroundColor: '#1a1a1a',
                                border: '1px solid #333',
                                borderRadius: '8px',
                                color: '#ededed',
                                outline: 'none',
                                transition: 'border-color 0.2s ease',
                                _focus: {
                                    borderColor: '#2563eb',
                                }
                            }))}
                        />
                    </div>
                </div>

                {/* Autocomplete */}
                <div className={cx('autocomplete-section', css({
                    marginBottom: '24px',
                }))}>
                    <label className={cx('field-label', css({
                        display: 'block',
                        color: '#999',
                        fontSize: '17px',
                        fontWeight: '500',
                        marginBottom: '8px',
                    }))}>
                        Search Exercises
                    </label>
                    <SmartAutocomplete
                        exercises={exercises}
                        onSelect={onAddExercise}
                        onCreateNew={handleCreateNew}
                        placeholder="Type to search or create new..."
                    />
                </div>

                {/* Selected Exercises */}
                {selectedExercises.length > 0 && (
                    <div className={cx('selected-exercises', css({
                        marginBottom: '24px',
                    }))}>
                        <label className={cx('field-label', css({
                            display: 'block',
                            color: '#999',
                            fontSize: '17px',
                            fontWeight: '500',
                            marginBottom: '12px',
                        }))}>
                            Added Exercises ({selectedExercises.length})
                        </label>
                        
                        <Reorder.Group
                            axis="y"
                            values={selectedExercises}
                            onReorder={onReorder}
                            className={cx('selected-list', css({
                                flex: 1,
                                overflowY: 'auto',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                marginBottom: '20px',
                                paddingRight: '4px',
                                listStyle: 'none',
                                padding: 0,
                                margin: 0,
                            }))}
                        >
                            {selectedExercises.map((exercise) => (
                                <ReorderableExerciseItem
                                    key={exercise.id}
                                    exercise={exercise}
                                    onRemove={onRemoveExercise}
                                    onUpdateExerciseData={onUpdateExerciseData}
                                />
                            ))}
                        </Reorder.Group>
                    </div>
                )}

                {/* Action Buttons */}
                <div className={cx('form-actions', css({
                    display: 'flex',
                    gap: '12px',
                    paddingTop: '16px',
                    borderTop: '1px solid #333',
                }))}>
                    <button
                        onClick={onCancel}
                        className={cx('cancel-button', css({
                            flex: 1,
                            padding: '14px 24px',
                            fontSize: '17px',
                            fontWeight: '500',
                            backgroundColor: 'transparent',
                            color: '#999',
                            border: '1px solid #333',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            tapHighlightColor: 'transparent',
                            _hover: {
                                borderColor: '#666',
                                color: '#ededed',
                            }
                        }))}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        disabled={selectedExercises.length === 0}
                        className={cx('save-button', css({
                            flex: 1,
                            padding: '14px 24px',
                            fontSize: '17px',
                            fontWeight: '500',
                            backgroundColor: '#2563eb',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s ease',
                            tapHighlightColor: 'transparent',
                            _hover: {
                                backgroundColor: '#3b82f6',
                            },
                            _disabled: {
                                opacity: 0.5,
                                cursor: 'not-allowed',
                            }
                        }))}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}
