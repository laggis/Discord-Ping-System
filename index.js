require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
} = require('discord.js');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const DATA_PATH = path.join(__dirname, 'roleData.json');

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    console.error(`[JSON] Could not read ${path.basename(filePath)}:`, error.message);
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const config = readJson(CONFIG_PATH, {});
let roleData = readJson(DATA_PATH, {
  panelMessageId: '',
  panelChannelId: '',
  lastPanelSync: '',
});

const token = process.env.DISCORD_TOKEN;

if (!token || token === 'PASTE_YOUR_BOT_TOKEN_HERE') {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

if (!config.guildId || config.guildId.includes('PASTE_')) {
  console.error('Missing guildId in config.json');
  process.exit(1);
}

if (!config.channelId || config.channelId.includes('PASTE_')) {
  console.error('Missing channelId in config.json');
  process.exit(1);
}

if (!Array.isArray(config.roles) || config.roles.length === 0) {
  console.error('config.json needs at least one role in the roles array.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

function normalizeHexColor(value, fallback = 0x2b7fff) {
  if (typeof value !== 'string') return fallback;
  const clean = value.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return Number.parseInt(clean, 16);
}

function sanitizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getRoleConfigByKey(key) {
  return config.roles.find((roleConfig) => roleConfig.key === key);
}

function isPlaceholderId(value) {
  return !value || value.includes('PASTE_');
}

async function fetchMainGuild() {
  return client.guilds.fetch(config.guildId);
}

async function fetchPanelChannel(guild) {
  const channel = await guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Panel channel not found or not text based: ${config.channelId}`);
  }
  return channel;
}

async function warmMemberCache(guild) {
  if (!config.countMembers) return;

  try {
    console.log('[Panel] Fetching members for accurate role counts...');
    await guild.members.fetch();
    console.log('[Panel] Member cache loaded.');
  } catch (error) {
    console.warn('[Panel] Could not fetch all members. Counts may be cached/approx only.');
    console.warn('[Panel] Enable Server Members Intent in the Discord Developer Portal if counts are wrong.');
  }
}

function getRoleMemberCount(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  if (!role) return 'Role missing';
  return `${role.members.size} användare har denna roll`;
}

function buildPanelEmbed(guild) {
  const panel = config.panel || {};
  const embed = new EmbedBuilder()
    .setColor(normalizeHexColor(panel.color))
    .setTitle(panel.title || 'PenguinHosting • Ping & Role Panel')
    .setDescription(panel.description || 'Välj vilka pingar och roller du vill ha.')
    .setTimestamp(new Date())
    .setFooter({ text: panel.footer || 'PenguinHosting Roles • Du kan lämna rollerna när som helst' });

  for (const roleConfig of config.roles) {
    const roleId = sanitizeId(roleConfig.roleId);
    const mention = isPlaceholderId(roleId) ? '`Role ID missing in config.json`' : `<@&${roleId}>`;
    const notes = Array.isArray(roleConfig.notes) && roleConfig.notes.length > 0
      ? roleConfig.notes.map((note) => `• ${note}`).join('\n')
      : '• Klicka på knapparna nedanför för att få eller ta bort rollen.';

    const countText = isPlaceholderId(roleId)
      ? 'Role ID saknas i config.json'
      : getRoleMemberCount(guild, roleId);

    const quote = roleConfig.quote ? `> ${roleConfig.quote}\n\n` : '';
    const infoTitle = roleConfig.infoTitle || 'Info';
    const infoText = roleConfig.infoText || 'Du kan ta bort rollen när som helst.';

    embed.addFields({
      name: `${roleConfig.emoji || '🔔'} ${roleConfig.title || roleConfig.key}`,
      value:
        `${roleConfig.description || ''}\n\n` +
        `${quote}` +
        `✨ **Vad gör knapparna?**\n${notes}\n\n` +
        `👥 **Medlemmar**\n**${countText}**\n\n` +
        `🔒 **${infoTitle}**\n${infoText}\n\n` +
        `Roll: ${mention}`,
      inline: false,
    });
  }

  return embed;
}

function buildPanelComponents() {
  const rows = [];

  for (const roleConfig of config.roles) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`role:add:${roleConfig.key}`)
        .setLabel(roleConfig.getLabel || `Get ${roleConfig.title || roleConfig.key}`)
        .setEmoji(roleConfig.buttonEmoji || roleConfig.emoji || '✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`role:remove:${roleConfig.key}`)
        .setLabel(roleConfig.removeLabel || `Remove ${roleConfig.title || roleConfig.key}`)
        .setEmoji(roleConfig.buttonEmoji || roleConfig.emoji || '🗑️')
        .setStyle(ButtonStyle.Danger),
    );
    rows.push(row);
  }

  return rows.slice(0, 5);
}

function looksLikeRolePanelMessage(message) {
  if (!message || message.author?.id !== client.user.id) return false;

  const title = message.embeds?.[0]?.title || '';
  const footer = message.embeds?.[0]?.footer?.text || '';

  return (
    title.includes('PenguinHosting') && title.toLowerCase().includes('role panel')
  ) || (
    title.includes('PenguinHosting') && title.toLowerCase().includes('ping')
  ) || (
    footer.includes('PenguinHosting Roles')
  );
}

async function findExistingPanelMessage(channel) {
  if (roleData.panelMessageId) {
    const savedMessage = await channel.messages.fetch(roleData.panelMessageId).catch(() => null);
    if (savedMessage && looksLikeRolePanelMessage(savedMessage)) return savedMessage;
  }

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return null;

  const panelMessages = [...messages.values()]
    .filter(looksLikeRolePanelMessage)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  return panelMessages[0] || null;
}

async function cleanupDuplicatePanels(channel, keepMessageId) {
  if (!config.deleteDuplicatePanels) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return;

  const duplicates = [...messages.values()]
    .filter(looksLikeRolePanelMessage)
    .filter((message) => message.id !== keepMessageId);

  for (const message of duplicates) {
    await message.delete().catch((error) => {
      console.warn(`[Panel] Could not delete old panel message ${message.id}: ${error.message}`);
    });
  }

  if (duplicates.length > 0) {
    console.log(`[Panel] Deleted ${duplicates.length} old duplicate role panel message(s).`);
  }
}

async function upsertPanelMessage(reason = 'startup') {
  const guild = await fetchMainGuild();
  await warmMemberCache(guild);
  const channel = await fetchPanelChannel(guild);

  const payload = {
    embeds: [buildPanelEmbed(guild)],
    components: buildPanelComponents(),
    allowedMentions: { parse: [] },
  };

  let panelMessage = await findExistingPanelMessage(channel);

  if (panelMessage) {
    panelMessage = await panelMessage.edit(payload);
    console.log(`[Panel] Edited existing combined role panel (${reason}).`);
  } else {
    panelMessage = await channel.send(payload);
    console.log(`[Panel] Sent new combined role panel (${reason}).`);
  }

  roleData.panelMessageId = panelMessage.id;
  roleData.panelChannelId = channel.id;
  roleData.lastPanelSync = new Date().toISOString();
  writeJson(DATA_PATH, roleData);

  await cleanupDuplicatePanels(channel, panelMessage.id);

  return panelMessage;
}

function resolveLegacyButton(customId) {
  const id = customId.toLowerCase();

  const legacyMap = {
    get_update_ping: ['add', 'updates'],
    add_update_ping: ['add', 'updates'],
    give_update_ping: ['add', 'updates'],
    remove_update_ping: ['remove', 'updates'],
    delete_update_ping: ['remove', 'updates'],

    get_fivem_role: ['add', 'fivem'],
    add_fivem_role: ['add', 'fivem'],
    give_fivem_role: ['add', 'fivem'],
    remove_fivem_role: ['remove', 'fivem'],
    delete_fivem_role: ['remove', 'fivem'],
  };

  return legacyMap[id] || null;
}

function parseRoleButton(customId) {
  if (customId.startsWith('role:')) {
    const parts = customId.split(':');
    if (parts.length === 3) return [parts[1], parts[2]];
  }

  return resolveLegacyButton(customId);
}

function botCanManageRole(guild, role) {
  const botMember = guild.members.me;
  if (!botMember) return { ok: false, reason: 'Bot member missing.' };

  if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: 'Botten saknar permission **Manage Roles**.' };
  }

  if (role.managed) {
    return { ok: false, reason: 'Den rollen är managed/integration role och kan inte ändras av botten.' };
  }

  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    return { ok: false, reason: 'Botten ligger under rollen i Discord role hierarchy. Flytta botrollen över rollen den ska ge.' };
  }

  return { ok: true };
}

async function handleRoleButton(interaction) {
  const parsed = parseRoleButton(interaction.customId);
  if (!parsed) return;

  const [action, key] = parsed;
  const roleConfig = getRoleConfigByKey(key);

  if (!roleConfig) {
    await interaction.reply({ content: 'Jag hittar inte den rollen i config.json.', ephemeral: true });
    return;
  }

  const roleId = sanitizeId(roleConfig.roleId);
  if (isPlaceholderId(roleId)) {
    await interaction.reply({ content: `Role ID saknas för **${roleConfig.title || key}** i config.json.`, ephemeral: true });
    return;
  }

  const guild = interaction.guild;
  const role = await guild.roles.fetch(roleId).catch(() => null);

  if (!role) {
    await interaction.reply({ content: `Jag hittar inte rollen **${roleConfig.title || key}**. Kontrollera roleId i config.json.`, ephemeral: true });
    return;
  }

  const canManage = botCanManageRole(guild, role);
  if (!canManage.ok) {
    await interaction.reply({ content: `Kan inte ändra rollen: ${canManage.reason}`, ephemeral: true });
    return;
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'Jag kunde inte hitta din Discord member i servern.', ephemeral: true });
    return;
  }

  const hasRole = member.roles.cache.has(role.id);

  if (action === 'add') {
    if (hasRole) {
      await interaction.reply({ content: `Du har redan rollen **${role.name}**.`, ephemeral: true });
      return;
    }

    await member.roles.add(role, `Role panel button: ${interaction.user.tag}`).catch(async (error) => {
      console.error(`[Role] Could not add ${role.name} to ${interaction.user.tag}:`, error);
      await interaction.reply({ content: `Kunde inte ge rollen **${role.name}**. Kontrollera bot permissions och role hierarchy.`, ephemeral: true });
    });

    if (!interaction.replied) {
      await interaction.reply({ content: `Klart! Du fick rollen **${role.name}**. 🐧`, ephemeral: true });
    }
  } else if (action === 'remove') {
    if (!hasRole) {
      await interaction.reply({ content: `Du har inte rollen **${role.name}**.`, ephemeral: true });
      return;
    }

    await member.roles.remove(role, `Role panel button: ${interaction.user.tag}`).catch(async (error) => {
      console.error(`[Role] Could not remove ${role.name} from ${interaction.user.tag}:`, error);
      await interaction.reply({ content: `Kunde inte ta bort rollen **${role.name}**. Kontrollera bot permissions och role hierarchy.`, ephemeral: true });
    });

    if (!interaction.replied) {
      await interaction.reply({ content: `Klart! Jag tog bort rollen **${role.name}**.`, ephemeral: true });
    }
  }

  if (config.updatePanelAfterRoleChange) {
    setTimeout(() => {
      upsertPanelMessage('role-change').catch((error) => {
        console.error('[Panel] Could not refresh panel after role change:', error);
      });
    }, 1500);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await upsertPanelMessage('startup');
  } catch (error) {
    console.error('[Startup] Could not create/update role panel:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  try {
    await handleRoleButton(interaction);
  } catch (error) {
    console.error('[Interaction] Button error:', error);

    const message = 'Något gick fel när jag försökte ändra rollen. Kontrollera console/loggen.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => null);
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => null);
    }
  }
});

process.on('unhandledRejection', (error) => {
  console.error('[Process] Unhandled rejection:', error);
});

client.login(token);
