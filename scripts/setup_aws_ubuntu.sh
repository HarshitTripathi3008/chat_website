#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting Server Setup for Chat App..."

# 1. Update and Upgrade
echo "📦 Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Node.js 20 (LTS)
echo "🟢 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v

# 3. Install Nginx and Git
echo "🌐 Installing Nginx and Git..."
sudo apt-get install -y nginx git

# 4. Install PM2 (Process Manager)
echo "⚙️ Installing PM2..."
sudo npm install -g pm2

# 5. Configure Firewall (UFW)
echo "🛡️ Configuring Firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
# Enable UFW if not already enabled (be careful not to lock yourself out, SSH is allowed above)
echo "y" | sudo ufw enable

# 6. Setup Directory Structure (if running standalone, but we assume we are inside the repo)
# If this script is run from inside the cloned repo, we are good.

echo "✅ Setup Complete! dependencies installed."
echo "➡️  Next Steps:"
echo "   1. Create .env file with production secrets."
echo "   2. Configure Nginx (cp scripts/nginx.conf /etc/nginx/sites-available/default)."
echo "   3. Start app with: pm2 start server.js --name chat-app"
