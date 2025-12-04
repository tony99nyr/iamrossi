import { NextResponse } from 'next/server';
import { getDailyScores } from '@/lib/oura-service';

export async function GET() {
  try {
    const testDate = '2025-12-03';
    console.log('=== TESTING OURA CACHE ===');
    const scores = await getDailyScores(testDate);
    console.log('=== RESULT ===', scores);
    
    return NextResponse.json({ success: true, scores });
  } catch (error) {
    console.error('=== ERROR ===', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
