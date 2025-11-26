import { NextRequest, NextResponse } from 'next/server';
import { getExercises, getEntries } from '@/lib/kv';
import { google } from 'googleapis';

/**
 * Backup Redis data to Google Drive
 * This endpoint should be called by a cron job
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch data from Redis
    const exercises = await getExercises();
    const entries = await getEntries();

    // Prepare backup data
    const timestamp = new Date().toISOString();
    const backupData = {
      timestamp,
      exercises,
      entries,
    };

    // Upload to Google Drive if credentials are configured
    if (process.env.GOOGLE_DRIVE_CREDENTIALS) {
      try {
        await uploadToGoogleDrive(backupData);
      } catch (error) {
        console.error('Failed to upload to Google Drive:', error);
        // Continue even if Google Drive upload fails
      }
    }

    return NextResponse.json({
      success: true,
      timestamp,
      stats: {
        exercises: exercises.length,
        entries: entries.length,
      },
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
  // Parse service account credentials
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS || '{}');
  
  // Initialize Google Drive API
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const drive = google.drive({ version: 'v3', auth });

  // Create filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `rehab-backup-${timestamp}.json`;

  // Upload file
  const fileMetadata = {
    name: fileName,
    parents: [process.env.GOOGLE_DRIVE_FOLDER_ID], // Optional: specify folder
  };

  const media = {
    mimeType: 'application/json',
    body: JSON.stringify(backupData, null, 2),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, name, webViewLink',
  });

  console.log('✅ Backup uploaded to Google Drive:', response.data);
  return response.data;
}
