const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } = require("discord.js");
const mongoose = require('mongoose');
const http = require('http');

// 1. سيرفر الويب (ضروري في Hugging Face)
http.createServer((req, res) => {
  res.write("Bot is Running (Prefix Mode)!");
  res.end();
}).listen(7860);

const config = require("./config.json");
const PREFIX = "!"; // تقدر تبدلو واش تحب

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // هادي ضرورية باش يقرا الرسائل
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// 2. المونغو
const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
  mongoose.connect(mongoURI)
    .then(() => console.log('✅ المونڨو واجد!'))
    .catch(err => console.error('❌ غلطة مونغو:', err));
}

const User = mongoose.model('User', new mongoose.Schema({
  guildId: String, userId: String, xp: { type: Number, default: 0 }, level: { type: Number, default: 0 }
}));

client.once(Events.ClientReady, () => {
  console.log(`✅ البوت شغال بـ الأوامر العادية باسم: ${client.user.tag}`);
});

// 3. نظام الأوامر والـ XP (كلش في MessageCreate)
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  // --- نظام الـ XP ---
  try {
    let userData = await User.findOne({ guildId: message.guild.id, userId: message.author.id }) 
                   || new User({ guildId: message.guild.id, userId: message.author.id });

    userData.xp += Math.floor(Math.random() * 15) + 15;
    if (userData.xp >= (120 * (userData.level + 1))) {
      userData.xp = 0;
      userData.level++;
      message.channel.send(`مبروك 🥳 <@${message.author.id}> طلعت للمستوى **${userData.level}**`);
    }
    await userData.save();
  } catch (e) { console.error("XP Error:", e); }

  // --- معالجة الأوامر ---
  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // أمر !ping
  if (command === "ping") {
    return message.reply("🏓 Pong!");
  }

  // أمر !leaderboard
  if (command === "leaderboard" || command === "top") {
    try {
      const top = await User.find({ guildId: message.guild.id }).sort({ level: -1, xp: -1 }).limit(10);
      let desc = "";
      for (let i = 0; i < top.length; i++) {
        desc += `**${i + 1}.** <@${top[i].userId}> — مستوى **${top[i].level}**\n`;
      }
      const embed = new EmbedBuilder()
        .setTitle("🏆 لوحة المتصدرين")
        .setDescription(desc || "لا توجد بيانات بعد")
        .setColor("#FFD700");
      message.channel.send({ embeds: [embed] });
    } catch (err) { console.error(err); }
  }
});

// 4. الـ Login مع محاولة الإعادة
function start() {
  client.login(process.env.Bot_Token || config.token).catch(() => {
    console.log("❌ Timeout! Reconnecting in 10s...");
    setTimeout(start, 10000);
  });
}
start();
