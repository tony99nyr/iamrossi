import { NextResponse, NextRequest } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execPromise = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { teamId, year } = await request.json();

    if (!teamId || !year) {
      return NextResponse.json({ error: 'Team ID and Year are required' }, { status: 400 });
    }

    const scriptPath = path.join(process.cwd(), 'scripts/mhr-scraper.js');
    const command = `node ${scriptPath} ${teamId} ${year}`;
    console.log(`Executing: ${command}`);

    const { stdout, stderr } = await execPromise(command);
    if (stderr) {
      console.error(`Stderr: ${stderr}`);
      return NextResponse.json({ error: 'Failed to sync schedule', details: stderr }, { status: 500 });
    }
    console.log(`Stdout: ${stdout}`);
    return NextResponse.json({ success: true, message: 'Schedule synced successfully' });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  // Endpoint to get current settings
  const settingsPath = path.join(process.cwd(), 'src/data/settings.json');
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return NextResponse.json(settings);
  }
  return NextResponse.json({ teamId: '19758', year: '2025' }); // Defaults
}
