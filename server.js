
require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const session = require("express-session");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const sharedSession = require("express-socket.io-session");
const MongoStore = require("connect-mongo").default;
const passport = require("./config/passport");
const MemeBot = require("./services/memeBot");



// Import Routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const chatRoutes = require("./routes/chatRoutes");
const uploadRoutes = require("./routes/uploadRoutes");

const channelRoutes = require("./routes/channelRoutes");
const adminRoutes = require("./routes/adminRoutes");
const socketHandler = require("./socket/socketHandler");


const app = express();
app.set('trust proxy', 1); // Fix for Render/Heroku proxy rate limiting

const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

/* ================= MIDDLEWARE ================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

/* ================= DB ================= */
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

/* ================= SESSION (4 HOURS) ================= */
const sessionMiddleware = session({
  name: "chat-session",
  secret: process.env.SESSION_SECRET,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URL }),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 365 * 10 } // 10 years
});

app.use(sessionMiddleware);
app.use(passport.initialize());
io.use(sharedSession(sessionMiddleware, { autoSave: true }));


/* ================= REDIS (OPTIONAL) ================= */
let useRedis = false;
let pub, sub;

(async () => {
  try {
    if (process.env.REDIS_URL) {
      const redisClient = createClient({ url: process.env.REDIS_URL });
      redisClient.on('error', (err) => {
        console.log('Redis Client Error', err);
        useRedis = false;
      });

      await redisClient.connect();

      // Create pub/sub clients
      pub = redisClient.duplicate();
      sub = redisClient.duplicate();
      await pub.connect();
      await sub.connect();

      console.log("✅ Redis connected");
      useRedis = true;

      // Make pub/redis available to routes
      app.set("pub", pub);

      // Initialize Socket Logic with Redis
      socketHandler(io, useRedis, pub, sub);
    } else {
      throw new Error("Redis URL not provided");
    }

  } catch (err) {
    if (process.env.REDIS_URL) {
      console.log("⚠️  Redis not available - running in single-server mode");
    } else {
      console.log("ℹ️  Running in single-server mode (Redis not configured)");
    }
    // Initialize Socket Logic without Redis
    socketHandler(io, false, null, null);
  }

  app.set("useRedis", useRedis);
  app.set("io", io);

  // Mount Routes (after setting app vars)
  app.use("/", authRoutes);
  app.use("/", userRoutes);
  app.use("/", chatRoutes);
  app.use("/", channelRoutes);
  app.use("/api/admin", adminRoutes); // Correctly mounted

  app.use("/", uploadRoutes); // Mounts to root but routes start with /upload


  // Base Route
  app.get("/", (_, res) => res.sendFile(path.join(__dirname, "index.html")));

  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    // Start Bot
    new MemeBot(io);
  });
})();


