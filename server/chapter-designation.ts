export interface ChapterDesignation {
  number: number;
  part: number;
  suffix: string;
}

// Slugs spell decimal Chapters with a dash ("chapter-6-5" is Chapter 6.5), but only right after the "chapter" word.
const SLUG_DECIMAL = /chapter[-_ ]*(\d+)[-_](\d+)([a-z]?)\/?$/i;
const DESIGNATION = /(\d+)(?:\.(\d+))?([a-z]*)/gi;

export function parseChapterDesignation(...sources: Array<string | undefined>): ChapterDesignation | undefined {
  for (const source of sources) {
    if (!source) continue;
    const match = source.match(SLUG_DECIMAL) ?? [...source.matchAll(DESIGNATION)].at(-1);
    if (match) {
      return {
        number: Number.parseInt(match[1], 10),
        part: match[2] ? Number.parseInt(match[2], 10) : 0,
        suffix: match[3].toLowerCase()
      };
    }
  }
  return undefined;
}

export function compareChapterDesignations(left: ChapterDesignation, right: ChapterDesignation): number {
  return left.number - right.number || left.part - right.part || left.suffix.localeCompare(right.suffix);
}
