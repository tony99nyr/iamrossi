import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret, verifyPin } from '@/lib/auth';
import { adminVerifySchema, safeValidateRequest } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = safeValidateRequest(adminVerifySchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const { secret } = validation.data;

    // Try ADMIN_SECRET first, then fall back to WORKOUT_ADMIN_PIN
    if (verifyAdminSecret(secret) || verifyPin(secret)) {
      return NextResponse.json({ success: true, message: 'Authentication successful' });
    }

    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  } catch (error) {
    logger.apiError('POST', '/api/admin/verify', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
