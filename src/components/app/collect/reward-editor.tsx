"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { addRewardCodes, clearRewardCodes } from "@/app/actions/forms";
import { GroupRow, rowInputClass } from "@/components/app/grouped";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm";
import { inputClass, textareaClass } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { isHttpUrl, PRIZE_KINDS, REWARD_TYPES, type Prize, type Reward, type RewardType } from "@/lib/forms";

const TYPE_LABEL: Record<RewardType, string> = { none: "None", coupon: "Coupon code", link: "Link", wheel: "Spin the wheel" };
const PRIZE_LABEL: Record<Prize["kind"], string> = { code: "Code", link: "Link", none: "No prize" };

export function BadLink({ value }: { value: string }) {
  return value && !isHttpUrl(value) ? <p className="px-4 pb-3 text-[13px] text-danger">Not a valid link</p> : null;
}

// The reward a visitor gets after submitting: a coupon (one code, or a list handed out once each), a link, or a
// spin of a wheel the server decides.
export function RewardEditor({
  spaceId,
  formId,
  reward,
  onChange,
  codes,
  onCodes,
}: {
  spaceId: string;
  formId: string;
  reward: Reward;
  onChange: (r: Reward) => void;
  codes: { left: number; used: number };
  onCodes: (c: { left: number; used: number }) => void;
}) {
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Reward>) => onChange({ ...reward, ...patch });
  const setPrize = (i: number, patch: Partial<Prize>) => set({ prizes: reward.prizes.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const totalWeight = reward.prizes.reduce((s, p) => s + p.weight, 0);

  async function addCodes() {
    setBusy(true);
    const res = await addRewardCodes(spaceId, formId, paste);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    onCodes({ left: res.data.left, used: res.data.used });
    setPaste("");
    toast.success(res.data.added === 1 ? "1 code added" : `${res.data.added} codes added`);
  }

  async function clearCodes() {
    const ok = await confirmAction({ title: `Remove ${codes.left} unused codes?`, confirmLabel: "Remove", destructive: true });
    if (!ok) return;
    const res = await clearRewardCodes(spaceId, formId);
    if (!res.ok) return toast.error(res.error);
    onCodes(res.data);
  }

  return (
    <>
      <GroupRow label="Reward">
        <Select<RewardType>
          aria-label="Reward"
          value={reward.type}
          onChange={(type) => set({ type })}
          options={REWARD_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
          className="w-[168px]"
        />
      </GroupRow>

      {reward.type === "coupon" && (
        <>
          <GroupRow label="Codes">
            <Segmented
              label="Codes"
              fit
              value={reward.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: "fixed", label: "One code" },
                { value: "list", label: "List" },
              ]}
            />
          </GroupRow>
          {reward.mode === "fixed" ? (
            <GroupRow label="Code" htmlFor="reward-code">
              <input
                id="reward-code"
                value={reward.code}
                maxLength={80}
                placeholder="THANKYOU20"
                spellCheck={false}
                onChange={(e) => set({ code: e.target.value })}
                className={cn(rowInputClass, "font-mono")}
              />
            </GroupRow>
          ) : (
            <div className="space-y-2.5 p-4">
              <div className="flex items-center justify-between text-[14px]">
                <span>
                  <span className="font-medium tabular-nums" data-testid="codes-left">
                    {codes.left}
                  </span>{" "}
                  <span className="text-muted">left · {codes.used} used</span>
                </span>
                {codes.left > 0 && (
                  <button type="button" onClick={() => void clearCodes()} className="text-[13px] text-muted hover:text-danger">
                    Clear unused
                  </button>
                )}
              </div>
              <textarea
                aria-label="Codes to add"
                placeholder={"One code per line\nSPRING-7Q2\nSPRING-K9D"}
                value={paste}
                rows={4}
                spellCheck={false}
                onChange={(e) => setPaste(e.target.value)}
                className={cn(textareaClass, "font-mono text-[13px] md:text-[13px]")}
              />
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" disabled={!paste.trim() || busy} onClick={() => void addCodes()}>
                  {busy && <Loader2 className="size-3.5 animate-spin" />} Add codes
                </Button>
              </div>
            </div>
          )}
          <GroupRow label="Note" htmlFor="reward-label">
            <input
              id="reward-label"
              value={reward.label}
              maxLength={60}
              placeholder="20% off your next order"
              onChange={(e) => set({ label: e.target.value })}
              className={rowInputClass}
            />
          </GroupRow>
        </>
      )}

      {reward.type === "link" && (
        <>
          <GroupRow label="Link" htmlFor="reward-url">
            <input
              id="reward-url"
              inputMode="url"
              value={reward.url}
              maxLength={500}
              placeholder="acme.com/gift"
              onChange={(e) => set({ url: e.target.value })}
              className={rowInputClass}
            />
          </GroupRow>
          <BadLink value={reward.url} />
          <GroupRow label="Button" htmlFor="reward-button">
            <input
              id="reward-button"
              value={reward.label}
              maxLength={60}
              placeholder="Claim your reward"
              onChange={(e) => set({ label: e.target.value })}
              className={rowInputClass}
            />
          </GroupRow>
        </>
      )}

      {reward.type === "wheel" && (
        <div className="space-y-3 p-4">
          {reward.prizes.map((p, i) => (
            <div key={i} className="space-y-2 rounded-[10px] p-3 ring-1 ring-line ring-inset" data-testid="prize">
              <div className="flex items-center gap-2">
                <input
                  aria-label={`Prize ${i + 1}`}
                  placeholder="Prize"
                  value={p.label}
                  maxLength={40}
                  onChange={(e) => setPrize(i, { label: e.target.value })}
                  className={cn(inputClass, "h-10 md:h-9")}
                />
                <button
                  type="button"
                  disabled={reward.prizes.length <= 2}
                  onClick={() => set({ prizes: reward.prizes.filter((_, j) => j !== i) })}
                  className="grid size-9 shrink-0 place-items-center rounded-[8px] text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30"
                  aria-label={`Remove prize ${i + 1}`}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Select<Prize["kind"]>
                  aria-label={`Prize ${i + 1} type`}
                  value={p.kind}
                  onChange={(kind) => setPrize(i, { kind })}
                  options={PRIZE_KINDS.map((k) => ({ value: k, label: PRIZE_LABEL[k] }))}
                  className="w-[118px] shrink-0"
                />
                {p.kind !== "none" ? (
                  <input
                    aria-label={`Prize ${i + 1} ${p.kind === "code" ? "code" : "link"}`}
                    placeholder={p.kind === "code" ? "Code" : "acme.com/gift"}
                    value={p.value}
                    maxLength={500}
                    spellCheck={false}
                    onChange={(e) => setPrize(i, { value: e.target.value })}
                    className={cn(inputClass, "h-10 min-w-0 md:h-9", p.kind === "code" && "font-mono")}
                  />
                ) : (
                  <span className="flex-1" />
                )}
                <label className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted">
                  <span className="max-sm:sr-only">Odds</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`Prize ${i + 1} odds`}
                    value={p.weight}
                    onChange={(e) => setPrize(i, { weight: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })}
                    className={cn(inputClass, "h-10 w-16 text-center tabular-nums md:h-9")}
                  />
                </label>
                <span className="w-10 shrink-0 text-right text-[12px] text-faint tabular-nums" aria-hidden>
                  {totalWeight ? Math.round((p.weight / totalWeight) * 100) : 0}%
                </span>
              </div>
              {p.kind === "link" && <BadLink value={p.value} />}
            </div>
          ))}
          {reward.prizes.length < 8 && (
            <button
              type="button"
              onClick={() => set({ prizes: [...reward.prizes, { label: "", kind: "none", value: "", weight: 1 }] })}
              className="flex h-9 items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink"
            >
              <Plus className="size-4" /> Add prize
            </button>
          )}
        </div>
      )}
    </>
  );
}
