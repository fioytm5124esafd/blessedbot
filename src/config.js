'use strict';

require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('PEGA_AQUI')) throw new Error(`Falta ${name} en el archivo .env`);
  return value;
}

function timeStamp(now = new Date()) {
  const configZone = process.env.TIME_ZONE?.trim() || 'Europe/Madrid';
  let date;
  try {
    date = new Intl.DateTimeFormat('es-ES', {
      timeZone: configZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  } catch {
    date = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
  }
  const obj = Object.fromEntries(date.formatToParts(now).map(p => [p.type, p.value]));
  return `${obj.day}/${obj.month}/${obj.year} ${obj.hour}:${obj.minute}`;
}

function httpsUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

function validateImage(attachment) {
  if (!attachment) return null;
  const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const acceptedExt = /\.(png|jpe?g|webp|gif)$/i;
  if (attachment.size > 8 * 1024 * 1024 ||
      !acceptedExt.test(attachment.name || '') ||
      (attachment.contentType && !acceptedTypes.includes(attachment.contentType))) {
    return 'La imagen debe ser PNG, JPG, WEBP o GIF y no superar 8 MB.';
  }
  return null;
}

function attachmentFile(attachment, basename) {
  if (!attachment) return null;
  const ext = attachment.name.match(/\.(png|jpe?g|webp|gif)$/i)?.[1]?.toLowerCase() || 'png';
  return { name: `${basename}.${ext}`, url: attachment.url };
}

module.exports = { requireEnv, timeStamp, httpsUrl, validateImage, attachmentFile };
