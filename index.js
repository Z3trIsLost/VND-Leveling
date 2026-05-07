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

// ==========================================
// 1. Web Server (باش يبقى البوت شاعل في Render)
// ==========================================
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.write("I'm alive and patient!");
  res.end();
}).listen(port, () => {
  console.log(`✅ Web Server is running on port ${port}`);
});

// ==========================================
// 2. إعدادات السيرفرات (A و B)
// ==========================================
const guildConfigs = {
  // إعدادات السيرفر الأول (A) - خليهم كيما راهم
  "1486337190580715560": { 
    levelUpChannel: "1408661076350079056",
    roleRewards: {
      1: "1486624511427346472",
      10: "1486624590481588434",
      20: "1486624679811612792",
      30: "1486624772833153026",
      50: "1486625010645991505",
      70: "1486625237570424936"
    }
  },
  // إعدادات السيرفر الثاني (B) - نسخة بنفس الصوالح
  "1476180028608876621": { // <--- حط الـ ID تاع السيرفر الزاوج هنا
    levelUpChannel: "1502031419398951083", // <--- حط ID قناة التهنئة هنا
    roleRewards: {
      1: "1502033298631688392",
      10: "1502033775180251176",
      20: "1502033866582659294",
      35: "1502034203359969491",
      50: "1502034369647345664",
      70: "1502034532965023937",
      80: "1502034730080796802"
    }
  }
};

// ==========================================
// 3. الربط مع قاعدة البيانات (MongoDB)
// ==========================================
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

function getXPNeeded(level) {
  return 120 * level; 
}

// ==========================================
// 4. إعدادات البوت والـ Slash Commands
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check bot response time"),
  new SlashCommandBuilder().setName("xp_leaderboard").setDescription("Show the XP leaderboard")
].map(command => command.toJSON());

const botToken = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;

const rest = new REST({ version: "10" }).setToken(botToken);

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    // تسجيل الأوامر Global باش يمشو في قاع السيرفرات (A و B)
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Global Slash commands registered.");
  } catch (error) {
    console.error("⚠️ Error registering commands:", error);
  }
});

// ==========================================
// 5. Handling Interaction (Ping & Leaderboard)
// ==========================================
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
        try { await interaction.guild.members.fetch(data.userId); } catch (e) {}
        description += `**${i + 1}.** <@${data.userId}> — المستوى **${data.level}** | **${data.xp} XP**\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle("🏆 لوحة متصدري الخبرة")
        .setDescription(description)
        .setColor("#FFD700");

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      interaction.deferred ? interaction.editReply("Error!") : interaction.reply("Error!");
    }
  }
});

// ==========================================
// 6. XP System Logic (Multi-Guild)
// ==========================================
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
      // جلب إعدادات السيرفر لي جا منو الميساج
      const currentConfig = guildConfigs[message.guild.id];
      
      if (currentConfig) {
        const channel = message.guild.channels.cache.get(currentConfig.levelUpChannel) || message.channel;
        let response = `تهانينا 🥳 <@${message.author.id}>\nتمت ترقيتك للمستوى **${userData.level}**`;

        // مكافأة الرولات
        if (currentConfig.roleRewards[userData.level]) {
          const roleId = currentConfig.roleRewards[userData.level];
          const newRole = message.guild.roles.cache.get(roleId);
          if (newRole) {
            await message.member.roles.add(newRole).catch(() => null);
            response += `\nلقد ربحت رول: **${newRole.name}**`;
          }
        }
        channel.send(response);
      } else {
        // إذا السيرفر مش مسجل في القائمة، يبعث في نفس الشانل بلا رولات
        message.channel.send(`تهانينا 🥳 <@${message.author.id}> وصلت للمستوى **${userData.level}**`);
      }
    }
  } catch (err) {
    console.error("XP Error:", err);
  }
});

// ==========================================
// 7. ميزة الصبر (الدخول)
// ==========================================
function startBot() {
  if (!botToken) return console.error("❌ BOT_TOKEN is missing!");
  client.login(botToken).catch(err => {
    console.error("❌ Timeout. Retrying in 10s...");
    setTimeout(startBot, 10000);
  });
}

startBot();
