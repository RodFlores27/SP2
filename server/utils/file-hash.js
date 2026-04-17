'use strict';

const crypto = require('crypto');

function sha256HexBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return null;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
  sha256HexBuffer,
};
