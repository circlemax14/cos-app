/**
 * Expiry of a JWT in ms since epoch, or null when it is not a JWT or carries no
 * `exp`. Pure (no React Native imports) so node --test can load it.
 */
export function jwtExpiryMs(jwt: string): number | null {
  try {
    // base64url → base64, padded (atob rejects the - and _ alphabet).
    let b64 = (jwt.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const exp = JSON.parse(atob(b64))?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}
