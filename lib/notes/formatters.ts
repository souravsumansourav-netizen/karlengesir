/**
 * Utilities for formatting, parsing, and optimizing tabular data and images in Notes.
 */

export interface TableBlock {
  type: "table";
  headers: string[];
  alignments: ("left" | "center" | "right")[];
  rows: string[][];
}

export interface ImageBlock {
  type: "image";
  alt: string;
  src: string;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export type ContentBlock = TextBlock | TableBlock | ImageBlock;

export interface AttachedImage {
  id: string;
  name: string;
  dataUrl: string;
  size?: number;
}

/**
 * Optimizes an image File by scaling down large dimensions and compressing
 * via HTML5 Canvas into a high-quality JPEG/PNG data URL.
 * Keeps payloads lightweight and fast while preserving document/screenshot clarity.
 */
export function optimizeImage(
  file: File,
  maxDimension = 1600,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    // If it's SVG, keep vector format as-is
    if (file.type === "image/svg+xml") {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        // If already within reasonable dimensions and size, keep original
        if (width <= maxDimension && height <= maxDimension && file.size < 600 * 1024) {
          resolve(dataUrl);
          return;
        }

        // Scale down preserving aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        // Smooth image rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Keep PNG if original is PNG with potential transparency and reasonable size, else JPEG
        const mimeType = file.type === "image/png" && file.size < 1.5 * 1024 * 1024 ? "image/png" : "image/jpeg";
        const resultUrl = canvas.toDataURL(mimeType, quality);
        resolve(resultUrl);
      };

      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Converts copied HTML table data (from Microsoft Excel, Google Sheets, or web pages)
 * into a clean, standard Markdown table.
 */
export function convertHtmlTableToMarkdown(html: string): string | null {
  if (typeof window === "undefined" || !html || !html.includes("<table")) {
    return null;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    if (!table) return null;

    const trElements = Array.from(table.querySelectorAll("tr"));
    if (trElements.length === 0) return null;

    const rawGrid: string[][] = [];

    for (const tr of trElements) {
      const cells = Array.from(tr.querySelectorAll("th, td"));
      if (cells.length === 0) continue;

      const rowData = cells.map((cell) => {
        const clone = cell.cloneNode(true) as HTMLElement;
        // Convert line breaks to space
        clone.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
        let text = clone.textContent || "";
        // Clean non-breaking spaces and trim
        text = text.replace(/\u00a0/g, " ").trim();
        // Escape pipes
        text = text.replace(/\|/g, "\\|");
        // Flatten multiple whitespaces/newlines
        text = text.replace(/[\r\n]+/g, " ");
        return text;
      });

      rawGrid.push(rowData);
    }

    if (rawGrid.length === 0) return null;

    const maxCols = Math.max(...rawGrid.map((r) => r.length));
    if (maxCols < 1) return null;

    // Pad all rows to maxCols
    const normalized = rawGrid.map((row) => {
      const padded = [...row];
      while (padded.length < maxCols) {
        padded.push("");
      }
      return padded;
    });

    const headerRow = normalized[0];
    const separatorRow = new Array(maxCols).fill("---");
    const dataRows = normalized.slice(1);

    let md = `| ${headerRow.join(" | ")} |\n| ${separatorRow.join(" | ")} |`;
    if (dataRows.length > 0) {
      md += "\n" + dataRows.map((r) => `| ${r.join(" | ")} |`).join("\n");
    }

    return md;
  } catch (err) {
    console.error("[convertHtmlTableToMarkdown] Error parsing HTML table:", err);
    return null;
  }
}

/**
 * Converts tab-separated text (TSV) from Excel or spreadsheet copy operations
 * into a clean Markdown table.
 */
export function convertTsvToMarkdown(tsv: string): string | null {
  if (!tsv || !tsv.includes("\t")) {
    return null;
  }

  try {
    const lines = tsv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;

    // Check if at least one line has tabs
    const hasTabs = lines.some((l) => l.includes("\t"));
    if (!hasTabs) return null;

    const rawRows = lines.map((line) =>
      line.split("\t").map((cell) => {
        let text = cell.replace(/\u00a0/g, " ").trim();
        text = text.replace(/\|/g, "\\|");
        text = text.replace(/[\r\n]+/g, " ");
        return text;
      })
    );

    const maxCols = Math.max(...rawRows.map((r) => r.length));
    if (maxCols < 2 && rawRows.length < 2) return null;

    const normalized = rawRows.map((row) => {
      const padded = [...row];
      while (padded.length < maxCols) {
        padded.push("");
      }
      return padded;
    });

    const headerRow = normalized[0];
    const separatorRow = new Array(maxCols).fill("---");
    const dataRows = normalized.slice(1);

    let md = `| ${headerRow.join(" | ")} |\n| ${separatorRow.join(" | ")} |`;
    if (dataRows.length > 0) {
      md += "\n" + dataRows.map((r) => `| ${r.join(" | ")} |`).join("\n");
    }

    return md;
  } catch (err) {
    console.error("[convertTsvToMarkdown] Error parsing TSV:", err);
    return null;
  }
}

/**
 * Extracts standalone attached images from note markdown, separating them
 * from plain text for the editor.
 */
export function extractImagesAndText(content: string): {
  text: string;
  images: AttachedImage[];
} {
  if (!content) return { text: "", images: [] };

  const imageRegex = /!\[(.*?)\]\((data:image\/[^;]+;base64,[^)]+|https?:\/\/[^)]+)\)/g;
  const images: AttachedImage[] = [];
  let imageCounter = 1;

  // Find all images
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(content)) !== null) {
    images.push({
      id: `img-${Date.now()}-${imageCounter}`,
      name: match[1] || `Image ${imageCounter}`,
      dataUrl: match[2],
    });
    imageCounter++;
  }

  // Remove the image markdown tags from the text
  const cleanText = content.replace(imageRegex, "").trim();

  return { text: cleanText, images };
}

/**
 * Splits cells of a markdown table line.
 */
function splitMarkdownCells(line: string): string[] {
  let raw = line.trim();
  if (raw.startsWith("|")) raw = raw.substring(1);
  if (raw.endsWith("|")) raw = raw.substring(0, raw.length - 1);
  return raw.split("|").map((c) => c.trim().replace(/\\\|/g, "|"));
}

/**
 * Parses full note content into structured blocks (Text, Table, Image).
 * Supports Markdown tables, TSV tables, Markdown images, and plain text.
 */
export function parseContentBlocks(content: string): ContentBlock[] {
  if (!content) return [];

  const blocks: ContentBlock[] = [];
  const lines = content.split(/\r?\n/);
  let currentTextLines: string[] = [];

  const flushText = () => {
    if (currentTextLines.length > 0) {
      const text = currentTextLines.join("\n");
      if (text.length > 0) {
        blocks.push({ type: "text", text });
      }
      currentTextLines = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 1. Check for standalone markdown image: ![alt](url)
    const imgMatch = line.trim().match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      flushText();
      blocks.push({ type: "image", alt: imgMatch[1] || "Image", src: imgMatch[2] });
      i++;
      continue;
    }

    // 2. Check for markdown table start: line contains | and next line is a delimiter row
    if (line.includes("|") && i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const delimCells = splitMarkdownCells(nextLine);
      const isDelim =
        delimCells.length > 0 &&
        delimCells.every((c) => /^:?-+:?$/.test(c));

      if (isDelim) {
        flushText();
        const headers = splitMarkdownCells(line);
        const alignments = delimCells.map((c) => {
          const left = c.startsWith(":");
          const right = c.endsWith(":");
          if (left && right) return "center" as const;
          if (right) return "right" as const;
          return "left" as const;
        });

        const rows: string[][] = [];
        i += 2;
        while (
          i < lines.length &&
          lines[i].includes("|") &&
          lines[i].trim().length > 0
        ) {
          const rowCells = splitMarkdownCells(lines[i]);
          while (rowCells.length < headers.length) rowCells.push("");
          rows.push(rowCells.slice(0, headers.length));
          i++;
        }

        blocks.push({ type: "table", headers, alignments, rows });
        continue;
      }
    }

    // 3. Check for TSV table (2+ consecutive lines with tabs)
    if (line.includes("\t")) {
      const tsvLines = [line];
      let j = i + 1;
      while (
        j < lines.length &&
        lines[j].includes("\t") &&
        lines[j].trim().length > 0
      ) {
        tsvLines.push(lines[j]);
        j++;
      }

      if (tsvLines.length >= 2) {
        flushText();
        const rawRows = tsvLines.map((l) =>
          l.split("\t").map((c) => c.trim())
        );
        const maxCols = Math.max(...rawRows.map((r) => r.length));
        const normalized = rawRows.map((row) => {
          const padded = [...row];
          while (padded.length < maxCols) padded.push("");
          return padded;
        });

        const headers = normalized[0];
        const alignments = headers.map(() => "left" as const);
        const dataRows = normalized.slice(1);

        blocks.push({ type: "table", headers, alignments, rows: dataRows });
        i = j;
        continue;
      }
    }

    // Regular line of text
    currentTextLines.push(line);
    i++;
  }

  flushText();
  return blocks;
}

/**
 * Converts markdown table to HTML table string for clipboard copying.
 */
export function markdownTableToHtml(content: string): string {
  const blocks = parseContentBlocks(content);
  return blocks
    .map((b) => {
      if (b.type === "table") {
        const thead = `<thead><tr>${b.headers
          .map(
            (h, idx) =>
              `<th style="text-align:${b.alignments[idx] || "left"}">${h}</th>`
          )
          .join("")}</tr></thead>`;
        const tbody = `<tbody>${b.rows
          .map(
            (r) =>
              `<tr>${r
                .map(
                  (c, idx) =>
                    `<td style="text-align:${b.alignments[idx] || "left"}">${c}</td>`
                )
                .join("")}</tr>`
          )
          .join("")}</tbody>`;
        return `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse">${thead}${tbody}</table>`;
      }
      if (b.type === "image") {
        return `<img src="${b.src}" alt="${b.alt}" />`;
      }
      return `<p>${b.text.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

/**
 * Converts markdown table to TSV format for spreadsheet pasting.
 */
export function markdownTableToTsv(content: string): string {
  const blocks = parseContentBlocks(content);
  const tsvParts: string[] = [];

  for (const b of blocks) {
    if (b.type === "table") {
      tsvParts.push(b.headers.join("\t"));
      for (const row of b.rows) {
        tsvParts.push(row.join("\t"));
      }
    } else if (b.type === "text") {
      tsvParts.push(b.text);
    }
  }

  return tsvParts.join("\n");
}

