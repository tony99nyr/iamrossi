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
      identifiers: ['Black', 'Jr Canes', 'Carolina', 'Jr']
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
    const { teamName, identifiers, mhrTeamId, mhrYear, aliases } = body;

    if (!teamName || !Array.isArray(identifiers)) {
      return NextResponse.json({ error: 'Invalid settings format' }, { status: 400 });
    }

    // Get existing settings to preserve fields not in the request
    const existingSettings = await getSettings();

    // Build settings object - merge with existing to avoid losing fields
    const settings: Settings = {
      ...existingSettings, // Preserve existing fields
      teamName,
      identifiers,
      // Update optional fields if provided
      ...(mhrTeamId !== undefined && { mhrTeamId }),
      ...(mhrYear !== undefined && { mhrYear }),
      ...(aliases !== undefined && { aliases }),
    };

    // Save settings to KV
    await setSettings(settings);

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
