import { usePlaygroundStore } from '../stores/playgroundStore';
import { useToastStore } from '../stores/toastStore';

export const SCRIPT_FILE_RE = /\.(?:m|c)?[jt]sx?$/i;

export function isSupportedScriptFile(file: { name: string; type?: string }): boolean {
  if (SCRIPT_FILE_RE.test(file.name)) return true;
  return (
    file.type === 'text/javascript' ||
    file.type === 'application/javascript' ||
    file.type === 'application/x-javascript' ||
    file.type === 'text/typescript'
  );
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: {
    description?: string;
    accept: Record<string, string[]>;
  }[];
}

interface FileSystemWritableFileStreamLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandleLike {
  name: string;
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
};

function triggerBlobDownload(content: string, filename: string): void {
  const mime = filename.endsWith('.js') ? 'text/javascript' : 'text/typescript';
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function saveScriptFile(): Promise<void> {
  const {
    code: currentCode,
    fileName: currentFileName,
    setFileName,
  } = usePlaygroundStore.getState();
  const { addToast } = useToastStore.getState();
  const win = window as WindowWithSavePicker;

  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: currentFileName,
        types: [
          {
            description: 'TypeScript File',
            accept: { 'text/typescript': ['.ts', '.mts'] },
          },
          {
            description: 'JavaScript File',
            accept: { 'text/javascript': ['.js', '.mjs'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(currentCode);
      await writable.close();
      setFileName(handle.name);
      addToast(`Saved ${handle.name}`);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      addToast('Failed to save file');
    }
    return;
  }

  // Fallback for browsers without File System Access API (e.g. Firefox/Safari)
  const chosenName = window.prompt('Save file as:', currentFileName)?.trim();
  if (!chosenName) return;
  const normalizedName = SCRIPT_FILE_RE.test(chosenName) ? chosenName : `${chosenName}.ts`;
  setFileName(normalizedName);
  triggerBlobDownload(currentCode, normalizedName);
  addToast(`Downloaded ${normalizedName}`);
}
