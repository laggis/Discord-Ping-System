const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Configuration
const config = {
  channelId: 'YourChannelID',
  roles: {
    ping: {
      roleId: 'ROLEID',
      emoji: '🔔',
      count: 0,
      description: 'Tryck på klockan för att få ping tagen så vara gång jag gör en update så behöver jag inte använda everyone pingen. Så blir inte folk arga så gå med i denna rollen om det är okej att pinga er :)'
    },
    fivem: {
      roleId: 'ROLEID',
      emoji: '🐧',
      count: 0,
      description: 'Tryck på pingvinen för att få/av din fivem rollen'
    }
  },
  dataFile: path.join(__dirname, 'roleData.json')
};

// Load saved reaction counts
function loadReactionCounts() {
  try {
    if (fs.existsSync(config.dataFile)) {
      const data = JSON.parse(fs.readFileSync(config.dataFile, 'utf8'));
      for (const roleKey in data) {
        if (config.roles[roleKey]) {
          config.roles[roleKey].count = data[roleKey].count;
          if (data[roleKey].messageId) {
            config.roles[roleKey].messageId = data[roleKey].messageId;
          }
        }
      }
      console.log('Loaded reaction counts:', data);
    }
  } catch (error) {
    console.error('Error loading reaction counts:', error);
  }
}

// Save reaction counts
function saveReactionCounts() {
  try {
    const data = {};
    for (const roleKey in config.roles) {
      data[roleKey] = {
        count: config.roles[roleKey].count,
        messageId: config.roles[roleKey].messageId
      };
    }
    fs.writeFileSync(config.dataFile, JSON.stringify(data, null, 2));
    console.log('Saved reaction counts:', data);
  } catch (error) {
    console.error('Error saving reaction counts:', error);
  }
}

// Create or update role embeds
async function setupRoleEmbeds(channel) {
  for (const roleKey in config.roles) {
    const role = config.roles[roleKey];
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(roleKey === 'ping' ? 'PenguinHosting' : 'Fivem roll')
      .setDescription(role.description)
      .setThumbnail('LinkForThePicture') // Penguin image
      .setFooter({ text: `${role.count} användare har denna roll` });

    // Check if we already have a message ID for this role
    if (role.messageId) {
      try {
        // Try to fetch the existing message
        const message = await channel.messages.fetch(role.messageId);
        await message.edit({ embeds: [embed] });
        console.log(`Updated embed for ${roleKey}`);
      } catch (error) {
        // Message not found, create a new one
        console.log(`Could not find message for ${roleKey}, creating new one`);
        const message = await channel.send({ embeds: [embed] });
        role.messageId = message.id;
        await message.react(role.emoji);
        saveReactionCounts();
      }
    } else {
      // Create a new message
      const message = await channel.send({ embeds: [embed] });
      role.messageId = message.id;
      await message.react(role.emoji);
      saveReactionCounts();
      console.log(`Created new embed for ${roleKey}`);
    }
  }
}

// When the client is ready, run this code (only once)
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Load saved reaction counts
  loadReactionCounts();
  
  // Get the channel
  const channel = await client.channels.fetch(config.channelId);
  if (!channel) {
    console.error(`Channel with ID ${config.channelId} not found`);
    return;
  }
  
  // Setup role embeds
  await setupRoleEmbeds(channel);
});

// Handle reactions
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  
  // Check if the reaction is partial
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Error fetching reaction:', error);
      return;
    }
  }
  
  // Check if the reaction is on one of our role messages
  for (const roleKey in config.roles) {
    const role = config.roles[roleKey];
    if (reaction.message.id === role.messageId && reaction.emoji.name === role.emoji) {
      // Get the guild and member
      const guild = reaction.message.guild;
      const member = await guild.members.fetch(user.id);
      
      // Add the role
      await member.roles.add(role.roleId);
      console.log(`Added role ${roleKey} to ${user.tag}`);
      
      // Increment the count
      role.count++;
      
      // Update the embed
      const embed = EmbedBuilder.from(reaction.message.embeds[0])
        .setFooter({ text: `${role.count} användare har denna roll` });
      await reaction.message.edit({ embeds: [embed] });
      
      // Save the updated counts
      saveReactionCounts();
      break;
    }
  }
});

// Handle reaction removals
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  
  // Check if the reaction is partial
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Error fetching reaction:', error);
      return;
    }
  }
  
  // Check if the reaction is on one of our role messages
  for (const roleKey in config.roles) {
    const role = config.roles[roleKey];
    if (reaction.message.id === role.messageId && reaction.emoji.name === role.emoji) {
      // Get the guild and member
      const guild = reaction.message.guild;
      const member = await guild.members.fetch(user.id);
      
      // Remove the role
      await member.roles.remove(role.roleId);
      console.log(`Removed role ${roleKey} from ${user.tag}`);
      
      // Decrement the count
      if (role.count > 0) {
        role.count--;
      }
      
      // Update the embed
      const embed = EmbedBuilder.from(reaction.message.embeds[0])
        .setFooter({ text: `${role.count} användare har denna roll` });
      await reaction.message.edit({ embeds: [embed] });
      
      // Save the updated counts
      saveReactionCounts();
      break;
    }
  }
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);