'use client';

import { css, cx } from '@styled-system/css';
import { useRef, type TouchEvent } from 'react';

interface RehabEntry {
    id: string;
    date: string;
    exercises: { 
        id: string; 
        timeElapsed?: string;
        weight?: string;
        reps?: number;
        sets?: number;
        bfr?: boolean;
    }[];
    isRestDay: boolean;
    vitaminsTaken: boolean;
    proteinShake: boolean;
}

interface Exercise {
    id: string;
    title: string;
}

interface WeeklyCalendarProps {
    currentDate: Date;
    entries: RehabEntry[];
    exercises: Exercise[];
    selectedDate: string | null;
    onDateSelect: (date: string) => void;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    onSettingsClick?: () => void;
}

function getWeekDates(date: Date): Date[] {
    const week: Date[] = [];
    const current = new Date(date);
    
    // Find Sunday of the current week
    const day = current.getDay();
    const diff = current.getDate() - day;
    current.setDate(diff);
    
    // Generate 7 days starting from Sunday
    for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    
    return week;
}

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

function formatDayName(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function formatDayNumber(date: Date): string {
    return date.getDate().toString();
}

function formatMonthYear(startDate: Date, endDate: Date): string {
    const startMonth = startDate.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = endDate.toLocaleDateString('en-US', { month: 'short' });
    const year = endDate.getFullYear();
    
    if (startMonth === endMonth) {
        return `${startMonth} ${startDate.getDate()} - ${endDate.getDate()}, ${year}`;
    }
    return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}, ${year}`;
}

export default function WeeklyCalendar({
    currentDate,
    entries,
    exercises,
    selectedDate,
    onDateSelect,
    onPreviousWeek,
    onNextWeek,
    onSettingsClick,
}: WeeklyCalendarProps) {
    const weekDates = getWeekDates(currentDate);
    const today = formatDate(new Date());

    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);
    const touchEndY = useRef<number | null>(null);
    const minSwipeDistance = 100; // Increased from 50 to 100 for less sensitivity
    const maxVerticalDistance = 50; // Maximum vertical movement to still count as horizontal swipe

    const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
        touchEndX.current = null;
        touchEndY.current = null;
        touchStartX.current = e.targetTouches[0].clientX;
        touchStartY.current = e.targetTouches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
        touchEndX.current = e.targetTouches[0].clientX;
        touchEndY.current = e.targetTouches[0].clientY;
    };

    const onTouchEnd = () => {
        if (!touchStartX.current || !touchEndX.current || !touchStartY.current || !touchEndY.current) return;

        const horizontalDistance = touchStartX.current - touchEndX.current;
        const verticalDistance = Math.abs(touchStartY.current - touchEndY.current);

        // Only trigger swipe if horizontal movement is significantly more than vertical
        // This prevents accidental swipes while scrolling vertically
        if (verticalDistance > maxVerticalDistance) return;
        if (Math.abs(horizontalDistance) < verticalDistance * 2) return;

        const isLeftSwipe = horizontalDistance > minSwipeDistance;
        const isRightSwipe = horizontalDistance < -minSwipeDistance;

        if (isLeftSwipe) {
            onNextWeek();
        }
        if (isRightSwipe) {
            onPreviousWeek();
        }
    };

    const getEntryForDate = (date: string) => {
        return entries.find(e => e.date === date);
    };

    return (
        <div 
            className={cx('weekly-calendar', css({
                width: '100%',
                touchAction: 'pan-y', // Allow vertical scrolling but capture horizontal swipes
            }))}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {/* Week Navigation */}
            <div className={cx('week-nav', css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px',
            }))}>
                <button
                    onClick={onPreviousWeek}
                    className={cx('nav-button', css({
                        padding: '8px 16px',
                        backgroundColor: 'transparent',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        color: '#ededed',
                        fontSize: '20px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        _hover: {
                            borderColor: '#2563eb',
                            backgroundColor: '#1a1a1a',
                        }
                    }))}
                    aria-label="Previous week"
                >
                    ‹
                </button>
                <div className={css({ display: 'flex', alignItems: 'center', gap: '12px' })}>
                    <div className={cx('week-range', css({
                        color: '#ededed',
                        fontSize: '18px',
                        fontWeight: '600',
                    }))}>
                        {formatMonthYear(weekDates[0], weekDates[6])}
                    </div>
                    {onSettingsClick && (
                        <button
                            onClick={onSettingsClick}
                            className={css({
                                padding: '6px 12px',
                                backgroundColor: 'transparent',
                                border: '1px solid #333',
                                borderRadius: '6px',
                                color: '#999',
                                fontSize: '18px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                _hover: {
                                    borderColor: '#2563eb',
                                    backgroundColor: '#1a1a1a',
                                    color: '#ededed',
                                }
                            })}
                            aria-label="Settings"
                            title="Settings"
                        >
                            ⚙️
                        </button>
                    )}
                </div>
                <button
                    onClick={onNextWeek}
                    className={cx('nav-button', css({
                        padding: '8px 16px',
                        backgroundColor: 'transparent',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        color: '#ededed',
                        fontSize: '20px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        _hover: {
                            borderColor: '#2563eb',
                            backgroundColor: '#1a1a1a',
                        }
                    }))}
                    aria-label="Next week"
                >
                    ›
                </button>
            </div>

            {/* Week Grid */}
            <div className={cx('week-grid', css({
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '8px',
                sm: {
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '10px',
                },
                md: {
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: '12px',
                },
                lg: {
                    gap: '16px',
                }
            }))}>
                {weekDates.map((date) => {
                    const dateStr = formatDate(date);
                    const entry = getEntryForDate(dateStr);
                    const isToday = dateStr === today;
                    const isSelected = dateStr === selectedDate;
                    
                    const dayExercises = entry?.exercises.map(entryEx => {
                        const fullExercise = exercises.find(ex => ex.id === entryEx.id);
                        return fullExercise ? { ...fullExercise, weight: entryEx.weight } : null;
                    }).filter(Boolean) as { id: string; title: string; weight?: string }[] || [];

                    return (
                        <button
                            key={dateStr}
                            onClick={() => onDateSelect(dateStr)}
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
                                marginBottom: '10px',
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'baseline',
                                gap: '8px',
                                md: {
                                    marginBottom: '14px',
                                    flexDirection: 'column',
                                    gap: '0',
                                }
                            }))}>
                                <div className={cx('day-number', css({
                                    color: isToday ? '#2563eb' : '#ededed',
                                    fontSize: '28px',
                                    fontWeight: '700',
                                    lineHeight: '1',
                                    md: {
                                        fontSize: '32px',
                                        order: 2,
                                    }
                                }))}>
                                    {formatDayNumber(date)}
                                </div>
                                <div className={cx('day-name', css({
                                    color: '#999',
                                    fontSize: '15px',
                                    fontWeight: '600',
                                    letterSpacing: '0.5px',
                                    md: {
                                        fontSize: '11px',
                                        marginBottom: '4px',
                                        order: 1,
                                    }
                                }))}>
                                    {formatDayName(date)}
                                </div>
                            </div>

                            {/* Rest Day Indicator */}
                            {entry?.isRestDay && (
                                <div className={cx('rest-indicator', css({
                                    fontSize: '28px',
                                    md: {
                                        fontSize: '32px',
                                    }
                                }))}>
                                    😴
                                </div>
                            )}

                            {/* Exercise List */}
                            {!entry?.isRestDay && dayExercises.length > 0 && (
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
                                                alignItems: 'flex-start',
                                                gap: '6px',
                                                lineHeight: '1.4',
                                                md: {
                                                    fontSize: '13px',
                                                    marginBottom: '8px',
                                                    gap: '8px',
                                                }
                                            }))}
                                        >
                                            <span className={css({ color: '#2563eb', flexShrink: 0, marginTop: '4px' })}>•</span>
                                            <div className={css({ lineHeight: '1.4' })}>
                                                <span 
                                                    className={css({ color: '#ccc', marginRight: '6px' })}
                                                >
                                                    {exercise.title}
                                                </span>
                                                {(() => {
                                                    const parts: string[] = [];
                                                    if (exercise.timeElapsed) parts.push(exercise.timeElapsed);
                                                    if (exercise.weight) parts.push(`${exercise.weight} lbs`);
                                                    if (exercise.reps && exercise.sets) {
                                                        parts.push(`${exercise.reps}x${exercise.sets}`);
                                                    } else if (exercise.reps) {
                                                        parts.push(`${exercise.reps}x`);
                                                    }
                                                    const displayText = parts.join(' ');
                                                    const isBFR = exercise.bfr === true;
                                                    
                                                    return displayText ? (
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
                                                    ) : null;
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
                })}
            </div>
        </div>
    );
}
