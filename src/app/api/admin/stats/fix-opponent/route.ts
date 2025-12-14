import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { getSettings, getStatSessions, setStatSessions } from '@/lib/kv';
import { adminFixStatOpponentSchema, safeValidateRequest } from '@/lib/validation';
import { isUsTeamName } from '@/lib/stat-opponent';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
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

    const { newOpponent, sessionIds, date, onlyIfOpponentIsUs, limit, dryRun } = validation.data;

    const [settings, sessions] = await Promise.all([getSettings(), getStatSessions()]);

    const idSet = Array.isArray(sessionIds) && sessionIds.length > 0 ? new Set(sessionIds) : null;

    const matchesDate = (s: { date: string; startTime: number }) => {
      if (!date) return true;
      if (typeof s.date === 'string' && s.date.startsWith(date)) return true;
      return new Date(s.startTime).toISOString().startsWith(date);
    };

    const candidates = sessions.filter((s) => {
      if (idSet) return idSet.has(s.id);
      return matchesDate(s);
    });

    const filtered = onlyIfOpponentIsUs
      ? candidates.filter((s) => {
          if (isUsTeamName(s.opponent, settings || undefined)) return true;
          if (s.ourTeamName && s.opponent.trim().toLowerCase() === s.ourTeamName.trim().toLowerCase()) return true;
          return false;
        })
      : candidates;

    const selected = filtered.slice(0, limit);
    const updatedById = new Map(selected.map((s) => [s.id, { ...s, opponent: newOpponent }]));

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        matched: filtered.length,
        updated: selected.length,
        sessionIds: selected.map((s) => s.id),
      });
    }

    const nextSessions = sessions.map((s) => updatedById.get(s.id) ?? s);
    await setStatSessions(nextSessions);

    return NextResponse.json({
      success: true,
      updated: selected.length,
      sessionIds: selected.map((s) => s.id),
    });
  } catch (error) {
    logger.apiError('POST', '/api/admin/stats/fix-opponent', error);
    return NextResponse.json({ error: 'Failed to update stat sessions' }, { status: 500 });
  }
}

