'use client';

import { useState, useRef, useEffect } from 'react';
import { css, cx } from '@styled-system/css';

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt: string;
    weight?: string;
}

interface ExerciseEditModalProps {
    exercise: Exercise;
    onSave: (id: string, title: string, description: string, weight?: string) => Promise<void>;
    onCancel: () => void;
}

export default function ExerciseEditModal({ exercise, onSave, onCancel }: ExerciseEditModalProps) {
    const [title, setTitle] = useState(exercise.title);
    const [description, setDescription] = useState(exercise.description);
    const [weight, setWeight] = useState(exercise.weight || '');
    const [isSaving, setIsSaving] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const weightInputRef = useRef<HTMLInputElement>(null);
    const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-focus title input on mount
    useEffect(() => {
        titleInputRef.current?.focus();
    }, []);

    const handleInputFocus = (element: HTMLInputElement | HTMLTextAreaElement) => {
        setTimeout(() => {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300); // Delay to allow keyboard to appear
    };

    const handleSave = async () => {
        if (!title.trim()) return;

        setIsSaving(true);
        try {
            await onSave(exercise.id, title.trim(), description.trim(), weight.trim() || undefined);
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
                maxWidth: '400px',
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
                        fontSize: '17px',
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
                            padding: '14px 16px',
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            color: '#ededed',
                            fontSize: '18px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease',
                            _focus: {
                                borderColor: '#2563eb',
                            }
                        }))}
                    />
                </div>

                <div className={cx('form-group', css({ marginBottom: '16px' }))}>
                    <label className={cx('label', css({
                        display: 'block',
                        color: '#999',
                        fontSize: '17px',
                        fontWeight: '500',
                        marginBottom: '8px',
                    }))}>
                        Weight / Reps
                    </label>
                    <input
                        ref={weightInputRef}
                        type="text"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        onFocus={(e) => handleInputFocus(e.target)}
                        placeholder="e.g. 135lb 12x4"
                        className={cx('input', css({
                            width: '100%',
                            padding: '14px 16px',
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            color: '#ededed',
                            fontSize: '18px',
                            outline: 'none',
                            transition: 'border-color 0.2s ease',
                            _focus: {
                                borderColor: '#2563eb',
                            }
                        }))}
                    />
                </div>

                <div className={cx('form-group', css({ marginBottom: '24px' }))}>
                    <label className={cx('label', css({
                        display: 'block',
                        color: '#999',
                        fontSize: '17px',
                        fontWeight: '500',
                        marginBottom: '8px',
                    }))}>
                        Description
                    </label>
                    <textarea
                        ref={descriptionInputRef}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onFocus={(e) => handleInputFocus(e.target)}
                        rows={3}
                        className={cx('textarea', css({
                            width: '100%',
                            padding: '14px 16px',
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            color: '#ededed',
                            fontSize: '18px',
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
                            fontSize: '18px',
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
                            fontSize: '18px',
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
