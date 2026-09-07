const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey() {
  const keyStr = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!keyStr) return null;
  
  let buffer;
  // If the key is exactly 64 characters of hex, use it as hex, otherwise hash it to 32 bytes or pad it?
  // User says "represent a 32-byte AES key". Let's assume hex if it's 64 chars, otherwise just use as utf8 (if length 32).
  // Safest is to mandate 64-char hex or 32-char string, or just hash it if we want to be foolproof.
  // "be cryptographically strong, represent a 32-byte AES key"
  if (keyStr.length === 64 && /^[0-9a-fA-F]+$/.test(keyStr)) {
    buffer = Buffer.from(keyStr, 'hex');
  } else if (keyStr.length === 32) {
    buffer = Buffer.from(keyStr, 'utf8');
  } else {
    // Hash it to exactly 32 bytes just to ensure it doesn't crash on invalid length, but log a warning.
    console.warn('SETTINGS_ENCRYPTION_KEY is not a 32-byte string or 64-char hex. Hashing with SHA-256 to 32 bytes.');
    buffer = crypto.createHash('sha256').update(keyStr).digest();
  }
  
  return buffer;
}

function encrypt(text) {
  if (!text) return null;
  const key = getEncryptionKey();
  if (!key) throw new Error('Missing SETTINGS_ENCRYPTION_KEY in environment configuration');
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return JSON.stringify({
    version: 1,
    iv: iv.toString('hex'),
    authTag,
    ciphertext: encrypted
  });
}

function decrypt(envelopeString) {
  if (!envelopeString) return null;
  try {
    const envelope = JSON.parse(envelopeString);
    if (envelope.version !== 1 || !envelope.iv || !envelope.authTag || !envelope.ciphertext) {
      return envelopeString; // It might be an unencrypted string or different format
    }
    
    const key = getEncryptionKey();
    if (!key) throw new Error('Missing SETTINGS_ENCRYPTION_KEY in environment configuration');
    
    const iv = Buffer.from(envelope.iv, 'hex');
    const authTag = Buffer.from(envelope.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(envelope.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    if (error.name === 'SyntaxError') {
      return envelopeString; // Fallback for old unencrypted secrets
    }
    throw new Error('Failed to decrypt settings secret: ' + error.message);
  }
}

module.exports = {
  encrypt,
  decrypt
};
