import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { getSettings, getStatSessions, setStatSessions } from '@/lib/kv';
import { adminFixStatOpponentSchema, safeValidateRequest } from '@/lib/validation';
import { isUsTeamName } from '@/lib/stat-opponent';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = safeValidateRequest(adminFixStatOpponentSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const { newOpponent, sessionIds, date, startTimeFrom, startTimeTo, onlyIfOpponentIsUs, limit, dryRun } =
      validation.data;

    const [settings, sessions] = await Promise.all([getSettings(), getStatSessions()]);

    const idSet = Array.isArray(sessionIds) && sessionIds.length > 0 ? new Set(sessionIds) : null;

    const matchesDate = (s: { date: string; startTime: number }) => {
      if (!date) return true;
      if (typeof s.date === 'string' && s.date.startsWith(date)) return true;
      return new Date(s.startTime).toISOString().startsWith(date);
    };

    const candidates = sessions.filter((s) => {
      if (idSet) return idSet.has(s.id);
      if (!matchesDate(s)) return false;
      if (typeof startTimeFrom === 'number' && s.startTime < startTimeFrom) return false;
      if (typeof startTimeTo === 'number' && s.startTime > startTimeTo) return false;
      return true;
    });

    const filtered = onlyIfOpponentIsUs
      ? candidates.filter((s) => {
          if (isUsTeamName(s.opponent, settings || undefined)) return true;
          if (s.ourTeamName && s.opponent.trim().toLowerCase() === s.ourTeamName.trim().toLowerCase()) return true;
          return false;
        })
      : candidates;

    const selected = filtered.toSorted((a, b) => a.startTime - b.startTime).slice(0, limit);
    const updatedById = new Map(selected.map((s) => [s.id, { ...s, opponent: newOpponent }]));
    const sessionPreview = selected.map((s) => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime ?? null,
      ourTeamName: s.ourTeamName ?? null,
      opponent: s.opponent,
      gameId: s.gameId ?? null,
    }));

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        matched: filtered.length,
        updated: selected.length,
        sessions: sessionPreview,
      });
    }

    const nextSessions = sessions.map((s) => updatedById.get(s.id) ?? s);
    await setStatSessions(nextSessions);

    return NextResponse.json({
      success: true,
      updated: selected.length,
      sessions: sessionPreview.map((s) => ({ ...s, opponent: newOpponent })),
    });
  } catch (error) {
    logger.apiError('POST', '/api/admin/stats/fix-opponent', error);
    return NextResponse.json({ error: 'Failed to update stat sessions' }, { status: 500 });
  }
}

