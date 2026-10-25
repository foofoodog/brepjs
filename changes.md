# Fork Changes (`foofoodog/brepjs`)

This document tracks the user-facing features, build/deployment changes, and commit history added in [`foofoodog/brepjs`](https://github.com/foofoodog/brepjs) on top of upstream `brepjs` (`v20.10.3` / `0c205a06`).

- **Live Playground:** https://foofoodog.github.io/brepjs/

---

## Feature & Infrastructure Summary

### 1. One-Click Layerling 3D Export

- **Direct Copy to Layerling:** Added an **LYL** button to copy your finished 3D models straight to your system clipboard so you can paste them directly into Layerling with `Ctrl+V`.
- **Automatic Orientation:** Automatically aligns coordinate axes so models paste seamlessly without needing manual rotation.
- **Reliable Sharing:** Works across desktop, mobile, and command palettes, with fallbacks for large models.

### 2. Drag-and-Drop File Loading

- **Drag and Drop:** Easily open local model files by dragging and dropping them straight onto the code editor.
- **Instant Preview:** Automatically loads and generates the 3D model immediately while preserving your undo/redo history.
- **Visual Feedback:** Highlights the drop zone when you drag a file over the screen.

### 3. File Saving with Smart Filenames

- **Save to Your Computer:** Added a **Save** button in the code editor to save models directly to your computer using your system's native file dialog.
- **Smart Naming:** Automatically names the file based on the active model or example you are working on (e.g. `axial-fan.ts`), or matches the file you dropped in.

### 4. Download All Examples (.zip)

- **One-Click Download:** Added a **Download .zip** button inside the Examples gallery to download all 73 built-in CAD models in a single archive.
- **Ready to Use:** Includes both TypeScript and JavaScript versions of every example, ready for local offline editing.

### 5. Cleaner Links & Sharing

- **Clean Web Addresses:** Browsing examples and running models keeps the browser address bar tidy without cluttering it with long code strings.
- **One-Click Sharing:** Clicking **Share** creates a clean, sharable web link containing your exact model state so others can open and view it instantly.

### 6. Live Website & Project Cleanup

- **Automatic Web Publishing:** The playground website updates automatically on GitHub Pages whenever new changes are pushed.
- **Streamlined Project:** Removed unused development bots and publishing automation to keep the codebase fast and focused.

### 7. Interactive Parameters & Customizer Panel

- **Visual Customizer Overlay:** Added an interactive **Parameters** panel over the 3D viewer that lets anyone customize 3D models using sliders, dropdown menus, number steppers, and toggle switches without editing code.
- **Automatic Controls:** Automatically detects configurable values and comment annotations (such as OpenSCAD ranges and option lists) from the model to build user-friendly controls.
- **Pause & On-Demand Refresh:** Pause live 3D recomputation while tweaking multiple dimensions, then update the model on demand with a single click. When editing property inputs with auto-refresh paused, pressing `Tab` exits without recomputing, while pressing `Enter` commits the value and immediately refreshes the model.
- **Smart Error Highlighting & Alerts:** Highlights problematic inputs in red with an `Invalid` badge while preserving property descriptions. Instead of abruptly forcing open the code window during 3D customization, the `Show Code` button lights up red with an alert badge to notify you; clicking it opens the editor and immediately scrolls to and highlights the parameter definition line.
- **Roomier Parameters Header:** Expanded the parameters panel width and ensured the error badge never wraps into multiple lines even when all controls (`Save`, `Reset`, auto-refresh, and count) are active simultaneously.
- **Save & Reset Links:** Added clear `Save` and `Reset` text links in the header of the parameters panel whenever any property or code has been modified. Clicking `Save` opens the native save dialog to download/save your customized script.
- **Smooth In-Place Geometry Updates:** Eliminated canvas blanking and hard blinks during recomputation by keeping the current 3D mesh rendered until the new geometry is ready, swapping it seamlessly in-place.
- **Focus Mode by Default (Full-Screen 3D):** The code editor panel is now collapsed by default on startup, presenting the 3D viewer and customizer full-screen with the parametric LEGO brick as the default model. Clicking `Show Code` smoothly expands the editor to 50% split view.

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
| `260f052f` | 2026-10-24 | `feat(playground): add auto-refresh toggle and on-demand refresh to Parameters panel`           | Added an auto-refresh toggle icon and conditional on-demand refresh button to `ParametersPanel` to batch parameter modifications without triggering expensive kernel computations on every change.                                                            |
| `382f8f9e` | 2026-10-24 | `feat(playground): highlight invalid parameters in red on processing errors`                    | Added error detection and red status styling (`!` badge, red borders, inline 'Invalid' label, and header counter) to `ParametersPanel` when a parameter change causes a geometry kernel or processing error.                                                  |
| `ffce01c1` | 2026-10-24 | `docs(changes): simplify full feature summary to non-technical language`                        | Rewrote feature documentation in clear, non-technical terms accessible to anyone using the playground.                                                                                                                                                        |
| `9138f796` | 2026-10-24 | `feat(playground): default full-screen 3D customizer, error alerts, and save text links`        | Defaulted to full-screen 3D customizer, replaced forced code expansion on error with red alert button + signature-level highlighting, added auto-collapse on recovery, tab vs enter keyboard workflow, in-place mesh updates, and Save/Reset text links.      |
