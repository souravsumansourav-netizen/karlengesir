/**
 * Copies text and rich content (HTML tables, images, TSV) to the system clipboard.
 * Supports modern Clipboard API with rich MIME types (text/html + text/plain)
 * so tables paste natively into Excel, Google Sheets, Word, and text editors,
 * with robust fallbacks for non-secure contexts or older browsers.
 */

import { markdownTableToHtml, markdownTableToTsv } from "./formatters";

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  const hasTable = text.includes("|") || text.includes("\t") || text.includes("<table");
  const hasImage = text.includes("![") && text.includes("](");

  // 1. If content has tables or rich markdown, try writing multi-MIME ClipboardItem
  if (
    (hasTable || hasImage) &&
    navigator.clipboard &&
    window.isSecureContext &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      const htmlContent = markdownTableToHtml(text);
      // Clean plain text: for tables, provide TSV or clean text without massive base64 URLs
      let plainText = text;
      if (hasTable && !hasImage) {
        const tsv = markdownTableToTsv(text);
        if (tsv.trim().length > 0) {
          plainText = tsv;
        }
      }

      const item = new ClipboardItem({
        "text/plain": new Blob([plainText], { type: "text/plain" }),
        "text/html": new Blob([htmlContent], { type: "text/html" }),
      });

      await navigator.clipboard.write([item]);
      return true;
    } catch (richErr) {
      console.warn("Multi-MIME clipboard write failed, trying plain text:", richErr);
    }
  }

  // 2. Try standard navigator.clipboard.writeText
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (clipboardErr) {
      console.warn("navigator.clipboard.writeText failed, falling back:", clipboardErr);
    }
  }

  // 3. Fallback: invisible off-screen textarea with execCommand('copy')
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "-999999px";
    textArea.style.left = "-999999px";
    textArea.style.opacity = "0";
    textArea.style.pointerEvents = "none";
    textArea.setAttribute("readonly", "");
    textArea.setAttribute("aria-hidden", "true");

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (fallbackErr) {
    console.error("Clipboard copy fallback failed:", fallbackErr);
    return false;
  }
}
