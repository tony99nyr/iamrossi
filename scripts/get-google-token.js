const { google } = require('googleapis');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🔑 Google Drive OAuth 2.0 Token Generator');
console.log('=========================================');
console.log('This script will help you generate a Refresh Token for Google Drive Backup.\n');

rl.question('Enter your Client ID: ', (clientId) => {
    rl.question('Enter your Client Secret: ', (clientSecret) => {

        const oauth2Client = new google.auth.OAuth2(
            clientId.trim(),
            clientSecret.trim(),
            'https://developers.google.com/oauthplayground' // Using OAuth Playground as redirect URI for simplicity
        );

        const scopes = ['https://www.googleapis.com/auth/drive.file'];

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Critical for getting refresh token
            scope: scopes,
            prompt: 'consent' // Force consent to ensure refresh token is returned
        });

        console.log('\n🔗 Authorization URL:');
        console.log(url);
        console.log('\n👉 Instructions:');
        console.log('1. Open the above URL in your browser.');
        console.log('2. Log in with your Google account.');
        console.log('3. Allow access.');
        console.log('4. You will be redirected to OAuth Playground.');
        console.log('5. Copy the "Authorization code" from the URL or the page.');
        console.log('   (It starts with "4/...")');

        rl.question('\nEnter the Authorization Code: ', async (code) => {
            try {
                const { tokens } = await oauth2Client.getToken(code.trim());

                console.log('\n✅ Success! Here are your credentials for .env.local:\n');
                console.log(`GOOGLE_CLIENT_ID="${clientId.trim()}"`);
                console.log(`GOOGLE_CLIENT_SECRET="${clientSecret.trim()}"`);
                console.log(`GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`);

                if (!tokens.refresh_token) {
                    console.log('\n⚠️  WARNING: No refresh token returned.');
                    console.log('Did you authorize the app before? You might need to revoke access first or use prompt=consent (which we did).');
                }

                console.log('\n📝 Next steps:');
                console.log('1. Add these lines to your .env.local file (replace GOOGLE_DRIVE_CREDENTIALS)');
                console.log('2. Add them to your Vercel Environment Variables');

            } catch (error) {
                console.error('\n❌ Error retrieving access token:', error.message);
            } finally {
                rl.close();
            }
        });
    });
});
