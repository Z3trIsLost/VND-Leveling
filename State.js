const { ActivityType } = require('discord.js');

module.exports = (client) => {
  client.user.setPresence({
    activities: [{
      name: 'custom',
      type: ActivityType.Custom,
      state: 'I Love My Owner 🌹', // العبارة لي طلبتها
    }],
    status: 'online',
  });
};
