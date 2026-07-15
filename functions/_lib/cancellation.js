const TOKEN_BYTE_LENGTH = 32;
const TOKEN_CHARACTER_LENGTH = 43;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function isCancellationToken(value) {
  return TOKEN_PATTERN.test(String(value || ""));
}

export function generateCancellationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTE_LENGTH));
  const token = bytesToBase64Url(bytes);
  if (token.length !== TOKEN_CHARACTER_LENGTH || !isCancellationToken(token)) {
    throw new Error("Cancellation token generation failed.");
  }
  return token;
}

export async function hashCancellationToken(token) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(token))
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createCancellationSecret() {
  const token = generateCancellationToken();
  const tokenHash = await hashCancellationToken(token);
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
    throw new Error("Cancellation token hashing failed.");
  }
  return { token, tokenHash };
}

export function cancellationPath(token) {
  return `/cancel.html?token=${encodeURIComponent(token)}`;
}
