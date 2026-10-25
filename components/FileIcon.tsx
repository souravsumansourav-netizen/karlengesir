"use client";

import { getFileCategory } from "@/lib/utils";

interface FileIconProps {
  mimeType: string | null;
  className?: string;
}

const ICONS: Record<string, string> = {
  image: "🖼️",
  video: "🎬",
  audio: "🎵",
  pdf: "📕",
  document: "📝",
  spreadsheet: "📊",
  presentation: "📽️",
  archive: "🗜️",
  text: "📄",
  other: "📎",
};

export function FileIcon({ mimeType, className = "" }: FileIconProps) {
  const category = getFileCategory(mimeType);
  return (
    <span className={`file-icon ${className}`} role="img" aria-label={category}>
      {ICONS[category] ?? ICONS.other}
    </span>
  );
}
