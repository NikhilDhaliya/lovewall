import type { Metadata } from "next";
import { Mentions } from "@/components/mentions/mentions";
import { loadSpace } from "@/lib/data/load";
import { listMentions, mentionSettings } from "@/lib/data/mentions";

export const metadata: Metadata = { title: "Mentions" };

export default async function MentionsPage(props: PageProps<"/app/[space]/mentions">) {
  const { space: spaceId } = await props.params;
  const { space } = await loadSpace(spaceId);
  const [settings, list] = await Promise.all([mentionSettings(space.id), listMentions(space.id, "new")]);
  return <Mentions spaceId={space.id} initial={{ settings, ...list }} />;
}
