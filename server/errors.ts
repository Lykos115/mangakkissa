export const friendlyDetail = (error: unknown) => error instanceof Error ? error.message : String(error);
