/** Tiny synchronous benchmark helper for the `pnpm bench:*` scripts. */
export interface Timing {
  label: string;
  samples: number[];
  median: number;
  min: number;
}

export async function measure(
  label: string,
  fn: () => Promise<void> | void,
  iterations = 5,
): Promise<Timing> {
  await fn(); // warm-up
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return { label, samples, median, min: sorted[0] ?? 0 };
}

export function report(timings: Timing[]): void {
  const width = Math.max(...timings.map((timing) => timing.label.length));
  for (const timing of timings) {
    const samples = timing.samples.map((sample) => sample.toFixed(0)).join(', ');
    console.log(
      `${timing.label.padEnd(width)}  median ${timing.median.toFixed(0).padStart(5)} ms  min ${timing.min
        .toFixed(0)
        .padStart(5)} ms  [${samples}]`,
    );
  }
}
