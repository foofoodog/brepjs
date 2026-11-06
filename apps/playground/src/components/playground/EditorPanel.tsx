import '../../lib/monacoLoader';
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useToastStore } from '../../stores/toastStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { setupMonaco } from '../../lib/monacoSetup';
import { isSupportedScriptFile, saveScriptFile } from '../../lib/saveScriptFile';
import { loadScriptFile } from '../../lib/loadScriptFile';
import { extractScriptParams, offsetToPosition, type ScriptParam } from '../../lib/scriptParams';

function hasDraggedFiles(e: DragEvent<HTMLElement>): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

interface EditorPanelProps {
  onCodeChange: (code: string, opts?: { immediate?: boolean }) => void;
  onFormat?: { current: (() => void) | null };
  jumpToLineRef?: { current: ((line: number) => void) | null };
  onCollapseEditor?: () => void;
}

export default function EditorPanel({
  onCodeChange,
  onFormat,
  jumpToLineRef,
  onCollapseEditor,
}: EditorPanelProps) {
  const code = usePlaygroundStore((s) => s.code);
  const setCode = usePlaygroundStore((s) => s.setCode);
  const fileName = usePlaygroundStore((s) => s.fileName);
  const setFileName = usePlaygroundStore((s) => s.setFileName);
  const error = usePlaygroundStore((s) => s.error);
  const errorLine = usePlaygroundStore((s) => s.errorLine);
  const isEditorCollapsed = usePlaygroundStore((s) => s.isEditorCollapsed);
  const lastSuccessfulCode = usePlaygroundStore((s) => s.lastSuccessfulCode);
  const lastCommittedParamKey = usePlaygroundStore((s) => s.lastCommittedParamKey);
  const addToast = useToastStore((s) => s.addToast);
  const isMobile = useIsMobile();
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const decorationsRef = useRef<string[]>([]);
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
      if (!isExternal) {
        if (usePlaygroundStore.getState().resetInitiatedOnError) {
          usePlaygroundStore.getState().setResetInitiatedOnError(false);
        }
        if (window.location.pathname !== import.meta.env.BASE_URL) {
          history.replaceState(null, '', import.meta.env.BASE_URL);
        }
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

      if (error) {
        // Find if a specific parameter was changed or caused the error
        let targetParam: ScriptParam | undefined;
        try {
          const currentParams = extractScriptParams(code);
          if (lastCommittedParamKey) {
            targetParam = currentParams.find((p) => p.key === lastCommittedParamKey);
          }
          if (!targetParam && lastSuccessfulCode) {
            const goodParams = extractScriptParams(lastSuccessfulCode);
            targetParam = currentParams.find((p) => {
              const good = goodParams.find((g) => g.name === p.name);
              return !good || good.value !== p.value;
            });
          }
          if (!targetParam) {
            const errorLower = error.toLowerCase();
            targetParam = currentParams.find((p) => new RegExp(`\\b${p.name}\\b`, 'i').test(errorLower));
          }
        } catch {
          // ignore parsing error
        }

        if (targetParam) {
          // If the parameter is declared in a function signature, flag it there (one level up on the callstack)
          // as well as at the call site argument being passed.
          const hasDecl =
            targetParam.declStart !== undefined &&
            targetParam.declEnd !== undefined &&
            targetParam.declStart !== targetParam.valueStart;

          const primaryStartOffset = hasDecl ? targetParam.declStart! : targetParam.valueStart;
          const primaryEndOffset = hasDecl ? targetParam.declEnd! : targetParam.valueEnd;

          const startPos = offsetToPosition(code, primaryStartOffset);
          const endPos = offsetToPosition(code, primaryEndOffset);

          const markers = [
            {
              severity: monaco.MarkerSeverity.Error,
              message: `Invalid parameter '${targetParam.name}' (${targetParam.value}): ${error}`,
              startLineNumber: startPos.lineNumber,
              startColumn: startPos.column,
              endLineNumber: endPos.lineNumber,
              endColumn: endPos.column,
            },
          ];

          const newDecorations = [
            {
              range: new monaco.Range(
                startPos.lineNumber,
                startPos.column,
                endPos.lineNumber,
                endPos.column
              ),
              options: {
                isWholeLine: false,
                className: 'bg-red-500/25 ring-1 ring-red-500 rounded px-0.5',
                inlineClassName: 'text-red-300 font-bold underline decoration-red-500 underline-offset-2',
                overviewRuler: {
                  color: '#ef4444',
                  position: monaco.editor.OverviewRulerLane.Full,
                },
                hoverMessage: { value: `**Invalid parameter \`${targetParam.name}\`**: ${error}` },
              },
            },
          ];

          if (hasDecl) {
            // Also mark the call argument where the invalid value is being passed
            const valStartPos = offsetToPosition(code, targetParam.valueStart);
            const valEndPos = offsetToPosition(code, targetParam.valueEnd);
            markers.push({
              severity: monaco.MarkerSeverity.Error,
              message: `Value (${targetParam.value}) passed for '${targetParam.name}' caused error: ${error}`,
              startLineNumber: valStartPos.lineNumber,
              startColumn: valStartPos.column,
              endLineNumber: valEndPos.lineNumber,
              endColumn: valEndPos.column,
            });
            newDecorations.push({
              range: new monaco.Range(
                valStartPos.lineNumber,
                valStartPos.column,
                valEndPos.lineNumber,
                valEndPos.column
              ),
              options: {
                isWholeLine: false,
                className: 'bg-red-500/20 ring-1 ring-red-500/60 rounded px-0.5',
                inlineClassName: 'text-red-300 underline decoration-red-500/60',
                overviewRuler: {
                  color: '#ef4444',
                  position: monaco.editor.OverviewRulerLane.Full,
                },
                hoverMessage: { value: `**Value passed for \`${targetParam.name}\`**: ${error}` },
              },
            });
          }

          monaco.editor.setModelMarkers(model, 'brepjs', markers);
          decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);

          const scrollToTarget = () => {
            editor.revealLineInCenter(startPos.lineNumber);
            editor.setSelection(
              new monaco.Range(
                startPos.lineNumber,
                startPos.column,
                endPos.lineNumber,
                endPos.column
              )
            );
            editor.setPosition({ lineNumber: startPos.lineNumber, column: startPos.column });
          };
          if (!isEditorCollapsed) {
            scrollToTarget();
            requestAnimationFrame(scrollToTarget);
            setTimeout(scrollToTarget, 50);
          }
        } else if (errorLine) {
          // Fallback to errorLine only if no changed variable could be identified
          const lineCount = model.getLineCount();
          const targetLine = Math.min(Math.max(errorLine, 1), lineCount);
          monaco.editor.setModelMarkers(model, 'brepjs', [
            {
              severity: monaco.MarkerSeverity.Error,
              message: error,
              startLineNumber: targetLine,
              startColumn: 1,
              endLineNumber: targetLine,
              endColumn: model.getLineMaxColumn(targetLine),
            },
          ]);
          if (decorationsRef.current.length > 0) {
            decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
          }
          const scrollToErrorLine = () => {
            editor.revealLineInCenter(targetLine);
            editor.setPosition({ lineNumber: targetLine, column: 1 });
          };
          if (!isEditorCollapsed) {
            scrollToErrorLine();
            requestAnimationFrame(scrollToErrorLine);
            setTimeout(scrollToErrorLine, 50);
          }
        } else {
          monaco.editor.setModelMarkers(model, 'brepjs', []);
          if (decorationsRef.current.length > 0) {
            decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
          }
        }
      } else {
        monaco.editor.setModelMarkers(model, 'brepjs', []);
        if (decorationsRef.current.length > 0) {
          decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
        }
      }
    } catch {
      // Editor may be disposed during StrictMode remount — ignore
    }
  }, [error, errorLine, code, lastSuccessfulCode, lastCommittedParamKey, isEditorCollapsed]);

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

      void loadScriptFile(file);
    },
    []
  );

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
            void loadScriptFile();
          }}
          title="Load script file"
          aria-label="Load script file"
          className="pointer-events-auto flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              d="M8 10V2m0 0L5 5m3-3l3 3M3 12.5h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span>Load</span>
        </button>
        <button
          type="button"
          onClick={() => {
            void saveScriptFile();
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
        {onCollapseEditor && (
          <button
            type="button"
            onClick={onCollapseEditor}
            title="Collapse code pane"
            aria-label="Collapse code pane"
            className="pointer-events-auto flex items-center justify-center rounded px-1.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                d="M10 3.5L5.5 8 10 12.5M6 3.5v9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </button>
        )}
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
