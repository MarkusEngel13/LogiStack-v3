import { describe, expect, it } from 'vitest';
import { readSuggestions, readTally, type ShowdownRead } from './reads';
import { typeSettings } from './style';

const read = (tags: string[]): ShowdownRead => ({ id: Math.random().toString(), at: '2026-10-09T20:00:00Z', hand: '72o', tags });

describe('showdown reads', () => {
  it('two reads the same way move a slider one step', () => {
    const s = typeSettings('Reg');
    const out = readSuggestions([read(['calldown']), read(['calldown', 'bluff'])], s);
    const sticky = out.sliders.find((x) => x.slider === 'sticky')!;
    expect(sticky.to).toBe(Math.min(5, Math.round(s.sliders.sticky) + 1));
    // one bluff, the only read on bluffs: still a suggestion
    expect(out.sliders.some((x) => x.slider === 'bluffs')).toBe(true);
  });

  it('reads that disagree cancel out', () => {
    const s = typeSettings('Reg');
    const out = readSuggestions([read(['thin']), read(['slowplay'])], s);
    expect(out.sliders.find((x) => x.slider === 'postAggr')).toBeUndefined();
    expect(readTally([read(['thin']), read(['thin'])])).toEqual([{ slider: 'postAggr', net: 2 }]);
  });

  it('a switch needs two reads', () => {
    const s = { ...typeSettings('Fish'), leads: false };
    expect(readSuggestions([read(['lead'])], s).flags).toEqual([]);
    expect(readSuggestions([read(['lead']), read(['lead'])], s).flags).toEqual(['leads']);
  });

  it('never past the ends of the scale', () => {
    const s = typeSettings('Reg');
    const top = { ...s, sliders: { ...s.sliders, sticky: 5 } };
    expect(readSuggestions([read(['calldown']), read(['calldown'])], top).sliders).toEqual([]);
  });
});
