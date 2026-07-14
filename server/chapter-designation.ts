export interface ChapterDesignation {
  number: number;
  suffix: string;
}

export function parseChapterDesignation(...sources: Array<string | undefined>): ChapterDesignation | undefined {
  for (const source of sources) {
    if (!source) continue;
    const matches = [...source.matchAll(/(\d+)([a-z]*)/gi)];
    const match = matches.at(-1);
    if (match) {
      return {
        number: Number.parseInt(match[1], 10),
        suffix: match[2].toLowerCase()
      };
    }
  }
  return undefined;
}

export function compareChapterDesignations(left: ChapterDesignation, right: ChapterDesignation): number {
  return left.number - right.number || left.suffix.localeCompare(right.suffix);
}
