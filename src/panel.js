'use strict';

const crypto = require('node:crypto');
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  UserSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder,
  TextInputStyle, ModalBuilder, MessageFlags, escapeMarkdown,
} = require('discord.js');
const { casesFor } = require('./storage');
const { statusEmbed, currentCycle, postWinners } = require('./rewards');

function historyEmbed(guildId, user) {
  const results = casesFor(guildId, user.id);
  const lines = results.slice(0, 10).map(record => {
    const kind = record.type === 'ban' ? '🔨 Baneo' : record.type === 'sancion' ? '⛓️ Jail' : '🚨 Exposición';
    const time = Math.floor(new Date(record.createdAt).getTime() / 1000);
    const reason = escapeMarkdown(String(record.reason || 'Sin motivo').slice(0, 130)).replace(/[\r\n]/g, ' ');
    const duration = record.duration ? ` · ${escapeMarkdown(String(record.duration).slice(0, 55))}` : '';
    const link = record.messageUrl ? ` · [Ver aviso](${record.messageUrl})` : '';
    return `**${kind}** · <t:${time}:d>${duration}${link}\n${reason}`;
  });
  return new EmbedBuilder()
    .setColor(0x8B00FF)
    .setTitle(`📋 Historial de ${user.username}`)
    .setDescription(`**Usuario:** <@${user.id}>\n**Registros guardados:** ${results.length}\n\n${lines.length ? lines.join('\n\n') : 'No hay sanciones ni exposiciones registradas desde que se activó el historial.'}`)
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .setFooter({ text: `Blessed Abuse • Últimos ${Math.min(results.length, 10)} registros` });
}

function panelEmbed() {
  return new EmbedBuilder()
    .setColor(0x8B00FF)
    .setTitle('👑 BLESSED ABUSE | PANEL ADMINISTRATIVO')
    .setDescription('Selecciona una función. Solo tú puedes ver este panel.\n\n🔨 **Baneos** · ⛓️ **Sanciones** · 🚨 **Exposiciones**\n📢 **Anuncios** · 🎨 **Embeds**\n📋 **Historial** · 🏆 **Recompensas /tops**')
    .setFooter({ text: 'Blessed Abuse • Acceso exclusivo a los cuatro roles autorizados' });
}

function menuButtons(id) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blessed:panel:ban:${id}`).setLabel('Baneo').setEmoji('🔨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`blessed:panel:sancion:${id}`).setLabel('Sanción').setEmoji('⛓️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`blessed:panel:exponer:${id}`).setLabel('Exponer').setEmoji('🚨').setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blessed:panel:anuncio:${id}`).setLabel('Anuncio').setEmoji('📢').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`blessed:panel:embed:${id}`).setLabel('Embed').setEmoji('🎨').setStyle(ButtonStyle.Primary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blessed:panel:historial:${id}`).setLabel('Historial').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`blessed:panel:recompensas:${id}`).setLabel('Recompensas').setEmoji('🏆').setStyle(ButtonStyle.Success),
  );
  return [row1, row2, row3];
}

function backRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`blessed:panel:volver:${id}`).setLabel('Volver al panel').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
}

function userPick(id, prompt) {
  return {
    content: prompt, embeds: [],
    components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder()
      .setCustomId(`blessed:select:user:${id}`).setPlaceholder('Selecciona un usuario...').setMinValues(1).setMaxValues(1)), backRow(id)],
  };
}

function winnerPick(id, step) {
  const title = { airdrops: '📦 AIRDROPS', kills: '🔫 KILLS', torneos: '🏆 TORNEOS' }[step];
  return {
    content: `🏆 Selecciona el jugador **TOP 1 en ${title}** de la última quincena finalizada.`,
    embeds: [],
    components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder()
      .setCustomId(`blessed:select:winner-${step}:${id}`).setPlaceholder('Seleccionar ganador').setMaxValues(1)), backRow(id)],
  };
}

function addField(id, label, max, style = TextInputStyle.Short, placeholder = null) {
  const item = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(max).setRequired(true);
  if (placeholder) item.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(item);
}

function caseModal(action, id) {
  const modal = new ModalBuilder().setCustomId(`blessed:case:${id}`);
  if (action === 'ban') {
    modal.setTitle('Blessed Abuse • Nuevo baneo').addComponents(
      addField('razon', 'Motivo del baneo', 350, TextInputStyle.Paragraph),
      addField('duracion', 'Duración', 100, TextInputStyle.Short, 'Ej.: 2 días / Permanente'));
  } else if (action === 'sancion') {
    modal.setTitle('Blessed Abuse • Nueva sanción').addComponents(
      addField('razon', 'Motivo de la sanción', 700, TextInputStyle.Paragraph),
      addField('duracion', 'Tiempo de jail', 100, TextInputStyle.Short, 'Ej.: 30 minutos'));
  } else {
    modal.setTitle('Blessed Abuse • Nueva exposición').addComponents(
      addField('server', 'Servidor que expone', 100, TextInputStyle.Short, 'Blessed Abuse'),
      addField('razon', 'Motivo de exposición', 700, TextInputStyle.Paragraph));
  }
  return modal;
}

function initPanel(client, sessions, deps) {
  function newSession(interaction, type = 'panel') {
    const id = crypto.randomUUID();
    const session = {
      id, createdAt: Date.now(), status: 'panel', type,
      userId: interaction.user.id, guildId: interaction.guildId, channelId: interaction.channelId,
    };
    sessions.set(id, session);
    return session;
  }

  function requireSession(interaction, id) {
    const session = sessions.get(id);
    if (!session || session.userId !== interaction.user.id ||
        session.guildId !== interaction.guildId || !deps.isStaff(interaction)) {
      throw new Error('Este panel ha caducado o no tienes uno de los roles autorizados. Abre /panel de nuevo.');
    }
    return session;
  }

  async function open(interaction) {
    const session = newSession(interaction);
    await interaction.reply({ embeds: [panelEmbed()], components: menuButtons(session.id), flags: MessageFlags.Ephemeral });
  }

  async function button(interaction) {
    const [, , action, id] = interaction.customId.split(':');
    const s = requireSession(interaction, id);
    if (action === 'volver') {
      s.status = 'panel'; s.type = 'panel';
      await interaction.update({ content: '', embeds: [panelEmbed()], components: menuButtons(id) });
      return;
    }
    if (s.status === 'sending') throw new Error('Este proceso ya está publicando.');
    if (action === 'historial' || ['ban', 'sancion', 'exponer'].includes(action)) {
      s.action = action; s.status = 'pick-user';
      await interaction.update(userPick(id, action === 'historial'
        ? '📋 Selecciona el usuario cuyo historial quieres consultar.'
        : `Selecciona el usuario para **${action}**.`));
      return;
    }
    if (action === 'embed') {
      Object.assign(s, { type: 'embed', status: 'modal', image: null, thumbnail: null, buttons: [] });
      await interaction.showModal(deps.createModal('embed', id));
      return;
    }
    if (action === 'anuncio') {
      s.status = 'style';
      await interaction.update({ content: '📢 Escoge el estilo de tu anuncio:', embeds: [], components: [
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
          .setCustomId(`blessed:select:style:${id}`).setPlaceholder('Estilo del comunicado').addOptions(
            { label: 'Oficial', value: 'oficial', emoji: '📢' },
            { label: 'Aviso', value: 'aviso', emoji: '⚠️' },
            { label: 'Urgente', value: 'urgente', emoji: '🚨' },
            { label: 'Actualización', value: 'actualizacion', emoji: '🔄' },
          )), backRow(id)],
      });
      return;
    }
    if (action === 'recompensas') {
      s.status = 'reward-menu';
      await interaction.update({ content: '', embeds: [statusEmbed()], components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`blessed:panel:estado:${id}`).setLabel('Actualizar estado').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`blessed:panel:ganadores:${id}`).setLabel('Publicar ganadores').setEmoji('🏆').setStyle(ButtonStyle.Success)),
        backRow(id),
      ] });
      return;
    }
    if (action === 'estado') {
      if (s.status !== 'reward-menu') throw new Error('Abre primero la sección de recompensas.');
      await interaction.update({ embeds: [statusEmbed()] });
      return;
    }
    if (action === 'ganadores') {
      if (s.status !== 'reward-menu') throw new Error('Abre primero la sección de recompensas.');
      if (currentCycle().index < 1) throw new Error('No hay ninguna quincena finalizada todavía.');
      s.status = 'winner-airdrops'; s.winners = {};
      await interaction.update(winnerPick(id, 'airdrops'));
      return;
    }
    if (action === 'winner-confirm') {
      if (s.status !== 'winner-ready' || !s.winners) throw new Error('Primero selecciona los tres ganadores.');
      s.status = 'sending';
      await interaction.deferUpdate();
      try {
        const url = await postWinners(client, s.winners, interaction.user.id);
        sessions.delete(id);
        await interaction.editReply({ content: `✅ Ganadores publicados: ${url}`, embeds: [], components: [] });
      } catch (e) {
        s.status = 'winner-ready';
        await interaction.editReply({ content: `❌ ${e.message}`, components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blessed:panel:winner-confirm:${id}`).setLabel('Reintentar publicación').setStyle(ButtonStyle.Success)),
          backRow(id),
        ] });
      }
      return;
    }
    throw new Error('Acción de panel desconocida.');
  }

  async function select(interaction) {
    const [, , action, id] = interaction.customId.split(':');
    const s = requireSession(interaction, id);
    if (action === 'user') {
      if (s.status !== 'pick-user') throw new Error('Abre primero el selector del panel.');
      s.targetUserId = interaction.values[0];
      if (s.action === 'historial') {
        const user = interaction.users.get(s.targetUserId) || await client.users.fetch(s.targetUserId);
        s.status = 'history-view';
        await interaction.update({ content: '', embeds: [historyEmbed(interaction.guildId, user)], components: [backRow(id)] });
      } else {
        s.status = 'case-modal';
        await interaction.showModal(caseModal(s.action, id));
      }
      return;
    }
    if (action === 'style') {
      if (s.status !== 'style') throw new Error('Abre antes la selección del estilo.');
      Object.assign(s, { style: interaction.values[0], type: 'anuncio', status: 'modal', image: null, thumbnail: null, buttons: [] });
      await interaction.showModal(deps.createModal('anuncio', id));
      return;
    }
    if (action.startsWith('winner-')) {
      const step = action.slice('winner-'.length);
      if (!['airdrops', 'kills', 'torneos'].includes(step) || s.status !== `winner-${step}`) {
        throw new Error('Debes seleccionar los ganadores en el orden indicado.');
      }
      s.winners[step] = interaction.values[0];
      if (step !== 'torneos') {
        const next = step === 'airdrops' ? 'kills' : 'torneos';
        s.status = `winner-${next}`;
        await interaction.update(winnerPick(id, next));
      } else {
        s.status = 'winner-ready';
        await interaction.update({
          content: `🏆 **Confirmar ganadores de la última edición finalizada**\n\n📦 Airdrops: <@${s.winners.airdrops}>\n🔫 Kills: <@${s.winners.kills}>\n🏆 Torneos: <@${s.winners.torneos}>\n\nComprueba que coincidan con los resultados reales de \`/tops\`.`,
          embeds: [], components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`blessed:panel:winner-confirm:${id}`).setLabel('Publicar ganadores').setStyle(ButtonStyle.Success)), backRow(id)],
          allowedMentions: { parse: [] },
        });
      }
      return;
    }
    throw new Error('Selección desconocida.');
  }

  async function caseSubmit(interaction) {
    const id = interaction.customId.slice('blessed:case:'.length);
    const s = requireSession(interaction, id);
    if (s.status !== 'case-modal' || !s.targetUserId) throw new Error('La selección del usuario ha caducado.');
    const user = await client.users.fetch(s.targetUserId);
    const reason = interaction.fields.getTextInputValue('razon').trim();
    const duration = s.action === 'exponer' ? undefined : interaction.fields.getTextInputValue('duracion').trim();
    const server = s.action === 'exponer' ? interaction.fields.getTextInputValue('server').trim() : undefined;
    if (!reason || (duration !== undefined && !duration) || (server !== undefined && !server)) {
      throw new Error('Rellena todos los campos obligatorios.');
    }
    s.status = 'sending';
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const url = s.action === 'exponer'
        ? await deps.publishExposure(interaction, user, 'personalizada', reason, server, null, s.channelId)
        : await deps.publishSanction(interaction, s.action, user, interaction.user, reason, duration,
          process.env.SANCTIONS_CHANNEL_ID?.trim() || s.channelId);
      sessions.delete(id);
      await interaction.editReply(`✅ Publicado correctamente: ${url}`);
    } catch (e) {
      sessions.delete(id);
      throw e;
    }
  }

  return { open, button, select, caseSubmit, historyEmbed };
}

module.exports = { initPanel, historyEmbed };
