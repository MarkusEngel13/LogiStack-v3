/**
 * Who is calling. Today: Cloudflare Access, which sits in front of the whole site and passes a
 * signed token (the Cf-Access-Jwt-Assertion header) with the user's email. The Worker checks the
 * signature against Access's public keys, the audience and the expiry - never trusts a plain
 * header. Swapping in another login service later means replacing this one function.
 */

export interface AuthEnv {
  /** Your Zero Trust team domain, e.g. "mariusdinu.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's AUD tag (Access -> Applications -> the app -> Overview). */
  ACCESS_AUD?: string;
  /** Local development only (`wrangler dev`): pretend to be this email. Never set in production. */
  DEV_EMAIL?: string;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

let certs: { at: number; keys: Jwk[] } | null = null;

async function accessKeys(team: string): Promise<Jwk[]> {
  if (certs && Date.now() - certs.at < 60 * 60 * 1000) return certs.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`Access certs: HTTP ${r.status}`);
  const body = (await r.json()) as { keys: Jwk[] };
  certs = { at: Date.now(), keys: body.keys };
  return body.keys;
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const json = (part: string) => JSON.parse(new TextDecoder().decode(b64url(part))) as Record<string, unknown>;

/** The verified email of the caller, or null. */
export async function identify(req: Request, env: AuthEnv): Promise<string | null> {
  // local development: DEV_EMAIL, or another tester via the x-dev-email header (only when DEV_EMAIL is set)
  if (env.DEV_EMAIL) return (req.headers.get('x-dev-email') ?? env.DEV_EMAIL).toLowerCase();
  const token = req.headers.get('cf-access-jwt-assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) return null;
  try {
    const header = json(h);
    const payload = json(p);
    const keys = await accessKeys(env.ACCESS_TEAM_DOMAIN);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== 'RS256') return null;
    const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    return typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}
