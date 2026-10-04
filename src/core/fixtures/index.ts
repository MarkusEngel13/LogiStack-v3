import type { HandRecord } from '../hand/types';
import steal from './01-steal.json';
import multiwayShowdown from './02-multiway-showdown.json';
import sidePots from './03-side-pots.json';
import straddle72 from './04-straddle-72.json';
import squid from './05-squid.json';
import headsUpSplit from './06-heads-up-split.json';

// JSON imports type card pairs as string[] and the format as string; the shapes are checked by the tests.
const asHand = (json: unknown) => json as HandRecord;

export const FIXTURES = {
  steal: asHand(steal),
  multiwayShowdown: asHand(multiwayShowdown),
  sidePots: asHand(sidePots),
  straddle72: asHand(straddle72),
  squid: asHand(squid),
  headsUpSplit: asHand(headsUpSplit),
};
