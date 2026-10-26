"use client";

import { FileSpreadsheet, Images, PenLine, Puzzle } from "lucide-react";
import type { Source } from "@/lib/sources";
import { PickRow } from "./import-parts";

const EXTENSION = "https://github.com/NikhilDhaliya/lovewall/tree/main/extension";

// A site Lovewall doesn't read for you: the ways to bring its reviews in by hand.
export function HandStep({
  source,
  onFile,
  onPaste,
  onShots,
}: {
  source: Source;
  onFile: () => void;
  onPaste: () => void;
  onShots: () => void;
}) {
  const one = "sm:odd:border-r-0";
  return (
    <div className="animate-view space-y-3 px-5 pt-4 pb-6">
      <p className="text-[13.5px] text-muted">
        Add {source.label} {source.group === "social" ? "posts" : "reviews"} yourself.
      </p>
      <div className="grid overflow-hidden rounded-[12px] ring-1 ring-line">
        {source.file && <PickRow icon={<FileSpreadsheet className="size-4" />} label="Export file" onClick={onFile} className={one} />}
        <PickRow icon={<PenLine className="size-4" />} label="Paste" onClick={onPaste} className={one} />
        <PickRow icon={<Images className="size-4" />} label="Screenshots" onClick={onShots} className={one} />
        <PickRow icon={<Puzzle className="size-4" />} label="Browser extension" href={EXTENSION} className={one} />
      </div>
    </div>
  );
}
