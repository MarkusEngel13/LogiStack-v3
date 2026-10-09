import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { identify } from './auth';

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function setup() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'k1' }] }))));
  const sign = async (payload: Record<string, unknown>, key = pair.privateKey) => {
    const h = enc({ alg: 'RS256', kid: 'k1' });
    const p = enc(payload);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`));
    return `${h}.${p}.${b64u(sig)}`;
  };
  return { sign };
}

const req = (token?: string) => new Request('https://x/api/me', { headers: token ? { 'cf-access-jwt-assertion': token } : {} });
const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const good = () => ({ aud: [AUD], email: 'Marius@Example.com', exp: Math.floor(Date.now() / 1000) + 600, iss: `https://${TEAM}` });

// one key pair for the file: auth.ts caches Access's keys for an hour, as in production
let sign: Awaited<ReturnType<typeof setup>>['sign'];
beforeAll(async () => {
  sign = (await setup()).sign;
});
afterAll(() => vi.unstubAllGlobals());

describe('the Cloudflare Access token', () => {

  test('a valid token gives the email', async () => {
    expect(await identify(req(await sign(good())), env)).toBe('marius@example.com');
  });

  test('no token, wrong audience, expired, wrong issuer or forged: nobody', async () => {
    expect(await identify(req(), env)).toBeNull();
    expect(await identify(req(await sign({ ...good(), aud: ['other-app'] })), env)).toBeNull();
    expect(await identify(req(await sign({ ...good(), exp: 1 })), env)).toBeNull();
    expect(await identify(req(await sign({ ...good(), iss: 'https://evil.example' })), env)).toBeNull();
    const other = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign'])) as CryptoKeyPair;
    expect(await identify(req(await sign(good(), other.privateKey)), env)).toBeNull();
    // a tampered payload with the old signature
    const t = (await sign(good())).split('.');
    expect(await identify(req(`${t[0]}.${enc({ ...good(), email: 'evil@x.com' })}.${t[2]}`), env)).toBeNull();
  });

  test('not configured: nobody (the site is never open by accident)', async () => {
    expect(await identify(req(await sign(good())), {})).toBeNull();
  });
});
