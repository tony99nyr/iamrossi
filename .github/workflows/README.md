# GitHub Actions Workflows

## Trading Bot Cron Job

The `trading-bot-cron.yml` workflow automatically updates the ETH trading bot every 5 minutes.

### Setup Instructions

1. **Add GitHub Secrets** (Settings → Secrets and variables → Actions):
   - `CRON_SECRET`: Your Vercel `CRON_SECRET` environment variable value
   - `VERCEL_URL`: Your Vercel deployment URL (e.g., `iamrossi.com` or `your-app.vercel.app`)
     - **Note**: The protocol (`https://`) will be added automatically if not included

2. **Verify the workflow**:
   - Go to Actions tab in GitHub
   - You can manually trigger it using "Run workflow" button
   - Check the logs to ensure it's working correctly

### How It Works

- Runs every 5 minutes via GitHub Actions scheduled workflow
- Calls `/api/trading/paper/cron-update` endpoint
- Sends `Authorization: Bearer {CRON_SECRET}` header for authentication
- Includes retry logic (3 attempts with exponential backoff) for network failures
- Logs response status and body for debugging

### Error Handling

The workflow includes robust error handling:

- **Network Failures**: Automatically retries up to 3 times with exponential backoff
- **401 Unauthorized**: Treated as success (expected when no active session)
- **500 Server Error**: Retries up to 3 times before failing
- **Other HTTP Errors**: Fails immediately with error details

### Troubleshooting

If the workflow fails:

1. **Check GitHub Secrets**:
   - Verify `VERCEL_URL` is set correctly (can be with or without `https://`)
   - Verify `CRON_SECRET` matches your Vercel environment variable

2. **Check Vercel Deployment**:
   - Ensure your Vercel deployment is accessible
   - Verify the API endpoint `/api/trading/paper/cron-update` exists
   - Check Vercel logs for any server-side errors

3. **Network Issues**:
   - The workflow will automatically retry on network failures
   - If it consistently fails, check GitHub Actions network connectivity
   - Verify the Vercel URL is correct and accessible

4. **Authentication Issues**:
   - Ensure `CRON_SECRET` in GitHub Secrets matches `CRON_SECRET` in Vercel
   - Check that the API endpoint is correctly validating the secret

### Notes

- The workflow will exit successfully even if there's no active trading session (401 is expected)
- Network failures will trigger automatic retries (up to 3 attempts)
- You can manually trigger the workflow anytime using the "Run workflow" button
- The workflow has a 5-minute timeout to prevent hanging

