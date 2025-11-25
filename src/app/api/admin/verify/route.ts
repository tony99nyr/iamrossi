import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secret } = body;

    if (!secret) {
      return NextResponse.json({ error: 'Secret required' }, { status: 400 });
    }

    if (verifyAdminSecret(secret)) {
      return NextResponse.json({ success: true, message: 'Authentication successful' });
    }

    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  } catch (error) {
    console.error('Error verifying admin secret:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
