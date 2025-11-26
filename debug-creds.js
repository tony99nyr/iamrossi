const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

try {
    const rawCreds = process.env.GOOGLE_DRIVE_CREDENTIALS;
    if (!rawCreds) {
        console.log('❌ GOOGLE_DRIVE_CREDENTIALS is missing');
        process.exit(1);
    }

    console.log('Length of credentials string:', rawCreds.length);
    console.log('First 20 chars:', rawCreds.substring(0, 20));
    console.log('Last 20 chars:', rawCreds.substring(rawCreds.length - 20));

    // Check for unescaped newlines
    if (rawCreds.includes('\n')) {
        console.log('⚠️  WARNING: String contains actual newline characters');
    } else {
        console.log('✅ String does not contain actual newline characters');
    }

    // Try to parse
    try {
        JSON.parse(rawCreds);
        console.log('✅ JSON.parse successful');
    } catch (e) {
        console.log('❌ JSON.parse failed:', e.message);
        // specific check for the common private key issue
        if (rawCreds.includes('private_key')) {
            const match = rawCreds.match(/"private_key":\s*"(.*?)"/);
            if (match) {
                console.log('Private key found. Checking format...');
                const key = match[1];
                console.log('Private key contains \\n literal:', key.includes('\\n'));
                console.log('Private key contains actual newline:', key.includes('\n'));
            }
        }
    }

} catch (err) {
    console.error('Unexpected error:', err);
}
