'use strict';

const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, escapeMarkdown } = require('discord.js');
const { timeStamp, httpsUrl } = require('./config');

const reasons = Object.freeze({
  programas: 'Se ha registrado una infracción confirmada por **uso de programas externos no permitidos en FiveM.**',
  screenshare: 'Un usuario **rehusó compartir su Screen-Share** durante una revisión.',
});
const styles = Object.freeze({
  oficial: { title: '📢 Comunicado oficial', color: 0x00B7FF },
  aviso: { title: '⚠️ Aviso importante', color: 0x8B00FF },
  urgente: { title: '🚨 Comunicado urgente', color: 0xE500FF },
  actualizacion: { title: '🔄 Actualización', color: 0xA34CFF },
});

function footer(botUser, title) {
  const iconURL = [process.env.BLESSED_ICON_URL].find(httpsUrl)
    || botUser.displayAvatarURL({ size: 64 });
  return { text: `${title} • ${timeStamp()}`, iconURL };
}

function exposePost(botUser, usuario, motivo, detalle, miniatura, server) {
  const text = motivo === 'personalizada'
    ? `Se ha registrado una infracción: **${escapeMarkdown(detalle.trim()).replace(/\n/g, ' ')}**`
    : reasons[motivo];
  if (!text) throw new Error('Motivo de exposición no reconocido.');
  const embed = new EmbedBuilder()
    .setColor(0xE500FF)
    .setTitle('🚨 Nuevo usuario exposeado')
    .setDescription(`${text}\n\n**👤 Usuario**\n**Nombre:** ${escapeMarkdown(usuario.username)}\n**ID de Discord:** \`${usuario.id}\`\n**Ping:** <@${usuario.id}>`)
    .setFooter(footer(botUser, `Subido por 🛡️ ${server || 'Blessed Abuse'}`));
  const files = [];
  if (miniatura) {
    files.push(new AttachmentBuilder(miniatura.url, { name: miniatura.name }));
    embed.setThumbnail(`attachment://${miniatura.name}`);
  } else {
    embed.setThumbnail(usuario.displayAvatarURL({ size: 256 }));
  }
  return { embeds: [embed], files, allowedMentions: { parse: [], users: [usuario.id] } };
}

// Estilo de los avisos de sanción, inspirado en los ejemplos facilitados.
function sanctionsAppearance(botUser) {
  const brand = 'Blessed Abuse';
  const iconURL = httpsUrl(process.env.SANCTIONS_ICON_URL)
    ? process.env.SANCTIONS_ICON_URL
    : [process.env.BLESSED_ICON_URL].find(httpsUrl)
      || botUser.displayAvatarURL({ size: 128 });
  const thumbnailURL = httpsUrl(process.env.SANCTIONS_THUMBNAIL_URL)
    ? process.env.SANCTIONS_THUMBNAIL_URL
    : iconURL;
  return { brand, iconURL, thumbnailURL };
}

function codeBox(input) {
  // Evita romper el bloque de código con backticks escritos por el staff.
  const value = String(input).trim().replace(/`/g, 'ˋ').replace(/@/g, '＠');
  return `\`\`\`\n${value}\n\`\`\``;
}

function sanctionPost(botUser, type, user, moderator, reason, duration) {
  if (!['ban', 'sancion'].includes(type)) throw new Error('Tipo de aviso desconocido.');
  const { brand, iconURL, thumbnailURL } = sanctionsAppearance(botUser);
  const authorName = type === 'ban' ? `Sanciones ${brand} 😎` : `Sistema sanciones ${brand} 😎`;
  const embed = new EmbedBuilder()
    .setColor(type === 'ban' ? 0xB900FF : 0x00B7FF)
    .setAuthor({ name: authorName, iconURL })
    .setThumbnail(thumbnailURL)
    .setFooter({ text: authorName, iconURL })
    .setTimestamp();

  if (type === 'ban') {
    embed.setTitle('│ Nuevo Baneo Aplicado').addFields(
      { name: '• Usuario baneado', value: `<@${user.id}>`, inline: false },
      { name: '• Aplicado Por', value: `<@${moderator.id}>`, inline: true },
      { name: '• Motivo', value: escapeMarkdown(reason.trim().replace(/\s+/g, ' ')), inline: true },
      { name: '• Duración', value: escapeMarkdown(duration.trim().replace(/\s+/g, ' ')), inline: true },
    );
  } else {
    embed.setTitle('│ Nueva Sancion Aplicada').addFields(
      { name: '• Usuario sancionado', value: `<@${user.id}>`, inline: true },
      { name: '• Aplicado Por', value: `<@${moderator.id}>`, inline: true },
      { name: '• Razon', value: codeBox(reason), inline: false },
      { name: '• Sanción', value: codeBox(duration), inline: false },
    );
  }

  // Muestra las menciones sin enviar notificaciones ni permitir @everyone/@here.
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

function hexColor(value) {
  if (!value?.trim()) return 0x00B7FF;
  const input = value.trim().replace(/^#/, '');
  if (!/^[\da-f]{6}$/i.test(input)) throw new Error('El color debe tener formato #RRGGBB, por ejemplo #00B7FF.');
  return parseInt(input, 16);
}

function externalButtons(buttons) {
  if (!buttons?.length) return [];
  const row = new ActionRowBuilder();
  for (const b of buttons) {
    if (!b?.label || !httpsUrl(b.url)) throw new Error('Los botones necesitan texto y una URL HTTPS válida.');
    row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(b.label).setURL(b.url));
  }
  return [row];
}

function prepareImage(embed, files, image, name, method) {
  if (!image) return;
  if (image.file) {
    files.push(new AttachmentBuilder(image.file.url, { name: image.file.name }));
    embed[method](`attachment://${image.file.name}`);
  } else if (image.url) {
    if (!httpsUrl(image.url)) throw new Error('La URL de imagen debe empezar por https:// y ser válida.');
    embed[method](image.url);
  }
}

function draftPost(botUser, draft) {
  const files = [];
  const embed = new EmbedBuilder();
  switch (draft.type) {
    case 'embed':
      embed.setColor(hexColor(draft.color)).setTitle(draft.title).setDescription(draft.description);
      if (draft.footer?.trim()) embed.setFooter({ text: draft.footer });
      prepareImage(embed, files, draft.image, 'imagen', 'setImage');
      prepareImage(embed, files, draft.thumbnail, 'miniatura', 'setThumbnail');
      break;
    case 'anuncio': {
      const style = styles[draft.style];
      if (!style) throw new Error('Tipo de anuncio desconocido.');
      embed.setColor(style.color)
        .setTitle(`${style.title} | ${draft.title}`)
        .setDescription(draft.description)
        .setFooter(footer(botUser, 'Blessed Abuse • Comunicados'));
      prepareImage(embed, files, draft.image, 'imagen', 'setImage');
      break;
    }
    default:
      throw new Error('Tipo de publicación desconocido.');
  }
  return { embeds: [embed], files, components: externalButtons(draft.buttons || []), allowedMentions: { parse: [] } };
}

module.exports = { reasons, styles, exposePost, draftPost, sanctionPost, hexColor, externalButtons };
