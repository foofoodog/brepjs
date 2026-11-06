// Insecure HTTP origins, sandboxed iframes, and a few older browsers expose
// `navigator.clipboard` as undefined; calling `?.writeText(...)` then chaining
// `.then(...)` throws synchronously. Guard explicitly and report success/fail.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback below
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.readOnly = true;
    textArea.setAttribute('aria-hidden', 'true');
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '-10000px';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const copied = document.execCommand('copy');
    textArea.remove();
    return copied;
  } catch {
    return false;
  }
}
