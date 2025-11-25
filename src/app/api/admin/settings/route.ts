import { NextRequest, NextResponse } from 'next/server';
import { getSettings, setSettings, Settings } from '@/lib/kv';
import { verifyAdminAuth } from '@/lib/auth';

export async function GET() {
  try {
    const settings = await getSettings();

    if (settings) {
      return NextResponse.json(settings);
    }

    // Default settings if not found in KV
    return NextResponse.json({
      teamName: 'Carolina Junior Canes (Black) 10U AA',
      identifiers: ['Black', 'Jr Canes', 'Carolina', 'Jr'],
      teamLogo: 'https://ranktech-cdn.s3.us-east-2.amazonaws.com/myhockey_prod/logos/0022e6_a.png'
    });
  } catch (error) {
    console.error('Error loading settings:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Verify admin authentication
  if (!verifyAdminAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { teamName, identifiers, teamLogo, mhrTeamId, mhrYear, aliases } = body;

    if (!teamName || !Array.isArray(identifiers)) {
      return NextResponse.json({ error: 'Invalid settings format' }, { status: 400 });
    }

    // Build settings object with all fields
    const settings: Settings = {
      teamName,
      identifiers,
      teamLogo,
      ...(mhrTeamId && { mhrTeamId }),
      ...(mhrYear && { mhrYear }),
      ...(aliases && { aliases }),
    };

    // Save settings to KV
    await setSettings(settings);

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
