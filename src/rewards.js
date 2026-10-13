'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getState, saveState } = require('./storage');

// Primera quincena anunciada: jueves 15/10/2026 a las 00:00 de Madrid.
// Los periodos duran 14 días de calendario local (mantienen la medianoche con DST).
const TZ = 'Europe/Madrid';
const ANCHOR = Date.UTC(2026, 9, 15);
const DAY = 86_400_000;
const PERIOD_DAYS = 14;
const dateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function midnightLocalToUtc(calendarDayMs) {
  const target = new Date(calendarDayMs);
  const y = target.getUTCFullYear(), m = target.getUTCMonth() + 1, d = target.getUTCDate();
  const targetUtc = Date.UTC(y, m - 1, d);
  let guess = targetUtc;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(dateParts.formatToParts(new Date(guess)).map(p => [p.type, p.value]));
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
    guess += targetUtc - asUtc;
  }
  return guess;
}

function boundary(index) {
  return midnightLocalToUtc(ANCHOR + index * PERIOD_DAYS * DAY);
}

function currentCycle(now = Date.now()) {
  if (now < boundary(0)) return { index: -1, startsAt: boundary(0), endsAt: boundary(0) };
  let index = Math.max(0, Math.floor((now - boundary(0)) / (PERIOD_DAYS * DAY)));
  while (now < boundary(index)) index--;
  while (now >= boundary(index + 1)) index++;
  return { index, startsAt: boundary(index), endsAt: boundary(index + 1) };
}

function discordDate(ms) {
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

function statusEmbed(now = Date.now()) {
  const cycle = currentCycle(now);
  const data = getState();
  const active = cycle.index >= 0;
  const done = cycle.index - 1;
  const notice = active ? data.rewards.notices[String(cycle.index)] : null;
  return new EmbedBuilder()
    .setColor(0x8B00FF)
    .setTitle('🏆 Blessed Abuse | Recompensas quincenales')
    .setDescription(active
      ? `**Edición:** #${cycle.index + 1}\n**Inicio:** ${discordDate(cycle.startsAt)}\n**Final:** ${discordDate(cycle.endsAt)}\n\n**Clasificaciones:** 📦 Airdrops · 🔫 Kills · 🏆 Torneos`
      : `**Próximo comienzo:** ${discordDate(boundary(0))}\n\n**Clasificaciones:** Airdrops, Kills y Torneos`)
    .addFields(
      { name: 'Anuncios', value: process.env.REWARDS_CHANNEL_ID
        ? (notice?.open ? 'Inicio de la edición actual publicado.' : 'Canal configurado; pendiente de anuncio.')
        : '⚠️ Falta `REWARDS_CHANNEL_ID` en el archivo `.env`.' },
      { name: 'Ganadores de la edición anterior', value: active && done >= 0
        ? (data.rewards.winners[String(done)] ? '✅ Publicados' : 'Pendientes de registrar por el staff')
        : 'Aún no hay ninguna edición finalizada.' },
    )
    .setFooter({ text: 'Blessed Abuse • Sistema de /tops' });
}

function noticeEmbed(kind, index, isLate = false) {
  const start = boundary(index), end = boundary(index + 1);
  return new EmbedBuilder()
    .setColor(kind === 'open' ? 0x00B7FF : 0xE500FF)
    .setTitle(kind === 'open' ? (isLate ? '🏆 Recompensa quincenal en marcha' : '🏆 ¡Comienza la recompensa quincenal!') : '🏁 ¡Finaliza la recompensa quincenal!')
    .setDescription(kind === 'open'
      ? `**Edición #${index + 1}**\n¡Demuestra quién domina Rolas! Compite por el TOP 1 en las tres categorías.\n\n📦 **Airdrops**\n🔫 **Kills**\n🏆 **Torneos**\n\n**Comienza:** ${discordDate(start)}\n**Termina:** ${discordDate(end)}\n\nLos ganadores se anunciarán tras verificar los resultados de \`/tops\`.`
      : `**Edición #${index + 1}**\nLa competición ha terminado en ${discordDate(end)}.\n\n📦 Airdrops · 🔫 Kills · 🏆 Torneos\n\nEl staff revisará \`/tops\` y publicará los ganadores.`)
    .setFooter({ text: 'Blessed Abuse • Recompensas quincenales' })
    .setTimestamp();
}

function winnersEmbed(index, winners) {
  return new EmbedBuilder()
    .setColor(0xB900FF)
    .setTitle('🏆 Blessed Abuse | Ganadores quincenales')
    .setDescription(`**Edición #${index + 1}** (${discordDate(boundary(index))} — ${discordDate(boundary(index + 1))})\n\n📦 **TOP 1 AIRDROPS:** <@${winners.airdrops}>\n🔫 **TOP 1 KILLS:** <@${winners.kills}>\n🏆 **TOP 1 TORNEOS:** <@${winners.torneos}>\n\n¡Enhorabuena a los ganadores!`)
    .setFooter({ text: 'Blessed Abuse • Resultados confirmados por el staff' })
    .setTimestamp();
}

async function destination(client) {
  const id = process.env.REWARDS_CHANNEL_ID?.trim();
  if (!id) throw new Error('Configura `REWARDS_CHANNEL_ID` en tu .env para publicar las recompensas.');
  const channel = await client.channels.fetch(id);
  if (!channel || !channel.guild || !channel.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('El canal de recompensas no existe o no acepta mensajes.');
  }
  if (process.env.GUILD_ID && channel.guildId !== process.env.GUILD_ID.trim()) {
    throw new Error('El canal de recompensas debe pertenecer al servidor GUILD_ID.');
  }
  const member = channel.guild.members.me || await channel.guild.members.fetchMe();
  if (!channel.permissionsFor(member)?.has([
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
  ])) throw new Error('Faltan permisos de ver canal, enviar mensajes o insertar enlaces en el canal de recompensas.');
  return channel;
}

let polling = false;
async function pollRewards(client, now = Date.now()) {
  if (polling || !process.env.REWARDS_CHANNEL_ID?.trim()) return;
  polling = true;
  try {
    const cycle = currentCycle(now);
    if (cycle.index < 0) return;
    const db = getState();
    // No emitir mensajes de ediciones pasadas después de un reinicio prolongado.
    const previous = cycle.index - 1;
    if (previous >= 0 && now - cycle.startsAt <= DAY && !db.rewards.notices[String(previous)]?.close) {
      const channel = await destination(client);
      const msg = await channel.send({ embeds: [noticeEmbed('close', previous)], allowedMentions: { parse: [] } });
      db.rewards.notices[String(previous)] ||= {};
      db.rewards.notices[String(previous)].close = msg.id;
      saveState();
    }
    if (!db.rewards.notices[String(cycle.index)]?.open) {
      const channel = await destination(client);
      const msg = await channel.send({ embeds: [noticeEmbed('open', cycle.index, now - cycle.startsAt > 20 * 60_000)], allowedMentions: { parse: [] } });
      db.rewards.notices[String(cycle.index)] ||= {};
      db.rewards.notices[String(cycle.index)].open = msg.id;
      saveState();
    }
  } finally { polling = false; }
}

let timer;
function startScheduler(client) {
  if (timer) return;
  void pollRewards(client).catch(e => console.error('❌ Recompensas:', e.message));
  timer = setInterval(() => void pollRewards(client).catch(e => console.error('❌ Recompensas:', e.message)), 60_000);
}

let publishingWinner = false;
async function postWinners(client, winners, byUserId) {
  if (publishingWinner) throw new Error('Ya se está publicando un anuncio de ganadores.');
  publishingWinner = true;
  try {
  const cycle = currentCycle();
  const index = cycle.index - 1;
  if (index < 0) throw new Error('Todavía no ha terminado ninguna edición de /tops.');
  const db = getState();
  if (db.rewards.winners[String(index)]) throw new Error('Los ganadores de esta edición ya se han publicado.');
  if (!['airdrops', 'kills', 'torneos'].every(k => /^\d{17,20}$/.test(winners[k] || ''))) {
    throw new Error('Indica los tres usuarios ganadores.');
  }
  const channel = await destination(client);
  const message = await channel.send({ embeds: [winnersEmbed(index, winners)], allowedMentions: { parse: [] } });
  db.rewards.winners[String(index)] = { ...winners, byUserId, messageId: message.id, postedAt: new Date().toISOString() };
  saveState();
  return message.url;
  } finally { publishingWinner = false; }
}

module.exports = { currentCycle, boundary, statusEmbed, startScheduler, pollRewards, postWinners, winnersEmbed };
