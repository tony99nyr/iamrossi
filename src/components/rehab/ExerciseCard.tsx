'use client';

import { css, cx } from '@styled-system/css';

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt?: string;
    weight?: string;
}

interface ExerciseCardProps {
    exercise: Exercise;
    onRemove?: () => void;
    onEdit?: () => void;
    showRemove?: boolean;
    onClick?: () => void;
}

export default function ExerciseCard({ exercise, onRemove, onEdit, showRemove = false, onClick }: ExerciseCardProps) {
    return (
        <div 
            onClick={onClick}
            className={cx('exercise-card', css({
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            transition: 'all 0.2s ease',
            cursor: onClick ? 'pointer' : 'default',
            _hover: {
                borderColor: '#2563eb',
            }
        }))}>
            <div className={cx('exercise-info', css({
                flex: 1,
                minWidth: 0,
            }))}>
                <div className={cx('exercise-title', css({
                    color: '#ededed',
                    fontSize: '15px',
                    fontWeight: '500',
                    marginBottom: '4px',
                }))}>
                    {exercise.title}
                </div>
                {exercise.description && (
                    <div className={cx('exercise-description', css({
                        color: '#999',
                        fontSize: '13px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: '4px',
                    }))}>
                        {exercise.description}
                    </div>
                )}
                {exercise.weight && (
                    <div className={cx('exercise-weight', css({
                        color: '#2563eb',
                        fontSize: '12px',
                        fontWeight: '600',
                        marginTop: '4px',
                        display: 'inline-block',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                    }))}>
                        {exercise.weight}
                    </div>
                )}
            </div>
            
            <div className={cx('actions', css({
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
            }))}>
                {onEdit && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
                        }}
                        className={cx('edit-button', css({
                            background: 'transparent',
                            border: 'none',
                            color: '#666',
                            cursor: 'pointer',
                            fontSize: '14px',
                            padding: '4px',
                            transition: 'color 0.2s ease',
                            tapHighlightColor: 'transparent',
                            _hover: {
                                color: '#7877c6',
                            }
                        }))}
                        aria-label="Edit exercise"
                    >
                        ✎
                    </button>
                )}
                
                {showRemove && onRemove && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove();
                        }}
                        className={cx('remove-button', css({
                            background: 'transparent',
                            border: 'none',
                            color: '#999',
                            cursor: 'pointer',
                            fontSize: '20px',
                            padding: '4px 8px',
                            transition: 'color 0.2s ease',
                            tapHighlightColor: 'transparent',
                            _hover: {
                                color: '#ff6b6b',
                            }
                        }))}
                        aria-label="Remove exercise"
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}
