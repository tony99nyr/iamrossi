import { NextRequest, NextResponse } from 'next/server';
import { getSettings, setSettings, Settings } from '@/lib/kv';
import { verifyAdminAuth } from '@/lib/auth';
import { adminSettingsSchema, safeValidateRequest } from '@/lib/validation';
import { logger } from '@/lib/logger';

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
    logger.apiError('GET', '/api/admin/settings', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Verify admin authentication
  if (!(await verifyAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = safeValidateRequest(adminSettingsSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid settings format' },
        { status: 400 }
      );
    }

    // Get existing settings to preserve fields not in the request
    const existingSettings = await getSettings();

    // Build settings object - merge with existing to avoid losing fields
    const settings: Settings = {
      ...existingSettings, // Preserve existing fields
      ...validation.data,
    };

    // Save settings to KV
    await setSettings(settings);

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    logger.apiError('POST', '/api/admin/settings', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
