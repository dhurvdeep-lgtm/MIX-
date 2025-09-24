const fs = require("fs");
const login = require("ws3-fca");
const express = require("express");

const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const ADMIN_PASSWORD = config.ADMIN_PASSWORD;
const ADMIN_UIDS = config.ADMIN_UIDS || [];
const FBSTATE_FILE = config.FBSTATE_FILE;

let muteList = [];
let lockList = [];

// Helper: parse duration like 10s, 5m, 2h
function parseDuration(str) {
    const match = str.match(/^(\d+)([smh])$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    if (match[2] === "s") return value * 1000;
    if (match[2] === "m") return value * 60 * 1000;
    if (match[2] === "h") return value * 60 * 60 * 1000;
    return null;
}

// Start bot
login({ appState: JSON.parse(fs.readFileSync(FBSTATE_FILE, "utf8")) }, (err, api) => {
    if (err) return console.error("❌ Login Failed:", err);

    api.setOptions({ listenEvents: true });
    console.log("✅ Pro 5 Messenger Bot Started!");

    api.listenMqtt((err, event) => {
        if (err) return console.error(err);

        // Delete messages if group is locked
        if (event.type === "message" && lockList.includes(event.threadID)) {
            api.deleteMessage(event.messageID, (e) => {
                if (e) console.error("⚠️ Delete failed", e);
            });
        }

        if (event.type === "message" && event.body) {
            const parts = event.body.trim().split(" ");
            const command = parts[0].toLowerCase();
            const password = parts[1];

            // Admin check
            if (
                ["/mute", "/unmute", "/lock", "/unlock"].includes(command) &&
                (!ADMIN_UIDS.includes(event.senderID) || password !== ADMIN_PASSWORD)
            ) {
                api.sendMessage("❌ Unauthorized! You are not admin.", event.threadID);
                return;
            }

            // /mute
            if (command === "/mute") {
                if (!muteList.includes(event.threadID)) muteList.push(event.threadID);
                api.sendMessage("🔇 Group muted!", event.threadID);

                if (parts[2]) {
                    const duration = parseDuration(parts[2]);
                    if (duration) {
                        setTimeout(() => {
                            muteList = muteList.filter(id => id !== event.threadID);
                            api.sendMessage("🔊 Auto Unmuted after " + parts[2], event.threadID);
                        }, duration);
                    }
                }
            }

            // /unmute
            if (command === "/unmute") {
                muteList = muteList.filter(id => id !== event.threadID);
                api.sendMessage("🔊 Group unmuted!", event.threadID);
            }

            // /lock
            if (command === "/lock") {
                if (!lockList.includes(event.threadID)) lockList.push(event.threadID);
                api.sendMessage("🔒 Group locked!", event.threadID);

                if (parts[2]) {
                    const duration = parseDuration(parts[2]);
                    if (duration) {
                        setTimeout(() => {
                            lockList = lockList.filter(id => id !== event.threadID);
                            api.sendMessage("🔓 Auto Unlocked after " + parts[2], event.threadID);
                        }, duration);
                    }
                }
            }

            // /unlock
            if (command === "/unlock") {
                lockList = lockList.filter(id => id !== event.threadID);
                api.sendMessage("🔓 Group unlocked!", event.threadID);
            }
        }
    });
});

// Express API for status
const app = express();
app.get("/status", (req, res) => {
    res.json({
        mutedGroups: muteList,
        lockedGroups: lockList
    });
});
app.listen(5000, () => console.log("🌐 API running on port 5000"));
