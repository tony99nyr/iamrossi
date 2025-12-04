import { css, cx } from '@styled-system/css';
import OuraDayScores from '@/components/oura/OuraDayScores';
import type { OuraScores, RehabEntry, Exercise } from '@/types';

interface DayCardProps {
    date: Date;
    entry?: RehabEntry;
    exercises: Exercise[];
    isSelected: boolean;
    isToday: boolean;
    ouraScores?: OuraScores;
    onSelect: () => void;
}

function formatDayName(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function formatDayNumber(date: Date): string {
    return date.getDate().toString();
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default function DayCard({
    date,
    entry,
    exercises,
    isSelected,
    isToday,
    ouraScores,
    onSelect,
}: DayCardProps) {
    const dateStr = formatDate(date);

    const dayExercises = entry?.exercises.map(entryEx => {
        const fullExercise = exercises.find(ex => ex.id === entryEx.id);
        return fullExercise ? { 
            ...fullExercise, 
            timeElapsed: entryEx.timeElapsed,
            weight: entryEx.weight,
            reps: entryEx.reps,
            sets: entryEx.sets,
            bfr: entryEx.bfr,
            painLevel: entryEx.painLevel,
            difficultyLevel: entryEx.difficultyLevel
        } : null;
    }).filter(Boolean) as { 
        id: string; 
        title: string; 
        timeElapsed?: string;
        weight?: string;
        reps?: number;
        sets?: number;
        bfr?: boolean;
        painLevel?: number | null;
        difficultyLevel?: number | null;
    }[] || [];

    return (
        <button
            data-date={dateStr}
            onClick={onSelect}
            className={cx('day-card', css({
                backgroundColor: isSelected ? '#1a1a1a' : '#0f0f0f',
                border: '2px solid',
                borderColor: isSelected ? '#2563eb' : isToday ? '#333' : '#1a1a1a',
                borderRadius: '12px',
                padding: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left',
                minHeight: '100px',
                display: 'flex',
                flexDirection: 'column',
                md: {
                    padding: '16px',
                    minHeight: '240px',
                },
                _hover: {
                    borderColor: '#2563eb',
                    backgroundColor: '#1a1a1a',
                }
            }))}
        >
            {/* Day Header */}
            <div className={cx('day-header', css({
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '8px',
                md: {
                    marginBottom: '20px',
                }
            }))}>
                <div className={css({
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '0',
                })}>
                    <div className={cx('day-name', css({
                        color: '#999',
                        fontSize: '15px',
                        fontWeight: '600',
                        letterSpacing: '0.5px',
                        marginBottom: '4px',
                        md: {
                            fontSize: '11px',
                        }
                    }))}>
                        {formatDayName(date)}
                    </div>
                    <div className={cx('day-number', css({
                        color: isToday ? '#2563eb' : '#ededed',
                        fontSize: '28px',
                        fontWeight: '700',
                        lineHeight: '1',
                        md: {
                            fontSize: '32px',
                        }
                    }))}>
                        {formatDayNumber(date)}
                    </div>
                </div>

                {/* Oura Scores - Top right */}
                {ouraScores && (
                    <div className={css({ 
                        display: 'flex',
                        alignItems: 'flex-start',
                    })}>
                        <OuraDayScores scores={ouraScores} />
                    </div>
                )}
            </div>

            {/* Rest Day Indicator */}
            {entry?.isRestDay && (
                <div className={cx('rest-indicator', css({
                    fontSize: '28px',
                    marginBottom: '16px',
                    md: {
                        fontSize: '32px',
                    }
                }))}>
                    😴
                </div>
            )}

            {/* Exercise List - Now shows on rest days too */}
            {dayExercises.length > 0 && (
                <div className={cx('exercise-list', css({
                    flex: 1,
                    marginBottom: '8px',
                    md: {
                        marginBottom: '12px',
                    }
                }))}>
                    {dayExercises.map((exercise) => (
                        <div
                            key={exercise.id}
                            className={cx('exercise-bullet', css({
                                color: '#ccc',
                                fontSize: '16px',
                                marginBottom: '6px',
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: '6px',
                                lineHeight: '1.4',
                                md: {
                                    fontSize: '13px',
                                    marginBottom: '8px',
                                    gap: '8px',
                                }
                            }))}
                        >
                            <span className={css({ color: '#2563eb', flexShrink: 0 })}>•</span>
                            <div className={css({ lineHeight: '1.4' })}>
                                <span 
                                    className={css({ color: '#ccc', marginRight: '6px' })}
                                >
                                    {exercise.title}
                                </span>
                                {(() => {
                                    const parts: string[] = [];
                                    if (exercise.timeElapsed) parts.push(`${exercise.timeElapsed} minutes`);
                                    if (exercise.weight) parts.push(`${exercise.weight} lbs`);
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
                                        <div className={css({ display: 'inline-flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' })}>
                                            {displayText && (
                                                <span className={css({ 
                                                    color: isBFR ? '#ef4444' : '#60a5fa',
                                                    fontSize: '0.85em',
                                                    fontWeight: '600',
                                                    display: 'inline-block',
                                                    backgroundColor: isBFR ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    whiteSpace: 'nowrap',
                                                    verticalAlign: 'middle',
                                                })}>
                                                    {isBFR && 'BFR '}
                                                    {displayText}
                                                </span>
                                            )}
                                            
                                            {hasPain && (
                                                <span className={css({
                                                    color: exercise.painLevel! <= 3 ? '#10b981' : exercise.painLevel! <= 6 ? '#f59e0b' : '#ef4444',
                                                    fontSize: '0.85em',
                                                    fontWeight: '600',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    whiteSpace: 'nowrap',
                                                })}>
                                                    P:{exercise.painLevel}
                                                </span>
                                            )}

                                            {hasDifficulty && (
                                                <span className={css({
                                                    color: '#a78bfa',
                                                    fontSize: '0.85em',
                                                    fontWeight: '600',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '2px',
                                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                    padding: '1px 6px',
                                                    borderRadius: '4px',
                                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                                    whiteSpace: 'nowrap',
                                                })}>
                                                    D:{exercise.difficultyLevel}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Daily Tracking Icons */}
            {(entry?.vitaminsTaken || entry?.proteinShake) && (
                <div className={cx('tracking-icons', css({
                    display: 'flex',
                    gap: '6px',
                    marginTop: 'auto',
                    md: {
                        gap: '8px',
                    }
                }))}>
                    {entry.vitaminsTaken && (
                        <span className={css({ fontSize: '16px', md: { fontSize: '20px' } })} title="Vitamins">💊</span>
                    )}
                    {entry.proteinShake && (
                        <span className={css({ fontSize: '16px', md: { fontSize: '20px' } })} title="Protein">🥤</span>
                    )}
                </div>
            )}
        </button>
    );
}
