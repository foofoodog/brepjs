import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { saveScriptFile } from '../../lib/saveScriptFile';
import {
  extractScriptParams,
  updateScriptParam,
  type ScriptParam,
  type ScriptParamValue,
} from '../../lib/scriptParams';

function stepForParam(param: ScriptParam): number {
  if (param.step !== undefined && param.step > 0) {
    return param.step;
  }
  const val = typeof param.value === 'number' ? param.value : 1;
  const abs = Math.abs(val);
  if (!Number.isInteger(val)) {
    const decimals = (String(val).split('.')[1] ?? '').length;
    return decimals >= 2 ? 0.1 : 0.5;
  }
  if (abs >= 500) return 50;
  if (abs >= 100) return 10;
  return 1;
}

function clampToParamBounds(param: ScriptParam, val: number): number {
  let res = val;
  if (param.min !== undefined && res < param.min) res = param.min;
  if (param.max !== undefined && res > param.max) res = param.max;
  return res;
}

function RevertIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 3.5v3.5h3.5" />
      <path d="M3 7a5.5 5.5 0 1 1 1.3 4.2" />
    </svg>
  );
}

function SaveIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 2v8m0 0L5 7m3 3l3-3M3 12.5h10" />
    </svg>
  );
}

function AutoRefreshIcon({
  active,
  className = 'h-3 w-3',
}: {
  active: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 8a5.5 5.5 0 0 1 9.35-3.89L13.5 5.5" />
      <path d="M13.5 2v3.5h-3.5" />
      <path d="M13.5 8a5.5 5.5 0 0 1-9.35 3.89L2.5 10.5" />
      <path d="M2.5 14v-3.5h3.5" />
      <path d="M6.3 10.2L8 5.8l1.7 4.4" strokeWidth="1.2" />
      <path d="M6.9 9h2.2" strokeWidth="1.2" />
      {!active && (
        <line x1="2.5" y1="2.5" x2="13.5" y2="13.5" stroke="#f87171" strokeWidth="1.6" />
      )}
    </svg>
  );
}

function RefreshNowIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14 8a6 6 0 1 1-2-4.5L14 5.5" />
      <path d="M14 2v3.5h-3.5" />
    </svg>
  );
}

const STEP_COMMIT_DELAY_MS = 350;

function ParamRow({
  param,
  defaultValue,
  onCommit,
}: {
  param: ScriptParam;
  defaultValue: ScriptParamValue;
  onCommit: (param: ScriptParam, nextValue: ScriptParamValue) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [pendingStepValue, setPendingStepValue] = useState<number | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paramRef = useRef(param);
  paramRef.current = param;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const clearStepTimer = () => {
    if (stepTimerRef.current !== null) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (stepTimerRef.current !== null) {
        clearTimeout(stepTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    clearStepTimer();
    setPendingStepValue(null);
  }, [param.value]);

  const effectiveValue: ScriptParamValue = pendingStepValue ?? param.value;
  const displayed = draft ?? String(effectiveValue);
  const step = stepForParam(param);
  const hasRange =
    param.type === 'number' && param.min !== undefined && param.max !== undefined;
  const isModified = effectiveValue !== defaultValue;

  const scheduleStepCommit = (next: number) => {
    clearStepTimer();
    setDraft(null);
    if (next === param.value) {
      setPendingStepValue(null);
      return;
    }
    setPendingStepValue(next);
    stepTimerRef.current = setTimeout(() => {
      stepTimerRef.current = null;
      setPendingStepValue(null);
      if (next !== paramRef.current.value) {
        onCommitRef.current(paramRef.current, next);
      }
    }, STEP_COMMIT_DELAY_MS);
  };

  const commitDraft = () => {
    if (draft === null) return;
    clearStepTimer();
    setPendingStepValue(null);
    if (param.type === 'string') {
      const next = draft;
      setDraft(null);
      if (next !== param.value) {
        onCommit(param, next);
      }
      return;
    }
    const parsed = Number(draft.trim());
    setDraft(null);
    if (Number.isFinite(parsed)) {
      const clamped = clampToParamBounds(param, parsed);
      if (clamped !== param.value) {
        onCommit(param, clamped);
      }
    }
  };

  return (
    <div className="group flex flex-col gap-1 px-3 py-1.5 hover:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <label
            htmlFor={`param-${param.key}`}
            className={`truncate font-mono text-xs font-medium ${
              isModified ? 'text-teal-light' : 'text-gray-200'
            }`}
            title={param.description ? `${param.name} — ${param.description}` : param.name}
          >
            {param.name}
          </label>
          {isModified && (
            <button
              type="button"
              onClick={() => {
                clearStepTimer();
                setPendingStepValue(null);
                setDraft(null);
                if (param.value !== defaultValue) {
                  onCommit(param, defaultValue);
                }
              }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white/10 hover:text-teal-light"
              title={`Reset ${param.name} to default (${String(defaultValue)})`}
              aria-label={`Reset ${param.name} to default`}
            >
              <RevertIcon className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        {param.options && param.options.length > 0 ? (
          <select
            id={`param-${param.key}`}
            value={String(param.value)}
            onChange={(e) => {
              const selected = param.options?.find((o) => String(o.value) === e.target.value);
              if (selected) {
                onCommit(param, selected.value);
              }
            }}
            className="max-w-[140px] rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 font-mono text-xs text-teal-light focus:border-teal-primary focus:outline-none"
          >
            {param.options.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : param.type === 'boolean' ? (
          <button
            id={`param-${param.key}`}
            type="button"
            role="switch"
            aria-checked={Boolean(param.value)}
            onClick={() => {
              onCommit(param, !param.value);
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
              param.value
                ? 'border-teal-primary bg-teal-primary/30'
                : 'border-gray-700 bg-gray-900'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                param.value ? 'translate-x-4 bg-teal-light' : 'translate-x-0.5 bg-gray-400'
              }`}
            />
          </button>
        ) : param.type === 'string' ? (
          <input
            id={`param-${param.key}`}
            type="text"
            value={displayed}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
            className="w-28 rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 font-mono text-xs text-teal-light focus:border-teal-primary focus:outline-none"
          />
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const draftNum = draft !== null ? Number(draft.trim()) : NaN;
                const numVal = Number.isFinite(draftNum) ? draftNum : Number(effectiveValue);
                const next = clampToParamBounds(param, Number((numVal - step).toFixed(4)));
                if (next !== numVal) scheduleStepCommit(next);
              }}
              disabled={param.min !== undefined && Number(effectiveValue) <= param.min}
              className="flex h-5 w-5 items-center justify-center rounded border border-gray-700 bg-surface-overlay text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              title={`Decrease ${param.name} by ${step}`}
              aria-label={`Decrease ${param.name}`}
            >
              −
            </button>
            <input
              id={`param-${param.key}`}
              type="number"
              min={param.min}
              max={param.max}
              step={param.step ?? 'any'}
              value={displayed}
              onChange={(e) => {
                clearStepTimer();
                setPendingStepValue(null);
                setDraft(e.target.value);
              }}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setDraft(null);
                  e.currentTarget.blur();
                }
              }}
              className="w-20 rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-right font-mono text-xs text-teal-light focus:border-teal-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                const draftNum = draft !== null ? Number(draft.trim()) : NaN;
                const numVal = Number.isFinite(draftNum) ? draftNum : Number(effectiveValue);
                const next = clampToParamBounds(param, Number((numVal + step).toFixed(4)));
                if (next !== numVal) scheduleStepCommit(next);
              }}
              disabled={param.max !== undefined && Number(effectiveValue) >= param.max}
              className="flex h-5 w-5 items-center justify-center rounded border border-gray-700 bg-surface-overlay text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              title={`Increase ${param.name} by ${step}`}
              aria-label={`Increase ${param.name}`}
            >
              +
            </button>
          </div>
        )}
      </div>

      {hasRange && !param.options && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="font-mono text-[10px] text-gray-500">{param.min}</span>
          <input
            type="range"
            min={param.min}
            max={param.max}
            step={step}
            value={Number(effectiveValue)}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next !== effectiveValue) {
                clearStepTimer();
                setPendingStepValue(null);
                setDraft(null);
                onCommit(param, next);
              }
            }}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-700 accent-teal-primary"
            aria-label={`${param.name} slider`}
          />
          <span className="font-mono text-[10px] text-gray-500">{param.max}</span>
        </div>
      )}

      {param.description && (
        <div className="truncate text-[10px] text-gray-500" title={param.description}>
          {param.description}
        </div>
      )}
    </div>
  );
}

export default function ParametersPanel({ onRun }: { onRun?: () => void } = {}) {
  const code = usePlaygroundStore((s) => s.code);
  const fileName = usePlaygroundStore((s) => s.fileName);
  const setCode = usePlaygroundStore((s) => s.setCode);
  const autoRefresh = usePlaygroundStore((s) => s.autoRefresh);
  const setAutoRefresh = usePlaygroundStore((s) => s.setAutoRefresh);
  const requestRun = usePlaygroundStore((s) => s.requestRun);
  const isRunning = usePlaygroundStore((s) => s.isRunning);
  const lastSuccessfulCode = usePlaygroundStore((s) => s.lastSuccessfulCode);
  const [collapsed, setCollapsed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const hasPendingChanges = lastSuccessfulCode !== null && code !== lastSuccessfulCode;

  const handleRefresh = () => {
    if (onRun) {
      onRun();
    } else {
      requestRun();
    }
  };

  const handleToggleAutoRefresh = () => {
    const next = !autoRefresh;
    setAutoRefresh(next);
    if (next && code !== lastSuccessfulCode) {
      handleRefresh();
    }
  };

  // Track initial default values per parameter for the active script
  const defaultsRef = useRef<Map<string, ScriptParamValue>>(new Map());
  const lastFileNameRef = useRef<string>(fileName);
  if (lastFileNameRef.current !== fileName) {
    lastFileNameRef.current = fileName;
    defaultsRef.current = new Map();
  }

  const params = useMemo(() => extractScriptParams(code), [code]);

  // Seed default values for any newly discovered parameters
  useEffect(() => {
    for (const p of params) {
      if (!defaultsRef.current.has(p.name)) {
        defaultsRef.current.set(p.name, p.value);
      }
    }
  }, [params]);

  const getDefaultValue = (p: ScriptParam): ScriptParamValue =>
    defaultsRef.current.get(p.name) ?? p.value;

  const modifiedParams = params.filter((p) => p.value !== getDefaultValue(p));

  const sections = useMemo(() => {
    const hasCustomSections = params.some((p) => Boolean(p.section));
    if (hasCustomSections) {
      const grouped = new Map<string, ScriptParam[]>();
      for (const p of params) {
        const sec = p.section ?? (p.group === 'args' ? 'Arguments' : 'Parameters');
        const list = grouped.get(sec) ?? [];
        list.push(p);
        grouped.set(sec, list);
      }
      return Array.from(grouped.entries()).map(([title, items]) => ({ title, items }));
    }

    const argParams = params.filter((p) => p.group === 'args');
    const constParams = params.filter((p) => p.group === 'consts');
    if (argParams.length > 0 && constParams.length > 0) {
      return [
        { title: 'Arguments', items: argParams },
        { title: 'Constants', items: constParams },
      ];
    }
    return [{ title: '', items: params }];
  }, [params]);

  if (params.length === 0) return null;

  const applyCodeUpdate = (nextCode: string) => {
    const currentCode = usePlaygroundStore.getState().code;
    if (nextCode !== currentCode) {
      if (window.location.pathname !== import.meta.env.BASE_URL) {
        history.replaceState(null, '', import.meta.env.BASE_URL);
      }
      setCode(nextCode);
    }
  };

  const handleCommit = (param: ScriptParam, nextValue: ScriptParamValue) => {
    const latestCode = usePlaygroundStore.getState().code;
    const latestParams = latestCode === code ? params : extractScriptParams(latestCode);
    const targetParam = latestParams.find((p) => p.key === param.key) ?? param;
    if (!defaultsRef.current.has(targetParam.name)) {
      defaultsRef.current.set(targetParam.name, targetParam.value);
    }
    applyCodeUpdate(updateScriptParam(latestCode, targetParam, nextValue));
  };

  const handleResetAll = () => {
    if (modifiedParams.length === 0) return;
    // Apply replacements from end of file to start so earlier character spans remain valid
    const sorted = [...modifiedParams].sort((a, b) => b.valueStart - a.valueStart);
    let nextCode = code;
    for (const p of sorted) {
      const defVal = getDefaultValue(p);
      nextCode = updateScriptParam(nextCode, p, defVal);
    }
    applyCodeUpdate(nextCode);
  };

  return (
    <div className="pointer-events-auto flex max-h-full min-h-0 w-72 sm:w-80 flex-col overflow-hidden rounded-lg border border-border-subtle bg-surface/95 shadow-xl backdrop-blur">
      <div className="flex shrink-0 items-center justify-between gap-1.5 border-b border-border-subtle px-3 py-2">
        <button
          type="button"
          onClick={() => {
            setCollapsed((c) => !c);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold text-gray-200 transition-colors hover:text-white"
          title={collapsed ? 'Expand parameters' : 'Collapse parameters'}
          aria-expanded={!collapsed}
        >
          <span className="shrink-0 text-teal-primary">⚙</span>
          <span className="truncate">Parameters</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {modifiedParams.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => {
                  void saveScriptFile();
                }}
                className="flex h-4 items-center gap-0.5 rounded px-1 text-[10px] font-medium text-teal-light transition-colors hover:bg-teal-primary/20"
                title={`Save ${fileName}`}
                aria-label={`Save ${fileName}`}
              >
                <SaveIcon className="h-2.5 w-2.5" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                className="flex h-4 items-center gap-0.5 rounded px-1 text-[10px] font-medium text-teal-light transition-colors hover:bg-teal-primary/20"
                title={`Reset ${modifiedParams.length} modified parameter${modifiedParams.length === 1 ? '' : 's'} to defaults`}
                aria-label="Reset all parameters to defaults"
              >
                <RevertIcon className="h-2.5 w-2.5" />
                <span>Reset</span>
              </button>
            </>
          )}

          {/* Auto-refresh toggle */}
          <button
            type="button"
            onClick={handleToggleAutoRefresh}
            className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
              autoRefresh
                ? 'bg-teal-primary/20 text-teal-light'
                : 'text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
            title={
              autoRefresh
                ? 'Auto-refresh is ON — changes update preview immediately (click to pause)'
                : 'Auto-refresh is OFF — changes will not recompute automatically (click to resume)'
            }
            aria-label={
              autoRefresh
                ? 'Pause auto-refresh'
                : 'Resume auto-refresh'
            }
          >
            <AutoRefreshIcon active={autoRefresh} className="h-3 w-3" />
          </button>

          {/* Refresh now (shown when auto-refresh is off) */}
          {!autoRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRunning}
              className={`relative flex h-4 w-4 items-center justify-center rounded transition-colors ${
                hasPendingChanges
                  ? 'bg-teal-primary/20 text-teal-light ring-1 ring-teal-primary/60 hover:bg-teal-primary/30'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'
              } disabled:cursor-not-allowed disabled:opacity-50`}
              title={
                isRunning
                  ? 'Computing...'
                  : hasPendingChanges
                    ? 'Refresh now (changes pending)'
                    : 'Refresh preview now'
              }
              aria-label="Refresh preview now"
            >
              <RefreshNowIcon className={`h-2.5 w-2.5 ${isRunning ? 'animate-spin' : ''}`} />
              {hasPendingChanges && !isRunning && (
                <span
                  className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-teal-light ring-1 ring-surface"
                  aria-hidden="true"
                />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setShowHelp((h) => !h);
              if (collapsed) setCollapsed(false);
            }}
            className={`flex h-4 w-4 items-center justify-center rounded text-[10px] font-semibold transition-colors ${
              showHelp
                ? 'bg-teal-primary/20 text-teal-light'
                : 'text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
            title="Customizer annotation syntax help"
            aria-label="Customizer annotation syntax help"
          >
            ?
          </button>
          <button
            type="button"
            onClick={() => {
              setCollapsed((c) => !c);
            }}
            className="text-[11px] font-normal text-gray-400 hover:text-white"
            aria-label={collapsed ? 'Expand parameters' : 'Collapse parameters'}
          >
            {params.length} {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      {!collapsed && showHelp && (
        <div className="shrink-0 border-b border-border-subtle bg-gray-950/90 px-3 py-2 text-[10px] leading-relaxed text-gray-300">
          <div className="mb-1 font-semibold text-teal-light">Customizer Syntax</div>
          <pre className="overflow-x-auto font-mono text-[9.5px] text-gray-400">
{`// Range slider [min:step:max]
const od = 22; // [10:0.5:50] Outer Ø

// Dropdown (TS union or comment)
const sz: 'M4' | 'M6' | 'M8' = 'M6';
const fit = 0.2; // [0.1:Tight, 0.2:Std]

// Toggle & explicit string
const sealed = true;
const tag: string = 'ISO';

/* [Section Name] */ or /* [Hidden] */`}
          </pre>
        </div>
      )}

      {!collapsed && (
        <div className="scrollbar-thin divide-y divide-border-subtle/50 min-h-0 overflow-y-auto py-1">
          {sections.map((section, idx) => (
            <div key={section.title || idx} className="divide-y divide-border-subtle/30">
              {section.title && (
                <div className="bg-white/[0.02] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {section.title}
                </div>
              )}
              {section.items.map((p) => (
                <ParamRow
                  key={p.key}
                  param={p}
                  defaultValue={getDefaultValue(p)}
                  onCommit={handleCommit}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
