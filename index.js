const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField
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

client.commands = new Collection();

// =====================
// DATA PATH (Railway Volume Compatible)
// =====================
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "data")
  : path.join(__dirname, "data");

const LEVELS_FILE = path.join(DATA_DIR, "levels.json");

// create data folder / file if not exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEVELS_FILE)) fs.writeFileSync(LEVELS_FILE, JSON.stringify({}, null, 2));

// =====================
// LOAD / SAVE
// =====================
function loadLevels() {
  try {
    return JSON.parse(fs.readFileSync(LEVELS_FILE, "utf8"));
  } catch (err) {
    console.error("Error reading levels file:", err);
    return {};
  }
}

function saveLevels(data) {
  try {
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving levels file:", err);
  }
}

function getXPNeeded(level) {
  return (level + 1) * 120; // كل لفل يحتاج +120 XP أكثر من قبل
}

// =====================
// LEVEL UP CHANNEL 
// =====================
const LEVEL_CHANNEL_ID = "1408661076350079056"; // غيرها بالشانل تاعك

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
// COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your current level and XP"),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top leveling leaderboard"),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency")
].map(cmd => cmd.toJSON());

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: "10" }).setToken(config.token);
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
    console.log("✅ Slash commands registered.");
  } catch (err) {
    console.error("❌ Error registering slash commands:", err);
  }
});

// =====================
// INTERACTIONS
// =====================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const levels = loadLevels();
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  if (!levels[guildId]) levels[guildId] = {};
  if (!levels[guildId][userId]) levels[guildId][userId] = { xp: 0, level: 0, roles: [] };

  if (interaction.commandName === "rank") {
    const userData = levels[guildId][userId];
    return interaction.reply({
      content: `📊 ${interaction.user}, أنت Level **${userData.level}** وعندك **${userData.xp} XP**.`,
      ephemeral: false
    });
  }

  if (interaction.commandName === "leaderboard") {
    const guildUsers = levels[guildId];
    const sorted = Object.entries(guildUsers).sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp).slice(0, 10);
    if (!sorted.length) return interaction.reply("مازال ما كاش داتا في leaderboard.");
    let text = "🏆 **Leaderboard**\n\n";
    for (let i = 0; i < sorted.length; i++) {
      const [id, data] = sorted[i];
      text += `**${i + 1}.** <@${id}> — Level **${data.level}** (**${data.xp} XP**)\n`;
    }
    return interaction.reply(text);
  }

  if (interaction.commandName === "ping") {
    return interaction.reply("🏓 Pong!");
  }
});

// =====================
// LEVELING SYSTEM
// =====================
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const levels = loadLevels();

  if (!levels[guildId]) levels[guildId] = {};
  if (!levels[guildId][userId]) levels[guildId][userId] = { xp: 0, level: 0, roles: [] };

  // XP gain
  const xpGain = Math.floor(Math.random() * 16) + 15; // 15-30 XP
  levels[guildId][userId].xp += xpGain;

  let userData = levels[guildId][userId];
  let oldLevel = userData.level;
  let leveledUp = false;

  while (userData.xp >= getXPNeeded(userData.level)) {
    userData.xp -= getXPNeeded(userData.level);
    userData.level += 1;
    leveledUp = true;
  }

  saveLevels(levels);

  if (leveledUp) {
    let targetChannel = message.guild.channels.cache.get(LEVEL_CHANNEL_ID) || message.channel;

    let rewardText = "";
    const newRole = roleRewards[userData.level];
    if (newRole) {
      const role = message.guild.roles.cache.get(newRole);
      if (role && !message.member.roles.cache.has(role.id)) {
        await message.member.roles.add(role);
        rewardText = `\n🎁 ربح رول جديد: **${role.name}**`;
      }
    }

    targetChannel.send(
      `تهانينا 🥳 ${message.author}! تمت ترقيتك من مستوى **${oldLevel}** إلى مستوى **${userData.level}**${rewardText}`
    );
  }
});

client.login(process.env.Bot_Token);
