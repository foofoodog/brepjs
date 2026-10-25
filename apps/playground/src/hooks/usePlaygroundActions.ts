import { useCallback, useMemo } from 'react';
import { track } from '@vercel/analytics';
import { captureEvent } from '../lib/posthog';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { useToastStore } from '../stores/toastStore';
import { useViewerStore } from '../stores/viewerStore';
import { useCodeExecution } from './useCodeExecution';
import { useUrlState } from './useUrlState';
import { useScreenshot } from './useScreenshot';
import { clearDraft } from './useDraftPersistence';
import { copyToClipboard } from '../lib/copyToClipboard';
import { meshesToLayerlingClipboard } from '../lib/layerlingClipboard';
import { DEFAULT_CODE } from '../lib/constants';
import type { Example } from '../lib/examples';

export interface PlaygroundActions {
  onCodeChange: (code: string, opts?: { immediate?: boolean }) => void;
  handleRun: () => void;
  handleShare: () => void;
  handleExportSTL: () => void;
  handleExportSTEP: () => void;
  handleExportLYL: () => void;
  handleExportDXF: () => void;
  handleExportIFC: () => void;
  handleExportFiles: () => void;
  handleCopyCode: () => void;
  handleResetToDefault: () => void;
  handleResetViewer: () => void;
  handleScreenshot: () => void;
  handleLoadExample: (example: Example) => void;
}

export function usePlaygroundActions(): PlaygroundActions {
  const code = usePlaygroundStore((s) => s.code);
  const addToast = useToastStore((s) => s.addToast);
  const { runCode, exportSTL, exportSTEP, exportDXF, exportIFC, exportFiles, debouncedRun } =
    useCodeExecution();
  const { copyShareUrl, buildShareUrl } = useUrlState();
  const handleScreenshot = useScreenshot();
  const resetViewerDefaults = useViewerStore((s) => s.resetViewerDefaults);

  // Typing debounces; an external buffer swap (example/share/draft load) runs
  // immediately so the viewer reflects the switch without the 450 ms typing
  // delay — that lag was what made example switching feel unreliable.
  // When autoRefresh is paused, automatic execution on code change is suppressed
  // so the user can tweak parameters or edit code without firing expensive kernel runs.
  const onCodeChange = useCallback(
    (newCode: string, opts?: { immediate?: boolean }) => {
      const autoRefresh = usePlaygroundStore.getState().autoRefresh;
      if (!autoRefresh) return;
      if (opts?.immediate) runCode(newCode);
      else debouncedRun(newCode);
    },
    [debouncedRun, runCode]
  );

  const handleRun = useCallback(() => {
    const currentCode = usePlaygroundStore.getState().code;
    runCode(currentCode);
    track('playground_run');
    captureEvent('playground_run');
  }, [runCode]);

  const handleExportSTL = useCallback(() => {
    exportSTL(code);
    addToast('Exporting STL...');
    track('playground_export', { format: 'stl' });
    captureEvent('playground_export', { format: 'stl' });
  }, [exportSTL, code, addToast]);

  const handleExportSTEP = useCallback(() => {
    exportSTEP(code);
    addToast('Exporting STEP...');
    track('playground_export', { format: 'step' });
    captureEvent('playground_export', { format: 'step' });
  }, [exportSTEP, code, addToast]);

  const handleExportLYL = useCallback(() => {
    const meshes = usePlaygroundStore.getState().meshes;
    const result = meshesToLayerlingClipboard(meshes);
    if (!result) {
      addToast('No model to copy — check that your code returns a shape.');
      return;
    }
    void copyToClipboard(result.text).then((copied) => {
      addToast(
        copied ? 'Copied for Layerling — paste with Ctrl+V' : 'Clipboard unavailable'
      );
    });
    track('playground_export', { format: 'lyl' });
    captureEvent('playground_export', { format: 'lyl' });
  }, [addToast]);

  const handleExportDXF = useCallback(() => {
    exportDXF(code);
    addToast('Exporting DXF...');
    track('playground_export', { format: 'dxf' });
    captureEvent('playground_export', { format: 'dxf' });
  }, [exportDXF, code, addToast]);

  const handleExportIFC = useCallback(() => {
    exportIFC(code);
    addToast('Exporting IFC...');
    track('playground_export', { format: 'ifc' });
    captureEvent('playground_export', { format: 'ifc' });
  }, [exportIFC, code, addToast]);

  const handleExportFiles = useCallback(() => {
    exportFiles(code);
    addToast('Exporting files...');
    track('playground_export', { format: 'files' });
    captureEvent('playground_export', { format: 'files' });
  }, [exportFiles, code, addToast]);

  // On touch devices with the Web Share API, hand the permalink to the native
  // share sheet (Messages / AirDrop / etc.); everywhere else fall back to the
  // familiar copy-to-clipboard + toast. A dismissed share sheet rejects with
  // AbortError, which we swallow.
  const handleShare = useCallback(() => {
    const latestCode = usePlaygroundStore.getState().code;
    const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      const url = buildShareUrl(latestCode);
      void navigator
        .share({ title: 'brepjs Playground', url })
        // Only count a share once the sheet actually completes — a dismissed
        // sheet rejects with AbortError and must not inflate the share metric.
        .then(() => {
          track('playground_share');
          captureEvent('playground_share');
        })
        .catch(() => {
          /* user dismissed the share sheet */
        });
    } else {
      void copyShareUrl(latestCode);
      addToast('Link copied to clipboard');
      track('playground_share');
      captureEvent('playground_share');
    }
  }, [buildShareUrl, copyShareUrl, addToast]);

  const handleResetToDefault = useCallback(() => {
    const store = usePlaygroundStore.getState();
    store.setCode(DEFAULT_CODE);
    store.setFileName('stud-brick.ts');
    clearDraft();
    addToast('Reset to default code');
    runCode(DEFAULT_CODE);
  }, [addToast, runCode]);

  // Loading swaps the editor buffer through the store; EditorPanel's sync
  // effect picks it up and replaces content via Monaco's pushEditOperations,
  // which preserves the undo stack — Cmd+Z restores prior work if the user
  // overwrites edits by accident.
  const handleLoadExample = useCallback(
    (example: Example) => {
      const store = usePlaygroundStore.getState();
      store.setCode(example.code);
      store.setFileName(`${example.id}.ts`);
      addToast(`Loaded: ${example.label}`);
      runCode(example.code);
    },
    [addToast, runCode]
  );

  // copyToClipboard handles both undefined `navigator.clipboard` (HTTP /
  // sandboxed iframe / older browsers) and a sync throw — neither of which
  // a bare `navigator.clipboard?.writeText(...).then(...)` chain catches.
  const handleCopyCode = useCallback(() => {
    void copyToClipboard(code).then((copied) => {
      addToast(copied ? 'Code copied to clipboard' : 'Clipboard unavailable');
    });
  }, [code, addToast]);

  const handleResetViewer = useCallback(() => {
    resetViewerDefaults();
    addToast('Viewer settings reset');
  }, [resetViewerDefaults, addToast]);

  return useMemo(
    () => ({
      onCodeChange,
      handleRun,
      handleShare,
      handleExportSTL,
      handleExportSTEP,
      handleExportLYL,
      handleExportDXF,
      handleExportIFC,
      handleExportFiles,
      handleCopyCode,
      handleResetToDefault,
      handleResetViewer,
      handleScreenshot,
      handleLoadExample,
    }),
    [
      onCodeChange,
      handleRun,
      handleShare,
      handleExportSTL,
      handleExportSTEP,
      handleExportLYL,
      handleExportDXF,
      handleExportIFC,
      handleExportFiles,
      handleCopyCode,
      handleResetToDefault,
      handleResetViewer,
      handleScreenshot,
      handleLoadExample,
    ]
  );
}
