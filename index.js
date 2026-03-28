const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Events, 
  REST, 
  Routes, 
  SlashCommandBuilder,
} = require("discord.js");

const fs = require("fs");
const path = require("path");
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
// DATA PATH
// =====================
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "data")
  : path.join(__dirname, "data");

const LEVELS_FILE = path.join(DATA_DIR, "levels.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEVELS_FILE)) fs.writeFileSync(LEVELS_FILE, JSON.stringify({}, null, 2));

function loadLevels() {
  try { 
    return JSON.parse(fs.readFileSync(LEVELS_FILE, "utf8")); 
  } catch { 
    return {}; 
  }
}

function saveLevels(data) {
  try { 
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2)); 
  } catch (err) { 
    console.error(err); 
  }
}

// =====================
// XP NEEDED FUNCTION
// =====================
function getXPNeeded(level) {
  return 120 * level; // كل مستوى يزيد 120 XP إضافية
}

// =====================
// ROLE REWARDS
// =====================
const roleRewards = {
  1: "1486624511427346472",
  10: "1486624590481588434",
  20: "1486624679811612792",
  30: "1486624772833153026",
  50: "1486625010645991505",
  70: "1486625237570424936"
};

// =====================
// LEVEL-UP CHANNEL
// =====================
const LEVEL_UP_CHANNEL_ID = '1408661076350079056';

// =====================
// SLASH COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot response time"),

  new SlashCommandBuilder()
    .setName("xp_leaderboard")
    .setDescription("Show the XP leaderboard")
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(config.token);

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

// =====================
// BOT READY
// =====================
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// =====================
// INTERACTION HANDLER
// =====================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const levels = loadLevels();
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  if (!levels[guildId]) levels[guildId] = {};
  if (!levels[guildId][userId]) {
    levels[guildId][userId] = { xp: 0, level: 0 };
    saveLevels(levels);
  }

  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }

  if (interaction.commandName === "xp_leaderboard") {
    const guildUsers = Object.entries(levels[guildId]).filter(
      ([key, value]) => typeof value === "object" && value !== null && "xp" in value && "level" in value
    );

    const sorted = guildUsers
      .sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp)
      .slice(0, 10);

    if (!sorted.length) return interaction.reply("لا توجد بيانات بعد في لوحة المتصدرين.");

    let description = "";
    for (let i = 0; i < sorted.length; i++) {
      const [id, data] = sorted[i];
      const member = await interaction.guild.members.fetch(id).catch(() => null);
      const username = member ? member.user.username : `Unknown User (${id})`;
      description += `**${i + 1}.** ${username} — المستوى **${data.level}** | **${data.xp} XP**\n`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 لوحة متصدري الخبرة")
      .setDescription(description)
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
});

// =====================
// LEVELING SYSTEM
// =====================
// =====================
// LEVELING SYSTEM
// =====================
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const levels = loadLevels();

  if (!levels[guildId]) levels[guildId] = {};
  if (!levels[guildId][userId]) {
    levels[guildId][userId] = { xp: 0, level: 0 };
  }

  const oldLevel = levels[guildId][userId].level;
  const xpGain = Math.floor(Math.random() * 16) + 15;
  levels[guildId][userId].xp += xpGain;

  let userData = levels[guildId][userId];
  let leveledUp = false;

  while (userData.xp >= getXPNeeded(userData.level + 1)) {
    userData.xp -= getXPNeeded(userData.level + 1);
    userData.level += 1;
    leveledUp = true;
  }

  saveLevels(levels);

  if (leveledUp) {
    const channel = message.guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) || message.channel;

    // الرسالة موزعة على أسطر، السطر الأول يمنشن الشخص
    let messages = [
      `تهانينا 🥳 ${message.author}`, // يمنشن
      `تمت ترقيتك من مستوى **${oldLevel}** إلى مستوى **${userData.level}**`
    ];

    // إضافة رول جديد إذا ربحه
    if (roleRewards[userData.level]) {
      const newRole = message.guild.roles.cache.get(roleRewards[userData.level]);
      if (newRole && !message.member.roles.cache.has(newRole.id)) {
        try {
          await message.member.roles.add(newRole);
          messages.push(`لقد ربحت رول: **${newRole.name}**`);
        } catch (err) {
          console.error(err);
        }
      }
    }

    // إرسال كل شيء في رسالة واحدة لكن كل جزء في سطره
    channel.send(messages.join("\n"));
  }
});

client.login(process.env.Bot_Token);
