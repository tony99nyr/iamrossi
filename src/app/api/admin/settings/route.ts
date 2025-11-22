import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const settingsPath = path.join(process.cwd(), 'src/data/settings.json');

export async function GET() {
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return NextResponse.json(settings);
    }
    // Default settings if file doesn't exist
    return NextResponse.json({
      teamName: 'Carolina Junior Canes (Black) 10U AA',
      identifiers: ['Black', 'Jr Canes', 'Carolina', 'Jr'],
      teamLogo: 'https://ranktech-cdn.s3.us-east-2.amazonaws.com/myhockey_prod/logos/0022e6_a.png'
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { teamName, identifiers, teamLogo } = body;

    if (!teamName || !Array.isArray(identifiers)) {
      return NextResponse.json({ error: 'Invalid settings format' }, { status: 400 });
    }

    // Ensure directory exists
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save settings
    fs.writeFileSync(settingsPath, JSON.stringify({ teamName, identifiers, teamLogo }, null, 2), 'utf-8');
    
    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
