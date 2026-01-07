#!/usr/bin/env tsx
/**
 * Automated Google Fit token exchange script
 * Opens browser automatically and extracts authorization code from redirect URL
 * 
 * Usage: pnpm run auto-exchange-google-fit-token
 */

import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars from .env.local if present
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'https://developers.google.com/oauthplayground';
const DEFAULT_SCOPES = [
  // Drive upload
  'https://www.googleapis.com/auth/drive.file',
  // Fit data (activity + heart rate)
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
];
const OVERRIDE_SCOPES = process.env.GOOGLE_SCOPES;

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    console.error(`Missing ${name}. Set ${name} in your environment or .env.local.`);
    process.exit(1);
  }
  return value;
}

/**
 * Build OAuth2 authorization URL
 */
function buildAuthUrl(scopes: string[], redirectUri: string, clientId: string) {
  const scopeParam = encodeURIComponent(scopes.join(' '));
  const encodedRedirect = encodeURIComponent(redirectUri);
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodedRedirect}&response_type=code&access_type=offline&prompt=consent&scope=${scopeParam}`;
}

/**
 * Extract authorization code from URL
 */
function extractCodeFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('code');
  } catch {
    return null;
  }
}

/**
 * Extract code from URL (helper for manual entry)
 */
function extractCodeFromManualInput(input: string): string | null {
  // If it's a full URL, extract the code
  if (input.includes('code=')) {
    return extractCodeFromUrl(input);
  }
  // If it's just the code, return it
  if (input.trim().length > 20) {
    return input.trim();
  }
  return null;
}

/**
 * Prompt user to open browser and paste the authorization code or URL
 */
async function promptForCode(authUrl: string): Promise<string> {
  const readline = await import('readline/promises');
  const { stdin: input, stdout: output } = await import('node:process');

  console.log('\n📋 STEP 1: Open this URL in your browser:\n');
  console.log('   ' + authUrl);
  console.log('\n📋 STEP 2: Complete the authorization:');
  console.log('   1. Log in to your Google account (if needed)');
  console.log('   2. Review and accept the permissions');
  console.log('   3. You will be redirected to a page with a code\n');
  console.log('📋 STEP 3: Copy the ENTIRE redirect URL from your browser address bar');
  console.log('   (It will look like: https://developers.google.com/oauthplayground?code=...)');
  console.log('   OR just copy the code value\n');

  const rl = readline.default.createInterface({ input, output });
  const userInput = (await rl.question('Paste the URL or code here: ')).trim();
  rl.close();

  if (!userInput) {
    console.error('❌ No input provided.');
    process.exit(1);
  }

  // Try to extract code from input
  const code = extractCodeFromManualInput(userInput);
  if (!code) {
    console.error('❌ Could not extract authorization code from input.');
    console.error('   Please provide either:');
    console.error('   - The full redirect URL (with code= parameter)');
    console.error('   - Just the authorization code value');
    process.exit(1);
  }

  return code;
}

/**
 * Exchange authorization code for refresh token
 */
async function exchangeCode(code: string, clientSecret: string, redirectUri: string, clientId: string) {
  console.log('🔄 Exchanging authorization code for tokens...\n');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('❌ Token exchange failed:', data);
    process.exit(1);
  }

  console.log('✅ Token exchange successful!\n');
  console.log('📋 Token Response:');
  console.log(JSON.stringify(data, null, 2));
  console.log('\n💾 IMPORTANT: Save the refresh_token value to your .env.local file:');
  console.log(`   GOOGLE_DRIVE_REFRESH_TOKEN=${data.refresh_token}\n`);
  
  if (data.refresh_token) {
    console.log('📝 Quick copy command:');
    console.log(`   echo "GOOGLE_DRIVE_REFRESH_TOKEN=${data.refresh_token}" >> .env.local\n`);
  }

  return data;
}

async function main() {
  try {
    const clientId = requireEnv(CLIENT_ID, 'GOOGLE_DRIVE_CLIENT_ID');
    const clientSecret = requireEnv(CLIENT_SECRET, 'GOOGLE_DRIVE_CLIENT_SECRET');
    const redirectUri = requireEnv(REDIRECT_URI, 'GOOGLE_REDIRECT_URI');
    const scopes = OVERRIDE_SCOPES ? OVERRIDE_SCOPES.split(/\s+/).filter(Boolean) : DEFAULT_SCOPES;
    const authUrl = buildAuthUrl(scopes, redirectUri, clientId);

    // Check if code is provided via environment variable (for non-interactive use)
    const authCodeEnv = process.env.GOOGLE_AUTH_CODE;
    
    let code: string;
    if (authCodeEnv?.trim()) {
      console.log('📥 Using authorization code from GOOGLE_AUTH_CODE environment variable\n');
      code = authCodeEnv.trim();
    } else {
      // Prompt user to open browser and paste code
      code = await promptForCode(authUrl);
    }

    await exchangeCode(code, clientSecret, redirectUri, clientId);
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

