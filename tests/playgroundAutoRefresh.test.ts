import { describe, it, expect, beforeEach } from 'vitest';
import { usePlaygroundStore } from '../apps/playground/src/stores/playgroundStore.js';

describe('playgroundStore autoRefresh & runRequest', () => {
  beforeEach(() => {
    usePlaygroundStore.setState({
      autoRefresh: true,
      runRequestSeq: 0,
      lastSuccessfulCode: null,
      code: 'const a = 1;',
    });
  });

  it('defaults autoRefresh to true', () => {
    expect(usePlaygroundStore.getState().autoRefresh).toBe(true);
  });

  it('toggles autoRefresh state', () => {
    usePlaygroundStore.getState().toggleAutoRefresh();
    expect(usePlaygroundStore.getState().autoRefresh).toBe(false);

    usePlaygroundStore.getState().toggleAutoRefresh();
    expect(usePlaygroundStore.getState().autoRefresh).toBe(true);
  });

  it('sets autoRefresh explicitly', () => {
    usePlaygroundStore.getState().setAutoRefresh(false);
    expect(usePlaygroundStore.getState().autoRefresh).toBe(false);

    usePlaygroundStore.getState().setAutoRefresh(true);
    expect(usePlaygroundStore.getState().autoRefresh).toBe(true);
  });

  it('increments runRequestSeq on requestRun', () => {
    expect(usePlaygroundStore.getState().runRequestSeq).toBe(0);
    usePlaygroundStore.getState().requestRun();
    expect(usePlaygroundStore.getState().runRequestSeq).toBe(1);
    usePlaygroundStore.getState().requestRun();
    expect(usePlaygroundStore.getState().runRequestSeq).toBe(2);
  });

  it('tracks pending changes when code differs from lastSuccessfulCode', () => {
    usePlaygroundStore.setState({
      code: 'const a = 1;',
      lastSuccessfulCode: 'const a = 1;',
    });
    const isPending = (s: typeof usePlaygroundStore) => {
      const state = s.getState();
      return state.lastSuccessfulCode !== null && state.code !== state.lastSuccessfulCode;
    };

    expect(isPending(usePlaygroundStore)).toBe(false);

    usePlaygroundStore.getState().setCode('const a = 2;');
    expect(isPending(usePlaygroundStore)).toBe(true);

    usePlaygroundStore.getState().setLastSuccessfulCode('const a = 2;');
    expect(isPending(usePlaygroundStore)).toBe(false);
  });

  it('identifies parameter causing error by comparing code to lastSuccessfulCode', async () => {
    const { extractScriptParams } = await import('../apps/playground/src/lib/scriptParams.js');
    const goodCode = `
function studBrick(studsX: number, studsY: number, plateUnits: number) {}
export default studBrick(2, 4, 3);
`;
    const badCode = `
function studBrick(studsX: number, studsY: number, plateUnits: number) {}
export default studBrick(2, 4, 0);
`;

    const goodParams = extractScriptParams(goodCode);
    const badParams = extractScriptParams(badCode);

    const changedKeys = badParams
      .filter((p) => {
        const good = goodParams.find((g) => g.name === p.name);
        return !good || good.value !== p.value;
      })
      .map((p) => p.name);

    expect(changedKeys).toEqual(['plateUnits']);
  });

  it('records declStart and declEnd for function signature parameters', async () => {
    const { extractScriptParams } = await import('../apps/playground/src/lib/scriptParams.js');
    const code = `
function studBrick(studsX: number, studsY: number, plateUnits: number) {}
export default studBrick(2, 4, 3);
`;
    const params = extractScriptParams(code);
    const plateUnitsParam = params.find((p) => p.name === 'plateUnits');
    expect(plateUnitsParam).toBeDefined();
    expect(plateUnitsParam?.declStart).toBeDefined();
    expect(plateUnitsParam?.declEnd).toBeDefined();
    const start = plateUnitsParam?.declStart ?? 0;
    const end = plateUnitsParam?.declEnd ?? 0;
    expect(code.slice(start, end)).toBe('plateUnits');
  });

  it('tracks wasEditorCollapsedBeforeError and resetInitiatedOnError flags', () => {
    expect(usePlaygroundStore.getState().wasEditorCollapsedBeforeError).toBe(false);
    expect(usePlaygroundStore.getState().resetInitiatedOnError).toBe(false);

    usePlaygroundStore.getState().setWasEditorCollapsedBeforeError(true);
    expect(usePlaygroundStore.getState().wasEditorCollapsedBeforeError).toBe(true);

    usePlaygroundStore.getState().setResetInitiatedOnError(true);
    expect(usePlaygroundStore.getState().resetInitiatedOnError).toBe(true);

    usePlaygroundStore.getState().setWasEditorCollapsedBeforeError(false);
    usePlaygroundStore.getState().setResetInitiatedOnError(false);
    expect(usePlaygroundStore.getState().wasEditorCollapsedBeforeError).toBe(false);
    expect(usePlaygroundStore.getState().resetInitiatedOnError).toBe(false);
  });

  it('tracks isEditorCollapsed in playgroundStore and defaults to true', () => {
    expect(usePlaygroundStore.getState().isEditorCollapsed).toBe(true);
    usePlaygroundStore.getState().setEditorCollapsed(false);
    expect(usePlaygroundStore.getState().isEditorCollapsed).toBe(false);
    usePlaygroundStore.getState().setEditorCollapsed(true);
    expect(usePlaygroundStore.getState().isEditorCollapsed).toBe(true);
  });

  it('marks resetInitiatedOnError when recovering from an error', () => {
    usePlaygroundStore.setState({ error: 'Kernel failed', wasEditorCollapsedBeforeError: true });
    usePlaygroundStore.getState().setResetInitiatedOnError(true);
    expect(usePlaygroundStore.getState().resetInitiatedOnError).toBe(true);

    // Simulated error resolution
    usePlaygroundStore.setState({ error: null });
    expect(usePlaygroundStore.getState().error).toBe(null);
  });

  it('converts character offsets to line and column accurately', async () => {
    const { offsetToPosition } = await import('../apps/playground/src/lib/scriptParams.js');
    const snippet = 'const a = 1;\nconst b = 2;\nconst c = 3;';
    expect(offsetToPosition(snippet, 0)).toEqual({ lineNumber: 1, column: 1 });
    // Offset at 'b' (index 19: 'const a = 1;\nconst ' -> 13 + 6 = 19)
    expect(offsetToPosition(snippet, 19)).toEqual({ lineNumber: 2, column: 7 });
  });

  it('tracks lastCommittedParamKey in playgroundStore', () => {
    expect(usePlaygroundStore.getState().lastCommittedParamKey).toBe(null);
    usePlaygroundStore.getState().setLastCommittedParamKey('plateUnits');
    expect(usePlaygroundStore.getState().lastCommittedParamKey).toBe('plateUnits');
    usePlaygroundStore.getState().setLastCommittedParamKey(null);
    expect(usePlaygroundStore.getState().lastCommittedParamKey).toBe(null);
  });

  it('suppresses execution when autoRefresh is false, but triggers on explicit refresh request', () => {
    usePlaygroundStore.setState({ autoRefresh: false, runRequestSeq: 0 });
    let runCount = 0;
    const unsubscribe = usePlaygroundStore.subscribe((state, prev) => {
      if (state.runRequestSeq !== prev.runRequestSeq) {
        runCount++;
      }
    });

    // Simulated blur/tab exit with autoRefresh off: code is updated but runRequestSeq is NOT incremented
    usePlaygroundStore.getState().setCode('export default studBrick(2, 4, 2);');
    expect(runCount).toBe(0);

    // Simulated Enter key press: triggers explicit refresh request
    usePlaygroundStore.getState().requestRun();
    expect(runCount).toBe(1);

    unsubscribe();
  });
});
