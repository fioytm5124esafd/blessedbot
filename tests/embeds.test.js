'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { commands } = require('../src/commands');
const { exposePost, draftPost, hexColor } = require('../src/embeds');
const { httpsUrl, timeStamp, validateImage } = require('../src/config');

const botUser = { displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' };
const user = { id: '123456789012345678', username: 'usuario', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/1.png' };

test('los cuatro comandos son únicos y válidos', () => {
  assert.deepEqual(commands.map(x => x.name), ['exponer','embed','anonimo','anuncio']);
  for (const command of commands) assert.equal(command.toJSON().default_member_permissions, '8192');
});

test('el embed de exposición conserva motivo, usuario, ID y ping', () => {
  const post = exposePost(botUser, user, 'programas', '', null);
  const embed = post.embeds[0].toJSON();
  assert.equal(embed.color, 0xd53b36);
  assert.match(embed.title, /usuario exposeado/);
  assert.match(embed.description, /programas externos/);
  assert.match(embed.description, /123456789012345678/);
  assert.match(embed.description, /<@123456789012345678>/);
  assert.equal(embed.thumbnail.url, user.displayAvatarURL());
});

test('rechazo de screenshare tiene motivo original', () => {
  assert.match(exposePost(botUser, user, 'screenshare', '', null).embeds[0].toJSON().description, /Screen-Share/);
});

test('motivo personalizado no ejecuta menciones masivas', () => {
  const post = exposePost(botUser, user, 'personalizada', '@everyone violación', null);
  assert.match(post.embeds[0].toJSON().description, /@everyone/);
  assert.deepEqual(post.allowedMentions.parse, []);
});

test('anónimo sin nombre del staff en el embed', () => {
  const post = draftPost(botUser, { type: 'anonimo', title: 'Aviso', description: 'Texto de prueba', buttons: [] });
  assert.match(post.embeds[0].toJSON().footer.text, /anónima/);
  assert.doesNotMatch(JSON.stringify(post.embeds[0].toJSON()), /investigador|enviado por/i);
});

test('colores, anuncios y botones externos', () => {
  assert.equal(hexColor('#123ABC'), 0x123abc);
  assert.throws(() => hexColor('rojo'));
  const post = draftPost(botUser, { type: 'anuncio', title: 'Servidor', description: 'Actualizado', style: 'actualizacion', buttons: [{ label: 'Ver cambios', url: 'https://example.com' }] });
  assert.match(post.embeds[0].toJSON().title, /Actualización/);
  assert.equal(post.components.length, 1);
});

test('se validan URLs e imágenes', () => {
  assert.equal(httpsUrl('https://example.com/imagen.png'), true);
  assert.equal(httpsUrl('javascript:alert(1)'), false);
  assert.equal(httpsUrl('http://example.com'), false);
  assert.equal(validateImage({ name: 'icon.png', contentType: 'image/png', size: 1000 }), null);
  assert.ok(validateImage({ name: 'script.exe', contentType: 'application/octet-stream', size: 1000 }));
  assert.match(timeStamp(new Date('2026-10-11T11:49:00Z')), /\d{2}\/\d{2}\/2026/);
});
