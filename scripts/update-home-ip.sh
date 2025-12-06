#!/bin/sh

# Configuration
# Replace with your actual domain if different
API_URL="https://www.iamrossi.com/api/admin/update-ip"
# Ensure this matches the CRON_SECRET in your Vercel environment variables
# You can hardcode it here or pass it as an environment variable in the Task Scheduler
# TOKEN="your-cron-secret-here" 

# Log file path (defaults to update-ip.log in the same directory)
LOG_FILE="${0%/*}/update-ip.log"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

if [ -z "$IAMROSSI_TOKEN" ]; then
  log "Error: IAMROSSI_TOKEN is not set. Please set the IAMROSSI_TOKEN variable."
  exit 1
fi

# Get current public IP
CURRENT_IP=$(curl -s https://api.ipify.org)

if [ -z "$CURRENT_IP" ]; then
  log "Error: Failed to get public IP"
  exit 1
fi

log "Current IP: $CURRENT_IP"

# Update IP via API
RESPONSE=$(curl -L -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IAMROSSI_TOKEN" \
  -d "{\"ip\": \"$CURRENT_IP\"}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS")

if [ "$HTTP_STATUS" -eq 200 ]; then
  log "Success: IP updated. Server response: $BODY"
else
  log "Error: Failed to update IP (Status: $HTTP_STATUS). Response: $BODY"
  exit 1
fi
