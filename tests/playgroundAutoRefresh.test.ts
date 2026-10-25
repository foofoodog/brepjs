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
});
