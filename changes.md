# Fork Changes (`foofoodog/brepjs`)

This document tracks the user-facing features, build/deployment changes, and commit history added in [`foofoodog/brepjs`](https://github.com/foofoodog/brepjs) on top of upstream `brepjs` (`v20.10.3` / `0c205a06`).

- **Live Playground:** https://foofoodog.github.io/brepjs/

---

## Feature & Infrastructure Summary

### 1. Layerling (`LYL`) Clipboard Export

- Added an **LYL** export button to the desktop toolbar, mobile action sheet, and command palette (`Export LYL (Copy for Layerling)`).
- Serializes all currently rendered 3D meshes into Layerling's custom-mesh clipboard JSON format (`__layerlingClipboard: 1`) with Z-up → Y-up coordinate conversion and copies it to the system clipboard so models can be pasted directly into Layerling with `Ctrl+V`.
- Improved `copyToClipboard` fallback handling for large payloads when `navigator.clipboard.writeText` is unavailable or rejects.

### 2. Editor Drag-and-Drop Script Loading

- Enabled dragging and dropping `.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`, `.tsx`, and `.jsx` files directly onto the Monaco editor panel.
- Added a visual drop-target overlay while dragging files over the editor.
- Loads dropped file contents into the editor (preserving the undo stack via Monaco's `pushEditOperations`), updates the active filename, clears any `/examples/<id>` route back to the root path, and immediately evaluates the model.

### 3. Editor Save Button (Native Save As Dialog)

- Added a floating **Save** button in the top-right corner of the Monaco editor panel.
- Uses the browser File System Access API (`window.showSaveFilePicker`) to prompt for both a save folder and filename (`.ts` or `.js`), falling back to a filename prompt + browser download when `showSaveFilePicker` is unsupported.
- Automatically syncs the default save filename (`fileName` in `playgroundStore`) when:
  - Selecting an example from the gallery or deep-linking to `/examples/<id>` (e.g. `axial-fan.ts`)
  - Dragging and dropping a file into the editor
  - Resetting to the default model (`stud-brick.ts`)

### 4. Standalone Examples Archive (`examples.zip`)

- Added `apps/playground/scripts/packExamples.ts` to extract all 73 playground models (the default `stud-brick` model plus all 72 categorized examples) in both `.ts` and `.js` formats (146 files total) and compress them into `dist/examples.zip` at build time.
- Added a **Download .zip** button in the header of the **Examples** gallery modal so users can download all standalone example scripts in one click.

### 5. URL & Share Link Cleanup

- Stopped the **Run** button from appending compressed `?code=...` strings to the address bar; `?code=...` is now only written when explicitly clicking **Share**.
- Kept `/examples/<id>` URLs clean when browsing or selecting examples in the gallery.
- Updated **Share** to always read the latest editor buffer from the store, strip `/examples/<id>` back to the root playground path (`/?code=...`), and load shared `?code=...` links as a clean blank slate without being overwritten by example templates.
- Fixed the toolbar `brepjs` logo link to use `import.meta.env.BASE_URL` instead of hardcoded `/`.

### 6. GitHub Pages Auto-Deploy & Workflow Cleanup

- Added `.github/workflows/pages.yml` to automatically build `brepjs` and `apps/playground` (with dynamic `VITE_BASE_PATH`, SPA `404.html` fallback, and `/playground/` redirect) and deploy to GitHub Pages on every push to `main`.
- Removed 17 unused upstream GitHub Actions workflows (npm release-please/trusted-publisher workflows, CLA bot, Dependabot auto-merge, OSV cron scan, Vercel smoke test, and Anthropic/Langfuse eval workflows).
- Updated `repository.url` across `package.json` manifests to `https://github.com/foofoodog/brepjs`.

### 7. Interactive Parameters / Customizer Panel & Code Pane Toggle

- Added a live **Parameters** panel in the top-left of the 3D viewport (`ParametersPanel.tsx` + `scriptParams.ts`) that automatically extracts editable parameters directly from the script without requiring changes to existing examples:
  - Exported function call-site arguments, positional defaults, and destructured object parameter defaults (`Arguments`).
  - Top-level and exported-function-body `const` literals (`Constants`) with trailing/preceding `//` comment descriptions.
  - **TypeScript Type Annotations:** Literal union types (`'M4' | 'M6' | 'M8'`, `4 | 6 | 8`, or `type` aliases) automatically render as dropdowns; explicit `: string` types render as text inputs; booleans render as toggle switches.
  - **OpenSCAD Customizer Comment Metadata:** Supports range sliders (`// [min:max]`, `// [min:step:max]`), labeled or unlabeled dropdowns (`// [a, b, c]`, `// [val:Label, ...]`), custom section headers (`/* [Section Name] */`), and hidden variables (`/* [Hidden] */` or `// [hidden]`).
  - **Save & Reset to Defaults (`↺`):** Includes per-parameter revert buttons, header `Save` and `↺ Reset` buttons when any parameters are modified, and debounced (350ms) `+`/`−` step buttons to batch rapid clicks before updating.
  - **Auto-Refresh Toggle & On-Demand Refresh:** Added header icon buttons to toggle automatic model recomputation on/off:
    - **Auto-Refresh Toggle Icon:** Pauses or resumes live evaluation. When paused, parameter adjustments (sliders, steppers, dropdowns, switches) update the code in the editor immediately but suppress expensive WASM geometry computations so multiple parameters can be changed without lag.
    - **Refresh Now Icon:** Shown whenever auto-refresh is paused, with a status dot indicator when un-rendered parameter changes exist. Clicking it evaluates the model once with all accumulated changes.
    - **Live Catch-Up:** Toggling auto-refresh back ON immediately re-evaluates any pending changes.
  - **Full-Height Layout & Syntax Help (`?`):** Panel anchors from top-to-bottom of the viewport (`top-3 bottom-3` container and `max-h-full min-h-0`) eliminating unnecessary scrollbars, with an inline `?` syntax cheat-sheet and full documentation in [`docs/customizer-parameters.md`](https://github.com/foofoodog/brepjs/blob/main/docs/customizer-parameters.md).
- Added **Hide Code / Show Code** toggle controls in the top toolbar (`Toolbar.tsx`) and a collapse (`«`) icon button next to **Save** in `EditorPanel.tsx` so the code pane can be collapsed to give the 3D viewport and Parameters panel 100% width.

---

## Commit Synopsis (Chronological)

| Commit     | Date       | Summary                                                                                         | Synopsis                                                                                                                                                                                                                                                      |
| :--------- | :--------- | :---------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `f5bbddb5` | 2026-10-24 | `feat(playground): add Layerling clipboard export, editor drag-and-drop, and file save`         | Added `layerlingClipboard.ts` + LYL toolbar/mobile/command-palette actions, file drag-and-drop into `EditorPanel`, floating `Save` button using `showSaveFilePicker`, initial GitHub Pages workflow (`pages.yml`), and `package.json` repository URL updates. |
| `ed7d9ea6` | 2026-10-24 | `ci: remove unused upstream workflows and keep only GitHub Pages deploy`                        | Removed 16 upstream CI, CLA, OSV, Vercel smoke, and npm publishing workflows, keeping only `.github/workflows/pages.yml`.                                                                                                                                     |
| `6d15e5ee` | 2026-10-24 | `build(playground): package examples into examples.zip for Pages and GitHub Release`            | Removed committed duplicate `examples/` directory from Git and added `apps/playground/scripts/packExamples.ts` to build `dist/examples.zip` on the fly during `npm run build`.                                                                                |
| `11b00cf1` | 2026-10-24 | `feat(playground): add examples.zip download buttons and fix logo base link`                    | Added UI download buttons for `examples.zip` and fixed the toolbar logo link to point to `import.meta.env.BASE_URL` instead of `/`.                                                                                                                           |
| `0cd02a3c` | 2026-10-24 | `ci: remove GitHub Release step and serve examples.zip from Pages UI`                           | Simplified `pages.yml` to serve `examples.zip` directly from GitHub Pages without creating a GitHub Release.                                                                                                                                                  |
| `62d3b71c` | 2026-10-24 | `docs(readme): document fork enhancements and GitHub Pages playground URL`                      | Added the _Fork Enhancements (`foofoodog/brepjs`)_ callout section and live GitHub Pages link to `README.md`.                                                                                                                                                 |
| `60e4c9a4` | 2026-10-24 | `refactor(playground): keep examples.zip download button only in Examples gallery`              | Removed the duplicate `Examples .zip` button from the top toolbar, keeping the `Download .zip` button inside the Examples gallery modal.                                                                                                                      |
| `c963d12a` | 2026-10-24 | `feat(playground): update Save filename when selecting an example`                              | Moved `fileName` into `playgroundStore` and updated `handleLoadExample` so selecting or deep-linking to an example pre-fills `<example-id>.ts` in the Save dialog.                                                                                            |
| `57599c8b` | 2026-10-24 | `fix(playground): keep example URLs clean and only write ?code= on Share`                       | Stopped `handleRun` from writing `?code=` to the URL and stripped stale query strings when selecting an example in `useExampleRoute`.                                                                                                                         |
| `1b215d61` | 2026-10-24 | `fix(playground): preserve shared ?code= on example routes and read live editor state on Share` | Updated `handleShare` to read live store code at click time and prevented `PlaygroundPage`'s initial example mount effect from overwriting shared `?code=` params.                                                                                            |
| `9dc40aa8` | 2026-10-24 | `fix(playground): share links always use root path and load as a blank slate`                   | Normalized shared links and editor edits to use the root base path (`/?code=...`) and load shared `?code=` URLs as a clean blank slate.                                                                                                                       |
| `b893f4b1` | 2026-10-24 | `docs: add changes.md summarizing fork features and commit history`                             | Added `changes.md` and linked it from `README.md`, plus removed `.github/workflows/eval.yml`.                                                                                                                                                                 |
| `053006d2` | 2026-10-24 | `feat(playground): add Customizer parameters panel and code pane collapse toggle`               | Added `ParametersPanel` + `scriptParams` (supporting zero-config extraction, TS union/primitive types, OpenSCAD Customizer comment annotations, and per-param/all reset), `docs/customizer-parameters.md`, and toolbar/editor code-pane collapse buttons.     |
| `c4ffbe0d` | 2026-10-24 | `fix(playground): preserve camera perspective when tweaking parameters or editing code`         | Updated `AutoFit` in `ViewerPanel.tsx` so `fitCamera` only runs on initial load, when switching examples/files, or when clicking `Fit`, while parameter/code edits preserve camera position/target and only update clip planes.                               |
| `a86dbd2e` | 2026-10-24 | `docs(readme): use absolute fork repository URLs for added documentation links`                 | Updated `changes.md` and `docs/customizer-parameters.md` links in `README.md` and `changes.md` to point to `https://github.com/foofoodog/brepjs/blob/main/...`.                                                                                               |
| `797d79ee` | 2026-10-24 | `feat(playground): add Save button to Parameters panel and debounce +/- step buttons`           | Extracted shared `saveScriptFile` helper, added `Save` action in `ParametersPanel` header when parameters are modified, and added a 350ms debounce to `+`/`−` step buttons to batch rapid clicks before re-evaluating the model.                              |
| `5c4717f0` | 2026-10-24 | `fix(playground): bundle Monaco editor worker and gate Vercel analytics on non-Vercel hosts`    | Configured `MonacoEnvironment.getWorker` with explicit Vite worker imports for `editor.worker` and `ts.worker` to prevent dynamic import failures, and only load Vercel analytics/speed-insights scripts when hosted on Vercel.                               |
| `f2f7b926` | 2026-10-24 | `feat(playground): allow Parameters panel to expand to full viewport height`                    | Replaced the fixed `max-h-96` clamp with viewport height anchoring (`top-3 bottom-3` container and `max-h-full min-h-0`), eliminating the vertical scrollbar whenever parameters fit on screen.                                                               |
| `ee52dd1f` | 2026-10-24 | `feat(playground): add auto-refresh toggle and on-demand refresh to Parameters panel`           | Added an auto-refresh toggle icon and conditional on-demand refresh button to `ParametersPanel` to batch parameter modifications without triggering expensive kernel computations on every change.                                                            |
