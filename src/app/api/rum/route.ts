import { NextResponse } from 'next/server';
import type { WebVitalSample } from '@/types';
import { logWebVitalSample } from '@/lib/kv';
import { webVitalSchema, safeValidateRequest } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = safeValidateRequest(webVitalSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid metric data' },
        { status: 400 }
      );
    }

    await logWebVitalSample(validation.data as WebVitalSample);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid payload' },
      { status: 400 },
    );
  }
}


