import type { Metadata } from "next";
import { A, C, Code, DocPage, H2, P, Step, Steps, Table } from "@/components/docs/site";

export const metadata: Metadata = {
  title: "MCP",
  description: "Connect Claude, ChatGPT or Cursor to Lovewall with MCP: search, approve, tag and add testimonials.",
  alternates: { canonical: "/docs/mcp" },
};

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const server = `${appUrl}/api/mcp`;

const TOC = [
  { id: "tools", label: "Tools" },
  { id: "claude", label: "Claude" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "cursor", label: "Cursor" },
  { id: "other", label: "Other clients" },
];

export default function McpDocs() {
  return (
    <DocPage title="MCP" lead="Let Claude, ChatGPT or Cursor read and manage your testimonials." toc={TOC}>
      <P>
        Server: <C>{server}</C> (Streamable HTTP). It signs in with an API key from your space’s{" "}
        <strong className="font-medium">Settings → API keys</strong>. With a read-only key the assistant can only look.
      </P>

      <H2 id="tools">Tools</H2>
      <Table
        head={["Tool", "What it does"]}
        rows={[
          ["search_testimonials", "Find by words, status, rating, tag, source or featured"],
          ["get_testimonial", "One testimonial with everything"],
          ["get_stats", "Counts, average rating, last 7 and 30 days, sources, top tags"],
          ["list_widgets", "Widgets with their page and embed code"],
          ["update_testimonials", "Approve, hide, feature and tag (read and write keys)"],
          ["add_testimonial", "Add one from an email or a review (read and write keys)"],
        ]}
      />
      <P>Try: “Approve this week’s five-star testimonials and tag them launch”, or “Which customers mention onboarding?”</P>

      <H2 id="claude">Claude</H2>
      <P>Claude Code:</P>
      <Code label="Terminal" code={`claude mcp add --transport http lovewall ${server} \\\n  --header "Authorization: Bearer lw_your_key"`} />
      <P>Claude on the web and desktop:</P>
      <Steps>
        <Step title="Open Settings → Connectors → Add custom connector." />
        <Step title="Name it Lovewall and paste this URL:">
          <Code code={`${server}?key=lw_your_key`} />
        </Step>
        <Step title="Turn it on in a chat from the tools menu." />
      </Steps>

      <H2 id="chatgpt">ChatGPT</H2>
      <Steps>
        <Step title="Turn on developer mode in Settings → Apps → Advanced settings." />
        <Step title="Create an app with this MCP server URL and no authentication:">
          <Code code={`${server}?key=lw_your_key`} />
        </Step>
        <Step title="Pick Lovewall from the tools menu in a chat." />
      </Steps>

      <H2 id="cursor">Cursor</H2>
      <P>
        Add it to <C>~/.cursor/mcp.json</C> (or <C>.cursor/mcp.json</C> in a project):
      </P>
      <Code
        label="mcp.json"
        code={`{
  "mcpServers": {
    "lovewall": {
      "url": "${server}",
      "headers": { "Authorization": "Bearer lw_your_key" }
    }
  }
}`}
      />

      <H2 id="other">Other clients</H2>
      <P>
        Any client that speaks Streamable HTTP works: send <C>Authorization: Bearer lw_your_key</C>, or put the key in the URL as{" "}
        <C>?key=</C> when a client can’t send headers. A key in a URL can end up in logs, so give that client its own key and revoke it when
        you’re done.
      </P>
      <P>
        Prefer plain HTTP? See the <A href="/docs/api">API</A>.
      </P>
    </DocPage>
  );
}
