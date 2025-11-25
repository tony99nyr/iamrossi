'use client';

import { useState, useEffect } from 'react';
import { css, cx } from '@styled-system/css';

interface PinEntryModalProps {
    onSuccess: (token: string) => void;
}

export default function PinEntryModal({ onSuccess }: PinEntryModalProps) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [remainingAttempts, setRemainingAttempts] = useState(3);
    const [cooldownSeconds, setCooldownSeconds] = useState(0);
    const [isShaking, setIsShaking] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Cooldown timer
    useEffect(() => {
        if (cooldownSeconds > 0) {
            const timer = setTimeout(() => {
                setCooldownSeconds(prev => prev - 1);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [cooldownSeconds]);

    const handleNumberClick = (num: number) => {
        if (cooldownSeconds > 0 || isSubmitting) return;
        
        const newPin = pin + num.toString();
        setPin(newPin);
        setError('');
    };

    const handleBackspace = () => {
        if (cooldownSeconds > 0 || isSubmitting) return;
        setPin(prev => prev.slice(0, -1));
        setError('');
    };

    const handleClear = () => {
        if (cooldownSeconds > 0 || isSubmitting) return;
        setPin('');
        setError('');
    };

    const handleSubmit = async () => {
        if (!pin || cooldownSeconds > 0 || isSubmitting) return;
        
        setIsSubmitting(true);
        setError('');

        try {
            const response = await fetch('/api/rehab/verify-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin }),
            });

            const data = await response.json();

            if (response.ok) {
                onSuccess(data.token);
            } else if (response.status === 429) {
                // Rate limited
                setCooldownSeconds(data.cooldownSeconds || 300);
                setError(`Too many attempts. Try again in ${formatTime(data.cooldownSeconds || 300)}`);
                setPin('');
                setIsShaking(true);
                setTimeout(() => setIsShaking(false), 500);
            } else {
                // Invalid PIN
                setRemainingAttempts(data.remainingAttempts ?? remainingAttempts - 1);
                setError(`Invalid PIN. ${data.remainingAttempts ?? remainingAttempts - 1} attempts remaining.`);
                setPin('');
                setIsShaking(true);
                setTimeout(() => setIsShaking(false), 500);
            }
        } catch (err) {
            console.error('PIN verification error:', err);
            setError('Connection error. Please try again.');
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const renderPinDots = () => {
        const dots = [];
        const maxDots = 8; // Show up to 8 dots
        
        for (let i = 0; i < maxDots; i++) {
            const isFilled = i < pin.length;
            dots.push(
                <div
                    key={i}
                    className={cx('pin-dot', css({
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        backgroundColor: isFilled ? '#fff' : 'transparent',
                        transition: 'all 0.2s ease',
                        transform: isFilled ? 'scale(1.1)' : 'scale(1)',
                    }))}
                />
            );
        }
        
        return dots;
    };

    const numberButtons = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const isDisabled = cooldownSeconds > 0 || isSubmitting;

    return (
        <div className={cx('pin-modal-overlay', css({
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
        }))}>
            <div className={cx('pin-modal-content', css({
                backgroundColor: '#1a1a1a',
                borderRadius: '24px',
                padding: '32px 24px',
                maxWidth: '400px',
                width: '100%',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                animation: isShaking ? 'shake 0.5s' : 'none',
            }), isShaking ? 'shake-animation' : '')}>
                <style jsx>{`
                    @keyframes shake {
                        0%, 100% { transform: translateX(0); }
                        10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
                        20%, 40%, 60%, 80% { transform: translateX(8px); }
                    }
                    .shake-animation {
                        animation: shake 0.5s;
                    }
                `}</style>                {/* Title */}
                <h2 className={cx('pin-title', css({
                    fontSize: '24px',
                    fontWeight: '600',
                    color: '#fff',
                    textAlign: 'center',
                    marginBottom: '8px',
                }))}>
                    Enter PIN
                </h2>

                {/* Subtitle */}
                <p className={cx('pin-subtitle', css({
                    fontSize: '14px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    textAlign: 'center',
                    marginBottom: '32px',
                }))}>
                    {cooldownSeconds > 0 
                        ? `Locked for ${formatTime(cooldownSeconds)}`
                        : 'Authentication required to modify data'
                    }
                </p>

                {/* PIN Dots Display */}
                <div className={cx('pin-dots-container', css({
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'center',
                    marginBottom: '32px',
                    minHeight: '16px',
                }))}>
                    {renderPinDots()}
                </div>

                {/* Error Message */}
                {error && (
                    <div className={cx('pin-error', css({
                        color: '#ff4444',
                        fontSize: '14px',
                        textAlign: 'center',
                        marginBottom: '24px',
                        minHeight: '20px',
                    }))}>
                        {error}
                    </div>
                )}

                {/* Number Keypad */}
                <div className={cx('pin-keypad', css({
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                    marginBottom: '16px',
                }))}>
                    {numberButtons.map(num => (
                        <button
                            key={num}
                            onClick={() => handleNumberClick(num)}
                            disabled={isDisabled}
                            className={cx('pin-number-btn', css({
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '24px',
                                fontWeight: '500',
                                padding: '20px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                userSelect: 'none',
                                WebkitTapHighlightColor: 'transparent',
                                _hover: {
                                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                    transform: 'scale(1.05)',
                                },
                                _active: {
                                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                    transform: 'scale(0.95)',
                                },
                                _disabled: {
                                    opacity: 0.3,
                                    cursor: 'not-allowed',
                                    transform: 'none',
                                },
                            }))}
                        >
                            {num}
                        </button>
                    ))}
                </div>

                {/* Bottom Row: Clear, 0, Backspace */}
                <div className={cx('pin-bottom-row', css({
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                    marginBottom: '24px',
                }))}>
                    <button
                        onClick={handleClear}
                        disabled={isDisabled}
                        className={cx('pin-action-btn', css({
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '12px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '14px',
                            fontWeight: '500',
                            padding: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            userSelect: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            _hover: {
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            },
                            _active: {
                                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                transform: 'scale(0.95)',
                            },
                            _disabled: {
                                opacity: 0.3,
                                cursor: 'not-allowed',
                            },
                        }))}
                    >
                        Clear
                    </button>

                    <button
                        onClick={() => handleNumberClick(0)}
                        disabled={isDisabled}
                        className={cx('pin-number-btn', css({
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '24px',
                            fontWeight: '500',
                            padding: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            userSelect: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            _hover: {
                                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                transform: 'scale(1.05)',
                            },
                            _active: {
                                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                transform: 'scale(0.95)',
                            },
                            _disabled: {
                                opacity: 0.3,
                                cursor: 'not-allowed',
                            },
                        }))}
                    >
                        0
                    </button>

                    <button
                        onClick={handleBackspace}
                        disabled={isDisabled}
                        className={cx('pin-action-btn', css({
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '12px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            fontSize: '14px',
                            fontWeight: '500',
                            padding: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            userSelect: 'none',
                            WebkitTapHighlightColor: 'transparent',
                            _hover: {
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            },
                            _active: {
                                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                transform: 'scale(0.95)',
                            },
                            _disabled: {
                                opacity: 0.3,
                                cursor: 'not-allowed',
                            },
                        }))}
                    >
                        ⌫
                    </button>
                </div>

                {/* Submit Button */}
                <button
                    onClick={handleSubmit}
                    disabled={!pin || isDisabled}
                    className={cx('pin-submit-btn', css({
                        width: '100%',
                        backgroundColor: '#4CAF50',
                        border: 'none',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '16px',
                        fontWeight: '600',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        userSelect: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        _hover: {
                            backgroundColor: '#45a049',
                            transform: 'translateY(-2px)',
                            boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
                        },
                        _active: {
                            transform: 'translateY(0)',
                        },
                        _disabled: {
                            backgroundColor: 'rgba(76, 175, 80, 0.3)',
                            cursor: 'not-allowed',
                            transform: 'none',
                            boxShadow: 'none',
                        },
                    }))}
                >
                    {isSubmitting ? 'Verifying...' : 'Submit'}
                </button>

                {/* Attempts Remaining */}
                {!error && remainingAttempts < 3 && cooldownSeconds === 0 && (
                    <p className={cx('pin-attempts', css({
                        fontSize: '12px',
                        color: 'rgba(255, 255, 255, 0.5)',
                        textAlign: 'center',
                        marginTop: '16px',
                    }))}>
                        {remainingAttempts} {remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining
                    </p>
                )}
            </div>
        </div>
    );
}
