import { NextResponse } from 'next/server';

export async function GET() {
  const envVars = Object.keys(process.env).filter(key => 
    key.startsWith('GOOGLE') || key.startsWith('CRON') || key.startsWith('NEXT')
  );
  
  return NextResponse.json({
    envVars,
    hasDriveCreds: !!process.env.GOOGLE_DRIVE_CREDENTIALS,
    hasRefreshToken: !!process.env.GOOGLE_REFRESH_TOKEN,
    hasDriveRefreshToken: !!process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
  });
}
