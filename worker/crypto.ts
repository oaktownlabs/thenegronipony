export async function sha256(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomLease(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function constantTimeTokenMatch(
  candidate: string,
  expected: string,
): Promise<boolean> {
  if (!candidate || !expected) return false;
  const [left, right] = await Promise.all([sha256(candidate), sha256(expected)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
