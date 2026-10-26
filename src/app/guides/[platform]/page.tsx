import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Code, DocPage, P, Step, Steps } from "@/components/docs/site";
import { findGuide, GUIDES, guideSnippet } from "@/lib/guides";

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export function generateStaticParams() {
  return GUIDES.map((g) => ({ platform: g.slug }));
}

export async function generateMetadata(props: PageProps<"/guides/[platform]">): Promise<Metadata> {
  const guide = findGuide((await props.params).platform);
  if (!guide) return {};
  return {
    title: `Testimonials on ${guide.name}`,
    description: `Add a Lovewall testimonial widget to ${guide.name}. ${guide.summary}`,
    alternates: { canonical: `/guides/${guide.slug}` },
  };
}

export default async function GuidePage(props: PageProps<"/guides/[platform]">) {
  const guide = findGuide((await props.params).platform);
  if (!guide) notFound();
  return (
    <DocPage title={`Testimonials on ${guide.name}`} lead={guide.summary} back={{ href: "/guides", label: "Guides" }}>
      <Steps>
        {guide.steps.map((s) => {
          const snippet = s.code ? guideSnippet(s.code, appUrl) : null;
          return (
            <Step key={s.title} title={s.title}>
              {s.text && <p>{s.text}</p>}
              {snippet && <Code code={snippet.code} label={snippet.label} />}
            </Step>
          );
        })}
      </Steps>
      {guide.note && <P className="mt-8 text-[14px] text-muted">{guide.note}</P>}
      <P className="mt-8 text-[14px] text-muted">
        No account yet?{" "}
        <Link href="/login" className="underline decoration-muted/40 underline-offset-2 hover:decoration-ink">
          Start free
        </Link>{" "}
        and make your first widget in a minute.
      </P>
    </DocPage>
  );
}
