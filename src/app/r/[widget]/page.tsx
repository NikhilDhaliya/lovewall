import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ReportForm } from "@/components/privacy/report-form";
import { one, q } from "@/lib/db";
import { ID_RE } from "@/lib/ids";
import { legalEnabled } from "@/lib/legal/config";
import { pageAllowed } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "Report a testimonial", robots: { index: false, follow: false } };

// Public: the "Report" link under wall pages and widgets. Anyone can ask for a testimonial to come down.
export default async function ReportPage(props: PageProps<"/r/[widget]">) {
  await connection();
  const { widget } = await props.params;
  const { t: picked } = await props.searchParams;
  if (!ID_RE.test(widget) || !(await pageAllowed("report", 60, 600))) notFound();
  const space = await one<{ id: string; name: string }>(
    "select s.id, s.name from widgets w join spaces s on s.id = w.space_id where w.id = $1",
    [widget],
  );
  if (!space) notFound();
  const items = await q<{ id: string; name: string; text: string }>(
    `select id, name, left(text, 140) as text from testimonials where space_id = $1 and status = 'approved'
     order by featured desc, given_at desc limit 200`,
    [space.id],
  );
  return (
    <main className="min-h-dvh bg-canvas">
      <div className="mx-auto w-full max-w-[520px] px-5 pt-10 pb-16 sm:pt-16">
        <ReportForm
          widgetId={widget}
          space={space.name}
          items={items}
          initial={typeof picked === "string" && items.some((i) => i.id === picked) ? picked : null}
          privacyUrl={legalEnabled() ? "/legal/privacy" : null}
        />
      </div>
    </main>
  );
}
