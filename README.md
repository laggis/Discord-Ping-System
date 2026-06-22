# PenguinHosting Ping Panel Bot

This version upgrades the old reaction-role bot into a cleaner Discord button panel.

## Added in this version

- Replaced reactions with Discord buttons.
- Added `/pingpanel` admin slash commands.
- Added automatic role count sync from Discord.
- Moved all IDs/text/settings into `config.json`.
- Added startup checks for channel, permissions, roles, and role hierarchy.
- Kept the previous WebSocket/network error protection and retry handling.
- Kept PM2 scripts for auto-restart.

## Important change

The bot no longer needs users to react with emojis. Users now click buttons instead.

The old panel messages are reused if `roleData.json` still contains their message IDs. The bot will edit those messages and add buttons to them.

## Install

```bash
npm install
```

Create your `.env` file:

```bash
copy .env.example .env
```

Then edit `.env`:

```env
TOKEN=your_discord_bot_token_here
ENABLE_EXACT_ROLE_COUNTS=true
```

Start the bot:

```bash
npm start
```

## Recommended PM2 setup

```bash
npm install -g pm2
npm run pm2:start
pm2 save
```

View logs:

```bash
npm run pm2:logs
```

Restart:

```bash
npm run pm2:restart
```

## Discord Developer Portal setting

For exact role counts, enable this privileged gateway intent:

```txt
Bot > Privileged Gateway Intents > Server Members Intent
```

If Discord closes the bot with `Used disallowed intents`, either enable **Server Members Intent** or set this in `.env`:

```env
ENABLE_EXACT_ROLE_COUNTS=false
```

The bot will still work with buttons, but role counts may only update from button clicks/cache instead of a full exact sync.

## config.json

Most things are now in `config.json`:

```json
{
  "channelId": "1132030110002847744",
  "logChannelId": "",
  "color": "#0099FF",
  "thumbnailUrl": "https://download.penguinhosting.host/cdn/pingvin.jpeg",
  "dataFile": "roleData.json",
  "exactRoleCounts": true,
  "roleCountSyncIntervalMinutes": 10,
  "roles": {
    "ping": {
      "roleId": "1132077210459717764",
      "emoji": "🔔",
      "buttonLabel": "Toggle Update Ping",
      "title": "PenguinHosting",
      "description": "Text shown in the embed"
    },
    "fivem": {
      "roleId": "761336023476994069",
      "emoji": "🐧",
      "buttonLabel": "Toggle FiveM Role",
      "title": "FiveM roll",
      "description": "Text shown in the embed"
    }
  }
}
```

### Optional log channel

Set `logChannelId` if you want logs when users add/remove roles:

```json
"logChannelId": "YOUR_LOG_CHANNEL_ID"
```

Leave it empty if you do not want logging.

## Admin slash commands

The bot registers one command:

```txt
/pingpanel refresh
```

Refreshes all embeds/buttons.

```txt
/pingpanel sync-counts
```

Syncs counts from Discord and updates the panel.

```txt
/pingpanel set-title role:<role> title:<new title>
```

Changes the embed title and saves it to `config.json`.

```txt
/pingpanel set-description role:<role> description:<new text>
```

Changes the embed description and saves it to `config.json`.

```txt
/pingpanel set-button role:<role> label:<text> emoji:<emoji>
```

Changes the button label and/or emoji.

```txt
/pingpanel set-channel channel:<channel>
```

Moves/creates the panel in another channel and saves the new channel ID.

Users need **Manage Roles** permission to use `/pingpanel`.

## Startup checks

When the bot starts, it prints checks like:

```txt
✅ Token loaded
✅ config.json loaded
✅ Panel channel found
✅ Permission: Send Messages
✅ Permission: Manage Roles
✅ Role found: ping
✅ Bot role above: Update Ping
```

If you see a red `❌`, fix that before troubleshooting anything else.

Most common problem:

```txt
❌ Bot role above: Role Name - move the bot role higher in Server Settings > Roles
```

Discord does not allow a bot to give/remove roles that are above or equal to the bot's highest role.

## PowerShell network test

If you still get Discord WebSocket timeout issues, test this from the Windows server:

```powershell
Test-NetConnection gateway.discord.gg -Port 443
```

You want:

```txt
TcpTestSucceeded : True
```

## Bot permissions

The bot needs at least:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- Manage Roles

For exact counts, it also needs **Server Members Intent** enabled in the Discord Developer Portal.


## v3 role toggle fix

This version fixes the issue where the old reaction buttons could still be clicked but did not add/remove roles.

What changed:

- Buttons are still the main system.
- Legacy reaction add/remove is supported too, so old 🔔 / 🐧 reactions can still add/remove roles during migration.
- On refresh, the bot tries to remove the old reaction controls from the panel messages so users use the new buttons instead.
- The bot now fetches a fresh Discord member before changing roles, so it should correctly remove roles that were added before the upgrade.
- Startup checks now include Manage Messages because that permission is needed to clean old reactions.

After installing, run `/pingpanel refresh` in Discord. If old reactions remain, make sure the bot has **Manage Messages** in that channel, then run `/pingpanel clean-reactions`.

Important Discord Developer Portal settings:

- Enable **Server Members Intent**.
- The bot needs **Manage Roles**.
- The bot role must be above the roles it should add/remove.
- The bot needs **Manage Messages** if you want it to remove old reactions from the old panel messages.

## Added in v6 modern embed version

This version gives the panel a cleaner/fancier Discord look:

- Modern embed author/header with PenguinHosting branding.
- Role emoji in the title.
- Cleaner Swedish descriptions.
- Benefit fields explaining what each role is for.
- Member count shown as a proper embed field.
- Spam-free / no-@everyone note.
- Per-role colors through `role.color` in `config.json`.
- Optional per-role image/banner through `role.imageUrl`.
- Optional per-role thumbnail through `role.thumbnailUrl`.

After installing, run this in Discord to update the old messages:

```txt
/pingpanel refresh
```

### Customize the modern embed

Edit `config.json`. Example role options:

```json
{
  "title": "PenguinHosting Updates",
  "description": "Få viktiga servernyheter, maintenance och driftinfo utan @everyone.",
  "color": "#00AEEF",
  "statusText": "Du styr själv om du vill få pings eller lämna rollen igen.",
  "benefits": [
    "Få ping när vi gör viktiga updates eller maintenance.",
    "Perfekt om du vill följa serverstatus utan @everyone-spam.",
    "Du kan ta bort rollen direkt med remove-knappen."
  ],
  "spamText": "Bara viktiga updates, inte onödiga mass-pings.",
  "footerText": "PenguinHosting Updates • Du kan lämna rollen när som helst",
  "imageUrl": "https://example.com/banner.png",
  "thumbnailUrl": "https://example.com/icon.png"
}
```
