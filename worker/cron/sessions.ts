// Expired-session sweep.
//
// A session row lingers in the database after its expires_at passes: the JWT
// stops verifying and the auth middleware now also refuses expired rows, but
// nothing was deleting them, so the "active sessions" view kept listing months
// of dead logins. This cron removes them (session_ips rows cascade away with
// them via the foreign key), keeping the table and that view honest.

const BATCH_SIZE = 500;

export async function sweepExpiredSessions(db: D1Database): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // Bounded per tick so a huge backlog is cleared over several runs rather
  // than one statement that could time out.
  await db
    .prepare(
      `DELETE FROM sessions
        WHERE id IN (
          SELECT id FROM sessions WHERE expires_at <= ? LIMIT ?
        )`,
    )
    .bind(now, BATCH_SIZE)
    .run();
}
