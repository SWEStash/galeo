/** The delivery truck's progress, one line every few seconds: the demo's log that grows. */
const LINES = [
  'INFO  truck: on the ring road, ETA 09:05',
  'INFO  truck: traffic slow at the bridge, ETA 09:12',
  'WARN  truck: diversion via Mill Lane, ETA 09:18',
  'INFO  truck: 2 miles away',
  'INFO  driver: called customer, side gate open',
  'INFO  truck: arrived, unloading',
  'INFO  driver: pallet 1/4 off (studs, plates)',
  'INFO  driver: pallet 2/4 off (rafters)',
  'INFO  driver: pallet 3/4 off (OSB, 16 sheets)',
  'INFO  driver: pallet 4/4 off (felt, shingles, fixings)',
  'INFO  driver: signed for by Sam',
  'INFO  yard: order GS-2026-0412 delivered',
];

/** Calls `append` with the next line, timestamped, every `everyMs`, until the lines run out. */
export function growingLog(append: (line: string) => void, everyMs = 4000, start = Date.parse('2026-11-13T08:24:00Z')): () => void {
  let next = 0;
  const timer = setInterval(() => {
    const line = LINES[next];
    if (line === undefined) return clearInterval(timer);
    append(`${new Date(start + next * 3 * 60_000).toISOString().replace('.000', '')} ${line}\n`);
    next += 1;
  }, everyMs);
  return () => clearInterval(timer);
}
