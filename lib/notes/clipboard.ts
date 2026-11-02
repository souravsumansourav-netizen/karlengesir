/**
 * Copies plain text to the system clipboard using the modern Clipboard API
 * if available and secure, with a robust fallback to document.execCommand('copy')
 * for older browsers or non-secure contexts (HTTP/local dev without TLS).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  // 1. Try navigator.clipboard.writeText if available and secure
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (clipboardErr) {
      console.warn("navigator.clipboard.writeText failed, falling back:", clipboardErr);
    }
  }

  // 2. Fallback: invisible off-screen textarea with execCommand('copy')
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    // Ensure element is not visible and does not alter layout
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
