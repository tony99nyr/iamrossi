'use client';

import { css, cx } from '@styled-system/css';
import type { StickAndPuckSession } from '@/types';

interface CalendarViewProps {
  sessions: StickAndPuckSession[];
  currentMonth: Date;
  selectedDate: string | null;
  selectedRink?: string | null;
  onDateSelect: (date: string) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onGoToToday: () => void;
}

function getDaysInMonth(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];
  
  // Add days from previous month to fill first week
  const startDay = firstDay.getDay();
  for (let i = startDay - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  
  // Add days of current month
  for (let day = 1; day <= lastDay.getDate(); day++) {
    days.push(new Date(year, month, day));
  }
  
  // Add days from next month to fill last week
  const endDay = lastDay.getDay();
  const remainingDays = 6 - endDay;
  for (let day = 1; day <= remainingDays; day++) {
    days.push(new Date(year, month + 1, day));
  }
  
  return days;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatTime(timeStr: string): string {
  // timeStr is in HH:mm format (24-hour)
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function abbreviateRink(rink: string): string {
  const rinkLower = rink.toLowerCase();
  if (rinkLower.includes('invisalign')) return 'IA';
  if (rinkLower.includes('cary')) return 'CA';
  if (rinkLower.includes('garner')) return 'GA';
  if (rinkLower.includes('wake forest')) return 'WF';
  if (rinkLower.includes('raleigh')) return 'RA';
  return rink; // Fallback to full name if no match
}

export default function CalendarView({
  sessions,
  currentMonth,
  selectedDate,
  selectedRink,
  onDateSelect,
  onPreviousMonth,
  onNextMonth,
  onGoToToday,
}: CalendarViewProps) {
  const days = getDaysInMonth(currentMonth);
  const today = formatDate(new Date());
  const currentMonthNum = currentMonth.getMonth();
  const currentYear = currentMonth.getFullYear();

  // Filter sessions by rink if a rink is selected
  const filteredSessions = selectedRink
    ? sessions.filter(session => session.rink === selectedRink)
    : sessions;

  // Group sessions by date
  const sessionsByDate = new Map<string, StickAndPuckSession[]>();
  for (const session of filteredSessions) {
    const dateSessions = sessionsByDate.get(session.date) || [];
    dateSessions.push(session);
    sessionsByDate.set(session.date, dateSessions);
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className={cx('calendar-view', css({
      width: '100%',
    }))}>
      {/* Calendar Header */}
      <div className={css({
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        padding: '0 4px',
      })}>
        <button
          onClick={onPreviousMonth}
          className={css({
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#ededed',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            transition: 'all 0.2s ease',
            _hover: {
              backgroundColor: '#2563eb',
              borderColor: '#2563eb',
            }
          })}
        >
          ← Previous
        </button>
        
        <div className={css({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        })}>
          <div className={css({
            color: '#ededed',
            fontSize: '20px',
            fontWeight: '700',
          })}>
            {formatMonthYear(currentMonth)}
          </div>
          <button
            onClick={onGoToToday}
            className={css({
              backgroundColor: 'transparent',
              border: 'none',
              color: '#999',
              cursor: 'pointer',
              fontSize: '12px',
              textDecoration: 'underline',
              _hover: {
                color: '#2563eb',
              }
            })}
          >
            Go to today
          </button>
        </div>
        
        <button
          onClick={onNextMonth}
          className={css({
            backgroundColor: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '8px 16px',
            color: '#ededed',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            transition: 'all 0.2s ease',
            _hover: {
              backgroundColor: '#2563eb',
              borderColor: '#2563eb',
            }
          })}
        >
          Next →
        </button>
      </div>

      {/* Week Day Headers */}
      <div className={css({
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '2px',
        marginBottom: '6px',
        sm: {
          gap: '8px',
          marginBottom: '12px',
        }
      })}>
        {weekDays.map((day) => (
          <div
            key={day}
            className={css({
              textAlign: 'center',
              color: '#999',
              fontSize: '9px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              padding: '2px 1px',
              sm: {
                fontSize: '12px',
                padding: '8px 4px',
              }
            })}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className={css({
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '2px',
        sm: {
          gap: '8px',
        }
      })}>
        {days.map((day, index) => {
          const dateStr = formatDate(day);
          const isCurrentMonth = day.getMonth() === currentMonthNum && day.getFullYear() === currentYear;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const daySessions = sessionsByDate.get(dateStr) || [];
          const sessionCount = daySessions.length;
          
          // Determine badge color for mobile based on session states
          const getMobileBadgeColor = () => {
            if (sessionCount === 0) return null;
            
            // Check if all sessions are in the past
            const now = new Date();
            const allPast = daySessions.every(session => {
              const [year, month, day] = session.date.split('-').map(Number);
              const [hours, minutes] = session.time.split(':').map(Number);
              const sessionDate = new Date(year, month - 1, day, hours, minutes);
              return sessionDate < now;
            });
            
            if (allPast) {
              return '#666'; // Grey/dark for past sessions
            }
            
            // Check if all sessions are full
            const allFull = daySessions.every(session => 
              session.isFull || (session.remainingSlots !== undefined && session.remainingSlots <= 0)
            );
            
            if (allFull) {
              return '#ef4444'; // Red for all full
            }
            
            // Check if there's at least one peak session
            const hasPeak = daySessions.some(session => session.priceType === 'regular');
            
            if (hasPeak) {
              return '#2563eb'; // Blue if there's peak
            }
            
            // All are off-peak
            return '#10b981'; // Green for all off-peak
          };
          
          const mobileBadgeColor = getMobileBadgeColor();
          const desktopLabelColor = mobileBadgeColor || '#10b981'; // Use same logic for desktop labels
          
          return (
            <button
              key={index}
              onClick={() => onDateSelect(dateStr)}
              className={css({
                aspectRatio: '1',
                backgroundColor: isSelected ? '#1a1a1a' : isCurrentMonth ? '#0f0f0f' : '#0a0a0a',
                border: '1px solid',
                borderColor: isSelected 
                  ? '#2563eb' 
                  : isToday 
                    ? '#10b981' 
                    : isCurrentMonth 
                      ? '#333' 
                      : '#1a1a1a',
              borderRadius: '6px',
              padding: '2px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: '1px',
              sm: {
                borderRadius: '12px',
                padding: '8px',
                gap: '4px',
              },
              _hover: {
                borderColor: '#2563eb',
                backgroundColor: '#1a1a1a',
              }
            })}
            >
              <div className={css({
                color: isCurrentMonth 
                  ? (isToday ? '#10b981' : '#ededed')
                  : '#666',
                fontSize: '12px',
                fontWeight: isToday ? '700' : '500',
                sm: {
                  fontSize: '18px',
                }
              })}>
                {day.getDate()}
              </div>
              {sessionCount > 0 && (
                <>
                  {/* Desktop: Show abbreviated rink names and times */}
                  <div className={css({
                    display: 'none',
                    md: {
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      width: '100%',
                      alignItems: 'center',
                    }
                  })}>
                    {/* Below 1280px: Show max 3 sessions + "more" indicator */}
                    <div className={css({
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      width: '100%',
                      alignItems: 'center',
                      xl: {
                        display: 'none',
                      }
                    })}>
                      {daySessions.slice(0, 3).map((session) => (
                        <div
                          key={session.id}
                          className={css({
                            fontSize: '12px',
                            fontWeight: '600',
                            color: desktopLabelColor,
                            textAlign: 'center',
                            lineHeight: '1.2',
                            width: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          })}
                          title={`${session.rink} - ${formatTime(session.time)}`}
                        >
                          {abbreviateRink(session.rink)} {formatTime(session.time)}
                        </div>
                      ))}
                      {sessionCount > 3 && (
                        <div className={css({
                          fontSize: '12px',
                          color: '#999',
                          fontWeight: '500',
                        })}>
                          +{sessionCount - 3} more
                        </div>
                      )}
                    </div>
                    {/* Above 1280px: Show all sessions */}
                    <div className={css({
                      display: 'none',
                      xl: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        width: '100%',
                        alignItems: 'center',
                      }
                    })}>
                      {daySessions.map((session) => (
                        <div
                          key={session.id}
                          className={css({
                            fontSize: '12px',
                            fontWeight: '600',
                            color: desktopLabelColor,
                            textAlign: 'center',
                            lineHeight: '1.2',
                            width: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          })}
                          title={`${session.rink} - ${formatTime(session.time)}`}
                        >
                          {abbreviateRink(session.rink)} {formatTime(session.time)}
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Mobile: Show count badge */}
                  {mobileBadgeColor && (
                    <div className={css({
                      backgroundColor: mobileBadgeColor,
                      color: '#fff',
                      borderRadius: '6px',
                      padding: '1px 3px',
                      fontSize: '9px',
                      fontWeight: '600',
                      minWidth: '18px',
                      textAlign: 'center',
                      position: 'relative',
                      sm: {
                        borderRadius: '12px',
                        padding: '2px 6px',
                        fontSize: '12px',
                        minWidth: '24px',
                      },
                      md: {
                        display: 'none',
                      }
                    })}>
                      {sessionCount}
                    </div>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

