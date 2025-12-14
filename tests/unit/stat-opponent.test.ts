import { describe, it, expect } from 'vitest';
import { resolveOpponentFromScheduledGame } from '@/lib/stat-opponent';

describe('resolveOpponentFromScheduledGame', () => {
  it('returns visitor as opponent when we are home', () => {
    const opponent = resolveOpponentFromScheduledGame(
      { home_team_name: 'Jr Canes 10U Black', visitor_team_name: 'Ohio Blue Jackets 10U AAA' },
      { teamName: 'Jr Canes 10U Black', identifiers: ['Jr Canes', 'Black'] }
    );
    expect(opponent).toBe('Ohio Blue Jackets 10U AAA');
  });

  it('returns home as opponent when we are visitor', () => {
    const opponent = resolveOpponentFromScheduledGame(
      { home_team_name: 'Ohio Blue Jackets 10U AAA', visitor_team_name: 'Jr Canes 10U Black' },
      { teamName: 'Jr Canes 10U Black', identifiers: ['Jr Canes', 'Black'] }
    );
    expect(opponent).toBe('Ohio Blue Jackets 10U AAA');
  });

  it('uses identifiers to detect our team', () => {
    const opponent = resolveOpponentFromScheduledGame(
      {
        home_team_name: 'Carolina Junior Canes (Black) 10U AA',
        visitor_team_name: 'Some Other Team 10U',
      },
      { teamName: 'Jr Canes 10U Black', identifiers: ['Jr Canes', 'Black'] }
    );
    expect(opponent).toBe('Some Other Team 10U');
  });

  it('falls back without returning our team name when possible', () => {
    const opponent = resolveOpponentFromScheduledGame(
      { home_team_name: 'Team A', visitor_team_name: 'Team B' },
      { teamName: 'Team B', identifiers: [] }
    );
    expect(opponent).toBe('Team A');
  });
});

