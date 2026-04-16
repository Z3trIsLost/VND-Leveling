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

// إعدادات البوت (تأكد من وجود config.json أو استعمل Secrets)
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
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ تربطنا مع المونڨو يا خو!'))
  .catch(err => console.error('❌ كاين غلطة في المونڨو:', err));

const userSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

// =====================
// حساب الـ XP المطلوب
// =====================
function getXPNeeded(level) {
  return 120 * level; 
}

// =====================
// الرولز (Role Rewards)
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
// تسجيل الـ Slash Commands
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot response time"),
  new SlashCommandBuilder()
    .setName("xp_leaderboard")
    .setDescription("Show the XP leaderboard")
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.Bot_Token || config.token);

(async () => {
  try {
    console.log("🔄 Registering slash commands...");
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
// التعامل مع الأوامر (Interactions)
// =====================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { guildId } = interaction;

  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }

  if (interaction.commandName === "xp_leaderboard") {
    const topUsers = await User.find({ guildId }).sort({ level: -1, xp: -1 }).limit(10);

    if (!topUsers.length) return interaction.reply("لا توجد بيانات بعد.");

    let description = "";
    for (let i = 0; i < topUsers.length; i++) {
      const data = topUsers[i];
      const member = await interaction.guild.members.fetch(data.userId).catch(() => null);
      const username = member ? member.user.username : `Unknown (${data.userId})`;
      description += `**${i + 1}.** ${username} — المستوى **${data.level}** | **${data.xp} XP**\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 لوحة متصدري الخبرة")
      .setDescription(description)
      .setColor("#FFD700")
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
});

// =====================
// نظام التفاعل والـ XP
// =====================
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  let userData = await User.findOne({ guildId, userId });
  if (!userData) {
    userData = new User({ guildId, userId });
  }

  const oldLevel = userData.level;
  const xpGain = Math.floor(Math.random() * 16) + 15;
  userData.xp += xpGain;

  let leveledUp = false;
  while (userData.xp >= getXPNeeded(userData.level + 1)) {
    userData.xp -= getXPNeeded(userData.level + 1);
    userData.level += 1;
    leveledUp = true;
  }

  await userData.save();

  if (leveledUp) {
    const channel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) || message.channel;
    let response = `تهانينا 🥳 ${message.author}\nتمت ترقيتك من مستوى **${oldLevel}** إلى مستوى **${userData.level}**`;

    if (roleRewards[userData.level]) {
      const newRole = message.guild.roles.cache.get(roleRewards[userData.level]);
      if (newRole) {
        try {
          await message.member.roles.add(newRole);
          response += `\nلقد ربحت رول: **${newRole.name}**`;
        } catch (err) { console.error("Error adding role:", err); }
      }
    }
    channel.send(response);
  }
});

client.login(process.env.Bot_Token || config.token);
