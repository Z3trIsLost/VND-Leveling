const { Client, GatewayIntentBits, Partials, Events, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const mongoose = require('mongoose');
const http = require('http');

// 1. فتح السيرفر فوراً باش Hugging Face يعطيك Running
http.createServer((req, res) => {
  res.write("Bot is Running!");
  res.end();
}).listen(7860, () => console.log("🌐 Web Server Ready on 7860"));

const config = require("./config.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// 2. الربط مع المونغو (بدون تعطيل البوت)
const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
  mongoose.connect(mongoURI)
    .then(() => console.log('✅ تربطنا مع المونڨو يا خو!'))
    .catch(err => console.error('❌ غلطة مونغو:', err));
}

const User = mongoose.model('User', new mongoose.Schema({
  guildId: String, userId: String, xp: { type: Number, default: 0 }, level: { type: Number, default: 0 }
}));

// 3. تسجيل الأوامر (في الخلفية باش ما يحبسش الـ Startup)
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot response time"),
  new SlashCommandBuilder().setName("xp_leaderboard").setDescription("Show the XP leaderboard")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.Bot_Token || config.token);

async function safeRegister() {
  try {
    console.log("⏳ جاري محاولة تسجيل الأوامر...");
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log("✅ تم تسجيل الأوامر!");
  } catch (e) {
    console.log("⚠️ فشل تسجيل الأوامر (Timeout)، البوت سيعمل بدونها مؤقتاً.");
  }
}

client.once(Events.ClientReady, () => {
  console.log(`✅ ${client.user.tag} واجد يا خو!`);
  safeRegister();
});

// 4. معالجة الأوامر والـ XP
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "xp_leaderboard") {
    await interaction.deferReply();
    const top = await User.find({ guildId: interaction.guildId }).sort({ level: -1, xp: -1 }).limit(10);
    let desc = "";
    for (let i = 0; i < top.length; i++) {
      try { await interaction.guild.members.fetch(top[i].userId); } catch (e) {}
      desc += `**${i + 1}.** <@${top[i].userId}> — مستوى **${top[i].level}**\n`;
    }
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🏆 المتصدرين").setDescription(desc || "لا يوجد بيانات").setColor("#FFD700")] });
  }
});

client.on(Events.MessageCreate, async m => {
  if (m.author.bot || !m.guild) return;
  try {
    let u = await User.findOne({ guildId: m.guild.id, userId: m.author.id }) || new User({ guildId: m.guild.id, userId: m.author.id });
    u.xp += Math.floor(Math.random() * 15) + 15;
    if (u.xp >= (120 * (u.level + 1))) { u.xp = 0; u.level++; m.channel.send(`مبروك <@${m.author.id}> طلعت للمستوى **${u.level}**`); }
    await u.save();
  } catch (e) {}
});

// تشغيل البوت
client.login(process.env.Bot_Token || config.token).catch(e => console.error("❌ Login Error:", e));
