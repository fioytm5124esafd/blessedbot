'use strict';

// Persistencia local sin dependencias adicionales. Conserva este directorio al actualizar.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dataDir = path.join(__dirname, 'data');
const filePath = path.join(dataDir, 'state.json');
let state;

function initialState() {
  return { version: 1, cases: [], rewards: { notices: {}, winners: {} } };
}

function getState() {
  if (state) return state;
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(filePath)) return (state = initialState());
  // Un fichero roto no debe hacer perder ni sobreescribir información anterior.
  const loaded = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!loaded || !Array.isArray(loaded.cases) || !loaded.rewards ||
      typeof loaded.rewards.notices !== 'object' || typeof loaded.rewards.winners !== 'object') {
    throw new Error(`Formato de base de datos no válido: ${filePath}`);
  }
  state = loaded;
  return state;
}

function saveState() {
  const data = getState();
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const temp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, filePath);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function addCase(fields) {
  const data = getState();
  const record = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...fields };
  data.cases.push(record);
  saveState();
  return record;
}

function casesFor(guildId, userId) {
  return getState().cases.filter(x => x.guildId === guildId && x.userId === userId).reverse();
}

module.exports = { getState, saveState, addCase, casesFor };
