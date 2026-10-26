import { listAudit, type AuditItem } from "@/lib/privacy";
import { Group } from "./grouped";

const LABEL: Record<AuditItem["action"], (d: Record<string, unknown>) => string> = {
  "testimonials.export": (d) => `Exported ${d.count ?? ""} testimonials`.replace("  ", " "),
  "testimonials.delete": (d) => (Number(d.count) > 1 ? `Deleted ${d.count} testimonials` : "Deleted a testimonial"),
  "testimonial.edit": () => "Edited a testimonial",
  "testimonial.reply": () => "Replied to a testimonial",
  "invites.send": (d) => `Sent ${d.sent ?? 0} invites`,
  "report.resolve": (d) =>
    d.action === "hide" ? "Hid a reported testimonial" : d.action === "delete" ? "Deleted a reported testimonial" : "Dismissed a report",
  "member.invite": () => "Invited someone",
  "member.remove": () => "Removed a member",
  "member.leave": () => "Left the space",
  "member.owner": () => "Handed over the space",
  "apikey.create": () => "Created an API key",
  "apikey.revoke": () => "Revoked an API key",
  "giver.edit": () => "Changed their testimonial",
  "giver.delete": () => "Deleted their testimonial",
  "account.export": () => "Exported their account",
};

const WHEN = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });

function who(item: AuditItem) {
  if (item.actorKind === "giver") return "A giver";
  if (item.actorKind === "api") return "API key";
  return item.actor ?? "Former member";
}

// Space settings, owner only: who did what with personal data (the last 50 entries; kept a year).
export async function ActivitySettings({ spaceId }: { spaceId: string }) {
  const items = await listAudit(spaceId);
  return (
    <Group title="Activity" id="activity">
      {items.length === 0 ? (
        <p className="px-4 py-3.5 text-[14px] text-muted">Nothing yet</p>
      ) : (
        <ul className="max-h-[360px] divide-y divide-line overflow-y-auto" data-testid="activity">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-4 px-4 py-3 text-[14px]">
              <span className="min-w-0">
                <span className="font-medium">{who(item)}</span>{" "}
                <span className="text-muted">{(LABEL[item.action] ?? (() => item.action))(item.detail)}</span>
              </span>
              <time className="shrink-0 text-[12px] text-muted tabular-nums" dateTime={item.at}>
                {WHEN.format(new Date(item.at))}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Group>
  );
}
