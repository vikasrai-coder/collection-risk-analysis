#!/bin/bash
# Collection Risk Platform Deployment Orchestrator
# Automates staging, committing, pushing to GitHub, and deploying to Vercel

set -e # Exit immediately on error

echo "=========================================================="
echo "🚀 Starting Collection Risk Platform Deploy Workflow..."
echo "=========================================================="

# 1. Staging and committing changes
echo "📦 Staging current working tree modifications..."
git add .

# Prompt or use a default message
COMMIT_MSG="fix: handle automatic session eviction on authentication failures to resolve presence sync"
echo "💾 Committing changes with message: '$COMMIT_MSG'..."
git commit -m "$COMMIT_MSG" || echo "⚠️ No modifications to commit"

# 2. Pushing to GitHub
echo "📤 Pushing code updates to GitHub 'main' branch..."
git push origin main

# 3. Triggering Vercel deployment
echo "⚡ Triggering production redeployment on Vercel..."
if command -v vercel &> /dev/null; then
  vercel --prod --yes
else
  npx vercel --prod --yes
fi

echo "=========================================================="
echo "🎉 Deployment Orchestration Completed Successfully!"
echo "=========================================================="
