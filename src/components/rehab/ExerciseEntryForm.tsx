'use client';

import { useState } from 'react';
import { css, cx } from '@styled-system/css';
import SmartAutocomplete from './SmartAutocomplete';
import ExerciseCard from './ExerciseCard';

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt: string;
}

interface SelectedExercise extends Exercise {
    weight?: string;
}

interface ExerciseEntryFormProps {
    date: string;
    exercises: Exercise[];
    selectedExercises: SelectedExercise[];
    onAddExercise: (exercise: Exercise) => void;
    onRemoveExercise: (id: string) => void;
    onUpdateWeight: (id: string, weight: string) => void;
    onCreateExercise: (title: string, description: string) => Promise<Exercise>;
    onSave: () => void;
    onCancel: () => void;
}

function formatDateForInput(dateStr: string): string {
    return dateStr;
}

export default function ExerciseEntryForm({
    date,
    exercises,
    selectedExercises,
    onAddExercise,
    onRemoveExercise,
    onUpdateWeight,
    onCreateExercise,
    onSave,
    onCancel,
}: ExerciseEntryFormProps) {
    const [entryDate, setEntryDate] = useState(formatDateForInput(date));

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
                md: {
                    borderRadius: '16px',
                }
            }))}>
                {/* Header */}
                <div className={cx('form-header', css({
                    marginBottom: '24px',
                }))}>
                    <h2 className={cx('form-title', css({
                        color: '#ededed',
                        fontSize: '20px',
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
                            fontSize: '13px',
                            fontWeight: '500',
                            marginBottom: '8px',
                        }))}>
                            Date
                        </label>
                        <input
                            type="date"
                            value={entryDate}
                            onChange={(e) => setEntryDate(e.target.value)}
                            className={cx('date-input', css({
                                width: '100%',
                                padding: '12px 16px',
                                fontSize: '15px',
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
                        fontSize: '13px',
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
                            fontSize: '13px',
                            fontWeight: '500',
                            marginBottom: '12px',
                        }))}>
                            Added Exercises ({selectedExercises.length})
                        </label>
                        <div className={cx('selected-list', css({
                    flex: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginBottom: '20px',
                    paddingRight: '4px',
                }))}>
                    {selectedExercises.length === 0 ? (
                        <div className={cx('empty-state', css({
                            color: '#666',
                            fontSize: '14px',
                            textAlign: 'center',
                            padding: '20px',
                            border: '1px dashed #333',
                            borderRadius: '8px',
                        }))}>
                            No exercises added yet
                        </div>
                    ) : (
                        selectedExercises.map((exercise) => (
                            <div key={exercise.id} className={cx('exercise-item', css({
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                backgroundColor: '#1a1a1a',
                                border: '1px solid #333',
                                borderRadius: '8px',
                                padding: '12px',
                            }))}>
                                <ExerciseCard
                                    exercise={exercise}
                                    onRemove={() => onRemoveExercise(exercise.id)}
                                    showRemove
                                />
                                <div className={cx('weight-input-container', css({
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    paddingLeft: '4px',
                                }))}>
                                    <label className={cx('weight-label', css({
                                        color: '#999',
                                        fontSize: '12px',
                                        fontWeight: '500',
                                    }))}>
                                        Weight:
                                    </label>
                                    <input
                                        type="text"
                                        value={exercise.weight || ''}
                                        onChange={(e) => onUpdateWeight(exercise.id, e.target.value)}
                                        placeholder="e.g. 30lbs"
                                        className={cx('weight-input', css({
                                            backgroundColor: '#0a0a0a',
                                            border: '1px solid #333',
                                            borderRadius: '4px',
                                            color: '#ededed',
                                            fontSize: '12px',
                                            padding: '4px 8px',
                                            width: '100px',
                                            outline: 'none',
                                            _focus: {
                                                borderColor: '#2563eb',
                                            }
                                        }))}
                                    />
                                </div>
                            </div>
                        ))
                    )}
                </div>
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
                            padding: '12px 24px',
                            fontSize: '15px',
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
                            padding: '12px 24px',
                            fontSize: '15px',
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
