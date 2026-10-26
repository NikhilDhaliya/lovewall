"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { replyToTestimonial } from "@/app/actions/replies";
import { Button } from "@/components/ui/button";
import { textareaClass } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { OwnerTestimonial } from "@/lib/data/testimonials";

// Reply by email to the person behind a testimonial. Their answer lands in the owner's own inbox (Reply-To).
export function ReplySheet({
  spaceId,
  to,
  onOpenChange,
  onSent,
}: {
  spaceId: string;
  to: OwnerTestimonial | null;
  onOpenChange: (open: boolean) => void;
  onSent: (id: string, repliedAt: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  if ((to?.id ?? null) !== seen) {
    setSeen(to?.id ?? null);
    if (to) setMessage(`Hi ${to.name.split(/\s+/)[0]},\n\n`);
  }

  async function send() {
    if (!to || busy) return;
    if (!message.trim()) return toast.error("Write a message");
    setBusy(true);
    const res = await replyToTestimonial(spaceId, to.id, message);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    onSent(to.id, res.data.repliedAt);
    onOpenChange(false);
    toast.success("Reply sent");
  }

  return (
    <Sheet
      open={to !== null}
      onOpenChange={onOpenChange}
      title="Reply"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Send
          </Button>
        </div>
      }
    >
      <div className="space-y-3 p-5" onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && void send()}>
        <p className="truncate text-[14px] text-muted">
          To <span className="text-ink">{to?.name}</span> · {to?.email}
        </p>
        <textarea
          autoFocus
          aria-label="Message"
          value={message}
          maxLength={5000}
          rows={8}
          onChange={(e) => setMessage(e.target.value)}
          className={cn(textareaClass, "min-h-[180px]")}
        />
      </div>
    </Sheet>
  );
}
