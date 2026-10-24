import '../../lib/monacoLoader';
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useToastStore } from '../../stores/toastStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { setupMonaco } from '../../lib/monacoSetup';

const SCRIPT_FILE_RE = /\.(?:m|c)?[jt]sx?$/i;

function hasDraggedFiles(e: DragEvent<HTMLElement>): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

function isSupportedScriptFile(file: File): boolean {
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

interface EditorPanelProps {
  onCodeChange: (code: string, opts?: { immediate?: boolean }) => void;
  onFormat?: { current: (() => void) | null };
  jumpToLineRef?: { current: ((line: number) => void) | null };
}

export default function EditorPanel({ onCodeChange, onFormat, jumpToLineRef }: EditorPanelProps) {
  const code = usePlaygroundStore((s) => s.code);
  const setCode = usePlaygroundStore((s) => s.setCode);
  const fileName = usePlaygroundStore((s) => s.fileName);
  const setFileName = usePlaygroundStore((s) => s.setFileName);
  const error = usePlaygroundStore((s) => s.error);
  const errorLine = usePlaygroundStore((s) => s.errorLine);
  const addToast = useToastStore((s) => s.addToast);
  const isMobile = useIsMobile();
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  // Mirrors the last value we know the model holds. The sync effect and the
  // mount reconcile set it to a programmatically-pushed value before the edit;
  // genuine typing changes the model to something else. handleChange uses the
  // equality to tell an echoed buffer swap (run immediately) from typing
  // (debounce).
  const lastUserCodeRef = useRef(code);

  // beforeMount fires before the Editor instance is created, so the theme is
  // registered ahead of first paint and we no longer flash from `vs-dark`.
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    setupMonaco(monaco);
  }, []);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // A setCode (share link / draft restore / example) can land before Monaco
      // finishes its async mount; the sync effect early-returns while editorRef
      // is null and never re-runs, leaving the buffer stale. Reconcile to the
      // authoritative store code now. The echoed change runs immediately via
      // handleChange's external-equality check.
      const current = usePlaygroundStore.getState().code;
      if (editor.getValue() !== current) {
        lastUserCodeRef.current = current;
        editor.setValue(current);
      }

      // Register format function for external access
      if (onFormat) {
        onFormat.current = () => {
          void editor.getAction('editor.action.formatDocument')?.run();
        };
      }
      // Expose a jump-to-line bridge so the console panel's "Go to line"
      // button can scroll the editor to the offending line and focus it.
      if (jumpToLineRef) {
        jumpToLineRef.current = (line: number) => {
          const model = editor.getModel();
          if (!model) return;
          const lineCount = model.getLineCount();
          const target = Math.min(Math.max(line, 1), lineCount);
          editor.revealLineInCenter(target);
          editor.setPosition({ lineNumber: target, column: 1 });
          editor.focus();
        };
      }
    },
    [onFormat, jumpToLineRef]
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      const newCode = value ?? '';
      // An echo of a programmatic buffer swap arrives equal to the value the
      // sync effect/mount reconcile just recorded; typing differs from it.
      const isExternal = newCode === lastUserCodeRef.current;
      lastUserCodeRef.current = newCode;
      if (!isExternal && window.location.pathname !== import.meta.env.BASE_URL) {
        history.replaceState(null, '', import.meta.env.BASE_URL);
      }
      setCode(newCode);
      onCodeChange(newCode, { immediate: isExternal });
    },
    [setCode, onCodeChange]
  );

  // Sync external code changes (example picker, URL state) to editor.
  // We replace the model contents through pushEditOperations so the user's
  // undo stack survives loading an example.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (code === lastUserCodeRef.current) return;

    lastUserCodeRef.current = code;
    const model = editor.getModel();
    if (!model) {
      editor.setValue(code);
      return;
    }
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: code }], () => null);
  }, [code]);

  // Update error markers
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    try {
      const model = editor.getModel();
      if (!model) return;

      if (error && errorLine) {
        // Clamp to the current line count — a stale error line from a previous
        // run can exceed the buffer after the user shortens the file.
        const lineCount = model.getLineCount();
        const line = Math.min(Math.max(errorLine, 1), lineCount);
        monaco.editor.setModelMarkers(model, 'brepjs', [
          {
            severity: monaco.MarkerSeverity.Error,
            message: error,
            startLineNumber: line,
            startColumn: 1,
            endLineNumber: line,
            endColumn: model.getLineMaxColumn(line),
          },
        ]);
      } else {
        monaco.editor.setModelMarkers(model, 'brepjs', []);
      }
    } catch {
      // Editor may be disposed during StrictMode remount — ignore
    }
  }, [error, errorLine]);

  const handleDragEnterCapture = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  }, []);

  const handleDragOverCapture = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingFile(true);
  }, []);

  const handleDragLeaveCapture = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (
      dragDepthRef.current === 0 ||
      !e.currentTarget.contains(e.relatedTarget as Node | null)
    ) {
      dragDepthRef.current = 0;
      setIsDraggingFile(false);
    }
  }, []);

  const handleDropCapture = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(e) && e.dataTransfer.files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDraggingFile(false);

      const file = e.dataTransfer.files[0];
      if (!file) return;

      if (!isSupportedScriptFile(file)) {
        addToast('Unsupported file — drop a .js or .ts file');
        return;
      }

      void file
        .text()
        .then((content) => {
          if (window.location.pathname !== import.meta.env.BASE_URL) {
            history.replaceState(null, '', import.meta.env.BASE_URL);
          }
          setFileName(file.name);
          setCode(content);
          addToast(`Loaded ${file.name}`);
        })
        .catch(() => {
          addToast(`Failed to read ${file.name}`);
        });
    },
    [setCode, setFileName, addToast]
  );

  const handleSaveFile = useCallback(async () => {
    const { code: currentCode, fileName: currentFileName } = usePlaygroundStore.getState();
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
  }, [setFileName, addToast]);

  return (
    <div
      className="relative h-full w-full"
      onDragEnterCapture={handleDragEnterCapture}
      onDragOverCapture={handleDragOverCapture}
      onDragLeaveCapture={handleDragLeaveCapture}
      onDropCapture={handleDropCapture}
    >
      <Editor
        height="100%"
        defaultLanguage="typescript"
        path="playground.ts"
        defaultValue={code}
        keepCurrentModel
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        theme="brepjs-dark"
        options={{
          // 16px on phones: below 16px, iOS Safari auto-zooms the whole page when
          // the editor gains focus, which breaks the fixed full-height layout.
          fontSize: isMobile ? 16 : 14,
          lineHeight: isMobile ? 24 : 22,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          wordWrap: 'on',
          tabSize: 2,
          automaticLayout: true,
          suggestOnTriggerCharacters: true,
          renderLineHighlight: 'none',
          dropIntoEditor: { enabled: false },
        }}
      />
      <div className="pointer-events-none absolute right-4 top-3 z-10 flex items-center gap-1 rounded-lg border border-white/10 bg-[#1a1d21]/75 p-1 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => {
            void handleSaveFile();
          }}
          title={`Save ${fileName}`}
          aria-label={`Save ${fileName}`}
          className="pointer-events-auto flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              d="M8 2v8m0 0L5 7m3 3l3-3M3 12.5h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span>Save</span>
        </button>
      </div>
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-teal-primary bg-gray-950/75 backdrop-blur-[1px]">
          <div className="rounded-lg border border-teal-primary/40 bg-surface px-4 py-2.5 text-xs font-semibold text-teal-light shadow-lg">
            Drop JS / TS file to load into editor
          </div>
        </div>
      )}
    </div>
  );
}
