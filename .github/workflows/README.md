# GitHub Actions Workflows

## Trading Bot Cron Job

The `trading-bot-cron.yml` workflow automatically updates the ETH trading bot every 5 minutes.

### Setup Instructions

1. **Add GitHub Secrets** (Settings → Secrets and variables → Actions):
   - `CRON_SECRET`: Your Vercel `CRON_SECRET` environment variable value
   - `VERCEL_URL`: Your Vercel deployment URL (e.g., `https://iamrossi.com` or `https://your-app.vercel.app`)

2. **Verify the workflow**:
   - Go to Actions tab in GitHub
   - You can manually trigger it using "Run workflow" button
   - Check the logs to ensure it's working correctly

### How It Works

- Runs every 5 minutes via GitHub Actions scheduled workflow
- Calls `/api/trading/paper/cron-update` endpoint
- Sends `Authorization: Bearer {CRON_SECRET}` header for authentication
- Logs response status and body for debugging

### Notes

- The workflow will exit successfully even if there's no active trading session (401 is expected)
- If the endpoint returns an error (500), the workflow will fail and you'll get a notification
- You can manually trigger the workflow anytime using the "Run workflow" button

