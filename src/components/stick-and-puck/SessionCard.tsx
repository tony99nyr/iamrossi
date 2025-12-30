'use client';

import { css, cx } from '@styled-system/css';
import type { StickAndPuckSession } from '@/types';

interface SessionCardProps {
  session: StickAndPuckSession;
}

export default function SessionCard({ session }: SessionCardProps) {
  const formatDate = (dateStr: string) => {
    // Parse date string manually to avoid timezone issues
    // dateStr is in YYYY-MM-DD format
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (timeStr: string) => {
    // timeStr is in HH:mm format (24-hour)
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const isFull = session.isFull || (session.remainingSlots !== undefined && session.remainingSlots <= 0);
  
  // Check if the session is in the past
  const isPast = (() => {
    const [year, month, day] = session.date.split('-').map(Number);
    const [hours, minutes] = session.time.split(':').map(Number);
    const sessionDate = new Date(year, month - 1, day, hours, minutes);
    return sessionDate < new Date();
  })();
  
  const isDisabled = isFull || isPast;

  return (
    <div className={cx('session-card', css({
      backgroundColor: isDisabled ? '#0a0a0a' : '#0f0f0f',
      border: '1px solid',
      borderColor: isDisabled 
        ? '#333' 
        : session.priceType === 'off-peak' 
          ? '#10b981' 
          : '#333',
      borderRadius: '12px',
      padding: '12px',
      transition: 'all 0.2s ease',
      opacity: isDisabled ? 0.6 : 1,
      _hover: isDisabled ? {} : {
        borderColor: session.priceType === 'off-peak' ? '#10b981' : '#2563eb',
        backgroundColor: '#1a1a1a',
      }
    }))}>
      <div className={css({
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      })}>
        {/* Header: Date and Time */}
        <div className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
        })}>
          <div>
            <div className={css({
              color: '#ededed',
              fontSize: '16px',
              fontWeight: '600',
              marginBottom: '4px',
            })}>
              {formatDate(session.date)}
            </div>
            <div className={css({
              color: '#999',
              fontSize: '14px',
            })}>
              {formatTime(session.time)}
            </div>
          </div>
          {session.priceType === 'off-peak' && (
            <div className={css({
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            })}>
              Off-Peak
            </div>
          )}
        </div>

        {/* Rink Name */}
        <div className={css({
          color: '#ccc',
          fontSize: '15px',
          fontWeight: '500',
        })}>
          {session.rink}
        </div>

        {/* Slots Available */}
        {session.remainingSlots !== undefined && !isPast && (
          <div className={css({
            marginTop: '4px',
            padding: '4px 8px',
            borderRadius: '6px',
            backgroundColor: isFull 
              ? 'rgba(239, 68, 68, 0.15)' 
              : session.remainingSlots <= 5 
                ? 'rgba(245, 158, 11, 0.15)' 
                : 'rgba(16, 185, 129, 0.15)',
            color: isFull 
              ? '#ef4444' 
              : session.remainingSlots <= 5 
                ? '#f59e0b' 
                : '#10b981',
            fontSize: '12px',
            fontWeight: '600',
            textAlign: 'center',
          })}>
            {isFull 
              ? 'Full' 
              : `${session.remainingSlots} slot${session.remainingSlots !== 1 ? 's' : ''} left`}
            {session.capacity !== undefined && ` (${session.capacity} total)`}
          </div>
        )}

        {/* Footer: Register Button (only for future events) */}
        {!isPast && (
          <div className={css({
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginTop: '8px',
          })}>
            {isFull ? (
              <div className={css({
                backgroundColor: '#333',
                color: '#666',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'not-allowed',
              })}>
                Full
              </div>
            ) : (
              <a
                href={session.registrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={css({
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                  _hover: {
                    backgroundColor: '#1d4ed8',
                    transform: 'translateY(-1px)',
                  }
                })}
              >
                Register
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

