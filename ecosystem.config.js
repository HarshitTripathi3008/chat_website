// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'chat-app-3000',
      script: 'server.js',
      env: {
        PORT: 3000,
        REDIS_URL: 'redis://localhost:6379',
        SERVER_ID: 'server-3000'
      }
    },
    {
      name: 'chat-app-3001',
      script: 'server.js',
      env: {
        PORT: 3001,
        REDIS_URL: 'redis://localhost:6379',
        SERVER_ID: 'server-3001'
      }
    }
  ]
};

