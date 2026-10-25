# Playground Customizer & Parameters Panel

The **brepjs Playground** includes an interactive **Parameters** panel in the top-left of the 3D viewport that automatically extracts editable parameters from the code in the editor and updates both the source code and the 3D model in real time.

It works out-of-the-box on existing scripts with **zero annotations**, and can be richly decorated using **TypeScript type annotations** and **OpenSCAD Customizer-style comments**.

---

## 1. Automatic Parameter Detection (Zero Config)

Even without special comments or types, the Parameters panel automatically discovers:

1. **Exported Function Arguments & Call-Site Values**

   ```ts
   function studBrick(studsX: number, studsY: number, plateUnits: number) {
     // ...
   }
   export default studBrick(2, 4, 3);
   ```

   Extracts `studsX = 2`, `studsY = 4`, and `plateUnits = 3` under **Arguments**.

2. **Positional & Destructured Function Defaults**

   ```ts
   function ballBearing(id = 8, od = 22, width = 7) {
     // ...
   }
   export default ballBearing();
   ```

   Or destructured object defaults:

   ```ts
   function nemaStepper({ bodyWidth = 42.3, bodyLength = 40 } = {}) {
     // ...
   }
   export default nemaStepper();
   ```

3. **Top-Level and Function-Body `const` Declarations**
   ```ts
   const pitch = 8; // stud-to-stud spacing
   const wall = 1.6; // outer wall thickness
   const sealed = true; // include dust shield
   ```
   Numeric and boolean `const` literals at the top level or inside the exported function body are extracted under **Constants**, using any trailing `// comment` as the parameter description.

> **Note:** Untyped string `const` declarations (such as hex color strings like `const steel = '#b8c0c8'`) are ignored by default so internal styling constants do not clutter the panel. To expose a string `const`, give it an explicit `: string` type, a union type, or a `// [...]` option comment.

---

## 2. TypeScript Type Annotations

Because playground scripts are written in TypeScript, you can use standard TypeScript types to control the UI widgets rendered in the Parameters panel:

### Literal Union Types → Dropdown (`<select>`)

Any string or numeric literal union type—written inline or via a `type` alias—renders a dropdown selector:

```ts
type BoltSize = 'M4' | 'M5' | 'M6' | 'M8' | 'M10';

const size: BoltSize = 'M8'; // Dropdown: M4, M5, M6, M8, M10
const fit: 'tight' | 'normal' | 'loose' = 'normal';
const holes: 4 | 6 | 8 | 12 = 6; // Numeric dropdown: 4, 6, 8, 12
```

Union types also work on positional function parameters and destructured parameter type annotations:

```ts
function flange(size: 'M6' | 'M8' | 'M10' = 'M8', bolts: 4 | 6 | 8 = 6) {
  // ...
}
export default flange();
```

### Explicit Primitive Types (`: string`, `: boolean`, `: number`)

- **`boolean`** (`true` / `false`) → renders a **toggle switch**.
- **`string`** (`const label: string = 'ISO'`) → exposes a **text input** even on a `const` declaration without a comment.
- **`number`** (`const length: number = 30`) → renders a **number input** with `−` / `+` step buttons.

---

## 3. OpenSCAD Customizer Comment Annotations

For range sliders, custom step sizes, labeled dropdown options, section grouping, or hiding internal constants, you can use [OpenSCAD Customizer](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer) comment syntax.

### Range Sliders (`[min:max]` and `[min:step:max]`)

Add `[min:max]` or `[min:step:max]` at the start of a trailing `//` comment to render a **range slider** alongside the numeric input:

```ts
const id = 8; // [4:20] Inner bore diameter (mm)
const od = 22; // [12:0.5:40] Outer ring diameter (mm)
const numBalls = 8; // [3:1:16] Rolling element count
const angle = 90; // [360] Shorthand for 0..360
```

### Dropdown Lists & Labeled Options (`[a, b, c]` and `[val:Label, ...]`)

Use comma-separated values in brackets for dropdowns, or `value:Label` pairs when the display label should differ from the literal value:

```ts
const thread = 'M8'; // [M4, M5, M6, M8, M10] Metric thread size
const clearance = 0.2; // [0.1:Tight (0.1mm), 0.2:Standard (0.2mm), 0.4:Loose (0.4mm)] Fit tolerance
```

### Descriptions (Preceding or Trailing Comments)

You can place the parameter description either after the `[...]` bracket on the same line, or on the standalone `//` comment line immediately above the variable (just like OpenSCAD):

```ts
// Overall bearing width in millimeters
const width = 7; // [4:1:15]
```

### Section Grouping (`/* [Section Name] */`)

Group parameters into named sections using `/* [Section Name] */` block comments (or standalone `// [Section Name]` line comments):

```ts
/* [Primary Dimensions] */
const id = 8; // [4:20] Inner diameter (mm)
const od = 22; // [12:40] Outer diameter (mm)
const width = 7; // [4:15] Width (mm)

/* [Features] */
const chamferRings = true; // Chamfer outer edges
const fit: 'tight' | 'normal' | 'loose' = 'normal';
```

### Hiding Internal Constants (`/* [Hidden] */` or `// [hidden]`)

To hide internal constants from the Parameters panel:

- Place `/* [Hidden] */` above a block of internal constants (all subsequent constants until the next `/* [Section] */` will be hidden), or
- Add `// [hidden]` to an individual declaration line.

```ts
const ballR = 2.0; // [1:0.25:5] Ball radius (mm)

/* [Hidden] */
const grooveRatio = 1.02; // Ignored by the Parameters panel
const clearanceEps = 0.001; // Ignored by the Parameters panel
```

---

## 4. Auto-Refresh Toggle & Batching Parameter Tweaks

When working with complex CAD geometry (such as heavy filleting, intricate boolean cuts, or large arrays), recomputing the geometry on every single slider tick or keystroke can be expensive.

The Parameters panel header includes two controls for managing model recomputation:

- **Auto-Refresh Toggle Icon:** Pauses or resumes automatic re-evaluation.
  - When **ON** (default), modifying any parameter immediately updates the 3D preview.
  - When **OFF**, you can freely adjust multiple sliders, dropdowns, steppers, and toggles without triggering expensive geometry kernel runs. The underlying source code in the editor is still updated live.
- **Refresh Now Icon:** When auto-refresh is paused, an on-demand refresh icon appears next to the toggle button.
  - If parameter changes are pending, the icon is highlighted with a dot indicator.
  - Clicking the icon immediately re-evaluates and meshes the 3D model with all accumulated parameter values at once.
  - Toggling auto-refresh back **ON** also immediately refreshes any pending changes.
  - **Keyboard Controls in Inputs:** When editing property values while auto-refresh is paused, pressing `Tab` exits and moves to the next parameter while saving the value without re-evaluating the model. Pressing `Enter` commits the value and immediately refreshes the 3D model.
- **Invalid Parameter Error Highlighting:** If a parameter value causes a processing or geometry error (such as setting `plateUnits` to `0` in a brick, producing negative box dimensions, or violating kernel constraints), the affected parameter row is highlighted in red with an `!` status badge, red-bordered inputs, an inline `Invalid` label (with full error details on hover tooltip), and a header error count. The code editor automatically scrolls to and highlights the exact variable where the value is being changed (rather than internal kernel code that failed). Correcting or reverting the value (via `+`, `−`, slider, or `↺`) automatically clears the warning, and if the code pane was collapsed before the error occurred, it will automatically re-collapse the code pane.
- **Smooth In-Place Updates:** While new geometry evaluates in the background worker, the previous 3D mesh remains visible in the viewport and swaps seamlessly in-place once computed, preventing jarring canvas blanking or hard blinks between parameter adjustments.

---

## 5. Complete Example

```ts
import { cylinder, cut, chamfer, edgeFinder, unwrap } from 'brepjs/quick';

type StandardBore = 5 | 8 | 10 | 12;

/* [Dimensions] */
const bore: StandardBore = 8; // Standard shaft bore (mm)
const od = 24; // [14:0.5:40] Outer diameter (mm)
const height = 10; // [4:1:30] Bushing height (mm)

/* [Options] */
const clearance = 0.2; // [0.05:Press Fit, 0.2:Slip Fit, 0.4:Loose Fit] Radial clearance
const chamferEnds = true; // Add 0.5mm lead-in chamfers

/* [Hidden] */
const chamferSize = 0.5;

function bushing() {
  const outerR = od / 2;
  const innerR = bore / 2 + clearance;
  let part = unwrap(cut(cylinder(outerR, height), cylinder(innerR, height)));
  if (chamferEnds) {
    const circles = edgeFinder().ofCurveType('CIRCLE').findAll(part);
    part = unwrap(chamfer(part, circles, chamferSize));
  }
  return part;
}

export default bushing();
```
