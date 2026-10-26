import "server-only";
import { one, q } from "@/lib/db";
import { sendMail, type Mail } from "@/lib/mail";

type Row = {
  id: string;
  to_email: string;
  subject: string;
  html: string;
  body: string;
  attempts: number;
  reply_to: string | null;
  from_name: string | null;
  headers: Record<string, string> | null;
};

const COLUMNS = "id, to_email, subject, html, body, attempts, reply_to, from_name, headers";

// Queues a mail and returns its id. Send it with flushOne() inside after(); the cron retries failures.
export async function enqueue(mail: Mail): Promise<string> {
  const row = await one<{ id: string }>(
    "insert into email_outbox (to_email, subject, html, body, reply_to, from_name, headers) values ($1, $2, $3, $4, $5, $6, $7) returning id",
    [
      mail.to,
      mail.subject,
      mail.html,
      mail.text,
      mail.replyTo ?? null,
      mail.fromName ?? null,
      mail.headers ? JSON.stringify(mail.headers) : null,
    ],
  );
  return row!.id;
}

async function attempt(row: Row) {
  try {
    await sendMail({
      to: row.to_email,
      subject: row.subject,
      html: row.html,
      text: row.body,
      replyTo: row.reply_to,
      fromName: row.from_name,
      headers: row.headers,
    });
    await q("update email_outbox set sent_at = now(), attempts = attempts + 1, last_error = null where id = $1", [row.id]);
    return true;
  } catch (error) {
    // Back off: 1, 4, 9, 16... minutes. Give up after 8 tries.
    const tries = row.attempts + 1;
    await q("update email_outbox set attempts = $2, last_error = $3, next_at = now() + make_interval(mins => $4) where id = $1", [
      row.id,
      tries,
      String((error as Error).message).slice(0, 500),
      tries * tries,
    ]);
    return false;
  }
}

export async function flushOne(id: string) {
  // Claim the row so a concurrent cron run doesn't send it twice.
  const row = await one<Row>(
    `update email_outbox set next_at = now() + interval '5 minutes' where id = $1 and sent_at is null returning ${COLUMNS}`,
    [id],
  );
  if (row) await attempt(row);
}

export async function flushDue(limit = 25) {
  const rows = await q<Row>(
    `update email_outbox set next_at = now() + interval '5 minutes'
     where id in (select id from email_outbox where sent_at is null and attempts < 8 and next_at <= now() order by next_at limit $1 for update skip locked)
     returning ${COLUMNS}`,
    [limit],
  );
  let sent = 0;
  for (const row of rows) if (await attempt(row)) sent++;
  return { due: rows.length, sent };
}
