const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

function checkDiscordJsVersion() {
  let installedVersion = 'unknown';

  try {
    installedVersion = require('discord.js/package.json').version;
  } catch (_) {
    // Keep unknown version text below.
  }

  const missing = [];
  if (!GatewayIntentBits) missing.push('GatewayIntentBits');
  if (!ActionRowBuilder) missing.push('ActionRowBuilder');
  if (!ButtonBuilder) missing.push('ButtonBuilder');
  if (!EmbedBuilder) missing.push('EmbedBuilder');
  if (!SlashCommandBuilder) missing.push('SlashCommandBuilder');

  if (missing.length > 0) {
    console.error('\n[Setup error] Wrong discord.js version installed.');
    console.error(`Installed discord.js version: ${installedVersion}`);
    console.error('This bot needs discord.js v14 because it uses buttons, GatewayIntentBits, and slash commands.');
    console.error(`Missing exports: ${missing.join(', ')}`);
    console.error('\nFix it by running this inside the bot folder:');
    console.error('  rmdir /s /q node_modules');
    console.error('  del package-lock.json');
    console.error('  npm install discord.js@14.21.0 dotenv@16.3.1');
    console.error('  npm start\n');
    process.exit(1);
  }
}

checkDiscordJsVersion();

const CONFIG_FILE = path.join(__dirname, 'config.json');
const DEFAULT_CONFIG = {
  channelId: '',
  logChannelId: '',
  color: '#0099FF',
  thumbnailUrl: '',
  dataFile: 'roleData.json',
  exactRoleCounts: false,
  legacyReactionsEnabled: true,
  removeLegacyReactionsOnRefresh: true,
  roleCountSyncIntervalMinutes: 10,
  buttonMode: 'add_remove',
  roles: {}
};

if (!process.env.TOKEN) {
  console.error('Missing TOKEN in .env file. Create .env and add TOKEN=your_discord_bot_token');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function logError(prefix, error) {
  const message = error?.stack || error?.message || String(error);
  console.error(`${prefix} ${message}`);
}

function isTemporaryNetworkError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  return [
    'etimedout',
    'econnreset',
    'econnrefused',
    'enotfound',
    'eai_again',
    'socket_closed',
    'network_error'
  ].includes(code) ||
    message.includes('opening handshake has timed out') ||
    message.includes('handshake has timed out') ||
    message.includes('socket hang up') ||
    message.includes('timed out') ||
    message.includes('network');
}

async function withRetry(label, task, maxAttempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (!isTemporaryNetworkError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delay = attempt * 5000;
      console.warn(`[Retry] ${label} failed (${error.message}). Trying again in ${delay / 1000}s...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

async function runSafely(label, task) {
  try {
    await task();
  } catch (error) {
    logError(`[${label}]`, error);
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error('Missing config.json. Copy config.example.json to config.json and edit it.');
    process.exit(1);
  }

  try {
    const userConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const merged = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      roles: userConfig.roles || {}
    };

    if (!merged.channelId) {
      console.error('Missing channelId in config.json.');
      process.exit(1);
    }

    if (!merged.roles || Object.keys(merged.roles).length === 0) {
      console.error('No roles configured in config.json.');
      process.exit(1);
    }

    return merged;
  } catch (error) {
    logError('[Config load error]', error);
    process.exit(1);
  }
}

let config = loadConfig();
const state = {
  roles: {},
  ignoredReactionRemovals: new Set(),
  exactRoleCountsDisabled: false,
  exactRoleCountWarningShown: false
};

function getDataFilePath() {
  return path.isAbsolute(config.dataFile)
    ? config.dataFile
    : path.join(__dirname, config.dataFile || 'roleData.json');
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('Saved config.json');
  } catch (error) {
    logError('[Config save error]', error);
  }
}

function getRoleState(roleKey) {
  if (!state.roles[roleKey]) {
    state.roles[roleKey] = {
      count: 0,
      messageId: null,
      lastSyncedAt: null
    };
  }

  return state.roles[roleKey];
}

function loadRoleData() {
  const dataFile = getDataFilePath();

  try {
    if (!fs.existsSync(dataFile)) return;

    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

    for (const roleKey in data) {
      if (!config.roles[roleKey]) continue;
      const roleState = getRoleState(roleKey);
      roleState.count = Number(data[roleKey].count || 0);
      roleState.messageId = data[roleKey].messageId || null;
      roleState.lastSyncedAt = data[roleKey].lastSyncedAt || null;
    }

    console.log('Loaded role data:', state.roles);
  } catch (error) {
    logError('[Role data load error]', error);
  }
}

function saveRoleData() {
  try {
    const data = {};

    for (const roleKey in config.roles) {
      const roleState = getRoleState(roleKey);
      data[roleKey] = {
        count: roleState.count,
        messageId: roleState.messageId,
        lastSyncedAt: roleState.lastSyncedAt
      };
    }

    fs.writeFileSync(getDataFilePath(), JSON.stringify(data, null, 2));
  } catch (error) {
    logError('[Role data save error]', error);
  }
}

function updateRoleCountByDelta(roleKey, delta) {
  const roleState = getRoleState(roleKey);
  roleState.count = Math.max(0, Number(roleState.count || 0) + Number(delta || 0));
  roleState.lastSyncedAt = new Date().toISOString();
  saveRoleData();
  return roleState.count;
}

function parseColor(color) {
  if (typeof color === 'number') return color;

  const cleaned = String(color || '#0099FF').replace('#', '').trim();
  const parsed = Number.parseInt(cleaned, 16);
  return Number.isNaN(parsed) ? 0x0099FF : parsed;
}

function isExactRoleCountEnabled() {
  if (state.exactRoleCountsDisabled) {
    return false;
  }

  if (String(process.env.ENABLE_EXACT_ROLE_COUNTS || '').toLowerCase() === 'false') {
    return false;
  }

  return Boolean(config.exactRoleCounts);
}

function isGuildMembersTimeout(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();

  return code.includes('guildmemberstimeout') ||
    message.includes("members didn't arrive in time") ||
    message.includes('guildmemberstimeout') ||
    message.includes('disallowed intents') ||
    message.includes('privileged intent');
}

function disableExactRoleCounts(reason) {
  state.exactRoleCountsDisabled = true;

  if (!state.exactRoleCountWarningShown) {
    state.exactRoleCountWarningShown = true;
    console.warn(`[Role count] Exact role counts disabled for this run: ${reason}`);
    console.warn('This is safe. The bot will keep using saved counts and button add/remove deltas instead.');
    console.warn('To use exact counts again: enable Server Members Intent in Discord Developer Portal and set exactRoleCounts=true in config.json.');
  }
}

function getRoleCountText(roleKey) {
  const roleState = getRoleState(roleKey);
  const count = Number(roleState.count || 0);
  return `${count.toLocaleString('sv-SE')} användare har denna roll`;
}

function getRoleMention(role) {
  return role?.roleId ? `<@&${role.roleId}>` : 'Denna roll';
}

function createRoleEmbed(roleKey) {
  const role = config.roles[roleKey];
  const roleState = getRoleState(roleKey);
  const roleEmoji = role.emoji || '✨';
  const brandName = role.authorName || config.authorName || 'PenguinHosting Role Panel';
  const brandIcon = role.authorIconUrl || config.authorIconUrl || config.thumbnailUrl || null;
  const thumbnail = role.thumbnailUrl || config.thumbnailUrl || null;
  const imageUrl = role.imageUrl || null;
  const roleMention = getRoleMention(role);
  const countText = getRoleCountText(roleKey);
  const benefits = Array.isArray(role.benefits) && role.benefits.length > 0
    ? role.benefits
    : [
        'Klicka på **Get** för att få rollen.',
        'Klicka på **Remove** om du inte vill ha den längre.',
        'Du kan ändra dig när som helst.'
      ];

  const description = [
    role.description || 'Välj om du vill få eller ta bort denna Discord-roll.',
    '',
    `> ${role.statusText || `Rollen du hanterar: ${roleMention}`}`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(parseColor(role.color || config.color || '#0099FF'))
    .setAuthor({ name: brandName, iconURL: brandIcon || undefined })
    .setTitle(`${roleEmoji} ${role.title || roleKey}`)
    .setDescription(description)
    .addFields(
      {
        name: '✨ Vad gör knapparna?',
        value: benefits.map((item) => `• ${item}`).join('\n').slice(0, 1024),
        inline: false
      },
      {
        name: '👥 Medlemmar',
        value: `**${countText}**`,
        inline: true
      },
      {
        name: '🔒 Spamfritt',
        value: role.spamText || 'Ingen @everyone-spam. Bara relevanta pings.',
        inline: true
      }
    )
    .setFooter({
      text: role.footerText || `PenguinHosting • Klicka på en knapp för att uppdatera rollen • ${Number(roleState.count || 0).toLocaleString('sv-SE')} medlemmar`,
      iconURL: brandIcon || undefined
    })
    .setTimestamp(new Date());

  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
}

function createRoleButtons(roleKey) {
  const role = config.roles[roleKey];
  const row = new ActionRowBuilder();
  const mode = role.buttonMode || config.buttonMode || 'add_remove';

  if (mode === 'toggle') {
    const toggleButton = new ButtonBuilder()
      .setCustomId(`role_toggle:${roleKey}`)
      .setLabel(role.buttonLabel || role.title || roleKey)
      .setStyle(ButtonStyle.Primary);

    if (role.emoji) {
      toggleButton.setEmoji(role.emoji);
    }

    return row.addComponents(toggleButton);
  }

  const addButton = new ButtonBuilder()
    .setCustomId(`role_add:${roleKey}`)
    .setLabel(role.addButtonLabel || role.buttonLabel || `Get ${role.title || roleKey}`)
    .setStyle(ButtonStyle.Success);

  const removeButton = new ButtonBuilder()
    .setCustomId(`role_remove:${roleKey}`)
    .setLabel(role.removeButtonLabel || `Remove ${role.title || roleKey}`)
    .setStyle(ButtonStyle.Danger);

  if (role.emoji) {
    addButton.setEmoji(role.emoji);
    removeButton.setEmoji(role.emoji);
  }

  return row.addComponents(addButton, removeButton);
}

async function getPanelChannel() {
  const channel = await withRetry('fetch panel channel', () => client.channels.fetch(config.channelId));

  if (!channel || !channel.isTextBased()) {
    throw new Error(`Channel with ID ${config.channelId} was not found or is not a text channel.`);
  }

  return channel;
}

async function sendLog(guild, message) {
  if (!config.logChannelId) return;

  try {
    const logChannel = await client.channels.fetch(config.logChannelId);
    if (logChannel && logChannel.isTextBased()) {
      await logChannel.send(message);
    }
  } catch (error) {
    logError('[Log channel error]', error);
  }
}

async function fetchDiscordRole(guild, roleKey) {
  const roleConfig = config.roles[roleKey];
  if (!roleConfig) return null;

  return await withRetry(`fetch Discord role ${roleKey}`, () => guild.roles.fetch(roleConfig.roleId));
}

async function syncRoleCount(guild, roleKey, fallbackDelta = null, options = {}) {
  const roleState = getRoleState(roleKey);
  const discordRole = await fetchDiscordRole(guild, roleKey);

  if (!discordRole) {
    console.warn(`[Role count] Missing Discord role for ${roleKey}.`);
    return roleState.count;
  }

  if (isExactRoleCountEnabled()) {
    try {
      if (!options.membersAlreadyFetched) {
        await withRetry('fetch guild members for exact role count', () => guild.members.fetch(), 1);
      }

      const refreshedRole = guild.roles.cache.get(discordRole.id) || discordRole;
      roleState.count = refreshedRole.members.size;
      roleState.lastSyncedAt = new Date().toISOString();
      saveRoleData();
      return roleState.count;
    } catch (error) {
      if (isGuildMembersTimeout(error)) {
        disableExactRoleCounts(error.message || 'Discord did not send the member list in time.');
      } else {
        logError(`[Exact role count failed for ${roleKey}]`, error);
      }
    }
  }

  // Exact counting needs Discord's privileged Server Members Intent.
  // When exact counting is off or Discord times out, do NOT replace the saved count
  // with discordRole.members.size because that cache is often incomplete and can show 0/wrong numbers.
  if (typeof fallbackDelta === 'number') {
    roleState.count = Math.max(0, Number(roleState.count || 0) + fallbackDelta);
    roleState.lastSyncedAt = new Date().toISOString();
    saveRoleData();
  }

  return roleState.count;
}

async function syncAllRoleCounts(guild) {
  const results = [];
  let membersAlreadyFetched = false;

  if (isExactRoleCountEnabled()) {
    try {
      await withRetry('fetch guild members for exact role counts', () => guild.members.fetch(), 1);
      membersAlreadyFetched = true;
    } catch (error) {
      if (isGuildMembersTimeout(error)) {
        disableExactRoleCounts(error.message || 'Discord did not send the member list in time.');
      } else {
        logError('[Exact role count prefetch failed]', error);
      }
    }
  }

  for (const roleKey in config.roles) {
    const count = await syncRoleCount(guild, roleKey, null, { membersAlreadyFetched });
    results.push({ roleKey, count });
  }

  return results;
}

async function updatePanelMessage(channel, guild, roleKey) {
  const roleState = getRoleState(roleKey);
  const embed = createRoleEmbed(roleKey);
  const components = [createRoleButtons(roleKey)];

  if (roleState.messageId) {
    try {
      const message = await withRetry(`fetch ${roleKey} panel message`, () => channel.messages.fetch(roleState.messageId));
      await withRetry(`edit ${roleKey} panel message`, () => message.edit({ embeds: [embed], components }));
      await clearLegacyReactions(message, roleKey);
      console.log(`Updated button panel for ${roleKey}`);
      return message;
    } catch (error) {
      console.warn(`Could not update old ${roleKey} panel message, creating a new one instead.`);
      logError(`[${roleKey} panel warning]`, error);
    }
  }

  const message = await withRetry(`send ${roleKey} panel message`, () => channel.send({ embeds: [embed], components }));
  roleState.messageId = message.id;
  saveRoleData();
  await clearLegacyReactions(message, roleKey);
  console.log(`Created new button panel for ${roleKey}`);
  return message;
}

async function refreshPanel(channel = null, guild = null) {
  const panelChannel = channel || await getPanelChannel();
  const panelGuild = guild || panelChannel.guild;

  await syncAllRoleCounts(panelGuild);

  for (const roleKey in config.roles) {
    await updatePanelMessage(panelChannel, panelGuild, roleKey);
  }

  saveRoleData();
}

function buildSlashCommands() {
  const roleChoices = Object.entries(config.roles).map(([roleKey, role]) => ({
    name: `${role.title || roleKey} (${roleKey})`.slice(0, 100),
    value: roleKey
  }));

  return [
    new SlashCommandBuilder()
      .setName('pingpanel')
      .setDescription('Manage the PenguinHosting ping/role panel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('refresh')
          .setDescription('Refresh all panel embeds and buttons'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('sync-counts')
          .setDescription('Sync role counts from Discord and update the panel'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('clean-reactions')
          .setDescription('Remove old reaction buttons from the panel messages'))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('set-title')
          .setDescription('Change the title for a role panel')
          .addStringOption((option) =>
            option
              .setName('role')
              .setDescription('Which panel role to edit')
              .setRequired(true)
              .addChoices(...roleChoices))
          .addStringOption((option) =>
            option
              .setName('title')
              .setDescription('New embed title')
              .setRequired(true)
              .setMaxLength(256)))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('set-description')
          .setDescription('Change the description for a role panel')
          .addStringOption((option) =>
            option
              .setName('role')
              .setDescription('Which panel role to edit')
              .setRequired(true)
              .addChoices(...roleChoices))
          .addStringOption((option) =>
            option
              .setName('description')
              .setDescription('New embed description')
              .setRequired(true)
              .setMaxLength(4000)))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('set-button')
          .setDescription('Change the button label and/or emoji')
          .addStringOption((option) =>
            option
              .setName('role')
              .setDescription('Which panel role to edit')
              .setRequired(true)
              .addChoices(...roleChoices))
          .addStringOption((option) =>
            option
              .setName('label')
              .setDescription('New add/toggle button label')
              .setRequired(false)
              .setMaxLength(80))
          .addStringOption((option) =>
            option
              .setName('remove-label')
              .setDescription('New remove button label')
              .setRequired(false)
              .setMaxLength(80))
          .addStringOption((option) =>
            option
              .setName('emoji')
              .setDescription('New button emoji')
              .setRequired(false)
              .setMaxLength(50)))
      .addSubcommand((subcommand) =>
        subcommand
          .setName('set-channel')
          .setDescription('Move/create the role panel in another channel')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('The channel where the panel should be posted')
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
      .toJSON()
  ];
}

async function registerSlashCommands(guild) {
  const commands = buildSlashCommands();
  await withRetry('register slash commands', () => guild.commands.set(commands));
  console.log(`Registered slash commands in ${guild.name}`);
}

function memberCanManagePanel(member) {
  return member?.permissions?.has(PermissionFlagsBits.ManageRoles) || member?.permissions?.has(PermissionFlagsBits.Administrator);
}

async function fetchPartialSafely(item, label) {
  if (!item?.partial) return item;

  try {
    return await withRetry(`fetch partial ${label}`, () => item.fetch());
  } catch (error) {
    logError(`[Partial fetch failed: ${label}]`, error);
    return null;
  }
}

function emojiMatches(reactionEmoji, configuredEmoji) {
  if (!reactionEmoji || !configuredEmoji) return false;

  const configured = String(configuredEmoji).trim();
  const reactionName = reactionEmoji.name ? String(reactionEmoji.name).trim() : '';
  const reactionId = reactionEmoji.id ? String(reactionEmoji.id).trim() : '';
  const reactionIdentifier = reactionEmoji.identifier ? String(reactionEmoji.identifier).trim() : '';

  return configured === reactionName ||
    configured === reactionId ||
    configured === reactionIdentifier ||
    configured.includes(reactionId) ||
    configured.includes(reactionName);
}

function messageBelongsToRole(message, roleKey) {
  const roleState = getRoleState(roleKey);
  const roleConfig = config.roles[roleKey] || {};
  const messageIds = new Set();

  if (roleState.messageId) messageIds.add(String(roleState.messageId));
  if (roleConfig.messageId) messageIds.add(String(roleConfig.messageId));

  if (Array.isArray(roleConfig.legacyMessageIds)) {
    for (const id of roleConfig.legacyMessageIds) {
      if (id) messageIds.add(String(id));
    }
  }

  if (messageIds.has(String(message.id))) return true;

  // Fallback for old panels where roleData.json did not keep the message ID.
  const firstEmbed = message.embeds?.[0];
  const embedTitle = firstEmbed?.title || '';
  return Boolean(embedTitle && roleConfig.title && embedTitle.trim() === String(roleConfig.title).trim());
}

function findRoleKeyFromReaction(reaction) {
  const message = reaction.message;

  for (const roleKey in config.roles) {
    const roleConfig = config.roles[roleKey];
    if (!emojiMatches(reaction.emoji, roleConfig.emoji)) continue;
    if (!messageBelongsToRole(message, roleKey)) continue;
    return roleKey;
  }

  return null;
}

async function fetchFreshMember(guild, userId, fallbackMember = null) {
  try {
    return await withRetry(`fetch member ${userId}`, () => guild.members.fetch(userId));
  } catch (error) {
    logError(`[Member fetch failed: ${userId}]`, error);
    return fallbackMember;
  }
}

async function setMemberRole(guild, member, roleKey, shouldHaveRole, actorTag = 'unknown user', options = {}) {
  const roleConfig = config.roles[roleKey];
  if (!roleConfig) {
    return { ok: false, message: 'This role is not configured anymore.' };
  }

  const discordRole = await fetchDiscordRole(guild, roleKey);
  if (!discordRole) {
    return { ok: false, message: 'I could not find that Discord role. Check config.json.' };
  }

  if (discordRole.managed) {
    return { ok: false, message: `I cannot manage ${discordRole.name} because it is managed by Discord/integration.` };
  }

  const botMember = guild.members.me || await guild.members.fetchMe();
  if (botMember.roles.highest.position <= discordRole.position) {
    return { ok: false, message: `I cannot manage ${discordRole.name} because my bot role is not above that role.` };
  }

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, message: 'I do not have the Manage Roles permission.' };
  }

  if (!member?.roles?.cache) {
    return { ok: false, message: 'I could not read the Discord member/role cache. Make sure Server Members Intent is enabled.' };
  }

  const currentlyHasRole = member.roles.cache.has(discordRole.id);

  if (shouldHaveRole && !currentlyHasRole) {
    await withRetry(`add ${roleKey} role`, () => member.roles.add(discordRole));
    if (options.syncCount !== false) {
      if (options.fastCount) updateRoleCountByDelta(roleKey, 1);
      else await syncRoleCount(guild, roleKey, 1);
    }
    await sendLog(guild, `➕ ${actorTag} added **${discordRole.name}**.`);
    return { ok: true, changed: true, action: 'added', role: discordRole };
  }

  if (!shouldHaveRole && currentlyHasRole) {
    await withRetry(`remove ${roleKey} role`, () => member.roles.remove(discordRole));
    if (options.syncCount !== false) {
      if (options.fastCount) updateRoleCountByDelta(roleKey, -1);
      else await syncRoleCount(guild, roleKey, -1);
    }
    await sendLog(guild, `➖ ${actorTag} removed **${discordRole.name}**.`);
    return { ok: true, changed: true, action: 'removed', role: discordRole };
  }

  if (options.syncCount !== false && !options.fastCount) {
    await syncRoleCount(guild, roleKey);
  }
  return { ok: true, changed: false, action: shouldHaveRole ? 'already_added' : 'already_removed', role: discordRole };
}

async function handleLegacyReaction(reaction, user, shouldHaveRole) {
  if (!config.legacyReactionsEnabled) return;
  if (!reaction || !user || user.bot) return;

  const fetchedReaction = await fetchPartialSafely(reaction, 'reaction');
  if (!fetchedReaction?.message) return;

  const fetchedMessage = await fetchPartialSafely(fetchedReaction.message, 'reaction message');
  if (!fetchedMessage?.guild) return;

  if (!shouldHaveRole && state.ignoredReactionRemovals.has(fetchedMessage.id)) {
    return;
  }

  const roleKey = findRoleKeyFromReaction(fetchedReaction);
  if (!roleKey) return;

  const member = await fetchFreshMember(fetchedMessage.guild, user.id);
  if (!member) return;

  const result = await setMemberRole(fetchedMessage.guild, member, roleKey, shouldHaveRole, user.tag || user.id);
  if (!result.ok) {
    console.warn(`[Legacy reaction] ${result.message}`);
    return;
  }

  await updatePanelMessage(fetchedMessage.channel, fetchedMessage.guild, roleKey);
}

async function clearLegacyReactions(message, roleKey) {
  if (!config.removeLegacyReactionsOnRefresh) return;
  if (!message?.reactions?.cache?.size) return;

  const guild = message.guild;
  const botMember = guild?.members?.me || await guild?.members?.fetchMe?.().catch(() => null);
  const permissions = message.channel?.permissionsFor?.(botMember);

  if (!permissions?.has(PermissionFlagsBits.ManageMessages)) {
    console.warn(`[${roleKey}] Old reactions found, but I cannot remove them without Manage Messages permission.`);
    return;
  }

  state.ignoredReactionRemovals.add(message.id);

  try {
    await withRetry(`remove old reactions for ${roleKey}`, () => message.reactions.removeAll());
    console.log(`Removed old reaction buttons from ${roleKey} panel.`);
  } catch (error) {
    logError(`[Remove old reactions failed for ${roleKey}]`, error);
  } finally {
    // Discord may emit reaction remove events after removeAll(). Ignore those for a little while.
    setTimeout(() => state.ignoredReactionRemovals.delete(message.id), 120000);
  }
}


function parseRoleButtonCustomId(customId) {
  const [type, roleKey] = String(customId || '').split(':');

  if (type === 'role_add') return { action: 'add', roleKey };
  if (type === 'role_remove') return { action: 'remove', roleKey };
  if (type === 'role_toggle') return { action: 'toggle', roleKey };

  return { action: null, roleKey: null };
}

async function answerInteraction(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content);
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch (error) {
    logError('[Interaction reply failed]', error);
  }
}

async function handleRoleButton(interaction) {
  const { action, roleKey } = parseRoleButtonCustomId(interaction.customId);
  const roleConfig = config.roles[roleKey];

  if (!roleConfig || !action) {
    await interaction.reply({ content: '❌ This button is not configured anymore.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const guild = interaction.guild;
    const freshMember = await fetchFreshMember(guild, interaction.user.id, interaction.member);

    if (!freshMember) {
      await answerInteraction(interaction, '❌ I could not read your Discord member data. Make sure **Server Members Intent** is enabled for the bot.');
      return;
    }

    const discordRole = await fetchDiscordRole(guild, roleKey);
    if (!discordRole) {
      await answerInteraction(interaction, '❌ I could not find that Discord role. Check `config.json`.');
      return;
    }

    let shouldHaveRole;
    if (action === 'add') shouldHaveRole = true;
    else if (action === 'remove') shouldHaveRole = false;
    else shouldHaveRole = !freshMember.roles.cache.has(discordRole.id);

    // Important: use fastCount here. Exact member count syncing can be slow and made Discord show
    // "bot is thinking..." forever after the role was already added/removed.
    const result = await setMemberRole(guild, freshMember, roleKey, shouldHaveRole, interaction.user.tag, {
      fastCount: true
    });

    if (!result.ok) {
      await answerInteraction(interaction, `❌ ${result.message}`);
      return;
    }

    if (result.action === 'added') {
      await answerInteraction(interaction, `✅ Added **${discordRole.name}** to you.`);
    } else if (result.action === 'removed') {
      await answerInteraction(interaction, `✅ Removed **${discordRole.name}** from you.`);
    } else if (result.action === 'already_added') {
      await answerInteraction(interaction, `✅ You already have **${discordRole.name}**.`);
    } else {
      await answerInteraction(interaction, `✅ You already do not have **${discordRole.name}**.`);
    }

    // Update the panel after answering the interaction, so users do not get stuck on "thinking".
    setTimeout(() => {
      runSafely('button panel update', async () => {
        const channel = interaction.channel?.id === config.channelId ? interaction.channel : await getPanelChannel();
        await updatePanelMessage(channel, guild, roleKey);
      });
    }, 100);
  } catch (error) {
    logError('[Role button error]', error);
    await answerInteraction(interaction, '❌ Something went wrong while changing your role. Please try again or contact staff.');
  }
}

async function handlePingPanelCommand(interaction) {
  if (!memberCanManagePanel(interaction.member)) {
    await interaction.reply({ content: '❌ You need **Manage Roles** permission to use this command.', ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  await interaction.deferReply({ ephemeral: true });

  if (subcommand === 'refresh') {
    const channel = await getPanelChannel();
    await refreshPanel(channel, interaction.guild);
    await interaction.editReply('✅ Panel refreshed with buttons.');
    return;
  }

  if (subcommand === 'sync-counts') {
    const channel = await getPanelChannel();
    const results = await syncAllRoleCounts(interaction.guild);

    for (const roleKey in config.roles) {
      await updatePanelMessage(channel, interaction.guild, roleKey);
    }

    const summary = results.map((item) => `**${item.roleKey}:** ${item.count}`).join('\n');
    await interaction.editReply(`✅ Counts synced.\n${summary}`);
    return;
  }

  if (subcommand === 'clean-reactions') {
    const channel = await getPanelChannel();

    for (const roleKey in config.roles) {
      const roleState = getRoleState(roleKey);
      if (!roleState.messageId) continue;

      try {
        const message = await channel.messages.fetch(roleState.messageId);
        await clearLegacyReactions(message, roleKey);
      } catch (error) {
        logError(`[Clean reactions failed for ${roleKey}]`, error);
      }
    }

    await interaction.editReply('✅ Old reactions cleaned from the panel messages.');
    return;
  }

  if (subcommand === 'set-title') {
    const roleKey = interaction.options.getString('role', true);
    const title = interaction.options.getString('title', true);
    config.roles[roleKey].title = title;
    saveConfig();
    await updatePanelMessage(await getPanelChannel(), interaction.guild, roleKey);
    await registerSlashCommands(interaction.guild);
    await interaction.editReply(`✅ Updated title for **${roleKey}**.`);
    return;
  }

  if (subcommand === 'set-description') {
    const roleKey = interaction.options.getString('role', true);
    const description = interaction.options.getString('description', true);
    config.roles[roleKey].description = description;
    saveConfig();
    await updatePanelMessage(await getPanelChannel(), interaction.guild, roleKey);
    await interaction.editReply(`✅ Updated description for **${roleKey}**.`);
    return;
  }

  if (subcommand === 'set-button') {
    const roleKey = interaction.options.getString('role', true);
    const label = interaction.options.getString('label');
    const removeLabel = interaction.options.getString('remove-label');
    const emoji = interaction.options.getString('emoji');

    if (!label && !removeLabel && !emoji) {
      await interaction.editReply('❌ Add at least `label`, `remove-label`, or `emoji`.');
      return;
    }

    if (label) {
      config.roles[roleKey].buttonLabel = label;
      config.roles[roleKey].addButtonLabel = label;
    }
    if (removeLabel) config.roles[roleKey].removeButtonLabel = removeLabel;
    if (emoji) config.roles[roleKey].emoji = emoji;

    saveConfig();
    await updatePanelMessage(await getPanelChannel(), interaction.guild, roleKey);
    await interaction.editReply(`✅ Updated button for **${roleKey}**.`);
    return;
  }

  if (subcommand === 'set-channel') {
    const channel = interaction.options.getChannel('channel', true);
    config.channelId = channel.id;

    for (const roleKey in config.roles) {
      getRoleState(roleKey).messageId = null;
    }

    saveConfig();
    saveRoleData();
    await refreshPanel(channel, interaction.guild);
    await interaction.editReply(`✅ Panel moved/created in ${channel}.`);
    return;
  }

  await interaction.editReply('❌ Unknown subcommand.');
}

async function handleInteraction(interaction) {
  if (interaction.isButton() && (interaction.customId.startsWith('role_toggle:') || interaction.customId.startsWith('role_add:') || interaction.customId.startsWith('role_remove:'))) {
    await handleRoleButton(interaction);
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'pingpanel') {
    await handlePingPanelCommand(interaction);
  }
}

function startupStatus(name, ok, details = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${name}${details ? ` - ${details}` : ''}`);
}

async function runStartupChecks(guild, channel) {
  console.log('\n--- Startup checks ---');
  startupStatus('Token loaded', Boolean(process.env.TOKEN));
  startupStatus('config.json loaded', Boolean(config));
  startupStatus('Panel channel found', Boolean(channel), `#${channel.name}`);

  const botMember = guild.members.me || await guild.members.fetchMe();
  startupStatus('Bot member found', Boolean(botMember), botMember?.user?.tag || '');

  const channelPermissions = channel.permissionsFor(botMember);
  const neededChannelPermissions = [
    ['View Channel', PermissionFlagsBits.ViewChannel],
    ['Send Messages', PermissionFlagsBits.SendMessages],
    ['Embed Links', PermissionFlagsBits.EmbedLinks],
    ['Read Message History', PermissionFlagsBits.ReadMessageHistory],
    ['Manage Messages', PermissionFlagsBits.ManageMessages]
  ];

  for (const [name, permission] of neededChannelPermissions) {
    startupStatus(`Permission: ${name}`, channelPermissions?.has(permission));
  }

  startupStatus('Permission: Manage Roles', botMember.permissions.has(PermissionFlagsBits.ManageRoles));

  for (const roleKey in config.roles) {
    const roleConfig = config.roles[roleKey];
    const discordRole = await guild.roles.fetch(roleConfig.roleId).catch(() => null);

    startupStatus(`Role found: ${roleKey}`, Boolean(discordRole), discordRole ? discordRole.name : roleConfig.roleId);

    if (discordRole) {
      const canManage = botMember.roles.highest.position > discordRole.position && !discordRole.managed;
      startupStatus(`Bot role above: ${discordRole.name}`, canManage, canManage ? '' : 'move the bot role higher in Server Settings > Roles, or choose a non-managed role');
    }
  }

  startupStatus('Button mode', true, config.buttonMode || 'add_remove');
  startupStatus('Legacy reaction support', Boolean(config.legacyReactionsEnabled), config.legacyReactionsEnabled ? 'enabled' : 'disabled');
  startupStatus('Remove old reactions on refresh', Boolean(config.removeLegacyReactionsOnRefresh), config.removeLegacyReactionsOnRefresh ? 'enabled' : 'disabled');
  startupStatus('Exact role counts', true, isExactRoleCountEnabled() ? 'enabled - Server Members Intent must be enabled' : 'disabled - using saved counts + add/remove deltas');
  console.log('--- Startup checks done ---\n');
}

function setupErrorProtection() {
  client.on('error', (error) => logError('[Discord client error]', error));
  client.on('warn', (warning) => console.warn('[Discord warning]', warning));
  client.on('debug', (message) => {
    if (message.toLowerCase().includes('heartbeat') || message.toLowerCase().includes('rate limit')) {
      console.log('[Discord debug]', message);
    }
  });

  client.on('shardError', (error, shardId) => {
    logError(`[Discord shard ${shardId} error]`, error);
  });

  client.on('shardDisconnect', (event, shardId) => {
    console.warn(`[Discord shard ${shardId}] Disconnected: ${event.code} ${event.reason || ''}`);
  });

  client.on('shardReconnecting', (shardId) => {
    console.warn(`[Discord shard ${shardId}] Reconnecting...`);
  });

  process.on('unhandledRejection', (error) => {
    logError('[Unhandled promise rejection]', error);
  });

  process.on('uncaughtException', (error) => {
    logError('[Uncaught exception]', error);

    if (isTemporaryNetworkError(error)) {
      console.warn('Temporary network/WebSocket error caught. Keeping bot alive so Discord.js can reconnect.');
      return;
    }

    console.error('Unexpected error caught. Bot will stay alive, but check the log because this may need a code fix.');
  });
}

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions
];

// Needed for exact role counts and for legacy reaction-role support.
if (isExactRoleCountEnabled() || config.legacyReactionsEnabled) {
  intents.push(GatewayIntentBits.GuildMembers);
}

const client = new Client({
  intents,
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember]
});

async function startBot() {
  setupErrorProtection();
  loadRoleData();

  client.once('ready', () => {
    runSafely('ready event', async () => {
      console.log(`Logged in as ${client.user.tag}!`);

      const channel = await getPanelChannel();
      const guild = channel.guild;

      await runStartupChecks(guild, channel);
      await registerSlashCommands(guild);
      await refreshPanel(channel, guild);

      const intervalMinutes = Number(config.roleCountSyncIntervalMinutes || 0);
      if (intervalMinutes > 0) {
        setInterval(() => {
          runSafely('scheduled role count sync', async () => {
            const syncChannel = await getPanelChannel();
            await refreshPanel(syncChannel, syncChannel.guild);
          });
        }, intervalMinutes * 60 * 1000);

        console.log(`Role counts will auto-sync every ${intervalMinutes} minutes.`);
      }
    });
  });

  client.on('interactionCreate', (interaction) => {
    runSafely('interactionCreate', () => handleInteraction(interaction));
  });

  client.on('messageReactionAdd', (reaction, user) => {
    runSafely('messageReactionAdd', () => handleLegacyReaction(reaction, user, true));
  });

  client.on('messageReactionRemove', (reaction, user) => {
    runSafely('messageReactionRemove', () => handleLegacyReaction(reaction, user, false));
  });

  while (true) {
    try {
      await client.login(process.env.TOKEN);
      break;
    } catch (error) {
      logError('[Discord login failed]', error);

      const message = String(error?.message || error || '').toLowerCase();
      if (message.includes('disallowed intents')) {
        console.error('Discord rejected the Server Members Intent. Enable it in the Discord Developer Portal, or set exactRoleCounts=false in config.json / ENABLE_EXACT_ROLE_COUNTS=false in .env.');
      }

      console.warn('Retrying login in 30 seconds...');
      await sleep(30000);
    }
  }
}

startBot();
