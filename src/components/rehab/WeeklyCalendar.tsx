'use client';

import { css, cx } from '@styled-system/css';
import Link from 'next/link';
import type { OuraScores, RehabEntry, Exercise } from '@/types';
import { useSwipe } from '@/hooks/useSwipe';
import CalendarHeader from './CalendarHeader';
import DayCard from './DayCard';

interface WeeklyCalendarProps {
    currentDate: Date;
    entries: RehabEntry[];
    exercises: Exercise[];
    selectedDate: string | null;
    onDateSelect: (date: string) => void;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    onSettingsClick?: (tab?: 'vitamins' | 'protein' | 'exercises') => void;
    onGoToToday?: () => void;
    ouraScores?: Record<string, OuraScores>;
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
    // Format as YYYY-MM-DD in local time (not UTC)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    onGoToToday,
    ouraScores = {},
}: WeeklyCalendarProps) {
    const weekDates = getWeekDates(currentDate);
    const today = formatDate(new Date());

    const { onTouchStart, onTouchMove, onTouchEnd } = useSwipe({
        onSwipeLeft: onNextWeek,
        onSwipeRight: onPreviousWeek,
        minSwipeDistance: 100,
        maxVerticalDistance: 50,
    });

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
            <CalendarHeader
                dateRange={formatMonthYear(weekDates[0], weekDates[6])}
                onPreviousWeek={onPreviousWeek}
                onNextWeek={onNextWeek}
                onGoToToday={onGoToToday}
            />

            {/* Week Grid */}
            <div className={cx('week-grid', css({
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '8px',
                md: {
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '10px',
                },
                _xlg: {
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: '16px',
                }
            }))}>
                {weekDates.map((date) => {
                    const dateStr = formatDate(date);
                    const entry = getEntryForDate(dateStr);
                    const isToday = dateStr === today;
                    const isSelected = dateStr === selectedDate;
                    
                    return (
                        <DayCard
                            key={dateStr}
                            date={date}
                            entry={entry}
                            exercises={exercises}
                            isSelected={isSelected}
                            isToday={isToday}
                            ouraScores={ouraScores[dateStr]}
                            onSelect={() => onDateSelect(dateStr)}
                        />
                    );
                })}
            </div>

            {/* Legend */}
            <div className={css({
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '24px',
                paddingTop: '40px',
                flexWrap: 'wrap',
                md: {
                    justifyContent: 'flex-end',
                }

            })}>
                <div className={css({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: '#999',
                })}>
                    <span className={css({ color: '#22c55e', fontWeight: '600' })}>P</span>
                    <span>Pain</span>
                </div>
                <div className={css({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: '#999',
                })}>
                    <span className={css({ color: '#a78bfa', fontWeight: '600' })}>D</span>
                    <span>Difficulty</span>
                </div>
                <div className={css({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: '#999',
                })}>
                    <span className={css({ color: '#ef4444', fontWeight: '600' })}>BFR</span>
                    <span>Blood Flow Restriction</span>
                </div>
                <div className={css({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    color: '#999',
                })}>
                    <span className={css({ fontSize: '16px' })}>😴</span>
                    <span>Rest day</span>
                </div>
                <div 
                    onClick={() => onSettingsClick?.('vitamins')}
                    className={css({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        color: '#999',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                        _hover: { color: '#ededed' }
                    })}
                >
                    <span className={css({ fontSize: '16px' })}>💊</span>
                    <span>Vitamins</span>
                </div>
                <div 
                    onClick={() => onSettingsClick?.('protein')}
                    className={css({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '13px',
                        color: '#999',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                        _hover: { color: '#ededed' }
                    })}
                >
                    <span className={css({ fontSize: '16px' })}>🥤</span>
                    <span>Protein shake</span>
                </div>
            </div>

            {/* Settings Button - Bottom Right */}
            {onSettingsClick && (
                <div className={css({
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: '12px',
                    marginTop: '32px',
                })}>
                    <Link
                        href="/tools/knee-rehab/ai"
                        className={css({
                            width: '40px',
                            height: '40px',
                            borderRadius: 'full',
                            border: '1px solid rgba(255,255,255,0.15)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.15rem',
                            textDecoration: 'none',
                            color: '#ededed',
                            opacity: 0.4,
                            transition: 'all 0.2s ease',
                            _hover: {
                                opacity: 0.85,
                                borderColor: 'rgba(255,255,255,0.35)',
                                transform: 'translateY(-2px)',
                            },
                        })}
                        aria-label="Open AI context"
                        title="AI context"
                    >
                        🤖
                    </Link>
                    <Link
                        href="/tools/knee-rehab/summary"
                        className={css({
                            width: '40px',
                            height: '40px',
                            borderRadius: 'full',
                            border: '1px solid rgba(255,255,255,0.15)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.15rem',
                            textDecoration: 'none',
                            color: '#ededed',
                            opacity: 0.4,
                            transition: 'all 0.2s ease',
                            _hover: {
                                opacity: 0.85,
                                borderColor: 'rgba(255,255,255,0.35)',
                                transform: 'translateY(-2px)',
                            },
                        })}
                        aria-label="View rehab summary"
                        title="Stats summary"
                    >
                        📊
                    </Link>
                    <button
                        onClick={() => onSettingsClick?.()}
                        className={css({
                            fontSize: '1.25rem',
                            opacity: 0.3,
                            transition: 'all 0.3s ease',
                            cursor: 'pointer',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#ededed',
                            _hover: {
                                opacity: 0.6,
                                transform: 'rotate(90deg)',
                            },
                        })}
                        aria-label="Settings"
                        title="Settings"
                    >
                        ⚙️
                    </button>
                </div>
            )}
        </div>
    );
}

