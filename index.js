const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder, Options } = require("discord.js");
const mongoose = require('mongoose');
const http = require('http');

// 1. سيرفر الويب (أهم حاجة)
http.createServer((req, res) => {
  res.write("Stability Mode Active");
  res.end();
}).listen(7860);

const config = require("./config.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  // زيادة وقت الصبر تاع البوت لـ 60 ثانية قبل ما يقطع
  rest: { timeout: 60000, retries: 5 },
  makeCache: Options.cacheWithLimits({ MessageManager: 50 })
});

// 2. المونغو
mongoose.connect(process.env.MONGO_URI).catch(e => console.log("Mongo Waiting..."));

const User = mongoose.model('User', new mongoose.Schema({
  guildId: String, userId: String, xp: { type: Number, default: 0 }, level: { type: Number, default: 0 }
}));

// 3. نظام XP بسيط (Prefix !)
client.on(Events.MessageCreate, async m => {
  if (m.author.bot || !m.guild) return;

  // زيادة الـ XP
  try {
    let u = await User.findOne({ guildId: m.guild.id, userId: m.author.id }) || new User({ guildId: m.guild.id, userId: m.author.id });
    u.xp += 20;
    if (u.xp >= 150) { u.xp = 0; u.level++; m.channel.send(`🆙 <@${m.author.id}> Level **${u.level}**!`); }
    await u.save();
  } catch (e) {}

  // أوامر !
  if (m.content === "!ping") return m.reply("Pong! 🏓");
  if (m.content === "!top") {
    const top = await User.find({ guildId: m.guild.id }).sort({ level: -1 }).limit(5);
    let txt = top.map((u, i) => `${i+1}. <@${u.userId}> - Lvl ${u.level}`).join("\n");
    m.channel.send({ embeds: [new EmbedBuilder().setTitle("Leaderboard").setDescription(txt || "Empty").setColor("Blue")] });
  }
});

// 4. الـ Login الانتحاري (يبقى يحاول للأبد)
async function connect() {
  try {
    console.log("📡 Attempting Discord Login...");
    await client.login(process.env.Bot_Token || config.token);
    console.log("✅ Connected!");
  } catch (e) {
    console.log("❌ Connection Failed. Retrying in 5s...");
    setTimeout(connect, 5000);
  }
}

connect();
