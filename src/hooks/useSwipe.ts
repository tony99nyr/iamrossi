import { useRef, type TouchEvent } from 'react';

interface UseSwipeProps {
    onSwipeLeft: () => void;
    onSwipeRight: () => void;
    minSwipeDistance?: number;
    maxVerticalDistance?: number;
}

export function useSwipe({ 
    onSwipeLeft, 
    onSwipeRight, 
    minSwipeDistance = 100, 
    maxVerticalDistance = 50 
}: UseSwipeProps) {
    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);
    const touchEndY = useRef<number | null>(null);

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
            onSwipeLeft();
        }
        if (isRightSwipe) {
            onSwipeRight();
        }
    };

    return {
        onTouchStart,
        onTouchMove,
        onTouchEnd,
    };
}
