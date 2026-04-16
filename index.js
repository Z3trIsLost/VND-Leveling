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
// Web Server (باش يبقى شاعل)
// =====================
http.createServer((req, res) => {
  res.write("I'm alive!");
  res.end();
}).listen(7860);

// استيراد الإعدادات
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

// =====================
// الربط مع MongoDB
// =====================
const mongoURI = process.env.MONGO_URI;

if (mongoURI) {
  mongoose.connect(mongoURI)
    .then(() => console.log('✅ تربطنا مع المونڨو يا خو!'))
    .catch(err => console.error('❌ كاين غلطة في المونڨو:', err));
} else {
  console.log("⚠️ MONGO_URI missing! Running without database.");
}

const userSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

// حساب الـ XP
function getXPNeeded(level) {
  return 120 * level; 
}

// الرولز (Role Rewards)
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
// تسجيل الـ Slash Commands
// =====================
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot response time"),
  new SlashCommandBuilder().setName("xp_leaderboard").setDescription("Show the XP leaderboard")
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.Bot_Token || config.token);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log("✅ Slash commands registered successfully.");
  } catch (error) {
    console.error("❌ Error registering slash commands:", error);
  }
})();

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// =====================
// التعامل مع الأوامر
// =====================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }

  if (interaction.commandName === "xp_leaderboard") {
    try {
      const topUsers = await User.find({ guildId: interaction.guildId }).sort({ level: -1, xp: -1 }).limit(10);
      if (!topUsers.length) return interaction.reply("لا توجد بيانات بعد.");

      let description = "";
      for (let i = 0; i < topUsers.length; i++) {
        const data = topUsers[i];
        const member = await interaction.guild.members.fetch(data.userId).catch(() => null);
        const username = member ? member.user.username : `Unknown (${data.userId})`;
        description += `**${i + 1}.** ${username} — المستوى **${data.level}** | **${data.xp} XP**\n`;
      }

      const embed = new EmbedBuilder().setTitle("🏆 لوحة متصدري الخبرة").setDescription(description).setColor("#FFD700");
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      interaction.reply("حدث خطأ أثناء جلب البيانات.");
    }
  }
});

// =====================
// نظام الـ XP
// =====================
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  try {
    let userData = await User.findOne({ guildId: message.guild.id, userId: message.author.id });
    if (!userData) userData = new User({ guildId: message.guild.id, userId: message.author.id });

    const oldLevel = userData.level;
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
      let response = `تهانينا 🥳 ${message.author}\nتمت ترقيتك للمستوى **${userData.level}**`;

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
    console.error("XP System Error:", err);
  }
});

client.login(process.env.Bot_Token || config.token);
