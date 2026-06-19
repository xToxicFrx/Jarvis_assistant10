// Registriert die Slash-Commands bei Discord.
// Einmalig (oder nach Änderungen) ausführen:  npm run deploy

import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("pomodoro")
    .setDescription("Startet eine gemeinsame Fokus-Session in diesem Channel.")
    .addIntegerOption((o) => o.setName("arbeit").setDescription("Fokusminuten pro Runde (Standard 25)").setMinValue(1).setMaxValue(120))
    .addIntegerOption((o) => o.setName("pause").setDescription("Pausenminuten (Standard 5)").setMinValue(1).setMaxValue(60))
    .addIntegerOption((o) => o.setName("runden").setDescription("Anzahl Runden (Standard 4)").setMinValue(1).setMaxValue(12)),

  new SlashCommandBuilder().setName("stop").setDescription("Beendet die laufende Session in diesem Channel."),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Zeigt deine Fokus-Statistik.")
    .addUserOption((o) => o.setName("nutzer").setDescription("Statistik einer anderen Person ansehen")),

  new SlashCommandBuilder().setName("leaderboard").setDescription("Zeigt die Fokus-Bestenliste des Servers."),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

try {
  const { CLIENT_ID, GUILD_ID } = process.env;
  if (!CLIENT_ID) throw new Error("CLIENT_ID fehlt in der .env");

  if (GUILD_ID) {
    // Server-spezifisch: erscheint sofort (ideal zum Testen)
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log(`✅ ${commands.length} Befehle auf Server ${GUILD_ID} registriert.`);
  } else {
    // Global: kann bis zu 1 Stunde dauern, bis es überall sichtbar ist
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log(`✅ ${commands.length} Befehle global registriert.`);
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
