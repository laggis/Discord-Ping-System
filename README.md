# Discord Role Reaction Bot

A Discord bot that assigns roles based on reactions to embedded messages. The bot saves reaction counts even when restarted.

## Features

- Assigns roles based on reactions
- Saves reaction counts between restarts
- Shows the number of users with each role in embedded messages
- Supports multiple roles with different emojis

## Installation

1. Clone this repository
2. Install dependencies with `npm install`
3. Create a `.env` file with your Discord bot token:
   ```
   TOKEN=your_discord_bot_token_here
   ```
4. Start the bot with `npm start`

## Configuration

The bot is configured to handle two roles:

1. **Ping role** (ID: 1132077210459717764) - Assigned when users react with 🔔
2. **Fivem role** (ID: 761336023476994069) - Assigned when users react with 🐧

Both roles are displayed in channel with ID 1132030110002847744.

To change the configuration, edit the `config` object in the `index.js` file.

## Bot Permissions

The bot needs the following permissions in Discord:

- Read messages
- Send messages
- Manage roles
- Read message history
- Add reactions

## Troubleshooting

If the bot doesn't work as expected, check the following:

1. Make sure the bot token is correct in the `.env` file
2. Check that the bot has the right permissions in the Discord server
3. Verify that role IDs and channel ID are correct in the configuration
4. Check console logs for any error messages