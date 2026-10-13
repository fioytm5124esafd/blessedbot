'use strict';

const { REST, Routes } = require('discord.js');
const { requireEnv } = require('./config');
const { commands } = require('./commands');

(async () => {
  const botToken = requireEnv('BOT_TOKEN');
  const clientId = requireEnv('CLIENT_ID');
  const guildId = requireEnv('GUILD_ID');
  const rest = new REST({ version: '10' }).setToken(botToken);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands.map(c => c.toJSON()) });
  console.log('✅ Comandos registrados: /exponer, /embed, /anuncio, /ban, /sancion, /panel, /historial y /recompensas');
})().catch(e => {
  console.error('❌ No se pudieron registrar los comandos:', e);
  process.exitCode = 1;
});
