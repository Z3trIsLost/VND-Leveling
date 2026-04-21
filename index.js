const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Events, 
  EmbedBuilder 
} = require("discord.js");
const mongoose = require('mongoose');
const http = require('http');

// =====================
// 1. Web Server (Hugging Face Stability)
// =====================
http.createServer((req, res) => {
  res.write("Bot is fully operational!");
  res.end();
}).listen(7860, () => console.log("🌐 Web Server Ready on Port 7860"));

const config = require("./config.json");

// =====================
// 2. Client Configuration
// =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // ضرورية لقراءة أوامر الـ Prefix
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel],
  restRequestTimeout: 60000 // زيادة الصبر مع الإنترنت الثقيلة
});

// =====================
// 3. XP & Rewards Settings
// =====================
const LEVEL_UP_CHANNEL_ID = '1408661076350079056';
const roleRewards = {
  1: "1486624511427346472",
  10: "1486624590481588434",
  20: "1486624679811612792",
  30: "1486624772833153026",
  50: "1486625010645991505",
  70: "1486625237570424936"
};

// =====================
// 4. MongoDB Connection
// =====================
const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
  mongoose.connect(mongoURI)
    .then(() => console.log('✅ المونڨو مربوط يا خو!'))
    .catch(err => console.error('❌ غلطة في المونڨو:', err));
}

const userSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

function getXPNeeded(level) {
  return 120 * (level + 1); 
}

// =====================
// 5. Bot Events & Logic
// =====================
client.once(Events.ClientReady, () => {
  console.log(`🚀 تم تسجيل الدخول باسم: ${client.user.tag}`);
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  // --- نظام الـ XP والـ Level Up ---
  try {
    let userData = await User.findOne({ guildId: message.guild.id, userId: message.author.id });
    if (!userData) userData = new User({ guildId: message.guild.id, userId: message.author.id });

    userData.xp += Math.floor(Math.random() * 16) + 15;

    if (userData.xp >= getXPNeeded(userData.level)) {
      userData.xp = 0;
      userData.level += 1;

      const channel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) || message.channel;
      let response = `تهانينا 🥳 <@${message.author.id}>\nتمت ترقيتك للمستوى **${userData.level}**`;

      // إعطاء الرولات التلقائية
      if (roleRewards[userData.level]) {
        const role = message.guild.roles.cache.get(roleRewards[userData.level]);
        if (role) {
          await message.member.roles.add(role).catch(() => null);
          response += `\nلقد ربحت رول: **${role.name}**`;
        }
      }
      channel.send(response);
    }
    await userData.save();
  } catch (err) {
    console.error("XP Error:", err);
  }

  // --- الأوامر بـ Prefix (!) ---
  if (!message.content.startsWith("!")) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // أمر !ping
  if (command === "ping") {
    return message.reply("🏓 Pong!");
  }

  // أمر !top (Leaderboard)
  if (command === "top" || command === "leaderboard") {
    try {
      const topUsers = await User.find({ guildId: message.guild.id })
        .sort({ level: -1, xp: -1 })
        .limit(10);

      if (!topUsers.length) return message.reply("لا توجد بيانات بعد.");

      let description = "";
      for (let i = 0; i < topUsers.length; i++) {
        const data = topUsers[i];
        // الطاق (Mention) يخرج ملون دايما في الـ Prefix
        description += `**${i + 1}.** <@${data.userId}> — ليفل **${data.level}** | **${data.xp} XP**\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle("🏆 لوحة متصدري الخبرة")
        .setDescription(description)
        .setColor("#FFD700")
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      message.reply("حدث خطأ أثناء جلب البيانات.");
    }
  }
});

// =====================
// 6. Login System with Auto-Retry
// =====================
async function startBot() {
  try {
    await client.login(process.env.Bot_Token || config.token);
  } catch (err) {
    console.error("❌ فشل الـ Login، إعادة المحاولة بعد 10 ثواني...");
    setTimeout(startBot, 10000);
  }
}

startBot();
