'use client';

import { css, cx } from '@styled-system/css';

interface RehabEntry {
    id: string;
    date: string;
    exercises: { id: string; weight?: string }[];
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
}

function getWeekDates(date: Date): Date[] {
    const week: Date[] = [];
    const current = new Date(date);
    
    // Get to start of week (Sunday)
    const day = current.getDay();
    current.setDate(current.getDate() - day);
    
    // Get all 7 days
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
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatDayNumber(date: Date): string {
    return date.getDate().toString();
}

export default function WeeklyCalendar({
    currentDate,
    entries,
    exercises,
    selectedDate,
    onDateSelect,
    onPreviousWeek,
    onNextWeek,
}: WeeklyCalendarProps) {
    const weekDates = getWeekDates(currentDate);
    const today = formatDate(new Date());

    const getEntryForDate = (date: string) => {
        return entries.find(e => e.date === date);
    };

    return (
        <div className={cx('weekly-calendar', css({
            width: '100%',
        }))}>
            {/* Navigation */}
            <div className={cx('calendar-header', css({
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                padding: '0 8px',
            }))}>
                <button
                    onClick={onPreviousWeek}
                    className={cx('nav-button', css({
                        background: 'transparent',
                        border: 'none',
                        color: '#ededed',
                        fontSize: '32px',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        transition: 'color 0.2s ease',
                        tapHighlightColor: 'transparent',
                        _hover: {
                            color: '#2563eb',
                        }
                    }))}
                    aria-label="Previous week"
                >
                    ‹
                </button>
                
                    <div className={cx('week-label', css({
                    color: '#ededed',
                    fontSize: '18px',
                    fontWeight: '600',
                }))}>
                    {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' - '}
                    {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>

                <button
                    onClick={onNextWeek}
                    className={cx('nav-button', css({
                        background: 'transparent',
                        border: 'none',
                        color: '#ededed',
                        fontSize: '32px',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        transition: 'color 0.2s ease',
                        tapHighlightColor: 'transparent',
                        _hover: {
                            color: '#2563eb',
                        }
                    }))}
                    aria-label="Next week"
                >
                    ›
                </button>
            </div>

            {/* Calendar Grid */}
            <div className={cx('calendar-grid', css({
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '8px',
            }))}>
                {weekDates.map((date) => {
                    const dateStr = formatDate(date);
                    const entry = getEntryForDate(dateStr);
                    const isToday = dateStr === today;
                    const isSelected = dateStr === selectedDate;
                    const exerciseCount = entry?.exercises.length || 0;

                    return (
                        <button
                            key={dateStr}
                            onClick={() => onDateSelect(dateStr)}
                            className={cx('calendar-day', css({
                                backgroundColor: isSelected ? '#2563eb' : '#1a1a1a',
                                border: isToday ? '2px solid #2563eb' : '1px solid #333',
                                borderRadius: '12px',
                                padding: '12px 8px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                minHeight: '80px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                tapHighlightColor: 'transparent',
                                _hover: {
                                    borderColor: '#2563eb',
                                    transform: 'translateY(-2px)',
                                }
                            }))}
                        >
                            <div className={cx('day-name', css({
                                color: isSelected ? '#fff' : '#999',
                                fontSize: '11px',
                                fontWeight: '500',
                                textTransform: 'uppercase',
                            }))}>
                                {formatDayName(date)}
                            </div>

                            <div className={cx('day-number', css({
                                color: isSelected ? '#fff' : '#ededed',
                                fontSize: '18px',
                                fontWeight: '600',
                            }))}>
                                {formatDayNumber(date)}
                            </div>

                            <div className={cx('day-info', css({
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '4px',
                                minHeight: '24px',
                            }))}>
                                {entry?.isRestDay ? (
                                    <span className={cx('rest-emoji', css({ fontSize: '24px' }))}>😴</span>
                                ) : exerciseCount > 0 ? (
                                    <div className={cx('exercises-preview', css({
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '4px',
                                        width: '100%',
                                    }))}>
                                        <div className={cx('icons-container', css({
                                            display: 'flex',
                                            justifyContent: 'center',
                                            flexWrap: 'wrap',
                                            gap: '2px',
                                        }))}>
                                            {Array.from({ length: exerciseCount }).map((_, i) => (
                                                <span 
                                                    key={i}
                                                    className={cx('flex-icon', css({
                                                        fontSize: '16px',
                                                        animationName: 'shake',
                                                        animationTimingFunction: 'ease-in-out',
                                                        animationIterationCount: 'infinite',
                                                        animationDelay: `${i * 0.1}s`,
                                                        // Increase shake intensity based on count
                                                        animationDuration: `${Math.max(0.2, 0.5 - (exerciseCount * 0.05))}s`
                                                    }))}
                                                >
                                                    💪
                                                </span>
                                            ))}
                                        </div>
                                        
                                        {!isSelected && (
                                            <div className={cx('titles-preview', css({
                                                fontSize: '10px',
                                                color: '#999',
                                                textAlign: 'center',
                                                width: '100%',
                                                overflow: 'hidden',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 3,
                                                // @ts-ignore
                                                WebkitBoxOrient: 'vertical',
                                                lineHeight: '1.2',
                                            }))}>
                                                {entry?.exercises.map(ex => {
                                                    const fullEx = exercises.find(e => e.id === ex.id);
                                                    return fullEx ? fullEx.title.substring(0, 30) : '';
                                                }).filter(Boolean).join(', ')}
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                {/* Mini indicators for vitamins/protein */}
                                {(entry?.vitaminsTaken || entry?.proteinShake) && (
                                    <div className={cx('indicators', css({
                                        display: 'flex',
                                        gap: '4px',
                                        fontSize: '10px',
                                    }))}>
                                        {entry.vitaminsTaken && (
                                            <span title="Vitamins">💊</span>
                                        )}
                                        {entry.proteinShake && (
                                            <span title="Protein">🥤</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
