// Small helpers shared by list endpoints that paginate + search.
//
// The team-members listing (worker/routes/teams.ts) and the admin listings
// (worker/routes/admin.ts) predate this module and keep their own inline
// parsing — new code should use these so the param names stay consistent.

export interface PageOptions {
  page: number;
  limit: number;
  offset: number;
}

/** Parse `page`/`limit` query params with sane bounds. */
export function readPage(
  pageRaw: string | undefined,
  limitRaw: string | undefined,
  defaultLimit = 50,
  maxLimit = 100,
): PageOptions {
  const page = Math.max(1, Number(pageRaw) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number(limitRaw) || defaultLimit),
  );
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Escape user input for a `LIKE ... ESCAPE '\'` pattern so `%`/`_`/`\` in
 * the term are treated literally rather than widening the match.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}
