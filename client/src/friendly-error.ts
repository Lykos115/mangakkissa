export const friendlyError = (code?: string, status?: number) => {
  if (code === 'FETCH_FAILED') return `Couldn't reach the site${status ? ` (HTTP ${status})` : ''}.`;
  if (code === 'LONG_STRIP_UNSUPPORTED') return 'This looks like a vertical-scroll comic — this reader only does page spreads.';
  return "Couldn't find chapter pages on this page — this site may need its own extractor.";
};
