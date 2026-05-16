#!/bin/bash

# Navigate to the directory where this script is located
cd "$(dirname "$0")"

echo "------------------------------------------------"
echo "  🚀 Starting Collection Risk Analysis..."
echo "------------------------------------------------"

# Run servers
(cd backend && npm start) &
npm run dev
