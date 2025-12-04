import { css } from '@styled-system/css';

interface CalendarHeaderProps {
    dateRange: string;
    onPreviousWeek: () => void;
    onNextWeek: () => void;
    onGoToToday?: () => void;
}

export default function CalendarHeader({
    dateRange,
    onPreviousWeek,
    onNextWeek,
    onGoToToday,
}: CalendarHeaderProps) {
    return (
        <div className={css({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
            gap: '16px',
        })}>
            <button
                onClick={onPreviousWeek}
                className={css({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '48px',
                    height: '48px',
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '12px',
                    color: '#ededed',
                    fontSize: '28px',
                    fontWeight: '300',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                    _hover: {
                        backgroundColor: '#2a2a2a',
                        borderColor: '#2563eb',
                        transform: 'scale(1.05)',
                    },
                    _active: {
                        transform: 'scale(0.95)',
                    }
                })}
                aria-label="Previous week"
            >
                ‹
            </button>

            <div
                onClick={onGoToToday}
                className={css({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    cursor: onGoToToday ? 'pointer' : 'default',
                    transition: 'opacity 0.2s ease',
                    _hover: onGoToToday ? {
                        opacity: 0.7,
                    } : {},
                })}
            >
                <h2 className={css({
                    color: '#ededed',
                    fontSize: '19px',
                    fontWeight: '600',
                    margin: 0,
                    letterSpacing: '0.3px',
                    textAlign: 'center',
                })}>
                    {dateRange}
                </h2>
            </div>

            <button
                onClick={onNextWeek}
                className={css({
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '48px',
                    height: '48px',
                    backgroundColor: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '12px',
                    color: '#ededed',
                    fontSize: '28px',
                    fontWeight: '300',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                    _hover: {
                        backgroundColor: '#2a2a2a',
                        borderColor: '#2563eb',
                        transform: 'scale(1.05)',
                    },
                    _active: {
                        transform: 'scale(0.95)',
                    }
                })}
                aria-label="Next week"
            >
                ›
            </button>
        </div>
    );
}
