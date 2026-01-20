#!/bin/bash

echo "⬇️  Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🔄 Restarting Application..."
pm2 restart chat-app

echo "✅ Deployed successfully!"
