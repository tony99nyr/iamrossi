'use client';

import { useState } from 'react';
import { css, cx } from '@styled-system/css';
import { calculateRatingMath } from '@/lib/next-game/rating-math';
import type { Game } from '@/types';
import { fullScheduleStyle } from '../styles';

interface RatingMathTableProps {
    games: Game[];
    ourTeamId: string;
    ourCurrentRating: number | null;
}

export default function RatingMathTable({ games, ourTeamId, ourCurrentRating }: RatingMathTableProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!games || games.length === 0) {
        return null;
    }

    const ratingMath = calculateRatingMath(games, ourTeamId, ourCurrentRating);

    const tableStyle = css({
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.9rem',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '8px',
        overflow: 'hidden',
    });

    const headerStyle = css({
        backgroundColor: 'rgba(220, 38, 38, 0.2)',
        color: '#fff',
        fontWeight: '600',
        textAlign: 'left',
        padding: '0.75rem',
        borderBottom: '2px solid rgba(220, 38, 38, 0.3)',
    });

    const cellStyle = css({
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        color: '#ddd',
    });

    const rowStyle = css({
        '&:nth-child(even)': {
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
        },
        '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
    });

    const winStyle = css({
        color: '#4ade80',
        fontWeight: '600',
    });

    const lossStyle = css({
        color: '#f87171',
        fontWeight: '600',
    });

    const tieStyle = css({
        color: '#fbbf24',
        fontWeight: '600',
    });

    const positiveStyle = css({
        color: '#4ade80',
    });

    const negativeStyle = css({
        color: '#f87171',
    });

    const totalsRowStyle = css({
        backgroundColor: 'rgba(220, 38, 38, 0.15)',
        fontWeight: '600',
        borderTop: '2px solid rgba(220, 38, 38, 0.3)',
    });

    const averagesRowStyle = css({
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
        fontWeight: '500',
        fontStyle: 'italic',
    });

    const averagePointsStyle = css({
        fontSize: '1.1rem',
        fontWeight: '700',
        color: '#fff',
        backgroundColor: 'rgba(220, 38, 38, 0.3)',
    });

    const formatNumber = (num: number | null, decimals: number = 1): string => {
        if (num === null) return '—';
        return num.toFixed(decimals);
    };

    const formatPerformanceDiff = (diff: number | null): string => {
        if (diff === null) return '—';
        if (diff > 0) return `+${diff.toFixed(1)}`;
        return diff.toFixed(1);
    };

    return (
        <div className={cx('full-schedule', fullScheduleStyle)}>
            {/* Collapsible Header */}
            <h2 
                onClick={() => setIsExpanded(!isExpanded)}
                className={css({
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'color 0.2s ease',
                    '&:hover': {
                        color: '#dc2626',
                    }
                })}
            >
                <span>Rating Math ({ratingMath.rows.length})</span>
                <svg 
                    width="20" 
                    height="20" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                    className={css({
                        transition: 'transform 0.3s ease',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                    })}
                >
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </h2>
            
            {isExpanded && (
                <div className={css({ overflowX: 'auto', marginTop: '1rem' })}>
                    <table className={tableStyle}>
                        <thead>
                            <tr>
                                <th className={headerStyle}>Date</th>
                                <th className={headerStyle}>Opponent</th>
                                <th className={headerStyle}>W/L/T</th>
                                <th className={headerStyle}>Score</th>
                                <th className={headerStyle}>GD</th>
                                <th className={headerStyle}>Opp Rating</th>
                                <th className={headerStyle}>Points</th>
                                <th className={headerStyle}>+/-</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ratingMath.rows.map((row, index) => (
                                <tr key={index} className={rowStyle}>
                                    <td className={cellStyle}>{row.date}</td>
                                    <td className={cellStyle}>{row.opponent}</td>
                                    <td className={cx(cellStyle, 
                                        row.result === 'W' && winStyle,
                                        row.result === 'L' && lossStyle,
                                        row.result === 'T' && tieStyle
                                    )}>
                                        {row.result}
                                    </td>
                                    <td className={cellStyle}>{row.score}</td>
                                    <td className={cellStyle}>
                                        {row.goalDifferential > 0 ? '+' : ''}{row.goalDifferential}
                                    </td>
                                    <td className={cellStyle}>{formatNumber(row.opponentRating)}</td>
                                    <td className={cellStyle}>{formatNumber(row.points)}</td>
                                    <td className={cx(cellStyle,
                                        row.performanceDiff !== null && row.performanceDiff > 0 && positiveStyle,
                                        row.performanceDiff !== null && row.performanceDiff < 0 && negativeStyle
                                    )}>
                                        {formatPerformanceDiff(row.performanceDiff)}
                                    </td>
                                </tr>
                            ))}
                            <tr className={totalsRowStyle}>
                                <td className={cellStyle} colSpan={2}>
                                    Totals
                                </td>
                                <td className={cellStyle}>
                                    {ratingMath.totals.wins}-{ratingMath.totals.losses}-{ratingMath.totals.ties}
                                </td>
                                <td className={cellStyle}>
                                    {ratingMath.totals.goalsFor}-{ratingMath.totals.goalsAgainst}
                                </td>
                                <td className={cellStyle}>
                                    {ratingMath.totals.goalDifferential > 0 ? '+' : ''}{ratingMath.totals.goalDifferential}
                                </td>
                                <td className={cellStyle}>{formatNumber(ratingMath.totals.opponentRatingSum, 1)}</td>
                                <td className={cellStyle}>{formatNumber(ratingMath.totals.pointsSum, 1)}</td>
                                <td className={cellStyle}>{formatPerformanceDiff(ratingMath.totals.performanceDiffSum)}</td>
                            </tr>
                            <tr className={averagesRowStyle}>
                                <td className={cellStyle} colSpan={2}>
                                    Averages
                                </td>
                                <td className={cellStyle} colSpan={2}></td>
                                <td className={cellStyle}>{formatNumber(ratingMath.averages.goalDifferential, 1)}</td>
                                <td className={cellStyle}>{formatNumber(ratingMath.averages.opponentRating, 1)}</td>
                                <td className={cx(cellStyle, averagePointsStyle)}>{formatNumber(ratingMath.averages.points, 1)}</td>
                                <td className={cellStyle}>{formatPerformanceDiff(ratingMath.averages.performanceDiff)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

