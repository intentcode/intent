#!/bin/bash

# Script to prepare environment variables for Vercel deployment
# Run from the project root: ./scripts/prepare-vercel-env.sh

OUTPUT_FILE="secrets/vercel-env.txt"
PEM_FILE="secrets/intent-app.2026-01-18.private-key.pem"

echo "Preparing Vercel environment variables..."
echo ""

# Check if PEM file exists
if [ ! -f "$PEM_FILE" ]; then
    echo "Error: PEM file not found at $PEM_FILE"
    exit 1
fi

# Convert PEM to single line
PEM_CONVERTED=$(cat "$PEM_FILE" | awk '{printf "%s\\n", $0}')

# Create output file
cat > "$OUTPUT_FILE" << EOF
# Vercel Environment Variables for Intent Code
# Copy these to: https://vercel.com/[project]/settings/environment-variables
# Generated on: $(date)

# GitHub App Configuration
GITHUB_APP_ID=<paste your App ID here>
GITHUB_APP_CLIENT_ID=<paste your Client ID here>
GITHUB_APP_CLIENT_SECRET=<paste your Client Secret here>

# Private Key (already converted for Vercel)
GITHUB_APP_PRIVATE_KEY=$PEM_CONVERTED

# JWT Secret for session tokens
JWT_SECRET=e43df6fa67950d7b0a06452b8d5e1ec295b53d7ece920ae36aa35443db85b535
EOF

echo "✅ Created $OUTPUT_FILE"
echo ""
echo "Next steps:"
echo "1. Open $OUTPUT_FILE"
echo "2. Fill in GITHUB_APP_ID, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET"
echo "3. Copy each variable to Vercel"
echo ""
echo "⚠️  Don't commit this file! It contains secrets."
