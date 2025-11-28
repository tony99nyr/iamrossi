'use client';

import { useState, useRef, useEffect } from 'react';
import { css, cx } from '@styled-system/css';
import type { ExerciseEntry } from '@/types';

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt: string;
}

interface ExerciseWithData extends Exercise, Partial<Omit<ExerciseEntry, 'id'>> {}

interface ExerciseEditModalProps {
    exercise: ExerciseWithData;
    onSave: (id: string, title: string, description: string, data: Partial<Omit<ExerciseEntry, 'id'>>) => Promise<void>;
    onCancel: () => void;
}

export default function ExerciseEditModal({ exercise, onSave, onCancel }: ExerciseEditModalProps) {
    const [title, setTitle] = useState(exercise.title);
    const [description, setDescription] = useState(exercise.description);
    const [timeElapsed, setTimeElapsed] = useState(exercise.timeElapsed || '');
    const [weight, setWeight] = useState(exercise.weight || '');
    const [reps, setReps] = useState(exercise.reps?.toString() || '');
    const [sets, setSets] = useState(exercise.sets?.toString() || '');
    const [painLevel, setPainLevel] = useState(exercise.painLevel ?? 0);
    const [difficultyLevel, setDifficultyLevel] = useState(exercise.difficultyLevel ?? 1);
    const [isSaving, setIsSaving] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus title input on mount
    useEffect(() => {
        titleInputRef.current?.focus();
    }, []);

    const handleInputFocus = (element: HTMLElement) => {
        setTimeout(() => {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
    };

    const handleSave = async () => {
        if (!title.trim()) return;

        setIsSaving(true);
        try {
            const data: Partial<Omit<ExerciseEntry, 'id'>> = {};
            if (timeElapsed) data.timeElapsed = timeElapsed;
            if (weight) data.weight = weight;
            if (reps) data.reps = parseInt(reps);
            if (sets) data.sets = parseInt(sets);
            if (painLevel !== undefined) data.painLevel = painLevel;
            if (difficultyLevel !== undefined) data.difficultyLevel = difficultyLevel;

            await onSave(exercise.id, title.trim(), description.trim(), data);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className={cx('edit-modal-overlay', css({
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '16px',
            paddingTop: '60px',
            overflowY: 'auto',
            md: {
                alignItems: 'center',
                paddingTop: '16px',
            }
        }))}>
            <div ref={modalRef} className={cx('edit-modal', css({
                backgroundColor: '#1a1a1a',
                width: '100%',
                maxWidth: '500px',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                animation: 'fadeIn 0.2s ease-out',
            }))}>
                <h3 className={cx('modal-title', css({
                    color: '#ededed',
                    fontSize: '22px',
                    fontWeight: '600',
                    marginBottom: '20px',
                }))}>
                    Edit Exercise
                </h3>

                <div className={cx('form-group', css({ marginBottom: '16px' }))}>
                    <label className={cx('label', css({
                        display: 'block',
                        color: '#999',
                        fontSize: '14px',
                        fontWeight: '500',
                        marginBottom: '8px',
                    }))}>
                        Title
                    </label>
                    <input
                        ref={titleInputRef}
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onFocus={(e) => handleInputFocus(e.target)}
                        className={cx('input', css({
                            width: '100%',
                            padding: '12px 14px',
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            color: '#ededed',
                            fontSize: '16px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease',
                            _focus: {
                                borderColor: '#2563eb',
                            }
                        }))}
                    />
                </div>

                {/* Exercise Data Fields */}
                <div className={css({
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    marginBottom: '16px',
                })}>
                    <div>
                        <label className={css({
                            display: 'block',
                            color: '#999',
                            fontSize: '13px',
                            fontWeight: '500',
                            marginBottom: '6px',
                        })}>
                            Time
                        </label>
                        <input
                            type="text"
                            value={timeElapsed}
                            onChange={(e) => setTimeElapsed(e.target.value)}
                            placeholder="e.g. 45 min"
                            className={css({
                                width: '100%',
                                padding: '10px 12px',
                                backgroundColor: '#0a0a0a',
                                border: '1px solid #333',
                                borderRadius: '4px',
                                color: '#ededed',
                                fontSize: '15px',
                                outline: 'none',
                                _focus: { borderColor: '#2563eb' }
                            })}
                        />
                    </div>

                    <div>
                        <label className={css({
                            display: 'block',
                            color: '#999',
                            fontSize: '13px',
                            fontWeight: '500',
                            marginBottom: '6px',
                        })}>
                            Weight
                        </label>
                        <input
                            type="text"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            placeholder="e.g. 135lb"
                            className={css({
                                width: '100%',
                                padding: '10px 12px',
                                backgroundColor: '#0a0a0a',
                                border: '1px solid #333',
                                borderRadius: '4px',
                                color: '#ededed',
                                fontSize: '15px',
                                outline: 'none',
                                _focus: { borderColor: '#2563eb' }
                            })}
                        />
                    </div>

                    <div>
                        <label className={css({
                            display: 'block',
                            color: '#999',
                            fontSize: '13px',
                            fontWeight: '500',
                            marginBottom: '6px',
                        })}>
                            Reps
                        </label>
                        <input
                            type="number"
                            value={reps}
                            onChange={(e) => setReps(e.target.value)}
                            className={css({
                                width: '100%',
                                padding: '10px 12px',
                                backgroundColor: '#0a0a0a',
                                border: '1px solid #333',
                                borderRadius: '4px',
                                color: '#ededed',
                                fontSize: '15px',
                                outline: 'none',
                                _focus: { borderColor: '#2563eb' }
                            })}
                        />
                    </div>

                    <div>
                        <label className={css({
                            display: 'block',
                            color: '#999',
                            fontSize: '13px',
                            fontWeight: '500',
                            marginBottom: '6px',
                        })}>
                            Sets
                        </label>
                        <input
                            type="number"
                            value={sets}
                            onChange={(e) => setSets(e.target.value)}
                            className={css({
                                width: '100%',
                                padding: '10px 12px',
                                backgroundColor: '#0a0a0a',
                                border: '1px solid #333',
                                borderRadius: '4px',
                                color: '#ededed',
                                fontSize: '15px',
                                outline: 'none',
                                _focus: { borderColor: '#2563eb' }
                            })}
                        />
                    </div>
                </div>

                {/* Pain Level Slider */}
                <div className={css({ marginBottom: '16px' })}>
                    <div className={css({ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' })}>
                        <label className={css({ color: '#999', fontSize: '13px', fontWeight: '500' })}>
                            Pain Level
                        </label>
                        <span className={css({ color: '#ededed', fontSize: '13px', fontWeight: '600' })}>
                            {painLevel}/10
                        </span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="10"
                        value={painLevel}
                        onChange={(e) => setPainLevel(parseInt(e.target.value))}
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

                {/* Difficulty Level Slider */}
                <div className={css({ marginBottom: '16px' })}>
                    <div className={css({ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' })}>
                        <label className={css({ color: '#999', fontSize: '13px', fontWeight: '500' })}>
                            Difficulty
                        </label>
                        <span className={css({ color: '#ededed', fontSize: '13px', fontWeight: '600' })}>
                            {difficultyLevel}/10
                        </span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="10"
                        value={difficultyLevel}
                        onChange={(e) => setDifficultyLevel(parseInt(e.target.value))}
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

                <div className={cx('form-group', css({ marginBottom: '24px' }))}>
                    <label className={cx('label', css({
                        display: 'block',
                        color: '#999',
                        fontSize: '14px',
                        fontWeight: '500',
                        marginBottom: '8px',
                    }))}>
                        Description
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onFocus={(e) => handleInputFocus(e.target)}
                        rows={3}
                        className={cx('textarea', css({
                            width: '100%',
                            padding: '12px 14px',
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            color: '#ededed',
                            fontSize: '15px',
                            outline: 'none',
                            resize: 'none',
                            transition: 'border-color 0.2s ease',
                            _focus: {
                                borderColor: '#2563eb',
                            }
                        }))}
                    />
                </div>

                <div className={cx('actions', css({
                    display: 'flex',
                    gap: '12px',
                }))}>
                    <button
                        onClick={onCancel}
                        disabled={isSaving}
                        className={cx('cancel-button', css({
                            flex: 1,
                            padding: '14px',
                            backgroundColor: 'transparent',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            color: '#999',
                            fontSize: '17px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            _hover: {
                                borderColor: '#666',
                                color: '#ededed',
                            },
                            _disabled: {
                                opacity: 0.5,
                                cursor: 'not-allowed',
                            }
                        }))}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !title.trim()}
                        className={cx('save-button', css({
                            flex: 1,
                            padding: '14px',
                            backgroundColor: '#2563eb',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '17px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s ease',
                            _hover: {
                                backgroundColor: '#3b82f6',
                            },
                            _disabled: {
                                opacity: 0.5,
                                cursor: 'not-allowed',
                            }
                        }))}
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}
