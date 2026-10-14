/**
 * Input-hardening helpers for the authentication flow.
 */

export const MAX_EMAIL_LEN = 254;
export const MAX_PASSWORD_LEN = 128;

// Characters/sequences used in XML / HTML / XXE / CDATA / script injection.
const INJECTION_PATTERN =
  /[<>"'`&;{}\\]|<!\[CDATA\[|<!DOCTYPE|<!ENTITY|<\?xml|&#|%3C|%3E|javascript:|data:text|\u0000/i;

// Strict RFC-5322-lite email whitelist (no angle brackets, quotes, etc).
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** Remove control characters and trim. */
export function stripControlChars(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

/** True if the value contains XML/HTML/script injection markers. */
export function containsInjection(value) {
  return INJECTION_PATTERN.test(String(value ?? ''));
}

/** Escape for safe display inside markup (defence in depth). */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Validate + normalise login input.
 * @returns {{ok:true,email:string,password:string}|{ok:false,error:string}}
 */
export function validateLoginInput(rawEmail, rawPassword) {
  const email = stripControlChars(rawEmail).toLowerCase();
  const password = String(rawPassword ?? '');

  if (!email || !password) return { ok: false, error: 'Please enter both email and password.' };
  if (email.length > MAX_EMAIL_LEN || password.length > MAX_PASSWORD_LEN) {
    return { ok: false, error: 'Input is too long.' };
  }
  if (containsInjection(email) || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  // Passwords may legitimately contain symbols, but never XML markup or NULs.
  if (/[<>\u0000]|<!\[CDATA\[|<!DOCTYPE|<!ENTITY|<\?xml/i.test(password)) {
    return { ok: false, error: 'Password contains invalid characters.' };
  }
  return { ok: true, email, password };
}

/** SHA-256 hex of a string – used as a non-guessable Firestore doc id. */
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
