/**
 * Fill-handle value tiling (Task 2.5). No series inference: the source block is
 * repeated modulo its size, matching Excel's copy-only fill.
 */
export function tileFill(
  source: readonly (readonly string[])[],
  height: number,
  width: number,
): string[][] {
  if (source.length === 0) return [];
  const sourceHeight = source.length;
  const sourceWidth = Math.max(...source.map((row) => row.length), 1);
  return Array.from({ length: height }, (_, row) =>
    Array.from(
      { length: width },
      (_, column) => source[row % sourceHeight]?.[column % sourceWidth] ?? '',
    ),
  );
}
