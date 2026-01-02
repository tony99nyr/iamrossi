/**
 * Audit Logs API Endpoint
 * Retrieves audit logs for trading system
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/auth';
import { getAuditLogs } from '@/lib/audit-logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify authentication
    if (!(await verifyAdminAuth(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const logs = await getAuditLogs(limit);

    return NextResponse.json({
      logs,
      count: logs.length,
    });
  } catch (error) {
    console.error('[Audit Logs] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve audit logs' },
      { status: 500 }
    );
  }
}

