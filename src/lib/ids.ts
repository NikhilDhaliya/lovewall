// Short, URL-safe random ids (base62). 12 characters ≈ 71 bits: plenty for public ids that must not be guessed.
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function newId(length = 12): string {
  const bytes = new Uint8Array(length * 2);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    // Reject values that would bias the alphabet (248 = 62 * 4).
    if (bytes[i] < 248) out += ALPHABET[bytes[i] % 62];
  }
  return out.length === length ? out : newId(length);
}

export const ID_RE = /^[0-9A-Za-z]{8,32}$/;
