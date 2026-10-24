export type ScriptParamValue = number | boolean | string;

export interface ScriptParamOption {
  value: ScriptParamValue;
  label: string;
}

export interface ScriptParam {
  /** Unique key for React rendering */
  key: string;
  /** Variable or parameter identifier */
  name: string;
  /** Parameter value type */
  type: 'number' | 'boolean' | 'string';
  /** Current value */
  value: ScriptParamValue;
  /** Raw literal text in the source code (including quotes for strings) */
  raw: string;
  /** Start index (inclusive) of the value literal in `code` */
  valueStart: number;
  /** End index (exclusive) of the value literal in `code` */
  valueEnd: number;
  /** Optional human-readable description from trailing or preceding comment */
  description?: string;
  /** Optional minimum value (from OpenSCAD `// [min:max]` or `// [min:step:max]`) */
  min?: number;
  /** Optional maximum value (from OpenSCAD `// [min:max]` or `// [min:step:max]`) */
  max?: number;
  /** Optional step value (from OpenSCAD `// [min:step:max]`) */
  step?: number;
  /** Optional dropdown choices (from TS union type or OpenSCAD `// [a, b, c]`) */
  options?: ScriptParamOption[];
  /** Built-in group ('args' | 'consts') */
  group: 'args' | 'consts';
  /** Optional custom section name from OpenSCAD `/* [Section Name] *\/` */
  section?: string;
}

const NUM_RE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const BOOL_RE = /^(?:true|false)$/;
const STR_RE = /^(['"])((?:\\.|(?!\1)[^\\\n])*)\1$/;

interface CommentMeta {
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: ScriptParamOption[];
  hidden?: boolean;
}

/**
 * Parse OpenSCAD Customizer metadata from a comment string.
 *
 * Supported formats in trailing (`// ...`) and/or preceding (`// ...`) comments:
 * - Range: `// [min:max]` or `// [min:step:max]` (optionally followed by description)
 * - Dropdown list: `// [opt1, opt2, opt3]` or `// [val1:Label 1, val2:Label 2]`
 * - Hidden marker: `// [hidden]`
 * - Plain description: `// Inner diameter (mm)`
 */
export function parseCustomizerComment(
  trailingComment?: string,
  precedingComment?: string
): CommentMeta {
  const meta: CommentMeta = {};
  const descParts: string[] = [];

  if (precedingComment) {
    const cleanPre = precedingComment.trim();
    if (cleanPre && !/^\[[^[\]]+\]$/.test(cleanPre)) {
      descParts.push(cleanPre);
    }
  }

  if (trailingComment) {
    let rem = trailingComment.trim();

    const bracketMatch = /^\[([^[\]]+)\]\s*(.*)$/.exec(rem);
    if (bracketMatch) {
      const inner = bracketMatch[1].trim();
      rem = bracketMatch[2].trim();

      if (/^hidden$/i.test(inner)) {
        meta.hidden = true;
      } else if (inner.includes(',') || (!inner.includes(':') && inner.length > 0 && !NUM_RE.test(inner))) {
        const rawParts = inner.split(',').map((s) => s.trim()).filter(Boolean);
        if (rawParts.length > 0) {
          meta.options = rawParts.map((part) => {
            const colonIdx = part.indexOf(':');
            if (colonIdx !== -1) {
              const rawVal = stripQuotes(part.slice(0, colonIdx).trim());
              const label = part.slice(colonIdx + 1).trim();
              return {
                value: coerceOptionValue(rawVal),
                label: label || rawVal,
              };
            }
            const cleanVal = stripQuotes(part);
            return {
              value: coerceOptionValue(cleanVal),
              label: cleanVal,
            };
          });
        }
      } else if (inner.includes(':')) {
        const parts = inner.split(':').map((s) => s.trim());
        if (parts.length === 2) {
          const min = Number(parts[0]);
          const max = Number(parts[1]);
          if (Number.isFinite(min) && Number.isFinite(max)) {
            meta.min = min;
            meta.max = max;
          }
        } else if (parts.length === 3) {
          const min = Number(parts[0]);
          const step = Number(parts[1]);
          const max = Number(parts[2]);
          if (Number.isFinite(min)) meta.min = min;
          if (Number.isFinite(step) && step > 0) meta.step = step;
          if (Number.isFinite(max)) meta.max = max;
        }
      } else if (NUM_RE.test(inner)) {
        const max = Number(inner);
        if (Number.isFinite(max) && max > 0) {
          meta.min = 0;
          meta.max = max;
        }
      }
    }

    if (rem) {
      descParts.push(rem);
    }
  }

  if (descParts.length > 0) {
    meta.description = descParts.join(' — ');
  }

  return meta;
}

function stripQuotes(s: string): string {
  const m = STR_RE.exec(s);
  return m ? m[2] : s;
}

function coerceOptionValue(raw: string): ScriptParamValue {
  if (NUM_RE.test(raw)) return Number(raw);
  if (BOOL_RE.test(raw)) return raw === 'true';
  return raw;
}

/**
 * Extract top-level `type Alias = ...;` definitions so parameter type
 * annotations referencing a union type alias can resolve their literal options.
 */
function extractTypeAliases(code: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /^\s*(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^;]+);/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

/**
 * Parse a TypeScript type annotation (e.g. `'M4' | 'M6' | 'M8'`, `2 | 4 | 8`,
 * `string`, `number`, `boolean`, or a `type` alias name) into literal union
 * options and/or an explicit primitive type.
 */
function parseTsTypeAnnotation(
  typeText: string | undefined,
  typeAliases: Map<string, string>
): { explicitType?: 'number' | 'boolean' | 'string'; options?: ScriptParamOption[] } {
  if (!typeText) return {};
  const resolved = typeAliases.get(typeText.trim()) ?? typeText.trim();

  if (resolved === 'string' || resolved === 'number' || resolved === 'boolean') {
    return { explicitType: resolved };
  }

  if (resolved.includes('|')) {
    const parts = resolved
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);
    const options: ScriptParamOption[] = [];
    for (const part of parts) {
      const strMatch = STR_RE.exec(part);
      if (strMatch) {
        options.push({ value: strMatch[2], label: strMatch[2] });
      } else if (NUM_RE.test(part)) {
        options.push({ value: Number(part), label: part });
      } else if (BOOL_RE.test(part)) {
        options.push({ value: part === 'true', label: part });
      } else {
        return {};
      }
    }
    if (options.length > 0) {
      const firstVal = options[0].value;
      const explicitType =
        typeof firstVal === 'number'
          ? 'number'
          : typeof firstVal === 'boolean'
            ? 'boolean'
            : 'string';
      return { explicitType, options };
    }
  }

  return {};
}

function getLineComment(code: string, indexInLine: number): string | undefined {
  const lineEnd = code.indexOf('\n', indexInLine);
  const end = lineEnd === -1 ? code.length : lineEnd;
  const slice = code.slice(indexInLine, end);
  const commentIdx = slice.indexOf('//');
  if (commentIdx === -1) return undefined;
  const text = slice.slice(commentIdx + 2).trim();
  return text || undefined;
}

function getPrecedingLineComment(code: string, itemIndex: number): string | undefined {
  const currentLineStart = code.lastIndexOf('\n', itemIndex - 1) + 1;
  if (currentLineStart === 0) return undefined;
  const prevLineEnd = currentLineStart - 1;
  const prevLineStart = code.lastIndexOf('\n', prevLineEnd - 1) + 1;
  const prevLine = code.slice(prevLineStart, prevLineEnd).trim();
  if (prevLine.startsWith('//')) {
    const text = prevLine.slice(2).trim();
    if (text && !/^\[[^[\]]+\]$/.test(text)) {
      return text;
    }
  }
  return undefined;
}

interface SectionMarker {
  index: number;
  name: string;
}

function extractSectionMarkers(code: string): SectionMarker[] {
  const markers: SectionMarker[] = [];
  const re = /\/\*+\s*\[\s*([^[\]*\n]+?)\s*\]\s*\*+\/|^[ \t]*\/\/\s*\[\s*([^[\]\n]+?)\s*\][ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const rawName = (m[1] ?? m[2] ?? '').trim();
    if (!rawName || rawName.includes(':') || rawName.includes(',')) continue;
    markers.push({ index: m.index, name: rawName });
  }
  return markers;
}

function getSectionAt(markers: SectionMarker[], index: number): string | undefined {
  let current: string | undefined;
  for (const m of markers) {
    if (m.index <= index) {
      current = m.name;
    } else {
      break;
    }
  }
  return current;
}

interface ParsedParamDef {
  name: string;
  nameIndex: number;
  typeAnnotation?: string;
  defaultRaw?: string;
  defaultStart?: number;
  defaultEnd?: number;
  trailingComment?: string;
  precedingComment?: string;
}

function findMatchingClose(code: string, openIndex: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openIndex; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inSingle) {
      if (ch === '\\') i++;
      else if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') i++;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') i++;
      else if (ch === '`') inTemplate = false;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }

    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelCommas(
  code: string,
  regionStart: number,
  regionEnd: number
): { start: number; end: number }[] {
  const items: { start: number; end: number }[] = [];
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let itemStart = regionStart;

  for (let i = regionStart; i < regionEnd; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inSingle) {
      if (ch === '\\') i++;
      else if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') i++;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }

    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === ',' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      items.push({ start: itemStart, end: i });
      itemStart = i + 1;
    }
  }
  if (itemStart < regionEnd) {
    items.push({ start: itemStart, end: regionEnd });
  }
  return items;
}

function trimSpan(code: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  while (s < end) {
    while (s < end && /\s/.test(code[s])) s++;
    if (code[s] === '/' && code[s + 1] === '/') {
      const nl = code.indexOf('\n', s + 2);
      s = nl === -1 ? end : nl + 1;
    } else if (code[s] === '/' && code[s + 1] === '*') {
      const close = code.indexOf('*/', s + 2);
      s = close === -1 ? end : close + 2;
    } else {
      break;
    }
  }
  let e = end;
  while (e > s && /\s/.test(code[e - 1])) e--;
  return { start: s, end: e };
}

function parseSingleParamItem(code: string, rawStart: number, rawEnd: number): ParsedParamDef | null {
  const { start, end } = trimSpan(code, rawStart, rawEnd);
  if (start >= end) return null;

  const text = code.slice(start, end);
  const nameMatch = /^([A-Za-z_$][A-Za-z0-9_$]*)/.exec(text);
  if (!nameMatch) return null;
  const name = nameMatch[1];

  // Find top-level `:` (type annotation) and `=` (default/initializer)
  let colonIdx = -1;
  let eqIdx = -1;
  let depthAngle = 0;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = start + name.length; i < end; i++) {
    const ch = code[i];
    const next = code[i + 1];
    if (inSingle) {
      if (ch === '\\') i++;
      else if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') i++;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    else if (ch === '{') depthBrace++;
    else if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);
    else if (ch === '[') depthBracket++;
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === '<') depthAngle++;
    else if (ch === '>' && code[i - 1] !== '=') depthAngle = Math.max(0, depthAngle - 1);
    else if (
      ch === ':' &&
      colonIdx === -1 &&
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0 &&
      depthAngle === 0
    ) {
      colonIdx = i;
    } else if (
      ch === '=' &&
      next !== '>' &&
      next !== '=' &&
      code[i - 1] !== '=' &&
      code[i - 1] !== '!' &&
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0 &&
      depthAngle === 0
    ) {
      eqIdx = i;
      break;
    }
  }

  let typeAnnotation: string | undefined;
  if (colonIdx !== -1 && (eqIdx === -1 || colonIdx < eqIdx)) {
    const typeEnd = eqIdx === -1 ? end : eqIdx;
    typeAnnotation = code.slice(colonIdx + 1, typeEnd).trim() || undefined;
  }

  const precedingComment = getPrecedingLineComment(code, start);
  const trailingAfterEnd = getLineComment(code, end);

  if (eqIdx === -1) {
    return {
      name,
      nameIndex: start,
      typeAnnotation,
      trailingComment: trailingAfterEnd,
      precedingComment,
    };
  }

  const valSpan = trimSpan(code, eqIdx + 1, end);
  const valSlice = code.slice(valSpan.start, valSpan.end);
  const inlineCommentIdx = findCommentOutsideStrings(valSlice);
  const cleanEnd =
    inlineCommentIdx === -1 ? valSpan.end : valSpan.start + inlineCommentIdx;
  const trimmedVal = trimSpan(code, valSpan.start, cleanEnd);
  const valRaw = code.slice(trimmedVal.start, trimmedVal.end);

  return {
    name,
    nameIndex: start,
    typeAnnotation,
    defaultRaw: valRaw,
    defaultStart: trimmedVal.start,
    defaultEnd: trimmedVal.end,
    trailingComment: trailingAfterEnd ?? getLineComment(code, trimmedVal.end),
    precedingComment,
  };
}

function findCommentOutsideStrings(slice: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    if (inSingle) {
      if (ch === '\\') i++;
      else if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') i++;
      else if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '/' && slice[i + 1] === '/') return i;
  }
  return -1;
}

function classifyLiteral(
  raw: string,
  allowUnannotatedStrings: boolean,
  hasOptionsOrExplicitString: boolean
): { type: 'number' | 'boolean' | 'string'; value: ScriptParamValue } | null {
  if (NUM_RE.test(raw)) {
    return { type: 'number', value: Number(raw) };
  }
  if (BOOL_RE.test(raw)) {
    return { type: 'boolean', value: raw === 'true' };
  }
  const strMatch = STR_RE.exec(raw);
  if (strMatch && (allowUnannotatedStrings || hasOptionsOrExplicitString)) {
    return { type: 'string', value: strMatch[2] };
  }
  return null;
}

function buildScriptParam(
  keyPrefix: string,
  name: string,
  raw: string,
  valueStart: number,
  valueEnd: number,
  group: 'args' | 'consts',
  allowUnannotatedStrings: boolean,
  typeAliases: Map<string, string>,
  typeAnnotation?: string,
  trailingComment?: string,
  precedingComment?: string,
  section?: string
): ScriptParam | null {
  if (section && /^hidden$/i.test(section)) {
    return null;
  }
  const meta = parseCustomizerComment(trailingComment, precedingComment);
  if (meta.hidden) {
    return null;
  }
  const tsMeta = parseTsTypeAnnotation(typeAnnotation, typeAliases);
  const options = meta.options ?? tsMeta.options;
  const hasOptionsOrExplicitString =
    Boolean(options) || tsMeta.explicitType === 'string';

  const classified = classifyLiteral(raw, allowUnannotatedStrings, hasOptionsOrExplicitString);
  if (!classified) {
    return null;
  }
  return {
    key: `${keyPrefix}-${name}-${valueStart}`,
    name,
    type: classified.type,
    value: classified.value,
    raw,
    valueStart,
    valueEnd,
    description: meta.description,
    min: meta.min,
    max: meta.max,
    step: meta.step,
    options,
    group,
    section,
  };
}

/**
 * Extract editable parameters from a playground script, supporting:
 * - Zero-annotation automatic inference on existing examples
 * - TypeScript type annotations (e.g. `'M4' | 'M6' | 'M8'`, `4 | 6 | 8`, `: string`)
 * - OpenSCAD Customizer comment metadata (`// [min:step:max]`, `// [a, b]`, `/* [Section] *\/`)
 */
export function extractScriptParams(code: string): ScriptParam[] {
  const params: ScriptParam[] = [];
  const seenNames = new Set<string>();
  const sectionMarkers = extractSectionMarkers(code);
  const typeAliases = extractTypeAliases(code);

  // 1. Check if `export default` invokes a named function
  const exportCallRe =
    /export\s+default\s+(?:present\s*\(\s*)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  const exportMatch = exportCallRe.exec(code);

  let targetFnBodyStart = -1;
  let targetFnBodyEnd = -1;

  if (exportMatch) {
    const fnName = exportMatch[1];
    const callOpenParen = exportMatch.index + exportMatch[0].length - 1;
    const callCloseParen = findMatchingClose(code, callOpenParen, '(', ')');

    const fnDeclRe = new RegExp(`\\bfunction\\s+${fnName}\\s*\\(`, 'g');
    const fnDeclMatch = fnDeclRe.exec(code);

    if (fnDeclMatch && callCloseParen !== -1) {
      const paramOpenParen = fnDeclMatch.index + fnDeclMatch[0].length - 1;
      const paramCloseParen = findMatchingClose(code, paramOpenParen, '(', ')');

      if (paramCloseParen !== -1) {
        const bodyOpenBrace = code.indexOf('{', paramCloseParen);
        if (bodyOpenBrace !== -1) {
          targetFnBodyStart = bodyOpenBrace + 1;
          targetFnBodyEnd = findMatchingClose(code, bodyOpenBrace, '{', '}');
        }

        const innerTrimmed = trimSpan(code, paramOpenParen + 1, paramCloseParen);
        if (code[innerTrimmed.start] === '{') {
          const closeBrace = findMatchingClose(code, innerTrimmed.start, '{', '}');
          if (closeBrace !== -1) {
            // Check for an object type annotation after `}` like `}: { prop?: 'a' | 'b' }`
            const propTypes = new Map<string, string>();
            const afterBrace = code.slice(closeBrace + 1, paramCloseParen);
            const colonBraceIdx = afterBrace.indexOf('{');
            if (colonBraceIdx !== -1) {
              const typeBraceOpen = closeBrace + 1 + colonBraceIdx;
              const typeBraceClose = findMatchingClose(code, typeBraceOpen, '{', '}');
              if (typeBraceClose !== -1) {
                const typeBody = code.slice(typeBraceOpen + 1, typeBraceClose);
                const propTypeRe = /([A-Za-z_$][A-Za-z0-9_$]*)\s*\??\s*:\s*([^;,\n]+)/g;
                let pm: RegExpExecArray | null;
                while ((pm = propTypeRe.exec(typeBody)) !== null) {
                  propTypes.set(pm[1], pm[2].trim());
                }
              }
            }

            const propSpans = splitTopLevelCommas(code, innerTrimmed.start + 1, closeBrace);
            for (const span of propSpans) {
              const def = parseSingleParamItem(code, span.start, span.end);
              if (
                def &&
                def.defaultRaw !== undefined &&
                def.defaultStart !== undefined &&
                def.defaultEnd !== undefined
              ) {
                const section = getSectionAt(sectionMarkers, def.nameIndex);
                const param = buildScriptParam(
                  'arg',
                  def.name,
                  def.defaultRaw,
                  def.defaultStart,
                  def.defaultEnd,
                  'args',
                  true,
                  typeAliases,
                  def.typeAnnotation ?? propTypes.get(def.name),
                  def.trailingComment,
                  def.precedingComment,
                  section
                );
                if (param) {
                  params.push(param);
                  seenNames.add(def.name);
                }
              }
            }
          }
        } else {
          // Positional parameters
          const paramSpans = splitTopLevelCommas(code, paramOpenParen + 1, paramCloseParen);
          const paramDefs = paramSpans.map((s) => parseSingleParamItem(code, s.start, s.end));
          const callArgSpans = splitTopLevelCommas(code, callOpenParen + 1, callCloseParen);

          paramDefs.forEach((def, idx) => {
            if (!def) return;
            const section = getSectionAt(sectionMarkers, def.nameIndex);
            const callArgSpan = callArgSpans[idx];
            if (callArgSpan) {
              const trimmedArg = trimSpan(code, callArgSpan.start, callArgSpan.end);
              const argRaw = code.slice(trimmedArg.start, trimmedArg.end);
              const param = buildScriptParam(
                'call',
                def.name,
                argRaw,
                trimmedArg.start,
                trimmedArg.end,
                'args',
                true,
                typeAliases,
                def.typeAnnotation,
                def.trailingComment,
                def.precedingComment,
                section
              );
              if (param) {
                params.push(param);
                seenNames.add(def.name);
                return;
              }
            }
            if (
              def.defaultRaw !== undefined &&
              def.defaultStart !== undefined &&
              def.defaultEnd !== undefined
            ) {
              const param = buildScriptParam(
                'arg',
                def.name,
                def.defaultRaw,
                def.defaultStart,
                def.defaultEnd,
                'args',
                true,
                typeAliases,
                def.typeAnnotation,
                def.trailingComment,
                def.precedingComment,
                section
              );
              if (param) {
                params.push(param);
                seenNames.add(def.name);
              }
            }
          });
        }
      }
    }
  }

  // 2. Scan `const` declarations at top-level or inside the exported function body
  const constLineRe = /^[ \t]*const\s+([^;\n]+);([ \t]*\/\/[^\n]*)?$/gm;
  let match: RegExpExecArray | null;
  while ((match = constLineRe.exec(code)) !== null) {
    const lineStart = match.index;
    const isTopLevel = !code.slice(0, lineStart).includes('function ') || match[0].startsWith('const ');
    const isInTargetFn =
      targetFnBodyStart !== -1 &&
      lineStart >= targetFnBodyStart &&
      (targetFnBodyEnd === -1 || lineStart < targetFnBodyEnd);

    if (!isTopLevel && !isInTargetFn) continue;

    const declListText = match[1];
    const declListOffset = match.index + match[0].indexOf(declListText);
    const trailingComment = match[2] ? match[2].replace(/^[ \t]*\/\/[ \t]*/, '').trim() : undefined;

    const declSpans = splitTopLevelCommas(
      code,
      declListOffset,
      declListOffset + declListText.length
    );

    for (const span of declSpans) {
      const def = parseSingleParamItem(code, span.start, span.end);
      if (
        !def ||
        def.defaultRaw === undefined ||
        def.defaultStart === undefined ||
        def.defaultEnd === undefined
      ) {
        continue;
      }
      if (seenNames.has(def.name)) continue;

      const section = getSectionAt(sectionMarkers, def.nameIndex);
      const param = buildScriptParam(
        'const',
        def.name,
        def.defaultRaw,
        def.defaultStart,
        def.defaultEnd,
        'consts',
        false,
        typeAliases,
        def.typeAnnotation,
        def.trailingComment ?? (declSpans.length === 1 ? trailingComment : undefined),
        def.precedingComment,
        section
      );
      if (param) {
        params.push(param);
        seenNames.add(def.name);
      }
    }
  }

  return params;
}

/**
 * Replace a parameter's literal value in `code` with `newValue`.
 */
export function updateScriptParam(
  code: string,
  param: ScriptParam,
  newValue: ScriptParamValue
): string {
  let formatted: string;
  if (param.type === 'boolean') {
    formatted = Boolean(newValue) ? 'true' : 'false';
  } else if (param.type === 'string') {
    const quote = param.raw.startsWith('"') ? '"' : "'";
    const escaped = String(newValue).replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), `\\${quote}`);
    formatted = `${quote}${escaped}${quote}`;
  } else {
    const num = Number(newValue);
    formatted = Number.isFinite(num) ? String(num) : param.raw;
  }
  return code.slice(0, param.valueStart) + formatted + code.slice(param.valueEnd);
}
