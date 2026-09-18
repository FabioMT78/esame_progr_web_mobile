const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const immobili = require('./immobili-service');
const repository = require('../repositories/immobili-repository');

const storageRoot = path.join(__dirname, '..', '..', 'storage', 'immobili');

const imageTypes = {
  'image/jpeg': {
    extension: 'jpg',
    valid(buffer) {
      return buffer.length >= 3
        && buffer[0] === 0xff
        && buffer[1] === 0xd8
        && buffer[2] === 0xff;
    }
  },
  'image/png': {
    extension: 'png',
    valid(buffer) {
      const signature = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
      ]);
      return buffer.length >= signature.length
        && buffer.subarray(0, signature.length).equals(signature);
    }
  },
  'image/webp': {
    extension: 'webp',
    valid(buffer) {
      return buffer.length >= 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP';
    }
  }
};

function inputError(status, message) {
  return Object.assign(new Error(message), { status });
}

function localStoredImagePath(url) {
  const prefix = '/uploads/immobili/';
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;

  const relative = url.slice(prefix.length);
  const resolved = path.resolve(storageRoot, relative);
  const root = path.resolve(storageRoot);

  if (!resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

function previewPath(filePath) {
  const extension = path.extname(filePath);
  return `${filePath.slice(0, -extension.length)}.preview.webp`;
}

function previewUrl(url) {
  const extensionIndex = typeof url === 'string' ? url.lastIndexOf('.') : -1;
  const slashIndex = typeof url === 'string' ? url.lastIndexOf('/') : -1;
  if (extensionIndex <= slashIndex) return null;
  return `${url.slice(0, extensionIndex)}.preview.webp`;
}

async function unlinkIfPresent(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function removePreviousLocalImage(url) {
  const filePath = localStoredImagePath(url);
  if (!filePath) return;

  try {
    await Promise.all([
      unlinkIfPresent(filePath),
      unlinkIfPresent(previewPath(filePath))
    ]);
  } catch (error) {
    console.warn('Impossibile eliminare la vecchia immagine immobile:', error);
  }
}

function validateImage(contentType, body, allowedTypes) {
  const mime = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (!allowedTypes.has(mime)) {
    throw inputError(
      415,
      allowedTypes.size === 1
        ? 'La preview deve essere in formato WebP.'
        : 'Formato foto non supportato. Usa JPG, PNG o WebP.'
    );
  }

  const definition = imageTypes[mime];
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw inputError(400, 'La foto inviata è vuota.');
  }
  if (!definition.valid(body)) {
    throw inputError(400, 'Il contenuto del file non corrisponde al formato dichiarato.');
  }

  return { mime, definition };
}

async function replace(immobileId, proprietarioId, contentType, body) {
  const immobile = await immobili.get(immobileId, proprietarioId);
  const { definition } = validateImage(
    contentType,
    body,
    new Set(Object.keys(imageTypes))
  );

  const ownerDirectory = path.join(storageRoot, String(proprietarioId));
  await fs.mkdir(ownerDirectory, { recursive: true });

  const filename = `${immobileId}-${crypto.randomUUID()}.${definition.extension}`;
  const filePath = path.join(ownerDirectory, filename);
  const publicUrl = `/uploads/immobili/${proprietarioId}/${filename}`;

  await fs.writeFile(filePath, body, { flag: 'wx' });

  try {
    const updated = await repository.updateImageUrl(
      immobileId,
      publicUrl,
      proprietarioId
    );
    if (!updated) {
      throw inputError(404, 'Immobile non trovato.');
    }
  } catch (error) {
    await fs.unlink(filePath).catch(() => {});
    throw error;
  }

  await removePreviousLocalImage(immobile.immagineUrl);
  return { immagineUrl: publicUrl };
}

async function replacePreview(immobileId, proprietarioId, contentType, body) {
  const immobile = await immobili.get(immobileId, proprietarioId);
  validateImage(contentType, body, new Set(['image/webp']));

  const fullPath = localStoredImagePath(immobile.immagineUrl);
  const publicPreviewUrl = previewUrl(immobile.immagineUrl);
  if (!fullPath || !publicPreviewUrl) {
    throw inputError(409, 'Salva prima la foto principale dell’immobile.');
  }

  const filePath = previewPath(fullPath);
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, body, { flag: 'wx' });

  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }

  return { immaginePreviewUrl: publicPreviewUrl };
}

module.exports = { replace, replacePreview };
