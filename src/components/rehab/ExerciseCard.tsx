'use client';

import { css, cx } from '@styled-system/css';

interface Exercise {
    id: string;
    title: string;
    description: string;
    createdAt?: string;
    timeElapsed?: string;
    weight?: string;
    reps?: number;
    sets?: number;
    bfr?: boolean;
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
                    fontSize: '19px',
                    fontWeight: '500',
                    marginBottom: '4px',
                }))}>
                    {exercise.title}
                </div>
                {exercise.description && (
                    <div className={cx('exercise-description', css({
                        color: '#999',
                        fontSize: '17px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: '4px',
                    }))}>
                        {exercise.description}
                    </div>
                )}
                {(() => {
                    // Format exercise data for display
                    const parts: string[] = [];
                    
                    // Always show time if present
                    if (exercise.timeElapsed) {
                        parts.push(exercise.timeElapsed);
                    }
                    
                    // Always show weight if present
                    if (exercise.weight) {
                        parts.push(exercise.weight);
                    }
                    
                    // Always show reps/sets if present
                    if (exercise.reps && exercise.sets) {
                        parts.push(`${exercise.reps}x${exercise.sets}`);
                    } else if (exercise.reps) {
                        parts.push(`${exercise.reps}x`);
                    }
                    
                    const displayText = parts.join(' ');
                    const isBFR = exercise.bfr === true;
                    
                    return displayText ? (
                        <div className={cx('exercise-data', css({
                            color: isBFR ? '#ef4444' : '#60a5fa',
                            fontSize: '16px',
                            fontWeight: '600',
                            marginTop: '4px',
                            display: 'inline-block',
                            backgroundColor: isBFR ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                            padding: '3px 10px',
                            borderRadius: '4px',
                        }))}>
                            {isBFR && 'BFR '}
                            {displayText}
                        </div>
                    ) : null;
                })()}
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
                            fontSize: '22px',
                            padding: '6px',
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
