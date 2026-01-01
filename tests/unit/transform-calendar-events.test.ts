import { describe, it, expect, vi } from 'vitest';
import { transformCalendarEvents } from '@/lib/transform-calendar-events';
import * as kv from '@/lib/kv';

// Mock dependencies
vi.mock('@/lib/kv', () => ({
    getSettings: vi.fn(),
}));

vi.mock('@/lib/mhr-service', () => ({
    getMHRTeamData: vi.fn().mockResolvedValue(null),
    scrapeTeamDetails: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
    logDebug: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
}));

describe('transformCalendarEvents', () => {
    it('should clean up placeholder event titles', async () => {
        // Mock settings
        vi.spyOn(kv, 'getSettings').mockResolvedValue({
            teamName: 'Carolina Junior Canes (Black) 10U AA',
            identifiers: ['Black', 'Jr Canes', 'Carolina', 'Jr'],
            mhrTeamId: '123',
            mhrYear: '2025'
        });

        const events = [
            {
                summary: 'Jr Canes 10U Black - Tier 1 Elite Tournament',
                start: new Date('2025-12-13T00:00:00Z'),
                end: new Date('2025-12-15T23:59:59Z'),
                location: 'TBD',
            },
            {
                summary: 'Showcase - Jr Canes Black',
                start: new Date('2026-01-01T00:00:00Z'),
                end: new Date('2026-01-03T23:59:59Z'),
                location: 'TBD',
            }
        ];

        const result = await transformCalendarEvents(events);

        const placeholder1 = result.find(e => e.placeholderStartDate?.includes('2025-12-13'));
        const placeholder2 = result.find(e => e.placeholderStartDate?.includes('2026-01-01'));

        expect(placeholder1).toBeDefined();
        expect(placeholder1?.isPlaceholder).toBe(true);
        // "Jr Canes 10U Black - Tier 1 Elite Tournament" -> "Tier 1 Elite Tournament"
        // "Jr Canes", "10U", "Black" removed.
        
        console.log('Placeholder 1 Label:', placeholder1?.placeholderLabel);
        console.log('Placeholder 2 Label:', placeholder2?.placeholderLabel);

        expect(placeholder1?.placeholderLabel).toBe('Tier 1 Elite Tournament');
        expect(placeholder2?.placeholderLabel).toBe('Showcase');
    });
});
