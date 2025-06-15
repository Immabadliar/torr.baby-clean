
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const session = require("express-session");
const path = require("path");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;

app.use(
  session({
    secret: "super_secret_key",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../html")));

const userStatuses = {};

// --- OAuth2 Login Routes ---

app.get("/login", (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=identify`;
  res.redirect(url);
});

app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided.");

  try {
    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        scope: "identify",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const access_token = tokenResponse.data.access_token;

    const userResponse = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    req.session.user = userResponse.data;
    res.redirect("/dashboard.html");
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.send("Error logging in with Discord.");
  }
});

// --- API Routes ---

app.get("/api/user", (req, res) => {
  if (req.session.user) res.json(req.session.user);
  else res.status(401).json({ error: "Not logged in" });
});

app.get("/api/status/:userId", (req, res) => {
  const status = userStatuses[req.params.userId] || "offline";
  res.json({ userId: req.params.userId, status });
});

app.post("/api/status", (req, res) => {
  const { userId, status } = req.body;
  if (!userId || !status) return res.status(400).json({ error: "Missing userId or status" });
  userStatuses[userId] = status;
  res.json({ message: `Status for user ${userId} saved as ${status}` });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/", (req, res) => {
  if (req.session.user) res.redirect("/dashboard.html");
  else res.redirect("/login");
});

// --- Discord Bot Setup ---

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
});

client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Cache all members' presence status on startup
  client.guilds.cache.forEach((guild) => {
    guild.members.cache.forEach((member) => {
      if (member.presence) {
        userStatuses[member.id] = member.presence.status;
      } else {
        userStatuses[member.id] = "offline";
      }
    });
  });
});

client.on("presenceUpdate", (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.user) return;
  const status = newPresence.status; // online, idle, dnd, offline
  userStatuses[newPresence.user.id] = status;
  // Removed status update console log per your request
});

client.on("guildMemberAdd", (member) => {
  console.log(`${member.user.tag} joined guild ${member.guild.name}`);
});

client.on("guildMemberRemove", (member) => {
  console.log(`${member.user.tag} left guild ${member.guild.name}`);
});

client.login(BOT_TOKEN);

app.listen(PORT, () => {
  console.log(`App listening on http://localhost:${PORT}`);
});
