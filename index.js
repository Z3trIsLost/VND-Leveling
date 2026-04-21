const { Client, GatewayIntentBits, Partials, Events, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const mongoose = require('mongoose');
const http = require('http');

// 1. فتح السيرفر فوراً باش الـ Space تبقى Running
http.createServer((req, res) => {
  res.write("Bot is Alive and Retrying...");
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

// 2. الربط مع المونغو
const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
  mongoose.connect(mongoURI)
    .then(() => console.log('✅ تربطنا مع المونڨو يا خو!'))
    .catch(err => console.error('❌ غلطة مونغو:', err));
}

const User = mongoose.model('User', new mongoose.Schema({
  guildId: String, userId: String, xp: { type: Number, default: 0 }, level: { type: Number, default: 0 }
}));

// 3. تسجيل الأوامر
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot response time"),
  new SlashCommandBuilder().setName("xp_leaderboard").setDescription("Show the XP leaderboard")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.Bot_Token || config.token);

client.once(Events.ClientReady, async () => {
  console.log(`✅ ${client.user.tag} واجد يا خو!`);
  try {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
    console.log("✅ تم تسجيل الأوامر!");
  } catch (e) { console.log("⚠️ فشل تسجيل الأوامر، راح يخدم بالأوامر القديمة."); }
});

// 4. معالجة الأوامر والـ XP
client.on(Events.InteractionCreate, async i => {
  if (!i.isChatInputCommand()) return;
  if (i.commandName === "xp_leaderboard") {
    await i.deferReply();
    const top = await User.find({ guildId: i.guildId }).sort({ level: -1, xp: -1 }).limit(10);
    let desc = "";
    for (let j = 0; j < top.length; j++) {
      try { await i.guild.members.fetch(top[j].userId); } catch (e) {}
      desc += `**${j + 1}.** <@${top[j].userId}> — مستوى **${top[j].level}**\n`;
    }
    await i.editReply({ embeds: [new EmbedBuilder().setTitle("🏆 المتصدرين").setDescription(desc || "لا يوجد بيانات").setColor("#FFD700")] });
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

// 5. وظيفة الـ Login الذكية (إعادة المحاولة في حال الـ Timeout)
function startBot() {
  console.log("⏳ محاولة الاتصال بديسكورد...");
  client.login(process.env.Bot_Token || config.token).catch(err => {
    console.error("❌ فشل الـ Login (Timeout غالباً). سأعيد المحاولة بعد 10 ثواني...");
    setTimeout(startBot, 10000); // يعاود المحاولة كل 10 ثواني
  });
}

startBot();
