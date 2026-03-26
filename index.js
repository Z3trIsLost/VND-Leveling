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
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(LEVELS_FILE)) {
  fs.writeFileSync(LEVELS_FILE, JSON.stringify({}, null, 2));
}

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
  return level * 100;
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
    .setName("setlevelchannel")
    .setDescription("Set the channel where level up messages are sent")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("Channel for level-up messages")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
].map(command => command.toJSON());

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(config.token);

    console.log("🔄 Registering slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
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
  if (!levels[guildId][userId]) {
    levels[guildId][userId] = {
      xp: 0,
      level: 1
    };
    saveLevels(levels);
  }

  if (interaction.commandName === "rank") {
    const userData = levels[guildId][userId];
    return interaction.reply({
      content: `📊 ${interaction.user}, أنت Level **${userData.level}** وعندك **${userData.xp} XP**.`,
      ephemeral: false
    });
  }

  if (interaction.commandName === "leaderboard") {
    const guildUsers = levels[guildId];

    const sorted = Object.entries(guildUsers)
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);

    if (!sorted.length) {
      return interaction.reply("مازال ما كاش داتا في leaderboard.");
    }

    let text = "🏆 **Leaderboard**\n\n";

    for (let i = 0; i < sorted.length; i++) {
      const [id, data] = sorted[i];
      text += `**${i + 1}.** <@${id}> — Level **${data.level}** (**${data.xp} XP**)\n`;
    }

    return interaction.reply(text);
  }

  if (interaction.commandName === "setlevelchannel") {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({
        content: "❌ لازم تكون Admin.",
        ephemeral: true
      });
    }

    const channel = interaction.options.getChannel("channel");

    if (!levels[guildId]._settings) levels[guildId]._settings = {};
    levels[guildId]._settings.levelChannelId = channel.id;

    saveLevels(levels);

    return interaction.reply(`✅ تم تعيين روم اللفلينج إلى ${channel}`);
  }
});

// =====================
// LEVELING SYSTEM
// =====================
const cooldown = new Set();

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  const levels = loadLevels();

  if (!levels[guildId]) levels[guildId] = {};
  if (!levels[guildId][userId]) {
    levels[guildId][userId] = {
      xp: 0,
      level: 1
    };
  }

  const key = `${guildId}-${userId}`;
  if (cooldown.has(key)) return;

  cooldown.add(key);
  setTimeout(() => cooldown.delete(key), 60000); // 1 min cooldown

  const xpGain = Math.floor(Math.random() * 16) + 15; // 15 to 30 XP
  levels[guildId][userId].xp += xpGain;

  let userData = levels[guildId][userId];
  let leveledUp = false;

  while (userData.xp >= getXPNeeded(userData.level)) {
    userData.xp -= getXPNeeded(userData.level);
    userData.level += 1;
    leveledUp = true;
  }

  saveLevels(levels);

  if (leveledUp) {
    let targetChannel = message.channel;

    if (
      levels[guildId]._settings &&
      levels[guildId]._settings.levelChannelId
    ) {
      const customChannel = message.guild.channels.cache.get(
        levels[guildId]._settings.levelChannelId
      );
      if (customChannel) targetChannel = customChannel;
    }

    let rewardText = "";

    if (roleRewards[userData.level] && roleRewards[userData.level] !== "PUT_ROLE_ID_LEVEL_" + userData.level) {
      const role = message.guild.roles.cache.get(roleRewards[userData.level]);

      if (role) {
        try {
          if (!message.member.roles.cache.has(role.id)) {
            await message.member.roles.add(role);
            rewardText = `\n🎁 مبروك! ربحت الرول: **${role.name}**`;
          }
        } catch (err) {
          console.error(`Error giving role to ${message.author.tag}:`, err);
        }
      }
    }

    targetChannel.send(
      `🎉 ${message.author} مبروك! طلعت لـ **Level ${userData.level}**!${rewardText}`
    );
  }
});

client.login(config.token);