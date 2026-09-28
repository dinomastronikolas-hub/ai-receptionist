"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

const EMOJIS = [
  "✅", "🔥", "💧", "🏋️", "🏃", "🚴", "🧘", "🤸", "👟", "🏊", "⚽", "🎾",
  "📖", "📚", "✍️", "📝", "🧠", "🎓", "💻", "🗣️", "🎸", "🎹", "🎨", "📷",
  "🥗", "🍎", "🥦", "🍳", "☕", "🚭", "🍩", "🍷", "💊", "🦷", "😴", "🛏️",
  "🌅", "🌙", "☀️", "🌿", "🪴", "🐕", "🧹", "🧺", "💰", "📈", "🗂️", "📵",
  "🙏", "❤️", "😊", "🤝", "📞", "💌", "🎯", "⏰", "🧊", "🚶", "🧗", "🏔️",
];

/** First grapheme of a string (so "👍🏽" stays one emoji). */
function firstGrapheme(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const { segment } of seg.segment(trimmed)) return segment;
  }
  return Array.from(trimmed)[0] ?? "";
}

export function EmojiPicker({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const pick = (e: string) => {
    onChange(e);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Pick an icon">
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => pick(e)}
            aria-label={`Use ${e}`}
            className={cn(
              "flex aspect-square items-center justify-center rounded-2xl text-[26px] transition hover:bg-sunken active:scale-90",
              value === e && "bg-sunken ring-2 ring-brand",
            )}
          >
            {e}
          </button>
        ))}
      </div>
      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const g = firstGrapheme(custom);
          if (g) pick(g);
        }}
      >
        <Input placeholder="Or type any emoji" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={16} aria-label="Custom emoji" />
        <button type="submit" className="h-12 shrink-0 rounded-2xl bg-primary px-5 font-semibold text-primary-fg disabled:opacity-50" disabled={!firstGrapheme(custom)}>
          Use
        </button>
      </form>
    </Sheet>
  );
}
