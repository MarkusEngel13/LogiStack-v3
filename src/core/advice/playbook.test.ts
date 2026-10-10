import { describe, expect, test } from 'vitest';
import { matchAdvice, parsePlaybook, serverAdvice, type PlaybookEntry } from './playbook';
import type { SpotTags } from './spot';

const entry = (id: string, when: PlaybookEntry['when'], strength = 1): PlaybookEntry => ({ id, title: id, advice: 'do it', when, strength, sources: [] });

const riverFacingBig: SpotTags = {
  street: ['river'], pot: ['srp'], players: ['hu'], position: ['oop'], role: ['caller'], decision: ['facing-bet'], size: ['big'],
  line: ['they-cbet', 'turn-checked-through'], board: ['static', 'blank'], villain: ['rec'], status: [], depth: ['100bb'],
};

describe('matching advice to a moment', () => {
  test('every named dimension must fit; values inside one dimension are alternatives', () => {
    const fits = entry('fits', { street: ['river'], size: ['big', 'overbet'], villain: ['rec'] });
    const wrongStreet = entry('turn', { street: ['turn'], size: ['big'] });
    const wrongVillain = entry('reg', { street: ['river'], villain: ['reg'] });
    const statusNeeded = entry('stuck', { street: ['river'], status: ['stuck'] });
    expect(matchAdvice([fits, wrongStreet, wrongVillain, statusNeeded], riverFacingBig).map((m) => m.entry.id)).toEqual(['fits']);
  });

  test('the more specific advice comes first, then the better sourced', () => {
    const broad = entry('broad', { street: ['river'] }, 9);
    const specific = entry('specific', { street: ['river'], decision: ['facing-bet'], line: ['turn-checked-through'] }, 1);
    const sameButStronger = entry('stronger', { street: ['river'], decision: ['facing-bet'], line: ['turn-checked-through'] }, 5);
    expect(matchAdvice([broad, specific, sameButStronger], riverFacingBig).map((m) => m.entry.id)).toEqual(['stronger', 'specific', 'broad']);
  });

  test('general advice (no moment) never shows in a hand', () => {
    expect(matchAdvice([{ ...entry('general', undefined), when: undefined }], riverFacingBig)).toEqual([]);
  });

  test('only the advice in our words goes to the server: no quotes, names, videos or caveats', () => {
    const full: PlaybookEntry = {
      ...entry('a', { street: ['river'] }, 4),
      title: 'Fold the river to a rec',
      advice: 'Fold one pair to a big river bet from a rec.',
      read: 'They rarely bluff the river.',
      said: 'they never have it',
      caveat: 'Unless he is stuck.',
      motive: 'logic',
      sources: [{ claim: 'c', video: 'v', url: 'https://www.youtube.com/watch?v=v', speaker: 'Coach', quote: 'a quote' }],
    };
    const named = { ...entry('b', { street: ['river'] }), advice: 'As Charlie does, call down.' };
    const general = { ...entry('c', undefined), when: undefined };
    const up = serverAdvice({ format: 'logistack.playbook/1', name: 'X', built: '', entries: [full, named, general] });
    expect(up).toEqual([{ id: 'a', title: 'Fold the river to a rec', advice: 'Fold one pair to a big river bet from a rec.', when: { street: ['river'] }, strength: 4 }]);
    // the server matches its copy the same way
    expect(matchAdvice(up, riverFacingBig).map((m) => m.entry.id)).toEqual(['a']);
  });

  test('a loaded file must be a playbook', () => {
    expect(() => parsePlaybook({ entries: [] })).toThrow(/playbook/);
    const p = parsePlaybook({ format: 'logistack.playbook/1', name: 'HHP', built: 'x', entries: [entry('a', { street: ['flop'] }), { broken: true }] });
    expect(p.entries.map((e) => e.id)).toEqual(['a']);
  });
});
