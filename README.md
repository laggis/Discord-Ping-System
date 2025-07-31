# Discord Role Reaction Bot

En Discord-bot som tilldelar roller baserat på reaktioner på inbäddade meddelanden. Boten sparar antalet reaktioner även om den startas om.

## Funktioner

- Tilldelar roller baserat på reaktioner
- Sparar antalet reaktioner mellan omstarter
- Visar antalet användare med varje roll i inbäddade meddelanden
- Stöder flera roller med olika emojis

## Installation

1. Klona detta repository
2. Installera beroenden med `npm install`
3. Skapa en `.env`-fil med din Discord-bot-token:
   ```
   TOKEN=din_discord_bot_token_här
   ```
4. Starta boten med `npm start`

## Konfiguration

Boten är konfigurerad för att hantera två roller:

1. **Ping-roll** (ID: 1132077210459717764) - Tilldelas när användare reagerar med 🔔
2. **Fivem-roll** (ID: 761336023476994069) - Tilldelas när användare reagerar med 🐧

Båda rollerna visas i kanal med ID 1132030110002847744.

För att ändra konfigurationen, redigera `config`-objektet i `index.js`-filen.

## Bot-behörigheter

Boten behöver följande behörigheter i Discord:

- Läsa meddelanden
- Skicka meddelanden
- Hantera roller
- Läsa meddelandehistorik
- Lägga till reaktioner

## Felsökning

Om boten inte fungerar som förväntat, kontrollera följande:

1. Se till att bot-token är korrekt i `.env`-filen
2. Kontrollera att boten har rätt behörigheter i Discord-servern
3. Verifiera att roll-ID och kanal-ID är korrekta i konfigurationen
4. Kontrollera konsolloggar för eventuella felmeddelanden