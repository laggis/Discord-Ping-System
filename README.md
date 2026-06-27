# PenguinHosting Combined Role / Ping Panel

This version fixes the duplicated Discord role panel problem by using **one message** and **one combined embed** for all ping roles.

## What was happening?

Your old bot was most likely sending a new role panel message every time the bot started or every time the panel command/function ran. Since the old messages were not being edited/deleted, Discord showed multiple role panels:

- one old FiveM panel
- one old Updates panel
- one newer Updates panel
- sometimes old buttons still working too

This version avoids that by saving the panel message ID in `roleData.json`, then editing the same message on startup instead of sending a new one.

It also has optional cleanup for old duplicate panel messages from the bot.

## Install

```bash
npm install
```

Copy the env example:

```bash
copy .env.example .env
```

Add your bot token inside `.env`:

```env
DISCORD_TOKEN=your_bot_token_here
```

## Configure

Open `config.json` and fill in:

```json
"guildId": "YOUR_DISCORD_SERVER_ID",
"channelId": "THE_CHANNEL_WHERE_THE_PANEL_SHOULD_BE",
```

Then fill in each role ID:

```json
"roleId": "YOUR_UPDATE_ROLE_ID"
```

and:

```json
"roleId": "YOUR_FIVEM_ROLE_ID"
```

## Run

```bash
npm start
```

The bot will:

1. Find the existing combined panel if it already exists.
2. Edit it instead of sending a new one.
3. Save the message ID in `roleData.json`.
4. Delete older duplicate PenguinHosting role panel messages if `deleteDuplicatePanels` is `true`.

## Important Discord settings

The bot needs:

- **Manage Roles** permission
- the bot role must be **above** the roles it gives/removes
- Server Members Intent enabled if you want accurate role member counts

Enable Server Members Intent here:

Discord Developer Portal → Your App → Bot → Privileged Gateway Intents → Server Members Intent

## If you do not want auto cleanup

Set this in `config.json`:

```json
"deleteDuplicatePanels": false
```

## Adding more ping roles later

Add another object inside the `roles` array in `config.json`.

Example:

```json
{
  "key": "minecraft",
  "roleId": "MINECRAFT_ROLE_ID",
  "emoji": "⛏️",
  "title": "Minecraft Updates",
  "description": "Få Minecraft-relaterade updates.",
  "quote": "Denna roll är bara för Minecraft updates.",
  "buttonEmoji": "⛏️",
  "getLabel": "Get Minecraft Role",
  "removeLabel": "Remove Minecraft Role",
  "infoTitle": "Spamfritt",
  "infoText": "Endast Minecraft-relaterad information.",
  "notes": [
    "Få Minecraft-pings.",
    "Hjälper staff veta vilka som vill ha Minecraft updates.",
    "Ta bort rollen när som helst."
  ]
}
```

Discord allows max 5 button rows per message, so this setup supports up to 5 role categories without changing the code.
