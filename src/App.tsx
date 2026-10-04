import { FIXTURES } from './core/fixtures';
import { replay } from './core/engine/replay';

// Placeholder until the replayer UI lands: replays every sample hand and prints the outcome.
export default function App() {
  return (
    <main className="min-h-screen bg-neutral-950 p-8 font-sans text-neutral-200">
      <h1 className="mb-6 text-2xl font-bold">LogiStack v3</h1>
      <ul className="space-y-3">
        {Object.entries(FIXTURES).map(([key, hand]) => {
          const result = replay(hand).result;
          const names = Object.fromEntries(hand.players.map((p) => [p.seat, p.name]));
          const winners = result?.pots.flatMap((p) => p.winners ?? []).map((s) => names[s]) ?? [];
          return (
            <li key={key} className="rounded-lg border border-neutral-800 p-4">
              <div className="font-semibold">{hand.title}</div>
              <div className="text-sm text-neutral-400">
                {hand.table.seats}-max {hand.table.venue} · won by {[...new Set(winners)].join(', ') || '?'}
                {result && result.rake > 0 && ` · rake ${result.rake}`}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
