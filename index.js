const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Events, 
  REST, 
  Routes, 
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const mongoose = require('mongoose');
const http = require('http');

// =====================
// 1. Web Server (باش الـ Render و Cron-job يقدروا يلحقوا ليه)
// =====================
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.write("I'm alive and patient!");
  res.end();
}).listen(port, () => {
  console.log(`✅ Web Server is running on port ${port}`);
});

// محاولة جلب الإعدادات من الملف المحلي (فقط للـ Local) أو من الـ Environment Variables
let config = {};
try {
  config = require("./config.json");
} catch (e) {
  // إذا الملف مش موجود (كيما في Render)، راح يستعمل process.env ديريكت
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// =====================
// 2. MongoDB Connection
// =====================
const mongoURI = process.env.MONGO_URI || config.mongoURI;

if (mongoURI) {
  mongoose.connect(mongoURI)
    .then(() => console.log('✅ تربطنا مع المونڨو يا خو!'))
    .catch(err => console.error('❌ كاين غلطة في المونڨو:', err));
}

const userSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

function getXPNeeded(level) {
  return 120 * level; 
}

// =====================
// 3. الرولات وقناة التنبيهات
// =====================
const roleRewards = {
  1: "1486624511427346472",
  10: "1486624590481588434",
  20: "1486624679811612792",
  30: "1486624772833153026",
  50: "1486625010645991505",
  70: "1486625237570424936"
};

const LEVEL_UP_CHANNEL_ID = '1408661076350079056';

// =====================
// 4. Slash Commands
// =====================
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot response time"),
  new SlashCommandBuilder().setName("xp_leaderboard").setDescription("Show the XP leaderboard")
].map(command => command.toJSON());

const botToken = process.env.BOT_TOKEN || config.token;
const clientId = process.env.CLIENT_ID || config.clientId;
const guildId = process.env.GUILD_ID || config.guildId;

const rest = new REST({ version: "10" }).setToken(botToken);

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    if (clientId && guildId) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log("✅ Slash commands registered.");
    }
  } catch (error) {
    console.log("⚠️ تأخر في تسجيل الأوامر، لكن البوت شغال.");
  }
});

// =====================
// 5. Command Handling
// =====================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }

  if (interaction.commandName === "xp_leaderboard") {
    try {
      await interaction.deferReply(); 

      const topUsers = await User.find({ guildId: interaction.guildId })
        .sort({ level: -1, xp: -1 })
        .limit(10);

      if (!topUsers.length) return interaction.editReply("لا توجد بيانات بعد.");

      let description = "";
      for (let i = 0; i < topUsers.length; i++) {
        const data = topUsers[i];
        try {
          await interaction.guild.members.fetch(data.userId);
        } catch (e) {}
        description += `**${i + 1}.** <@${data.userId}> — المستوى **${data.level}** | **${data.xp} XP**\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle("🏆 لوحة متصدري الخبرة")
        .setDescription(description)
        .setColor("#FFD700");

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      if (interaction.deferred) {
        interaction.editReply("حدث خطأ أثناء جلب البيانات.");
      } else {
        interaction.reply("حدث خطأ أثناء جلب البيانات.");
      }
    }
  }
});

// =====================
// 6. XP System Logic
// =====================
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  try {
    let userData = await User.findOne({ guildId: message.guild.id, userId: message.author.id });
    if (!userData) userData = new User({ guildId: message.guild.id, userId: message.author.id });

    userData.xp += Math.floor(Math.random() * 16) + 15;

    let leveledUp = false;
    while (userData.xp >= getXPNeeded(userData.level + 1)) {
      userData.xp -= getXPNeeded(userData.level + 1);
      userData.level += 1;
      leveledUp = true;
    }

    await userData.save();

    if (leveledUp) {
      const channel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) || message.channel;
      let response = `تهانينا 🥳 <@${message.author.id}>\nتمت ترقيتك للمستوى **${userData.level}**`;

      if (roleRewards[userData.level]) {
        const newRole = message.guild.roles.cache.get(roleRewards[userData.level]);
        if (newRole) {
          await message.member.roles.add(newRole).catch(() => null);
          response += `\nلقد ربحت رول: **${newRole.name}**`;
        }
      }
      channel.send(response);
    }
  } catch (err) {
    console.error("XP Error:", err);
  }
});

// =====================
// 7. ميزة الصبر
// =====================
function startBot() {
  if (!botToken) return console.error("❌ BOT_TOKEN is missing!");
  client.login(botToken).catch(err => {
    console.error("❌ فشل الاتصال (Timeout). سأعيد المحاولة بعد 10 ثواني...");
    setTimeout(startBot, 10000);
  });
}

startBot();
