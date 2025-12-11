#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';

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

function buildAuthUrl(scopes: string[], redirectUri: string, clientId: string) {
  const scopeParam = encodeURIComponent(scopes.join(' '));
  const encodedRedirect = encodeURIComponent(redirectUri);
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodedRedirect}&response_type=code&access_type=offline&prompt=consent&scope=${scopeParam}`;
}

async function promptForCode(authUrl: string) {
  console.log('Open this URL in a browser, complete consent, then paste the code:\n');
  console.log(authUrl);
  console.log('');
  const rl = readline.createInterface({ input, output });
  const code = (await rl.question('Authorization code: ')).trim();
  rl.close();
  if (!code) {
    console.error('No authorization code provided.');
    process.exit(1);
  }
  return code;
}

async function exchangeCode(code: string, clientSecret: string, redirectUri: string, clientId: string) {
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
    console.error('Token exchange failed:', data);
    process.exit(1);
  }

  console.log('\nToken response:\n');
  console.log(JSON.stringify(data, null, 2));
  console.log('\nSave the refresh_token securely; use it to mint new access tokens.');
}

async function main() {
  const clientId = requireEnv(CLIENT_ID, 'GOOGLE_DRIVE_CLIENT_ID');
  const clientSecret = requireEnv(CLIENT_SECRET, 'GOOGLE_DRIVE_CLIENT_SECRET');
  const redirectUri = requireEnv(REDIRECT_URI, 'GOOGLE_REDIRECT_URI');
  const scopes = OVERRIDE_SCOPES ? OVERRIDE_SCOPES.split(/\s+/).filter(Boolean) : DEFAULT_SCOPES;
  const authUrl = buildAuthUrl(scopes, redirectUri, clientId);
  const authCodeEnv = process.env.GOOGLE_AUTH_CODE;
  const code = authCodeEnv?.trim() || (await promptForCode(authUrl));

  await exchangeCode(code, clientSecret, redirectUri, clientId);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});