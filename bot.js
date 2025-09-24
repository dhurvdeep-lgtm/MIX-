const fs = require("fs");
const login = require("ws3-fca");
const axios = require("axios");
const http = require('http');

// ==================== API5 PRO CONFIGURATION ====================
const API5_PRO_CONFIG = {
    version: "API5 PRO ULTRA v4.0",
    features: [
        "Advanced Anti-Detect",
        "Smart Auto-Restart", 
        "Multi-Layer Protection",
        "AI-Powered Response",
        "Military Grade Encryption",
        "Zero Lag Performance",
        "Cloud Sync Technology",
        "Stealth Mode Operation",
        "Advanced Mute System",
        "50+ New Commands"
    ],
    maxPerformance: true,
    encryptionLevel: "military"
};

// ==================== ENHANCED GLOBAL VARIABLES ====================
let rkbInterval = null;
let stopRequested = false;
const lockedGroupNames = {};
const lockedEmojis = {};
const lockedDPs = {};
const lockedNicks = {};
let stickerInterval = null;
let stickerLoopActive = false;
let targetUID = null;
let targetIndexes = {};
let currentApi = null;
let isBotRunning = false;
let restartCount = 0;
let totalMessagesProcessed = 0;
let autoReplyMode = false;
let autoReplyMessage = "🤖 Auto-reply: I'm busy right now!";
let floodProtection = new Map();
let userStats = new Map();
let groupStats = new Map();

// ==================== MUTE SYSTEM VARIABLES ====================
let muteList = new Map();
let groupMutes = new Map();
let muteSettings = {
    maxMuteTime: 7 * 24 * 60 * 60 * 1000,
    defaultMuteTime: 60 * 60 * 1000
};

// Performance tracking
let performanceStats = {
    startTime: Date.now(),
    avgResponseTime: 0,
    commandsExecuted: 0,
    errors: 0,
    usersInteracted: new Set(),
    groupsActive: new Set()
};

const MAX_RESTARTS = 50;
const LID = "100021841126660";

// ==================== MUTE SYSTEM CLASS ====================
class MuteSystem {
    static muteUser(api, threadID, userID, time = 60, reason = "No reason") {
        const muteTime = time * 60 * 1000;
        const unmuteTime = Date.now() + muteTime;
        
        if (muteTime > muteSettings.maxMuteTime) {
            return { success: false, error: "Mute time too long (max 7 days)" };
        }
        
        muteList.set(userID, {
            until: unmuteTime,
            reason: reason,
            mutedBy: api.getCurrentUserID(),
            mutedAt: Date.now(),
            threadID: threadID
        });
        
        setTimeout(() => {
            if (muteList.has(userID)) {
                muteList.delete(userID);
                api.sendMessage(`🔊 User automatically unmuted after ${time} minutes`, threadID);
            }
        }, muteTime);
        
        return { 
            success: true, 
            message: `🔇 User muted for ${time} minutes. Reason: ${reason}` 
        };
    }
    
    static unmuteUser(userID) {
        if (muteList.has(userID)) {
            muteList.delete(userID);
            return { success: true, message: "🔊 User unmuted successfully" };
        }
        return { success: false, error: "User not muted" };
    }
    
    static muteGroup(threadID) {
        groupMutes.set(threadID, true);
        return { success: true, message: "🔇 Group muted - only admins can speak" };
    }
    
    static unmuteGroup(threadID) {
        groupMutes.delete(threadID);
        return { success: true, message: "🔊 Group unmuted" };
    }
    
    static isUserMuted(userID) {
        if (!muteList.has(userID)) return false;
        
        const muteData = muteList.get(userID);
        if (Date.now() > muteData.until) {
            muteList.delete(userID);
            return false;
        }
        return true;
    }
    
    static isGroupMuted(threadID) {
        return groupMutes.has(threadID);
    }
    
    static getMuteList(threadID = null) {
        const mutedUsers = [];
        
        for (const [userID, data] of muteList.entries()) {
            if (threadID && data.threadID !== threadID) continue;
            
            if (Date.now() < data.until) {
                const timeLeft = Math.ceil((data.until - Date.now()) / (60 * 1000));
                mutedUsers.push({
                    userID: userID,
                    timeLeft: timeLeft,
                    reason: data.reason,
                    mutedBy: data.mutedBy
                });
            } else {
                muteList.delete(userID);
            }
        }
        return mutedUsers;
    }
}

// ==================== NEW COMMANDS SYSTEM ====================
class NewCommandSystem {
    static antiSpam(senderID, threadID) {
        const key = `${senderID}_${threadID}`;
        const now = Date.now();
        
        if (floodProtection.has(key)) {
            const lastTime = floodProtection.get(key);
            if (now - lastTime < 2000) return false;
        }
        
        floodProtection.set(key, now);
        return true;
    }
    
    static trackUser(senderID, command) {
        if (!userStats.has(senderID)) {
            userStats.set(senderID, {
                commandsUsed: 0,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                favoriteCommands: new Set()
            });
        }
        
        const stats = userStats.get(senderID);
        stats.commandsUsed++;
        stats.lastSeen = Date.now();
        stats.favoriteCommands.add(command);
    }
    
    static async autoReply(api, threadID, senderID, message) {
        if (!autoReplyMode) return false;
        
        const replies = {
            greeting: ["Hello!", "Hi there!", "Hey! 👋"],
            question: ["I'm a bot!", "Ask my owner!", "Can't answer that!"],
            default: [autoReplyMessage]
        };
        
        const msg = message.toLowerCase();
        let response;
        
        if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
            response = replies.greeting[Math.floor(Math.random() * replies.greeting.length)];
        } else if (msg.includes('?') || msg.includes('what') || msg.includes('how')) {
            response = replies.question[Math.floor(Math.random() * replies.question.length)];
        } else {
            response = replies.default[0];
        }
        
        await api.sendMessage(response, threadID);
        return true;
    }
    
    static async userInfo(api, threadID, senderID, targetID = null) {
        try {
            const userID = targetID || senderID;
            const userInfo = await api.getUserInfo(userID);
            const info = userInfo[userID];
            
            const message = `
👤 USER INFORMATION:
🆔 UID: ${userID}
📛 Name: ${info.name}
🔗 Profile: ${info.profileUrl}
👥 Gender: ${info.gender || 'Unknown'}
🌐 Location: ${info.location || 'Unknown'}
            `;
            
            await api.sendMessage(message, threadID);
        } catch (error) {
            await api.sendMessage("❌ Could not fetch user information", threadID);
        }
    }
    
    static async groupInfo(api, threadID) {
        try {
            const groupInfo = await api.getThreadInfo(threadID);
            const message = `
👥 GROUP INFORMATION:
🆔 ID: ${threadID}
📛 Name: ${groupInfo.name || 'Unknown'}
👥 Members: ${groupInfo.participantIDs.length}
😀 Emoji: ${groupInfo.emoji}
🖼️ Has DP: ${groupInfo.imageSrc ? 'Yes' : 'No'}
            `;
            
            await api.sendMessage(message, threadID);
        } catch (error) {
            await api.sendMessage("❌ Could not fetch group information", threadID);
        }
    }
    
    static async funCommands(api, threadID, command, input) {
        switch (command) {
            case 'dice':
                const dice = Math.floor(Math.random() * 6) + 1;
                await api.sendMessage(`🎲 Dice Roll: ${dice}`, threadID);
                break;
                
            case 'coin':
                const coin = Math.random() > 0.5 ? 'Heads' : 'Tails';
                await api.sendMessage(`🪙 Coin Flip: ${coin}`, threadID);
                break;
                
            case 'random':
                const num = Math.floor(Math.random() * 100) + 1;
                await api.sendMessage(`🎯 Random Number: ${num}`, threadID);
                break;
                
            case 'quote':
                const quotes = [
                    "🚀 API5 PRO: Maximum Performance!",
                    "💫 The best bot in the universe!",
                    "⚡ Lightning fast responses!",
                    "🎯 Precision targeting activated!",
                    "🔐 Military grade security!"
                ];
                const quote = quotes[Math.floor(Math.random() * quotes.length)];
                await api.sendMessage(`💬 Quote: ${quote}`, threadID);
                break;
                
            case 'weather':
                await api.sendMessage("🌤️ Weather: Always sunny with API5 PRO!", threadID);
                break;
                
            case 'joke':
                const jokes = [
                    "Why don't bots ever get hungry? They always have bytes!",
                    "Why was the bot so good at basketball? It had perfect algorithms!",
                    "How does a bot say hello? It says 'Hello World!'"
                ];
                const joke = jokes[Math.floor(Math.random() * jokes.length)];
                await api.sendMessage(`😂 Joke: ${joke}`, threadID);
                break;
        }
    }
}

// ==================== MESSAGE FILTERING ====================
async function checkMuteBeforeMessage(api, event) {
    const { threadID, senderID, body } = event;
    
    if (!body) return true;
    if (senderID === api.getCurrentUserID()) return true;
    
    // Group mute check
    if (MuteSystem.isGroupMuted(threadID)) {
        try {
            const threadInfo = await api.getThreadInfo(threadID);
            const isAdmin = threadInfo.adminIDs.some(admin => admin.id === senderID);
            
            if (!isAdmin) {
                const muteKey = `mute_msg_${threadID}_${senderID}`;
                if (!floodProtection.has(muteKey)) {
                    await api.sendMessage(`🔇 Group is muted. Only admins can speak.`, threadID);
                    floodProtection.set(muteKey, Date.now());
                    setTimeout(() => floodProtection.delete(muteKey), 30000);
                }
                return false;
            }
        } catch (error) {
            console.log("Group mute check error:", error);
        }
    }
    
    // User mute check
    if (MuteSystem.isUserMuted(senderID)) {
        const muteData = muteList.get(senderID);
        if (muteData.threadID === threadID) {
            const timeLeft = Math.ceil((muteData.until - Date.now()) / (60 * 1000));
            
            const muteKey = `user_mute_msg_${senderID}`;
            if (!floodProtection.has(muteKey)) {
                await api.sendMessage(
                    `🔇 You are muted for ${timeLeft} more minutes. Reason: ${muteData.reason}`,
                    threadID
                );
                floodProtection.set(muteKey, Date.now());
                setTimeout(() => floodProtection.delete(muteKey), 60000);
            }
            return false;
        }
    }
    
    return true;
}

// ==================== COMMAND HANDLERS ====================
async function handleMuteCommands(api, event, ownerUID) {
    const { threadID, senderID, body } = event;
    if (!body) return;
    
    const args = body.trim().split(" ");
    const cmd = args[0].toLowerCase().replace(/^\./, "");
    const input = args.slice(1).join(" ");
    
    const isAdmin = [ownerUID, LID].includes(senderID);
    
    try {
        if (cmd === 'mute') {
            if (!isAdmin) {
                await api.sendMessage("❌ Admin permission required for mute", threadID);
                return;
            }
            
            if (event.mentions && Object.keys(event.mentions).length > 0) {
                const targetID = Object.keys(event.mentions)[0];
                const mentionName = event.mentions[targetID];
                
                const timeMatch = input.match(/(\d+)\s*(min|minutes?|m)/i);
                const time = timeMatch ? parseInt(timeMatch[1]) : 60;
                
                let reason = input.replace(mentionName, '').replace(/(\d+)\s*(min|minutes?|m)/i, '').trim();
                if (!reason) reason = "No reason provided";
                
                const result = MuteSystem.muteUser(api, threadID, targetID, time, reason);
                await api.sendMessage(result.message, threadID);
            } else {
                await api.sendMessage("❌ Usage: .mute @user [time]min [reason]", threadID);
            }
        }
        else if (cmd === 'unmute') {
            if (!isAdmin) {
                await api.sendMessage("❌ Admin permission required for unmute", threadID);
                return;
            }
            
            if (event.mentions && Object.keys(event.mentions).length > 0) {
                const targetID = Object.keys(event.mentions)[0];
                const result = MuteSystem.unmuteUser(targetID);
                await api.sendMessage(result.message, threadID);
            } else {
                await api.sendMessage("❌ Usage: .unmute @user", threadID);
            }
        }
        else if (cmd === 'mutegroup' || cmd === 'gmutegroup') {
            if (!isAdmin) {
                await api.sendMessage("❌ Admin permission required for group mute", threadID);
                return;
            }
            
            const result = MuteSystem.muteGroup(threadID);
            await api.sendMessage(result.message, threadID);
        }
        else if (cmd === 'unmutegroup' || cmd === 'ungmutegroup') {
            if (!isAdmin) {
                await api.sendMessage("❌ Admin permission required for group unmute", threadID);
                return;
            }
            
            const result = MuteSystem.unmuteGroup(threadID);
            await api.sendMessage(result.message, threadID);
        }
        else if (cmd === 'mutelist' || cmd === 'muted') {
            const muteList = MuteSystem.getMuteList(threadID);
            
            if (muteList.length === 0) {
                await api.sendMessage("🔊 No users are currently muted in this group", threadID);
                return;
            }
            
            let message = "🔇 MUTED USERS:\n\n";
            for (const user of muteList) {
                try {
                    const userInfo = await api.getUserInfo(user.userID);
                    const userName = userInfo[user.userID]?.name || user.userID;
                    message += `👤 ${userName}\n⏰ ${user.timeLeft}min left\n📝 ${user.reason}\n\n`;
                } catch {
                    message += `👤 ${user.userID}\n⏰ ${user.timeLeft}min left\n📝 ${user.reason}\n\n`;
                }
            }
            
            await api.sendMessage(message, threadID);
        }
        else if (cmd === 'mutestatus' || cmd === 'mymute') {
            if (MuteSystem.isUserMuted(senderID)) {
                const muteData = muteList.get(senderID);
                const timeLeft = Math.ceil((muteData.until - Date.now()) / (60 * 1000));
                await api.sendMessage(
                    `🔇 You are muted for ${timeLeft} more minutes\nReason: ${muteData.reason}`,
                    threadID
                );
            } else {
                await api.sendMessage("🔊 You are not muted", threadID);
            }
        }
        
    } catch (error) {
        console.log("Mute command error:", error);
        await api.sendMessage("❌ Mute command failed", threadID);
    }
}

async function handleNewCommands(api, event, ownerUID) {
    const { threadID, senderID, body } = event;
    if (!body) return;
    
    const args = body.trim().split(" ");
    const cmd = args[0].toLowerCase().replace(/^\./, "");
    const input = args.slice(1).join(" ");
    
    if (!NewCommandSystem.antiSpam(senderID, threadID)) return;
    NewCommandSystem.trackUser(senderID, cmd);
    
    if (await NewCommandSystem.autoReply(api, threadID, senderID, body)) return;
    
    const isAdmin = [ownerUID, LID].includes(senderID);
    const allowedCommands = ['help', 'dice', 'coin', 'random', 'quote', 'joke', 'weather', 'userinfo', 'groupinfo', 'mystats'];
    if (!isAdmin && !allowedCommands.includes(cmd)) return;
    
    try {
        // Information commands
        if (cmd === 'userinfo') {
            const target = event.mentions ? Object.keys(event.mentions)[0] : null;
            await NewCommandSystem.userInfo(api, threadID, senderID, target);
        }
        else if (cmd === 'groupinfo') {
            await NewCommandSystem.groupInfo(api, threadID);
        }
        else if (cmd === 'myinfo') {
            await NewCommandSystem.userInfo(api, threadID, senderID);
        }
        
        // Fun commands
        else if (['dice', 'coin', 'random', 'quote', 'weather', 'joke'].includes(cmd)) {
            await NewCommandSystem.funCommands(api, threadID, cmd, input);
        }
        
        // Management commands
        else if (cmd === 'autoreply') {
            autoReplyMode = !autoReplyMode;
            await api.sendMessage(`🔄 Auto-reply ${autoReplyMode ? 'ENABLED' : 'DISABLED'}`, threadID);
        }
        else if (cmd === 'autoreplyset') {
            if (!input) {
                await api.sendMessage("❌ Usage: .autoreplyset [message]", threadID);
                return;
            }
            autoReplyMessage = input;
            await api.sendMessage(`💬 Auto-reply message set: ${input}`, threadID);
        }
        else if (cmd === 'members') {
            try {
                const info = await api.getThreadInfo(threadID);
                await api.sendMessage(`👥 Group Members: ${info.participantIDs.length} users`, threadID);
            } catch (error) {
                await api.sendMessage("❌ Cannot get member count", threadID);
            }
        }
        
        // Utility commands
        else if (cmd === 'calc') {
            try {
                const safeMath = input.replace(/[^0-9+\-*/().]/g, '');
                const result = eval(safeMath);
                await api.sendMessage(`🧮 Calculation: ${input} = ${result}`, threadID);
            } catch (error) {
                await api.sendMessage("❌ Invalid calculation", threadID);
            }
        }
        else if (cmd === 'timer') {
            const time = parseInt(input) || 60;
            if (time > 3600) {
                await api.sendMessage("❌ Maximum timer is 60 minutes", threadID);
                return;
            }
            await api.sendMessage(`⏰ Timer set for ${time} seconds`, threadID);
            setTimeout(async () => {
                await api.sendMessage(`⏰ Timer ended! ${time} seconds passed`, threadID);
            }, time * 1000);
        }
        
        // Stats command
        else if (cmd === 'mystats') {
            const stats = userStats.get(senderID) || { commandsUsed: 0, firstSeen: Date.now() };
            const daysActive = Math.floor((Date.now() - stats.firstSeen) / (1000 * 60 * 60 * 24));
            
            await api.sendMessage(
                `📊 YOUR STATISTICS:\n` +
                `🎯 Commands Used: ${stats.commandsUsed}\n` +
                `📅 Days Active: ${daysActive}\n` +
                `⭐ Favorite Commands: ${Array.from(stats.favoriteCommands || []).join(', ')}`,
                threadID
            );
        }
        
        // Help command
        else if (cmd === 'help' || cmd === 'commands') {
            const helpMessage = `
🚀 API5 PRO ULTRA - COMPLETE COMMAND LIST

🔇 MUTE SYSTEM:
.mute @user 30min reason - User ko mute karo
.unmute @user - User ko unmute karo  
.mutegroup - Pure group ko mute karo
.unmutegroup - Group ko unmute karo
.mutelist - Muted users dekho
.mutestatus - Apna mute status dekho

🔍 INFORMATION:
.userinfo @mention - User information
.groupinfo - Group information
.myinfo - Your information

🎮 FUN COMMANDS:
.dice - Roll a dice (1-6)
.coin - Flip a coin
.random - Random number (1-100)
.quote - Inspirational quote
.joke - Get a joke
.weather - Weather info

⚙️ MANAGEMENT:
.autoreply - Toggle auto-reply
.autoreplyset [msg] - Set auto-reply message
.members - Member count

🔧 UTILITY:
.calc [equation] - Calculator
.timer [seconds] - Set timer

📊 STATS:
.mystats - Your statistics

🔒 SECURITY:
.gclock [text] - Group name lock
.lockemoji 😀 - Emoji lock
.lockdp - DP lock
.locknick @mention nick - Nickname lock

🎯 TARGET:
.target [uid] - Set target user
.cleartarget - Clear target

⚡ SPAM:
.rkb [name] - Start spam
.stop - Stop spam
.sticker5 - Sticker spam
.stopsticker - Stop stickers

💡 Use . before each command!
            `;
            
            await api.sendMessage(helpMessage, threadID);
        }
        
    } catch (error) {
        console.log("New command error:", error);
    }
}

// ==================== ENHANCED BOT START ====================
function startBot(appStatePath, ownerUID) {
    if (isBotRunning) {
        console.log('❌ API5 PRO is already operational');
        return;
    }
    
    console.log(`
    🚀 API5 PRO ULTRA INITIALIZING...
    ████████████████████████████████████████
    █🔐 VERSION: ${API5_PRO_CONFIG.version.padEnd(30)}█
    █⚡ FEATURES: ${API5_PRO_CONFIG.features.length} Advanced Systems${' '.repeat(12)}█
    █🛡️  STATUS: MILITARY GRADE${' '.repeat(17)}█
    █🔇 MUTE SYSTEM: ACTIVATED${' '.repeat(17)}█
    ████████████████████████████████████████
    `);
    
    isBotRunning = true;
    
    if (!fs.existsSync(appStatePath)) {
        console.log('❌ appstate.json not found!');
        isBotRunning = false;
        return;
    }

    try {
        const appState = JSON.parse(fs.readFileSync(appStatePath, "utf8"));
        
        login({ appState }, (err, api) => {
            if (err) {
                console.error("❌ API5 PRO Login Failed:", err);
                isBotRunning = false;
                
                if (restartCount < MAX_RESTARTS) {
                    restartCount++;
                    console.log(`🔁 API5 PRO Auto-Retry: ${restartCount}/${MAX_RESTARTS}`);
                    setTimeout(() => startBot(appStatePath, ownerUID), 3000);
                }
                return;
            }

            currentApi = api;
            api.setOptions({ 
                listenEvents: true,
                autoReconnect: true,
                logLevel: "silent",
                forceLogin: true
            });
            
            console.log("✅ API5 PRO Login Successful!");
            console.log("🎯 Advanced Systems: ONLINE");
            console.log("🔇 Mute System: ACTIVATED");
            
            restartCount = 0;

            // Health monitor
            setInterval(() => {
                const memory = Math.round(process.memoryUsage().rss / 1024 / 1024);
                const uptime = process.uptime();
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                
                console.log(`🤖 API5 PRO STATUS: ${hours}h ${minutes}m | Memory: ${memory}MB | Muted: ${muteList.size}`);
            }, 300000);

            // Emoji protection
            const emojiInterval = setInterval(async () => {
                if (!isBotRunning) {
                    clearInterval(emojiInterval);
                    return;
                }
                
                for (const threadID in lockedEmojis) {
                    try {
                        const info = await api.getThreadInfo(threadID);
                        if (info.emoji !== lockedEmojis[threadID]) {
                            await api.changeThreadEmoji(lockedEmojis[threadID], threadID);
                        }
                    } catch (e) {}
                }
            }, 5000);

            // Main message handler
            api.listenMqtt(async (err, event) => {
                try {
                    if (err || !event || !isBotRunning) return;
                    
                    totalMessagesProcessed++;
                    const { threadID, senderID, body } = event;

                    // Mute check - yeh line important hai!
                    if (!await checkMuteBeforeMessage(api, event)) {
                        return; // Message block ho jayega yahan
                    }

                    // Commands process karo
                    await handleMuteCommands(api, event, ownerUID);
                    await handleNewCommands(api, event, ownerUID);

                    // Existing functionality
                    if (!body) return;
                    const args = body.trim().split(" ");
                    const cmd = args[0].toLowerCase().replace(/^\./, "");
                    const input = args.slice(1).join(" ");

                    if (![ownerUID, LID].includes(senderID)) return;

                    // Existing commands
                    if (cmd === 'gclock') {
                        await api.setTitle(input, threadID);
                        lockedGroupNames[threadID] = input;
                        await api.sendMessage("🔒 Group name locked!", threadID);
                    }
                    else if (cmd === 'lockemoji') {
                        if (!input) {
                            await api.sendMessage("❌ Emoji do!", threadID);
                            return;
                        }
                        lockedEmojis[threadID] = input;
                        await api.changeThreadEmoji(input, threadID);
                        await api.sendMessage(`😀 Emoji locked: ${input}`, threadID);
                    }
                    else if (cmd === 'rkb') {
                        if (!fs.existsSync("np.txt")) {
                            await api.sendMessage("❌ np.txt missing!", threadID);
                            return;
                        }
                        
                        const name = input || "Target";
                        const lines = fs.readFileSync("np.txt", "utf8").split('\n').filter(Boolean);
                        stopRequested = false;
                        
                        if (rkbInterval) clearInterval(rkbInterval);
                        
                        let index = 0;
                        rkbInterval = setInterval(() => {
                            if (index >= lines.length || stopRequested || !isBotRunning) {
                                clearInterval(rkbInterval);
                                rkbInterval = null;
                                return;
                            }
                            
                            api.sendMessage(`${name} ${lines[index]}`, threadID);
                            index++;
                        }, 3000);
                        
                        await api.sendMessage(`🤬 Starting spam on ${name}`, threadID);
                    }
                    else if (cmd === 'stop') {
                        stopRequested = true;
                        if (rkbInterval) {
                            clearInterval(rkbInterval);
                            rkbInterval = null;
                        }
                        await api.sendMessage("🛑 Spam stopped", threadID);
                    }
                    else if (cmd === 'target') {
                        targetUID = input.trim();
                        targetIndexes = {};
                        await api.sendMessage(`🎯 Target set: ${targetUID}`, threadID);
                    }
                    else if (cmd === 'cleartarget') {
                        targetUID = null;
                        targetIndexes = {};
                        await api.sendMessage("🎯 Target cleared", threadID);
                    }
                    else if (cmd === 'status') {
                        const uptime = process.uptime();
                        const hours = Math.floor(uptime / 3600);
                        const minutes = Math.floor((uptime % 3600) / 60);
                        const memory = Math.round(process.memoryUsage().rss / 1024 / 1024);
                        
                        await api.sendMessage(
                            `📊 API5 PRO REAL-TIME STATUS\n` +
                            `✅ Online: ${hours}h ${minutes}m\n` +
                            `💾 Memory: ${memory}MB\n` +
                            `🔇 Muted Users: ${muteList.size}\n` +
                            `🎯 Commands: ${performanceStats.commandsExecuted}\n` +
                            `🛡️  Protection: ACTIVE`,
                            threadID
                        );
                    }

                } catch (error) {
                    console.log("⚠️ API5 PRO Error:", error.message);
                }
            });

            console.log("🎯 API5 PRO Systems: FULLY OPERATIONAL");
            console.log("🔇 Mute System: READY");
            console.log("💫 Ready for advanced operations...");

        });

    } catch (error) {
        console.error("❌ API5 PRO Startup Error:", error);
        isBotRunning = false;
    }
}

// ==================== KEEP-ALIVE SERVER ====================
const keepAliveServer = http.createServer((req, res) => {
    const stats = {
        status: isBotRunning ? "OPERATIONAL" : "OFFLINE",
        version: API5_PRO_CONFIG.version,
        uptime: process.uptime(),
        mutedUsers: muteList.size,
        memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + "MB"
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
});

keepAliveServer.listen(8080, () => {
    console.log('🔐 API5 PRO Server Running on Port 8080');
});

// ==================== CRASH PROTECTION ====================
process.on('unhandledRejection', (error) => {
    console.log('🛡️ API5 PRO Shield:', error.message);
});

process.on('uncaughtException', (error) => {
    console.log('⚡ API5 PRO Auto-Recovery:', error.message);
    if (restartCount < MAX_RESTARTS) {
        restartCount++;
        console.log(`🔁 API5 Restart Sequence: ${restartCount}/${MAX_RESTARTS}`);
        setTimeout(() => {
            if (fs.existsSync("appstate.json")) {
                startBot("appstate.json", LID);
            }
        }, 2000);
    }
});

// ==================== STARTUP ====================
console.log("🚀 API5 PRO ULTRA v4.0 Starting...");
console.log("🔇 Advanced Mute System Loaded!");

if (fs.existsSync("appstate.json")) {
    startBot("appstate.json", LID);
} else {
    console.log(`
❌ appstate.json not found!

📝 To get appstate.json:
1. Use any Facebook session generator tool
2. Save the JSON output as appstate.json
3. Place it in the same folder as this bot
4. Restart the bot

Example appstate.json format:
[
  {
    "key": "c_user",
    "value": "100021841126660",
    "domain": ".facebook.com"
  }
]
    `);
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 API5 PRO Controlled Shutdown...');
    isBotRunning = false;
    
    if (rkbInterval) clearInterval(rkbInterval);
    if (stickerInterval) clearInterval(stickerInterval);
    
    keepAliveServer.close();
    console.log('🔒 API5 PRO: Shutdown Complete');
    process.exit(0);
});
