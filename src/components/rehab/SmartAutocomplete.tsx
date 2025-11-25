'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { css, cx } from '@styled-system/css';
import { searchExercises } from '@/utils/exerciseSearch';

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt: string;
}

interface SmartAutocompleteProps {
    exercises: Exercise[];
    onSelect: (exercise: Exercise) => void;
    onCreateNew: (title: string, description: string) => void;
    placeholder?: string;
}

export default function SmartAutocomplete({ 
    exercises, 
    onSelect, 
    onCreateNew,
    placeholder = "Search exercises..."
}: SmartAutocompleteProps) {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newDescription, setNewDescription] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const filteredExercises = searchExercises(query, exercises);
    const showCreateOption = query.trim().length > 0 && filteredExercises.length === 0;

    // useEffect(() => {
    //     setSelectedIndex(0);
    // }, [query]);

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (showCreateForm) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => 
                Math.min(prev + 1, filteredExercises.length - 1)
            );
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (showCreateOption) {
                setShowCreateForm(true);
            } else if (filteredExercises[selectedIndex]) {
                handleSelect(filteredExercises[selectedIndex]);
            }
        } else if (e.key === 'Escape') {
            setQuery('');
            setSelectedIndex(0);
        }
    };

    const handleSelect = (exercise: Exercise) => {
        onSelect(exercise);
        setQuery('');
        setSelectedIndex(0);
        inputRef.current?.focus();
    };

    const handleCreateNew = () => {
        onCreateNew(query.trim(), newDescription.trim());
        setQuery('');
        setNewDescription('');
        setShowCreateForm(false);
        setSelectedIndex(0);
        inputRef.current?.focus();
    };

    return (
        <div className={cx('smart-autocomplete', css({
            position: 'relative',
            width: '100%',
        }))}>
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className={cx('autocomplete-input', css({
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
                    },
                    _placeholder: {
                        color: '#666',
                    }
                }))}
            />

            {query && (
                <div className={cx('autocomplete-results', css({
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    right: 0,
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    zIndex: 10,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                }))}>
                    {filteredExercises.map((exercise, index) => (
                        <div
                            key={exercise.id}
                            onClick={() => handleSelect(exercise)}
                            className={cx('autocomplete-item', css({
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #2a2a2a',
                                backgroundColor: index === selectedIndex ? '#2a2a2a' : 'transparent',
                                transition: 'background-color 0.15s ease',
                                _last: {
                                    borderBottom: 'none',
                                },
                                _hover: {
                                    backgroundColor: '#2a2a2a',
                                }
                            }))}
                        >
                            <div className={cx('item-title', css({
                                color: '#ededed',
                                fontSize: '14px',
                                fontWeight: '500',
                                marginBottom: '2px',
                            }))}>
                                {exercise.title}
                            </div>
                            {exercise.description && (
                                <div className={cx('item-description', css({
                                    color: '#999',
                                    fontSize: '12px',
                                }))}>
                                    {exercise.description}
                                </div>
                            )}
                        </div>
                    ))}

                    {showCreateOption && !showCreateForm && (
                        <div
                            onClick={() => setShowCreateForm(true)}
                            className={cx('create-new-option', css({
                                padding: '12px 16px',
                                cursor: 'pointer',
                                backgroundColor: '#2a2a2a',
                                color: '#2563eb',
                                fontSize: '14px',
                                fontWeight: '500',
                                transition: 'background-color 0.15s ease',
                                _hover: {
                                    backgroundColor: '#333',
                                }
                            }))}
                        >
                            + Create &quot;{query}&quot;
                        </div>
                    )}

                    {showCreateForm && (
                        <div className={cx('create-form', css({
                            padding: '16px',
                            borderTop: '1px solid #333',
                        }))}>
                            <div className={cx('form-title', css({
                                color: '#ededed',
                                fontSize: '14px',
                                fontWeight: '500',
                                marginBottom: '12px',
                            }))}>
                                Create new exercise: {query}
                            </div>
                            <input
                                type="text"
                                value={newDescription}
                                onChange={(e) => setNewDescription(e.target.value)}
                                placeholder="Description (optional)"
                                className={cx('description-input', css({
                                    width: '100%',
                                    padding: '8px 12px',
                                    fontSize: '13px',
                                    backgroundColor: '#0a0a0a',
                                    border: '1px solid #333',
                                    borderRadius: '6px',
                                    color: '#ededed',
                                    marginBottom: '12px',
                                    outline: 'none',
                                    _focus: {
                                        borderColor: '#2563eb',
                                    },
                                    _placeholder: {
                                        color: '#666',
                                    }
                                }))}
                            />
                            <div className={cx('form-buttons', css({
                                display: 'flex',
                                gap: '8px',
                            }))}>
                                <button
                                    onClick={handleCreateNew}
                                    className={cx('create-button', css({
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        backgroundColor: '#2563eb',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s ease',
                                        tapHighlightColor: 'transparent',
                                        _hover: {
                                            backgroundColor: '#3b82f6',
                                        }
                                    }))}
                                >
                                    Create & Add
                                </button>
                                <button
                                    onClick={() => {
                                        setShowCreateForm(false);
                                        setNewDescription('');
                                    }}
                                    className={cx('cancel-button', css({
                                        flex: 1,
                                        padding: '8px 16px',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        backgroundColor: 'transparent',
                                        color: '#999',
                                        border: '1px solid #333',
                                        borderRadius: '6px',
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
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
