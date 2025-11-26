import { NextRequest, NextResponse } from 'next/server';
import { getAllData } from '@/lib/kv';
import { google } from 'googleapis';

/**
 * Backup Redis data to Google Drive
 * This endpoint should be called by a cron job
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret or admin secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const isValidCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    const isValidAdmin = authHeader === `Bearer ${process.env.ADMIN_SECRET}`;
    
    if (!isValidCron && !isValidAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all data from Redis
    const allData = await getAllData();

    // Prepare backup data
    const timestamp = new Date().toISOString();
    const backupData = {
      timestamp,
      data: allData,
    };

    // Upload to Google Drive if credentials are configured
    let driveResult = null;
    let driveError = null;
    
    if (process.env.GOOGLE_DRIVE_CREDENTIALS || 
        process.env.GOOGLE_REFRESH_TOKEN || 
        process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
      try {
        driveResult = await uploadToGoogleDrive(backupData);
        console.log('✅ Google Drive upload successful:', driveResult);
      } catch (error) {
        console.error('❌ Failed to upload to Google Drive:', error);
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
        console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
        driveError = error instanceof Error ? error.message : 'Unknown error';
        // Continue even if Google Drive upload fails
      }
    } else {
      console.warn('⚠️  GOOGLE_DRIVE_CREDENTIALS not configured, skipping Google Drive upload');
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        keys: Object.keys(allData).length,
      },
      googleDrive: {
        uploaded: !!driveResult,
        fileId: driveResult?.id,
        link: driveResult?.webViewLink,
        error: driveError
      }
    });
  } catch (error) {
    console.error('Backup error:', error);
    return NextResponse.json(
      { error: 'Backup failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function uploadToGoogleDrive(backupData: any) {
  let auth;
  
  // Check for OAuth credentials (preferred for personal accounts)
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

  if (refreshToken && clientId && clientSecret) {
    const { google } = await import('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'https://developers.google.com/oauthplayground' // Redirect URI
    );
    
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
    
    auth = oauth2Client;
    console.log('Using OAuth 2.0 authentication');
  } 
  // Fallback to Service Account (works for Workspace/Shared Drives)
  else if (process.env.GOOGLE_DRIVE_CREDENTIALS) {
    // Parse service account credentials
    // Handle both single-quoted (fixed) and double-quoted formats
    let credentials;
    try {
        const rawCreds = process.env.GOOGLE_DRIVE_CREDENTIALS;
        // If it was fixed to be single quoted in .env, dotenv might have loaded it correctly now
        // But if it still has issues, we try to parse carefully
        credentials = JSON.parse(rawCreds);
    } catch (e) {
        console.error('Error parsing GOOGLE_DRIVE_CREDENTIALS:', e);
        throw new Error('Invalid GOOGLE_DRIVE_CREDENTIALS format');
    }
    
    const { google } = await import('googleapis');
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    console.log('Using Service Account authentication');
  } else {
    throw new Error('No valid Google Drive credentials found');
  }

  const { google } = await import('googleapis');
  const drive = google.drive({ version: 'v3', auth });

  // Create filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `iamrossi-backup-${timestamp}.json`;

  // Convert JSON to readable stream
  const { Readable } = await import('stream');
  const fileContent = JSON.stringify(backupData, null, 2);
  const stream = Readable.from([fileContent]);

  // Upload file
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: process.env.GOOGLE_DRIVE_FOLDER_ID ? [process.env.GOOGLE_DRIVE_FOLDER_ID] : undefined,
    },
    media: {
      mimeType: 'application/json',
      body: stream,
    },
    fields: 'id, name, webViewLink',
  });

  console.log('✅ Backup uploaded to Google Drive:', response.data);
  return response.data;
}
