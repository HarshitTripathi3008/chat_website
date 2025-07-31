const express = require('express');
const http = require('http');
const path = require('path');
const { createClient } = require('redis');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SERVER_ID = process.env.SERVER_ID || `server-${PORT}`;

// Redis clients
const pub = createClient({ url: REDIS_URL });
const sub = pub.duplicate();

// Local storage (not shared)
const users = new Map();
const messages = [];

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Subscribe to Redis message events
sub.subscribe('chat:message', (msg) => {
  const message = JSON.parse(msg);
  io.emit('message', message); // rebroadcast to local clients
});

sub.subscribe('chat:userJoined', (msg) => {
  const { username, usersCount } = JSON.parse(msg);
  io.emit('userJoined', { username, usersCount });
});

sub.subscribe('chat:userLeft', (msg) => {
  const { username, usersCount } = JSON.parse(msg);
  io.emit('userLeft', { username, usersCount });
});

sub.subscribe('chat:typing', (msg) => {
  const data = JSON.parse(msg);
  io.emit('userTyping', data);
});

sub.subscribe('chat:stopTyping', (msg) => {
  const data = JSON.parse(msg);
  io.emit('userStoppedTyping', data);
});

io.on('connection', (socket) => {
  console.log(`🔌 [${SERVER_ID}] User connected: ${socket.id}`);

  socket.on('join', ({ username }) => {
    users.set(socket.id, { username });
    const usersCount = users.size;

    // Emit to others via Redis
    pub.publish('chat:userJoined', JSON.stringify({ username, usersCount }));
    socket.emit('usersCount', usersCount);

    // Send recent messages
    messages.slice(-10).forEach(msg => socket.emit('message', msg));

    console.log(`✅ [${SERVER_ID}] ${username} joined`);
  });

  socket.on('message', ({ text }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = {
      id: Date.now(),
      username: user.username,
      text,
      timestamp: new Date(),
      server: SERVER_ID
    };

    messages.push(message);
    if (messages.length > 100) messages.shift();

    pub.publish('chat:message', JSON.stringify(message));
    console.log(`💬 [${SERVER_ID}] ${user.username}: ${text}`);
  });

  socket.on('typing', () => {
    const user = users.get(socket.id);
    if (user) {
      pub.publish('chat:typing', JSON.stringify({ username: user.username, socketId: socket.id }));
    }
  });

  socket.on('stopTyping', () => {
    const user = users.get(socket.id);
    if (user) {
      pub.publish('chat:stopTyping', JSON.stringify({ username: user.username, socketId: socket.id }));
    }
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      const usersCount = users.size;
      pub.publish('chat:userLeft', JSON.stringify({ username: user.username, usersCount }));
      console.log(`❌ [${SERVER_ID}] ${user.username} disconnected`);
    }
  });
});

(async () => {
  try {
    await pub.connect();
    await sub.connect();
    console.log(`✅ [${SERVER_ID}] Connected to Redis and listening on port ${PORT}`);
    server.listen(PORT, () => {
      console.log(`🚀 [${SERVER_ID}] Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Redis connection failed:', err);
  }
})();
