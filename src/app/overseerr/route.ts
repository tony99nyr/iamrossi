import { NextResponse } from 'next/server';
import { getHomeIp } from '@/lib/kv';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const homeIp = await getHomeIp();

    if (!homeIp) {
      return new NextResponse('Service Unavailable: Home IP not set', { status: 503 });
    }

    return NextResponse.redirect(`http://${homeIp}:5055`);
  } catch (error) {
    console.error('Redirect error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
