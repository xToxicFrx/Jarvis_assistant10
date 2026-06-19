// ===== Pomodoro / Study Discord Bot =====
// Gemeinsame Fokus-Sessions in einem Channel: alle, die auf "Beitreten" klicken,
// bekommen am Ende jeder Arbeitsphase ihre Fokusminuten gutgeschrieben.
// Mit Statistiken, Tages-Streak und Bestenliste.

import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { addFocus, getStats, leaderboard } from "./store.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Aktive Sessions pro Channel: channelId -> sessionState
const sessions = new Map();

const ACCENT = 0x9a2a2a;

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Eingeloggt als ${c.user.tag}`);
  c.user.setActivity("/pomodoro · Fokus-Sessions");
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton()) await handleButton(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable() && !interaction.replied) {
      interaction.reply({ content: "⚠️ Da ist etwas schiefgelaufen.", ephemeral: true }).catch(() => {});
    }
  }
});

// ---------- Slash-Commands ----------
async function handleCommand(interaction) {
  switch (interaction.commandName) {
    case "pomodoro": return startPomodoro(interaction);
    case "stop":      return stopPomodoro(interaction);
    case "stats":     return showStats(interaction);
    case "leaderboard": return showLeaderboard(interaction);
  }
}

async function startPomodoro(interaction) {
  const channelId = interaction.channelId;
  if (sessions.has(channelId)) {
    return interaction.reply({ content: "⏳ In diesem Channel läuft bereits eine Session. Mit `/stop` beenden.", ephemeral: true });
  }

  const work = interaction.options.getInteger("arbeit") ?? 25;
  const brk = interaction.options.getInteger("pause") ?? 5;
  const rounds = interaction.options.getInteger("runden") ?? 4;

  const session = {
    channel: interaction.channel,
    work, brk, rounds,
    round: 0,
    participants: new Set([interaction.user.id]),
    timer: null,
  };
  sessions.set(channelId, session);

  const join = new ButtonBuilder().setCustomId("pomo_join").setLabel("Beitreten").setStyle(ButtonStyle.Success).setEmoji("✅");
  const leave = new ButtonBuilder().setCustomId("pomo_leave").setLabel("Verlassen").setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder().addComponents(join, leave);

  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle("🍅 Pomodoro-Session gestartet!")
    .setDescription(`**${rounds} Runden** · ${work} Min Fokus / ${brk} Min Pause\n\nKlickt auf **Beitreten**, um mitzumachen — ihr sammelt Fokusminuten und steigt in der Bestenliste.`)
    .addFields({ name: "Mit dabei", value: `<@${interaction.user.id}>` })
    .setFooter({ text: "Phase 1 beginnt gleich …" });

  await interaction.reply({ embeds: [embed], components: [row] });
  session.message = await interaction.fetchReply();

  runWorkPhase(channelId);
}

function runWorkPhase(channelId) {
  const s = sessions.get(channelId);
  if (!s) return;
  s.round += 1;

  s.channel.send(`▶️ **Runde ${s.round}/${s.rounds} — Fokus!** ${s.work} Minuten konzentriert arbeiten. 🤫`).catch(() => {});

  s.phase = "work";
  s.timer = setTimeout(() => {
    // Fokusminuten gutschreiben
    for (const id of s.participants) addFocus(id, s.work);

    if (s.round >= s.rounds) return finishSession(channelId);

    s.channel.send(`☕ **Pause!** ${s.brk} Minuten durchatmen. Danach geht's weiter.`).catch(() => {});
    s.phase = "break";
    s.timer = setTimeout(() => runWorkPhase(channelId), s.brk * 60_000);
  }, s.work * 60_000);
}

function finishSession(channelId) {
  const s = sessions.get(channelId);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);

  const total = s.work * s.rounds;
  const list = [...s.participants].map((id) => `<@${id}>`).join(", ") || "—";
  const embed = new EmbedBuilder()
    .setColor(0x2c7a3f)
    .setTitle("🎉 Session abgeschlossen!")
    .setDescription(`Stark gemacht! Jede:r hat **${total} Fokusminuten** gesammelt.`)
    .addFields({ name: "Teilnehmer:innen", value: list });

  s.channel.send({ embeds: [embed] }).catch(() => {});
  sessions.delete(channelId);
}

async function stopPomodoro(interaction) {
  const s = sessions.get(interaction.channelId);
  if (!s) return interaction.reply({ content: "Hier läuft gerade keine Session.", ephemeral: true });
  if (s.timer) clearTimeout(s.timer);
  sessions.delete(interaction.channelId);
  return interaction.reply("⏹️ Session beendet. Bis zum nächsten Mal!");
}

// ---------- Buttons (Beitreten / Verlassen) ----------
async function handleButton(interaction) {
  const s = sessions.get(interaction.channelId);
  if (!s) return interaction.reply({ content: "Diese Session ist nicht mehr aktiv.", ephemeral: true });

  if (interaction.customId === "pomo_join") s.participants.add(interaction.user.id);
  if (interaction.customId === "pomo_leave") s.participants.delete(interaction.user.id);

  const list = [...s.participants].map((id) => `<@${id}>`).join(", ") || "—";
  const updated = EmbedBuilder.from(s.message.embeds[0]).setFields({ name: "Mit dabei", value: list });
  await s.message.edit({ embeds: [updated] }).catch(() => {});
  return interaction.reply({
    content: interaction.customId === "pomo_join" ? "✅ Du bist dabei — viel Fokus!" : "Du hast die Session verlassen.",
    ephemeral: true,
  });
}

// ---------- Statistik & Bestenliste ----------
async function showStats(interaction) {
  const target = interaction.options.getUser("nutzer") ?? interaction.user;
  const st = getStats(target.id);
  const embed = new EmbedBuilder()
    .setColor(ACCENT)
    .setTitle(`📊 Statistik — ${target.username}`)
    .addFields(
      { name: "Fokuszeit gesamt", value: formatMinutes(st.minutes), inline: true },
      { name: "Sessions", value: String(st.sessions), inline: true },
      { name: "Streak", value: `🔥 ${st.streak} Tage`, inline: true },
    );
  return interaction.reply({ embeds: [embed] });
}

async function showLeaderboard(interaction) {
  const top = leaderboard(10);
  if (top.length === 0) return interaction.reply("Noch keine Daten — startet mit `/pomodoro` die erste Session! 🍅");

  const medals = ["🥇", "🥈", "🥉"];
  const lines = top.map((u, i) => `${medals[i] ?? `**${i + 1}.**`} <@${u.id}> — ${formatMinutes(u.minutes)} (🔥 ${u.streak})`);
  const embed = new EmbedBuilder()
    .setColor(0xc8852b)
    .setTitle("🏆 Fokus-Bestenliste")
    .setDescription(lines.join("\n"));
  return interaction.reply({ embeds: [embed] });
}

function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

client.login(process.env.DISCORD_TOKEN);
