import { serverAdvice, type Playbook } from '../../core/advice/playbook';
import type { AdviceUpload } from '../../shared/api';

/** Entries per request: about 150 KB, well under the server's 512 KB. */
const PART = 250;

/**
 * Puts the loaded playbook's advice on the server for "Consider this" (admin only): the advice in
 * our own words and when it applies (serverAdvice). The coaches' words, names and videos never
 * leave this browser. Replaces the book of the same name. Returns how many entries went up.
 */
export async function uploadAdvice(p: Playbook, onProgress?: (done: number, of: number) => void): Promise<number> {
  const entries = serverAdvice(p);
  const book = p.name || 'Playbook';
  const parts = Math.max(1, Math.ceil(entries.length / PART));
  for (let part = 0; part < parts; part++) {
    const body: AdviceUpload = { book, part, parts, entries: entries.slice(part * PART, (part + 1) * PART) };
    const r = await fetch('/api/admin/advice', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const b = (await r.json().catch(() => ({}))) as { message?: string };
      throw new Error(b.message ?? `Upload failed (HTTP ${r.status}).`);
    }
    onProgress?.(part + 1, parts);
  }
  return entries.length;
}
