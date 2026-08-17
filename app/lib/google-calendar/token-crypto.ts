function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getEncryptionKey() {
  const encodedKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encodedKey) {
    throw new Error("Clé de chiffrement Google absente.");
  }

  const keyBytes = base64ToBytes(encodedKey);
  if (keyBytes.byteLength !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY doit contenir exactement 32 octets.");
  }

  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptGoogleToken(token: string) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );

  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptGoogleToken(encryptedToken: string) {
  const [version, encodedIv, encodedCiphertext] = encryptedToken.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext) {
    throw new Error("Format de jeton Google invalide.");
  }

  const key = await getEncryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encodedIv) },
    key,
    base64ToBytes(encodedCiphertext),
  );

  return new TextDecoder().decode(plaintext);
}
