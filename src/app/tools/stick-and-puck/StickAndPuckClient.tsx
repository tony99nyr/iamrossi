'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { css, cx } from '@styled-system/css';
import type { StickAndPuckSession } from '@/types';
import CalendarView from '@/components/stick-and-puck/CalendarView';
import SessionList from '@/components/stick-and-puck/SessionList';

interface StickAndPuckClientProps {
  initialSessions: StickAndPuckSession[];
}

export default function StickAndPuckClient({ initialSessions }: StickAndPuckClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Ensure initialSessions is always an array
  const [sessions, setSessions] = useState<StickAndPuckSession[]>(Array.isArray(initialSessions) ? initialSessions : []);
  const [selectedRink, setSelectedRink] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Get selected date from URL params, default to null
  const urlDate = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState<string | null>(urlDate);
  
  // Initialize current month from URL date or today
  // Parse date string manually to avoid timezone issues
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
      const [year, month, day] = urlDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    return new Date();
  });
  
  // Sync selectedDate with URL params
  useEffect(() => {
    const urlDateParam = searchParams.get('date');
    if (urlDateParam !== selectedDate) {
      setSelectedDate(urlDateParam);
      if (urlDateParam && /^\d{4}-\d{2}-\d{2}$/.test(urlDateParam)) {
        // Parse date string manually to avoid timezone issues
        const [year, month, day] = urlDateParam.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          setCurrentMonth(date);
        }
      }
    }
  }, [searchParams, selectedDate]);

  // Get unique rinks for filter
  const rinks = Array.from(new Set(sessions.map(s => s.rink))).sort();

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/stick-and-puck/sessions?refresh=1');
      if (!response.ok) {
        throw new Error('Failed to refresh sessions');
      }
      const data = await response.json();
      // API returns { sessions: [...], cached: boolean }
      if (data.sessions && Array.isArray(data.sessions)) {
        setSessions(data.sessions);
      } else if (Array.isArray(data)) {
        // Fallback: handle case where API returns array directly
        setSessions(data);
      } else {
        console.error('Invalid data format received:', data);
        throw new Error('Invalid response format from server');
      }
    } catch (error) {
      console.error('Error refreshing sessions:', error);
      alert('Failed to refresh sessions. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleDateSelect = useCallback((date: string) => {
    const newDate = selectedDate === date ? null : date;
    setSelectedDate(newDate);
    
    // Update URL params
    const params = new URLSearchParams(searchParams.toString());
    if (newDate) {
      params.set('date', newDate);
    } else {
      params.delete('date');
    }
    router.push(`/tools/stick-and-puck?${params.toString()}`, { scroll: false });

    // Scroll to detail view if a date is selected
    if (newDate) {
      // Use setTimeout to ensure the DOM has updated
      setTimeout(() => {
        const detailView = document.getElementById('session-detail-view');
        if (detailView) {
          detailView.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [selectedDate, searchParams, router]);

  const handlePreviousMonth = useCallback(() => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  }, []);

  const handleGoToToday = useCallback(() => {
    setCurrentMonth(new Date());
    setSelectedDate(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('date');
    router.push(`/tools/stick-and-puck?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const handleRinkFilter = useCallback((rink: string | null) => {
    setSelectedRink(rink);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedDate(null);
    setSelectedRink(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('date');
    router.push(`/tools/stick-and-puck?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  return (
    <div className={cx('stick-and-puck-client', css({
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      padding: '16px',
      md: {
        padding: '24px',
      }
    }))}>
      <div className={cx('container', css({
        maxWidth: '1800px',
        margin: '0 auto',
      }))}>
        {/* Header */}
        <div className={css({
          marginBottom: '32px',
        })}>
          <h1 className={css({
            color: '#ededed',
            fontSize: '32px',
            fontWeight: '700',
            marginBottom: '16px',
            md: {
              fontSize: '40px',
            }
          })}>
            Stick & Puck Finder
          </h1>
          <p className={css({
            color: '#999',
            fontSize: '16px',
            marginBottom: '24px',
          })}>
            Find open hockey sessions at Polar Ice rinks around town
          </p>

          {/* Controls */}
          <div className={css({
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center',
            marginBottom: '24px',
          })}>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={css({
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: isRefreshing ? 'not-allowed' : 'pointer',
                opacity: isRefreshing ? 0.6 : 1,
                transition: 'all 0.2s ease',
                _hover: {
                  backgroundColor: isRefreshing ? '#2563eb' : '#1d4ed8',
                }
              })}
            >
              Refresh Data
            </button>

            {(selectedDate || selectedRink) && (
              <button
                onClick={clearFilters}
                className={css({
                  backgroundColor: '#1a1a1a',
                  color: '#999',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  _hover: {
                    backgroundColor: '#2563eb',
                    borderColor: '#2563eb',
                    color: '#fff',
                  }
                })}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Rink Filter */}
          {rinks.length > 0 && (
            <div className={css({
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center',
            })}>
              <span className={css({
                color: '#999',
                fontSize: '14px',
                marginRight: '8px',
              })}>
                Filter by rink:
              </span>
              <button
                onClick={() => handleRinkFilter(null)}
                className={css({
                  backgroundColor: selectedRink === null ? '#2563eb' : '#1a1a1a',
                  color: '#ededed',
                  border: '1px solid',
                  borderColor: selectedRink === null ? '#2563eb' : '#333',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  _hover: {
                    backgroundColor: '#2563eb',
                    borderColor: '#2563eb',
                  }
                })}
              >
                All Rinks
              </button>
              {rinks.map((rink) => (
                <button
                  key={rink}
                  onClick={() => handleRinkFilter(rink)}
                  className={css({
                    backgroundColor: selectedRink === rink ? '#2563eb' : '#1a1a1a',
                    color: '#ededed',
                    border: '1px solid',
                    borderColor: selectedRink === rink ? '#2563eb' : '#333',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    _hover: {
                      backgroundColor: '#2563eb',
                      borderColor: '#2563eb',
                    }
                  })}
                >
                  {rink}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Calendar View - Always Visible */}
        <div className={css({
          marginBottom: '48px',
        })}>
          <CalendarView
            sessions={sessions}
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            selectedRink={selectedRink}
            onDateSelect={handleDateSelect}
            onPreviousMonth={handlePreviousMonth}
            onNextMonth={handleNextMonth}
            onGoToToday={handleGoToToday}
          />
        </div>

              {/* Detailed View - Shows below calendar when date is selected */}
              {selectedDate && (
                <div id="session-detail-view" className={css({
                  marginTop: '32px',
                })}>
                  <h2 className={css({
                    color: '#ededed',
                    fontSize: '24px',
                    fontWeight: '700',
                    marginBottom: '20px',
                  })}>
                    Sessions on {(() => {
                      // Parse date string manually to avoid timezone issues
                      const [year, month, day] = selectedDate.split('-').map(Number);
                      const date = new Date(year, month - 1, day);
                      return date.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric'
                      });
                    })()}
                  </h2>
                  <SessionList
                    sessions={sessions}
                    selectedDate={selectedDate}
                    selectedRink={selectedRink}
                  />
                </div>
              )}
      </div>

      {/* Loading spinner for data refresh */}
      {isRefreshing && (
        <div className={css({
          position: 'fixed',
          right: '1.5rem',
          bottom: '5rem',
          width: '3rem',
          height: '3rem',
          borderRadius: '9999px',
          backgroundColor: 'rgba(17, 24, 39, 0.9)',
          border: '1px solid rgba(59, 130, 246, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
          zIndex: 100,
        })}>
          <div className={css({
            width: '1.25rem',
            height: '1.25rem',
            border: '2px solid rgba(59, 130, 246, 0.3)',
            borderTopColor: '#60a5fa',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          })} />
        </div>
      )}

      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

