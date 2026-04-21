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
// Web Server (باش يبقى شاعل 24/7)
// =====================
http.createServer((req, res) => {
  res.write("I'm alive!");
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
  partials: [Partials.Channel]
});

// =====================
// MongoDB Connection
// =====================
const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
  mongoose.connect(mongoURI)
    .then(() => console.log('✅ تربطنا مع المونڨو يا خو!'))
    .catch(err => console.error('❌ غلطة في المونڨو:', err));
}

const userSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

function getXPNeeded(level) { return 120 * level; }

const roleRewards = {
  1: "1486624511427346472", 10: "1486624590481588434",
  20: "1486624679811612792", 30: "1486624772833153026",
  50: "1486625010645991505", 70: "1486625237570424936"
};
const LEVEL_UP_CHANNEL_ID = '1408661076350079056';

// =====================
// تسجيل الأوامر (نسخة مضادة للـ Timeout)
// =====================
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot response time"),
  new SlashCommandBuilder().setName("xp_leaderboard").setDescription("Show the XP leaderboard")
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.Bot_Token || config.token);

async function registerCommands() {
  try {
    console.log("⏳ جاري تسجيل الأوامر...");
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log("✅ تم تسجيل الأوامر بنجاح!");
  } catch (error) {
    console.error("⚠️ فشل تسجيل الأوامر (بصياح ديسكورد)، بصح البوت راح يكمل يشعل عادي.");
  }
}

client.once(Events.ClientReady, () => {
  console.log(`✅ البوت شغال باسم: ${client.user.tag}`);
  registerCommands(); // نسجلوهم هنا باش ما نحبسوش الـ Start
});

// =====================
// Command Handling (مع الـ Mention الملونة)
// =====================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") return interaction.reply("🏓 Pong!");

  if (interaction.commandName === "xp_leaderboard") {
    try {
      await interaction.deferReply();
      const topUsers = await User.find({ guildId: interaction.guildId }).sort({ level: -1, xp: -1 }).limit(10);
      if (!topUsers.length) return interaction.editReply("ماكاش بيانات.");

      let description = "";
      for (let i = 0; i < topUsers.length; i++) {
        const data = topUsers[i];
        try { await interaction.guild.members.fetch(data.userId); } catch (e) {}
        description += `**${i + 1}.** <@${data.userId}> — مستوى **${data.level}** | **${data.xp} XP**\n`;
      }

      const embed = new EmbedBuilder().setTitle("🏆 لوحة المتصدرين").setDescription(description).setColor("#FFD700");
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      if (interaction.deferred) interaction.editReply("غلطة في السيرفر.");
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

    userData.xp += Math.floor(Math.random() * 15) + 15;
    let leveledUp = false;
    while (userData.xp >= getXPNeeded(userData.level + 1)) {
      userData.xp -= getXPNeeded(userData.level + 1);
      userData.level += 1;
      leveledUp = true;
    }
    await userData.save();

    if (leveledUp) {
      const channel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) || message.channel;
      let response = `مبروك 🥳 <@${message.author.id}> طلعت للمستوى **${userData.level}**`;
      if (roleRewards[userData.level]) {
        const role = message.guild.roles.cache.get(roleRewards[userData.level]);
        if (role) { await message.member.roles.add(role).catch(() => null); response += `\nديت رول: **${role.name}**`; }
      }
      channel.send(response);
    }
  } catch (err) { console.error("XP Error:", err); }
});

client.login(process.env.Bot_Token || config.token);
