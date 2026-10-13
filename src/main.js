'use strict';

const crypto = require('node:crypto');
const {
  Client, Events, GatewayIntentBits, PermissionFlagsBits,
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { requireEnv, httpsUrl, validateImage, attachmentFile } = require('./config');
const { exposePost, draftPost, sanctionPost } = require('./embeds');
const { addCase, getState } = require('./storage');
const { statusEmbed, postWinners, startScheduler } = require('./rewards');
const { initPanel, historyEmbed } = require('./panel');

const token = requireEnv('BOT_TOKEN');
// GuildMessages es necesario para recibir las publicaciones del webhook.
// MessageContent no es necesario para identificar el webhook y mencionar roles.
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const sessions = new Map();
const TEN_MINUTES = 10 * 60_000;
const secretGuild = process.env.GUILD_ID?.trim();

// ÚNICOS roles autorizados para usar /exponer, /ban, /sancion, /embed y /anuncio.
// Ni siquiera un administrador sin uno de estos roles pasa esta comprobación.
const AUTHORIZED_COMMAND_ROLES = new Set([
  '1542224671158706176',
  '1145104319687958548',
  '1542218495280812062',
  '1542202831644131358',
]);

// Configuración de eventos (adaptación integrada del ejemplo de discord.py).
const EVENTS_CHANNEL_ID = '1555739448283627671';
const RA_EVENTS_ROLE_ID = '1556634761785638982';
const BLESSED_ROLE_ID = '1542203222536618085';
const ROLAS_WEBHOOK_ID = '1556625703896875079';

function isStaff(interaction) {
  if (!interaction.inGuild() || (secretGuild && interaction.guildId !== secretGuild)) return false;
  const roles = interaction.member?.roles;
  // En guilds cacheados Discord.js devuelve GuildMember; en otros, una lista de IDs.
  if (roles?.cache) return [...AUTHORIZED_COMMAND_ROLES].some(id => roles.cache.has(id));
  if (Array.isArray(roles)) return roles.some(id => AUTHORIZED_COMMAND_ROLES.has(id));
  return false;
}

async function handleRolasEvent(message) {
  // No responder a mensajes normales, otros webhooks, ni otros canales.
  if (message.channelId !== EVENTS_CHANNEL_ID || message.webhookId !== ROLAS_WEBHOOK_ID) return;
  if (!message.guild) return;

  console.log('🎉 ¡EVENTO DE ROLAS.ES DETECTADO!');
  console.log(`Mensaje: ${message.id}${message.content ? ` • ${message.content}` : ''}`);

  // Se comprueba la existencia real de ambos roles, como en el ejemplo original.
  const raEvents = message.guild.roles.cache.get(RA_EVENTS_ROLE_ID)
    || await message.guild.roles.fetch(RA_EVENTS_ROLE_ID).catch(() => null);
  const blessed = message.guild.roles.cache.get(BLESSED_ROLE_ID)
    || await message.guild.roles.fetch(BLESSED_ROLE_ID).catch(() => null);
  if (!raEvents) {
    console.error('❌ No encuentro el rol RA Events');
    return;
  }
  if (!blessed) {
    console.error('❌ No encuentro el rol Blessed');
    return;
  }

  // Solo se permiten esas 2 menciones: nunca @everyone o @here.
  await message.channel.send({
    content: `${raEvents} ${blessed}`,
    allowedMentions: { parse: [], roles: [RA_EVENTS_ROLE_ID, BLESSED_ROLE_ID] },
  });
  console.log('🔔 @RA Events + @Blessed mencionados');
}

function cleanExpired() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > TEN_MINUTES && s.status !== 'sending') sessions.delete(id);
  }
}

function field(name, label, style, required, maxLength, placeholder) {
  const box = new TextInputBuilder()
    .setCustomId(name).setLabel(label).setStyle(style)
    .setRequired(required).setMaxLength(maxLength);
  if (placeholder) box.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(box);
}

function createModal(type, sessionId) {
  const modal = new ModalBuilder().setCustomId(`blessed:modal:${sessionId}`);
  if (type === 'embed') {
    modal.setTitle('Blessed Abuse • Embeds').addComponents(
      field('titulo', 'Título', TextInputStyle.Short, true, 180, 'Título del embed'),
      field('contenido', 'Descripción', TextInputStyle.Paragraph, true, 3400, 'Escribe tu mensaje. Puedes usar **negrita**.'),
      field('color', 'Color HEX (opcional)', TextInputStyle.Short, false, 7, '#00B7FF'),
      field('pie', 'Texto del pie (opcional)', TextInputStyle.Short, false, 250, 'Blessed Abuse'),
      field('imagen_url', 'URL HTTPS de imagen (opcional)', TextInputStyle.Short, false, 1000, 'https://...'),
    );
  } else if (type === 'anuncio') {
    modal.setTitle('Blessed Abuse • Comunicado').addComponents(
      field('titulo', 'Título del anuncio', TextInputStyle.Short, true, 170, 'Ejemplo: Cambios en la comunidad'),
      field('contenido', 'Contenido del anuncio', TextInputStyle.Paragraph, true, 3400, 'Escribe aquí el comunicado completo'),
      field('imagen_url', 'URL HTTPS de imagen (opcional)', TextInputStyle.Short, false, 1000, 'https://...'),
    );
  }
  return modal;
}

function checkedButton(label, url) {
  const name = label?.trim();
  const link = url?.trim();
  if (!name && !link) return null;
  if (!name || !link) throw new Error('Para añadir un botón tienes que rellenar su texto y su URL.');
  if (name.length > 80 || link.length > 512 || !httpsUrl(link)) throw new Error('El botón debe tener texto de hasta 80 caracteres y una URL HTTPS válida de hasta 512 caracteres.');
  return { label: name, url: link };
}

function makeSession(interaction) {
  const type = interaction.commandName;
  const opts = interaction.options;
  const image = opts.getAttachment('imagen');
  const miniatura = type === 'embed' ? opts.getAttachment('miniatura') : null;
  for (const att of [image, miniatura]) {
    const error = validateImage(att);
    if (error) throw new Error(error);
  }
  const chosenChannel = opts.getChannel('canal') || interaction.channel;
  if (!chosenChannel) throw new Error('No se ha encontrado el canal.');
  const id = crypto.randomUUID();
  const buttons = [];
  if (type === 'embed') {
    for (const n of [1, 2]) {
      const b = checkedButton(opts.getString(`boton_${n}_texto`), opts.getString(`boton_${n}_url`));
      if (b) buttons.push(b);
    }
  } else if (type === 'anuncio') {
    const b = checkedButton(opts.getString('boton_texto'), opts.getString('boton_url'));
    if (b) buttons.push(b);
  }
  return {
    id, type, createdAt: Date.now(), status: 'modal',
    userId: interaction.user.id, guildId: interaction.guildId, channelId: chosenChannel.id,
    style: type === 'anuncio' ? opts.getString('tipo', true) : undefined,
    image: image ? { file: attachmentFile(image, `blessed-${id.slice(0, 8)}-imagen`) } : null,
    thumbnail: miniatura ? { file: attachmentFile(miniatura, `blessed-${id.slice(0, 8)}-miniatura`) } : null,
    buttons,
  };
}

function previewButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blessed:publish:${id}`).setLabel('Publicar').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`blessed:cancel:${id}`).setLabel('Cancelar').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
  );
}

async function resolveDestination(guildId, channelId, needsFiles = false) {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased() || typeof channel.send !== 'function' || channel.guildId !== guildId || !channel.permissionsFor) {
    throw new Error('El canal de destino no existe, no es de texto o pertenece a otro servidor.');
  }
  const me = channel.guild.members.me || await channel.guild.members.fetchMe();
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new Error('Necesito Ver canal, Enviar mensajes e Insertar enlaces en el canal de destino.');
  }
  if (needsFiles && !perms.has(PermissionFlagsBits.AttachFiles)) {
    throw new Error('Necesito el permiso Adjuntar archivos en el canal de destino.');
  }
  return { channel, perms };
}

// Publicación compartida entre comandos y panel. Registra solo después de enviar.
function recordCase(record) {
  try {
    addCase(record);
    return '';
  } catch (error) {
    console.error('❌ Mensaje enviado pero no se pudo guardar el historial:', error);
    return ' ⚠️ El mensaje se envió, pero no se pudo guardar el historial; revisa los permisos del directorio data/.';
  }
}

async function publishExposure(interaction, user, reason, detail, server, miniatura, originChannelId) {
  const post = exposePost(client.user, user, reason, detail, miniatura, server);
  const targetId = process.env.EXPOSE_CHANNEL_ID?.trim() || originChannelId || interaction.channelId;
  const { channel, perms } = await resolveDestination(interaction.guildId, targetId, !!post.files.length);
  const pingAll = process.env.PING_EVERYONE === 'true' &&
    interaction.memberPermissions?.has(PermissionFlagsBits.MentionEveryone) &&
    perms.has(PermissionFlagsBits.MentionEveryone);
  const sent = await channel.send({
    ...post,
    content: pingAll ? '@everyone' : undefined,
    allowedMentions: { parse: pingAll ? ['everyone'] : [], users: [user.id] },
  });
  const reasonLabel = reason === 'personalizada' ? detail :
    reason === 'programas' ? 'Uso de programas externos no permitidos en FiveM' :
    reason === 'screenshare' ? 'Rehusó compartir Screen-Share' : reason;
  const warning = recordCase({
    guildId: interaction.guildId, type: 'exponer', userId: user.id,
    moderatorId: interaction.user.id, reason: reasonLabel, server,
    channelId: channel.id, messageId: sent.id, messageUrl: sent.url,
  });
  console.log(`[EXPOSICIÓN] Caso publicado en ${channel.id} (${sent.id}).`);
  return `${sent.url}${warning}`;
}

async function handleExpose(interaction) {
  const user = interaction.options.getUser('usuario', true);
  const reason = interaction.options.getString('motivo', true);
  const server = interaction.options.getString('server', true).trim();
  const detail = interaction.options.getString('detalle')?.trim() || '';
  const miniatura = interaction.options.getAttachment('miniatura');
  if (reason === 'personalizada' && !detail) throw new Error('Para «Infracción personalizada», rellena el campo detalle.');
  const validation = validateImage(miniatura);
  if (validation) throw new Error(validation);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const url = await publishExposure(interaction, user, reason, detail, server,
    attachmentFile(miniatura, 'blessed-miniatura'), interaction.channelId);
  await interaction.editReply(`✅ Exposición publicada: ${url}`);
}

// Solo avisa: /ban y /sancion NO ejecutan ban() ni timeout() reales.
async function publishSanction(interaction, type, user, moderator, reason, duration, originChannelId) {
  const channelId = originChannelId || process.env.SANCTIONS_CHANNEL_ID?.trim() || interaction.channelId;
  const { channel } = await resolveDestination(interaction.guildId, channelId);
  const sent = await channel.send(sanctionPost(client.user, type, user, moderator, reason, duration));
  const warning = recordCase({
    guildId: interaction.guildId, type, userId: user.id,
    moderatorId: moderator.id, executedById: interaction.user.id,
    reason, duration, channelId: channel.id, messageId: sent.id, messageUrl: sent.url,
  });
  console.log(`[${type.toUpperCase()} - SOLO EMBED] Publicado en ${channel.id} (${sent.id}).`);
  return `${sent.url}${warning}`;
}

async function handleSanction(interaction) {
  const type = interaction.commandName;
  const user = interaction.options.getUser('usuario', true);
  const moderator = interaction.options.getUser('aplicado_por') || interaction.user;
  const reason = interaction.options.getString(type === 'ban' ? 'motivo' : 'razon', true).trim();
  const duration = interaction.options.getString(type === 'ban' ? 'duracion' : 'jail', true).trim();
  if (!reason || !duration) throw new Error('El motivo y la duración no pueden estar vacíos.');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const channelId = interaction.options.getChannel('canal')?.id ||
    process.env.SANCTIONS_CHANNEL_ID?.trim() || interaction.channelId;
  const url = await publishSanction(interaction, type, user, moderator, reason, duration, channelId);
  await interaction.editReply(`✅ Aviso publicado (solo embed, sin sanción real): ${url}`);
}

const panel = initPanel(client, sessions, {
  isStaff,
  createModal,
  publishExposure,
  publishSanction,
});

async function handleRewardsCommand(interaction) {
  const sub = interaction.options.getSubcommand(true);
  if (sub === 'estado') {
    await interaction.reply({ embeds: [statusEmbed()], flags: MessageFlags.Ephemeral });
    return;
  }
  if (sub !== 'ganadores') throw new Error('Subcomando de recompensas desconocido.');
  const winners = {
    airdrops: interaction.options.getUser('airdrops', true).id,
    kills: interaction.options.getUser('kills', true).id,
    torneos: interaction.options.getUser('torneos', true).id,
  };
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const url = await postWinners(client, winners, interaction.user.id);
  await interaction.editReply(`✅ Ganadores publicados: ${url}`);
}

async function handleSlash(interaction) {
  if (!['exponer', 'embed', 'anuncio', 'ban', 'sancion', 'panel', 'historial', 'recompensas'].includes(interaction.commandName)) return;
  if (!isStaff(interaction)) throw new Error('No tienes uno de los 4 roles autorizados para usar los comandos de Blessed Abuse.');
  if (interaction.commandName === 'panel') return panel.open(interaction);
  if (interaction.commandName === 'recompensas') return handleRewardsCommand(interaction);
  if (interaction.commandName === 'historial') {
    const user = interaction.options.getUser('usuario', true);
    return interaction.reply({ embeds: [historyEmbed(interaction.guildId, user)], flags: MessageFlags.Ephemeral });
  }
  if (interaction.commandName === 'exponer') return handleExpose(interaction);
  if (['ban', 'sancion'].includes(interaction.commandName)) return handleSanction(interaction);
  const session = makeSession(interaction);
  sessions.set(session.id, session);
  try {
    await interaction.showModal(createModal(session.type, session.id));
  } catch (e) {
    sessions.delete(session.id);
    throw e;
  }
}

async function handleModal(interaction) {
  const id = interaction.customId.slice('blessed:modal:'.length);
  const session = sessions.get(id);
  if (!session || session.status !== 'modal' || session.userId !== interaction.user.id || session.guildId !== interaction.guildId || !isStaff(interaction)) {
    throw new Error('Este formulario ha caducado o no tienes permiso. Ejecuta el comando de nuevo.');
  }
  const val = key => interaction.fields.getTextInputValue(key).trim();
  session.title = val('titulo');
  session.description = val('contenido');
  if (session.type === 'embed') {
    session.color = val('color');
    session.footer = val('pie');
  }
  const url = val('imagen_url');
  if (url && !httpsUrl(url)) throw new Error('La URL de la imagen debe ser HTTPS válida.');
  if (!session.image && url) session.image = { url };
  const preview = draftPost(client.user, session);
  session.status = 'preview';
  await interaction.reply({
    content: '👁️ **Previsualización privada:** solo tú ves este mensaje. Pulsa **Publicar** para enviarlo al canal.',
    ...preview,
    components: [previewButtons(id), ...preview.components],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleButton(interaction) {
  const [, action, id] = interaction.customId.split(':');
  const session = sessions.get(id);
  if (!session || session.status !== 'preview' || session.userId !== interaction.user.id ||
    session.guildId !== interaction.guildId || !isStaff(interaction)) {
    throw new Error('Esta previsualización ha caducado o no tienes permiso. Ejecuta el comando de nuevo.');
  }
  if (action === 'cancel') {
    sessions.delete(id);
    await interaction.update({ content: '❎ Publicación cancelada. No se ha enviado ningún mensaje.', embeds: [], components: [], attachments: [] });
    return;
  }
  if (action !== 'publish') return;
  session.status = 'sending';
  await interaction.deferUpdate();
  try {
    const post = draftPost(client.user, session);
    const { channel } = await resolveDestination(session.guildId, session.channelId, !!post.files.length);
    const sent = await channel.send(post);
    sessions.delete(id);
    console.log(`[${session.type.toUpperCase()}] Publicación enviada a ${channel.id} (${sent.id}).`);
    await interaction.editReply({
      content: `✅ Publicación enviada: ${sent.url}`,
      embeds: [], components: [], attachments: [],
    });
  } catch (e) {
    session.status = 'preview';
    await interaction.editReply({
      content: `❌ ${e.message}\nPuedes volver a pulsar Publicar después de corregir los permisos o cancelar.`,
    });
  }
}

async function reportError(interaction, error) {
  console.error('❌ Error en interacción:', error);
  const message = `❌ ${error.message || 'No he podido completar esta acción.'}`.slice(0, 1900);
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  } catch (e) {
    console.error('No se pudo enviar el error al usuario:', e.message);
  }
}

client.once(Events.ClientReady, bot => {
  getState(); // Valida la base de datos antes de iniciar tareas programadas.
  startScheduler(client);
  console.log(`✅ ${bot.user.tag} conectado. Comandos: /exponer, /embed, /anuncio, /ban, /sancion, /panel, /historial y /recompensas`);
});

// No afecta a los comandos: la escucha es automática y usa el mismo cliente.
client.on(Events.MessageCreate, async message => {
  try {
    await handleRolasEvent(message);
  } catch (error) {
    console.error('❌ Error al anunciar evento de Rolas.es:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  cleanExpired();
  try {
    if (interaction.isChatInputCommand()) await handleSlash(interaction);
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('blessed:modal:')) await handleModal(interaction);
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('blessed:case:')) await panel.caseSubmit(interaction);
    else if ((interaction.isUserSelectMenu() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('blessed:select:')) await panel.select(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('blessed:panel:')) await panel.button(interaction);
    else if (interaction.isButton() && interaction.customId.startsWith('blessed:')) await handleButton(interaction);
  } catch (e) {
    await reportError(interaction, e);
  }
});

client.login(token).catch(e => {
  console.error('❌ No se pudo iniciar el bot. Revisa BOT_TOKEN:', e.message);
  process.exitCode = 1;
});
