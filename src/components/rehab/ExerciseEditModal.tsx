'use client';

import { useState } from 'react';
import { css, cx } from '@styled-system/css';

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt: string;
}

interface ExerciseEditModalProps {
    exercise: Exercise;
    onSave: (id: string, title: string, description: string) => Promise<void>;
    onCancel: () => void;
}

export default function ExerciseEditModal({ exercise, onSave, onCancel }: ExerciseEditModalProps) {
    const [title, setTitle] = useState(exercise.title);
    const [description, setDescription] = useState(exercise.description);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!title.trim()) return;
        
        setIsSaving(true);
        try {
            await onSave(exercise.id, title.trim(), description.trim());
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
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
        }))}>
            <div className={cx('edit-modal', css({
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
                    fontSize: '18px',
                    fontWeight: '600',
                    marginBottom: '20px',
                }))}>
                    Edit Exercise
                </h3>

                <div className={cx('form-group', css({ marginBottom: '16px' }))}>
                    <label className={cx('label', css({
                        display: 'block',
                        color: '#999',
                        fontSize: '13px',
                        fontWeight: '500',
                        marginBottom: '8px',
                    }))}>
                        Title
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={cx('input', css({
                            width: '100%',
                            padding: '10px 12px',
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            color: '#ededed',
                            fontSize: '14px',
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
                        fontSize: '13px',
                        fontWeight: '500',
                        marginBottom: '8px',
                    }))}>
                        Description
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className={cx('textarea', css({
                            width: '100%',
                            padding: '10px 12px',
                            backgroundColor: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            color: '#ededed',
                            fontSize: '14px',
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
                            padding: '10px',
                            backgroundColor: 'transparent',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            color: '#999',
                            fontSize: '14px',
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
                            padding: '10px',
                            backgroundColor: '#2563eb',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '14px',
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
