import { useEffect, useRef } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { usePlaygroundStore } from '../stores/playgroundStore';

type PanelRef = React.RefObject<PanelImperativeHandle | null>;

// Auto-expand console + editor on the *transition* into an error — not on
// every render while an error persists. Without the wasErrorRef guard, a
// user who collapses the editor for a screenshot while an error is on
// screen would see the panel snap back open immediately, since the effect
// would re-fire as `isEditorCollapsed` flips.
//
// If the editor (or console) was collapsed to start with when the error occurred,
// and the error is resolved via a reset in the parameters/properties pane,
// automatically re-collapse the code editor back to its initial collapsed state.
export function useAutoExpandOnError(
  error: string | null,
  consolePanelRef: PanelRef,
  editorAreaPanelRef: PanelRef
): void {
  const wasErrorRef = useRef(false);
  const wasEditorCollapsedBeforeErrorRef = useRef(false);
  const wasConsoleCollapsedBeforeErrorRef = useRef(false);

  useEffect(() => {
    const isError = !!error;
    const store = usePlaygroundStore.getState();

    if (isError && !wasErrorRef.current) {
      // Transition INTO error
      const isEditorCollapsed =
        editorAreaPanelRef.current?.isCollapsed() ?? store.isEditorCollapsed;
      const isConsoleCollapsed =
        consolePanelRef.current?.isCollapsed() ?? store.isConsoleCollapsed;

      wasEditorCollapsedBeforeErrorRef.current = isEditorCollapsed;
      wasConsoleCollapsedBeforeErrorRef.current = isConsoleCollapsed;
      store.setWasEditorCollapsedBeforeError(isEditorCollapsed);

      // Do NOT auto-expand editorAreaPanelRef — keep it collapsed so the user's
      // customizer and 3D viewport remain uninterrupted. The "Show Code" button
      // turns red instead to alert the user.
      if (!isEditorCollapsed) {
        if (consolePanelRef.current?.isCollapsed()) consolePanelRef.current.expand();
      }
    } else if (!isError && wasErrorRef.current) {
      // Transition OUT of error (error resolved)
      const shouldCollapse =
        (wasEditorCollapsedBeforeErrorRef.current || store.wasEditorCollapsedBeforeError) &&
        store.resetInitiatedOnError;

      if (shouldCollapse) {
        if (editorAreaPanelRef.current && !editorAreaPanelRef.current.isCollapsed()) {
          editorAreaPanelRef.current.collapse();
        }
        if (
          wasConsoleCollapsedBeforeErrorRef.current &&
          consolePanelRef.current &&
          !consolePanelRef.current.isCollapsed()
        ) {
          consolePanelRef.current.collapse();
        }
      }

      wasEditorCollapsedBeforeErrorRef.current = false;
      wasConsoleCollapsedBeforeErrorRef.current = false;
      store.setWasEditorCollapsedBeforeError(false);
      store.setResetInitiatedOnError(false);
    }
    wasErrorRef.current = isError;
  }, [error, consolePanelRef, editorAreaPanelRef]);
}
