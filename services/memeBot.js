
const axios = require("axios");
const cron = require("node-cron");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");

// Configuration for subreddits
const SOURCES = {
    tech: [
        'ProgrammerHumor',
        'techmemes',
        'linuxmemes',
        'codingmemes',
        'developersIndia',
        'IndianDevelopers'
    ],

    dank: [
        'IndianDankMemes',
        'desimemes',
        'IndianMeyMeys',
        'IndianDankTemplates',
        'DesiMemeTemplates',
        'okbhaibudbak'
    ],

    nsfw: [
        'DirtyMemes',
        'nsfwmemes',
        'AdultHumor',
        'sexualmemes',
        'Hornyjail',
        'bdsm',
        'rule34',
        'hentaimemes',
        'ecchi',
        'NSFWFunny'
    ],


    political: [
        'india'
    ],

    instagram: [
        'desimemes',
        'InstaCelebsGossip',
        'terriblefacebookmemes',
        'ComedyCemetery'
    ],

    gaming: [
        'IndianGaming',
        'IndianGamers',
        'BGMI',
        'PUBGMobile'
    ],

    crypto: [
        'CryptoIndia',
        'IndianCrypto',
        'CryptoCurrencyMemes',
        'cryptomemes',
        'wallstreetbets'
    ],
    india: [
        'india'
    ],

    anime: [
        'AnimeIndia',
        'animememes',
        'AnimeFunny',
        'weebmemes'
    ],

    sports: [
        'CricketShitpost',
        'CricketMemes',
        'IndianFootball',
        'SportsMemes',
        'Kabaddi'
    ],

    bollywood: [
        'BollywoodMemes',
        'BollywoodRealism',
        'IndianCinema'
    ],

    general: [
        'desimemes',
        'IndiaSocial'
    ]
};





class MemeBot {
    constructor(io) {
        console.log("🤖 MemeBot Service v2 Started (Debug Mode)");
        this.io = io;
        this.setupCron();
        this.ensureBotUser();
        this.ensureChannels();
    }


    // Create a "system" user for the bot if it doesn't exist
    async ensureBotUser() {
        let bot = await User.findOne({ email: "bot@memeapp.com" });
        if (!bot) {
            bot = await User.create({
                name: "MemeBot 🤖",
                email: "bot@memeapp.com",
                avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=MemeBot"
            });
            console.log("🤖 MemeBot user created");
        }
        this.botId = bot._id;
    }

    // Ensure default channels exist
    async ensureChannels() {
        const defaultChannels = [
            { name: "Tech Memes", category: 'tech', description: "Programming & Tech Humor" },
            { name: "Dank Memes", category: 'dank', description: "The dankest of the dank" },
            { name: "NSFW 18+", category: 'nsfw', description: "Adult humor (18+)", isNSFW: true },
            { name: "Political Memes", category: 'political', description: "Politics & Satire" },
            { name: "Instagram & Normie", category: 'instagram', description: "From the other side of the internet" },
            { name: "Gaming Hub", category: 'gaming', description: "Press F to pay respects" },
            { name: "Crypto & Stonks", category: 'crypto', description: "To the moon! 🚀" },
            { name: "Anime Weebs", category: 'anime', description: "I noticed you notice me senpai" },
            { name: "Sports Central", category: 'sports', description: "Cricket, Football & More" },
            { name: "INDIA", category: 'india', description: "INFORMATION" }

        ];

        for (const ch of defaultChannels) {
            let exists = await Conversation.findOne({ type: 'channel', category: ch.category });
            if (!exists) {
                await Conversation.create({
                    type: 'channel',
                    name: ch.name,
                    category: ch.category,
                    isChannel: true,
                    isNSFW: ch.isNSFW || false,
                    description: ch.description,
                    participants: [] // Users "subscribe" effectively by being here, or we can use separate field
                });
                console.log(`📺 Channel created: ${ch.name}`);
            }
        }
    }

    setupCron() {
        // Run every 5 minutes for fetching
        cron.schedule('*/5 * * * *', () => {
            console.log("🤖 Fetching memes...");
            this.fetchAndPostMemes();
        });

        // Run every 10 minutes to clean up old memes (older than 2 hours)
        cron.schedule('*/10 * * * *', async () => {
            try {
                if (!this.botId) await this.ensureBotUser();

                const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

                // 1. Get all saved message IDs from all users
                const usersWithSaved = await User.find({ savedMessages: { $exists: true, $not: { $size: 0 } } }).select('savedMessages');
                let savedMessageIds = [];
                usersWithSaved.forEach(u => {
                    if (u.savedMessages && u.savedMessages.length > 0) {
                        savedMessageIds = savedMessageIds.concat(u.savedMessages);
                    }
                });

                // Unique IDs
                savedMessageIds = [...new Set(savedMessageIds.map(id => id.toString()))];

                // 2. Delete messages from Bot that are older than 2 hours AND NOT saved
                const result = await Message.deleteMany({
                    userId: this.botId,
                    createdAt: { $lt: twoHoursAgo },
                    _id: { $nin: savedMessageIds }
                });

                if (result.deletedCount > 0) {
                    console.log(`🧹 Cleaned up ${result.deletedCount} old memes (Protected ${savedMessageIds.length} saved memes).`);
                }
            } catch (err) {
                console.error("❌ Error cleaning up old memes:", err.message);
            }
        });
    }

    async fetchAndPostMemes() {
        try {
            if (!this.botId) await this.ensureBotUser();

            const categories = Object.keys(SOURCES);

            for (const cat of categories) {
                // Get channel
                const channel = await Conversation.findOne({ type: 'channel', category: cat });
                if (!channel) continue;

                const subreddits = [...SOURCES[cat]]; // Copy array to modify/shuffle if needed
                let success = false;
                let attempts = 0;
                const maxAttempts = 5; // Try up to 5 sources per category

                while (!success && attempts < maxAttempts && subreddits.length > 0) {
                    attempts++;
                    // Pick random subreddit
                    const randomIndex = Math.floor(Math.random() * subreddits.length);
                    const sub = subreddits[randomIndex];

                    // Remove tried subreddit so we don't pick it again this cycle
                    subreddits.splice(randomIndex, 1);

                    try {
                        // Fetch from Reddit API (public)
                        // Using meme-api.com as a proxy wrapper for Reddit
                        // Added User-Agent to avoid 403s on some endpoints
                        const response = await axios.get(`https://meme-api.com/gimme/${sub}`, {
                            headers: {
                                'User-Agent': 'MemeBot/1.0 (Educational Project; +http://localhost:3000)'
                            }
                        });
                        const { url, title } = response.data;

                        // Validation: Ensure valid image URL
                        if (!url || !url.match(/\.(jpg|jpeg|png|gif)$/i)) {
                            console.warn(`⚠️ Skipped non-image content from ${sub}: ${url}`);
                            continue; // Try next source
                        }

                        // Create Message
                        const msg = await Message.create({
                            conversationId: channel._id,
                            userId: this.botId,
                            username: "MemeBot 🤖",
                            text: title,
                            type: 'image',
                            file: {
                                url: url,
                                name: 'meme.jpg' // Placeholder
                            },
                            metadata: {
                                source: `r/${sub}`
                            }
                        });

                        // Broadcast
                        this.io.emit("message", msg);
                        console.log(`✅ Posted meme to ${channel.name} (from r/${sub}): ${title}`);
                        success = true; // Break while loop

                    } catch (innerErr) {
                        // Log 403/404s but continue to next source
                        if (innerErr.response && (innerErr.response.status === 404 || innerErr.response.status === 403)) {
                            console.warn(`🔸 r/${sub} failed (${innerErr.response.status}). Retrying with another source...`);
                        } else {
                            console.error(`❌ Error fetching from r/${sub}:`, innerErr.message);
                        }
                    }
                }

                if (!success) {
                    console.error(`❌ Failed to find a valid meme for category ${cat} after ${attempts} attempts.`);
                }
            }

        } catch (error) {
            console.error("❌ MemeBot Main Error:", error.message);
        }
    }
}


module.exports = MemeBot;
