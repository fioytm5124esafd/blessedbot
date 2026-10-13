'use strict';

const { SlashCommandBuilder, ChannelType } = require('discord.js');

function staffCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDMPermission(false)
    // Restringidos por defecto en Discord. Concede acceso solo a los 4 roles
    // desde Ajustes del servidor > Integraciones > Blessed Abuse.
    // main.js también los verifica antes de ejecutar cualquier acción.
    .setDefaultMemberPermissions(null);
}

const commands = [
  staffCommand('exponer', 'Publica un usuario exposeado con el embed oficial de Blessed Abuse.')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario de Discord').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo de la exposición').setRequired(true).addChoices(
      { name: 'Uso de programas externos en FiveM', value: 'programas' },
      { name: 'Rehusó compartir Screen-Share', value: 'screenshare' },
      { name: 'Infracción personalizada', value: 'personalizada' },
    ))
    .addStringOption(o =>
      o.setName('server')
        .setDescription('Nombre del servidor que realiza la exposición')
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption(o => o.setName('detalle').setDescription('Obligatorio si el motivo es personalizado').setMaxLength(700))
    .addAttachmentOption(o => o.setName('miniatura').setDescription('Imagen a la derecha (si no, avatar del usuario)')),

  // Solo publican avisos visuales: no ejecutan sanciones reales en Discord.
  staffCommand('ban', 'Publica un aviso de baneo; NO banea a nadie en Discord.')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario que aparecerá en el aviso').setRequired(true))
    .addStringOption(o => o.setName('motivo').setDescription('Motivo del baneo').setRequired(true).setMaxLength(350))
    .addStringOption(o => o.setName('duracion').setDescription('Ejemplo: 2 días o Permanente').setRequired(true).setMaxLength(100))
    .addUserOption(o => o.setName('aplicado_por').setDescription('Staff responsable (por defecto, tú)'))
    .addChannelOption(o => o.setName('canal').setDescription('Canal donde publicar el aviso').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  staffCommand('sancion', 'Publica un aviso de sanción; NO sanciona a nadie en Discord.')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario que aparecerá en el aviso').setRequired(true))
    .addStringOption(o => o.setName('razon').setDescription('Razón de la sanción').setRequired(true).setMaxLength(700))
    .addStringOption(o => o.setName('sancion').setDescription('Tiempo de sanción, por ejemplo: 30 minutos').setRequired(true).setMaxLength(100))
    .addUserOption(o => o.setName('aplicado_por').setDescription('Staff responsable (por defecto, tú)'))
    .addChannelOption(o => o.setName('canal').setDescription('Canal donde publicar el aviso').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  staffCommand('embed', 'Crea un embed personalizado; previsualízalo y publícalo.')
    .addChannelOption(o => o.setName('canal').setDescription('Canal de publicación (por defecto, este canal)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addAttachmentOption(o => o.setName('imagen').setDescription('Imagen grande debajo del texto'))
    .addAttachmentOption(o => o.setName('miniatura').setDescription('Imagen pequeña a la derecha'))
    .addStringOption(o => o.setName('boton_1_texto').setDescription('Texto del botón de enlace 1').setMaxLength(80))
    .addStringOption(o => o.setName('boton_1_url').setDescription('URL HTTPS del botón 1'))
    .addStringOption(o => o.setName('boton_2_texto').setDescription('Texto del botón de enlace 2').setMaxLength(80))
    .addStringOption(o => o.setName('boton_2_url').setDescription('URL HTTPS del botón 2')),

  staffCommand('anuncio', 'Publica un anuncio oficial de Blessed Abuse.')
    .addStringOption(o => o.setName('tipo').setDescription('Estilo del anuncio').setRequired(true).addChoices(
      { name: 'Oficial · azul eléctrico', value: 'oficial' },
      { name: 'Aviso · morado', value: 'aviso' },
      { name: 'Urgente · fucsia', value: 'urgente' },
      { name: 'Actualización · violeta', value: 'actualizacion' },
    ))
    .addChannelOption(o => o.setName('canal').setDescription('Canal de publicación').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addAttachmentOption(o => o.setName('imagen').setDescription('Imagen opcional'))
    .addStringOption(o => o.setName('boton_texto').setDescription('Texto de un botón opcional').setMaxLength(80))
    .addStringOption(o => o.setName('boton_url').setDescription('Enlace HTTPS al que llevará el botón')),

  staffCommand('panel', 'Abre el panel privado de administración de Blessed Abuse.'),

  staffCommand('historial', 'Consulta el historial registrado de sanciones y exposiciones.')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario del que quieres ver el historial').setRequired(true)),

  staffCommand('recompensas', 'Gestiona las recompensas quincenales de /tops.')
    .addSubcommand(o => o.setName('estado').setDescription('Consulta fechas y estado de la edición actual.'))
    .addSubcommand(o => o.setName('ganadores').setDescription('Publica los TOP 1 de la última edición finalizada.')
      .addUserOption(u => u.setName('airdrops').setDescription('Ganador de Airdrops').setRequired(true))
      .addUserOption(u => u.setName('kills').setDescription('Ganador de Kills').setRequired(true))
      .addUserOption(u => u.setName('torneos').setDescription('Ganador de Torneos').setRequired(true))),
];

module.exports = { commands };
