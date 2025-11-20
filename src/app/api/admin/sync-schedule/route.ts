import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(request: Request) {
    try {
        const { teamId, year } = await request.json();

        if (!teamId || !year) {
            return NextResponse.json({ error: 'Team ID and Year are required' }, { status: 400 });
        }

        const scriptPath = path.join(process.cwd(), 'scripts/mhr-scraper.js');
        
        // Execute the scraper script
        // Note: This assumes 'node' is in the path. In some environments, might need full path.
        const command = `node ${scriptPath} ${teamId} ${year}`;
        
        console.log(`Executing: ${command}`);

        return new Promise((resolve) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Exec error: ${error}`);
                    console.error(`Stderr: ${stderr}`);
                    resolve(NextResponse.json({ error: 'Failed to sync schedule', details: stderr }, { status: 500 }));
                    return;
                }
                
                console.log(`Stdout: ${stdout}`);
                resolve(NextResponse.json({ success: true, message: 'Schedule synced successfully' }));
            });
        });

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
