import { NextRequest, NextResponse } from 'next/server';
import { setHomeIp } from '@/lib/kv';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  // Verify authentication using CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    
    // Validate IP address
    const schema = z.object({
      ip: z.string().regex(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/, 'Invalid IP address')
    });

    const result = schema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid IP address' },
        { status: 400 }
      );
    }

    const { ip } = result.data;

    // Save IP to KV
    await setHomeIp(ip);

    return NextResponse.json({ success: true, ip });
  } catch (error) {
    console.error('Failed to update IP:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
