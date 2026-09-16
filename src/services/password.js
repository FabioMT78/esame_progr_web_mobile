const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const deriveKey = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await deriveKey(password, salt, 64);
  return `scrypt$v1$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  const parts = typeof encoded === 'string' ? encoded.split('$') : [];
  const [algorithm, version, salt, hash] = parts;
  if (parts.length !== 4 || algorithm !== 'scrypt' || version !== 'v1'
      || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash)) {
    return false;
  }
  const actual = await deriveKey(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

module.exports = { hashPassword, verifyPassword };
