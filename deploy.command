#!/bin/bash

# Navigate to the directory where this script is located
cd "$(dirname "$0")"

# Colors for premium look
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}  🚀  COLLECTION RISK ANALYSIS - AUTOMATED DEPLOYER   ${NC}"
echo -e "${CYAN}======================================================${NC}"

# Check for Git changes
CHANGES=$(git status --porcelain)
if [ -z "$CHANGES" ]; then
    echo -e "${YELLOW}ℹ️ No changes detected in Git repository.${NC}"
else
    echo -e "${YELLOW}📦 Found modified/untracked files:${NC}"
    git status -s
    echo ""
    
    # Prompt user for commit message
    echo -e -n "📝 Enter commit message [Press Enter for 'update: dashboard & server optimization']: "
    read -r COMMIT_MSG
    
    if [ -z "$COMMIT_MSG" ]; then
        COMMIT_MSG="update: dashboard & server optimization"
    fi
    
    echo -e "\n${CYAN}📤 Staging and committing changes...${NC}"
    git add .
    git commit -m "$COMMIT_MSG"
    
    echo -e "${CYAN}🚀 Pushing to GitHub...${NC}"
    git push
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Successfully pushed to GitHub!${NC}"
    else
        echo -e "${RED}✗ Failed to push to GitHub. Aborting Vercel deploy.${NC}"
        exit 1
    fi
fi

echo -e "\n${CYAN}⚡ Initializing Vercel Production Deployment...${NC}"
npx vercel --prod --yes

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}======================================================${NC}"
    echo -e "${GREEN}  🎉 DEPLOYMENT COMPLETE & LIVE ON PRODUCTION!         ${NC}"
    echo -e "${GREEN}  🔗 URL: https://collection-risk-analysis.vercel.app  ${NC}"
    echo -e "${GREEN}======================================================${NC}"
else
    echo -e "${RED}✗ Vercel deployment failed. Please check log messages above.${NC}"
fi

# Pause terminal to view results
echo -e "\n${YELLOW}Press any key to close this terminal window...${NC}"
read -n 1 -s
