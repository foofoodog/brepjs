import { box, cone, cylinder, sphere, torus, translate } from 'brepjs/quick';

// Multi-shape return: export an array of solids and the playground renders
// each one. Useful for spec sheets, side-by-side comparisons, and tests.
const s = translate(sphere(8), [0, 0, 8]);
const b = translate(box(14, 14, 14), [25, 0, 0]);
const c = translate(cylinder(6, 14), [-25, 0, 0]);
const co = translate(cone(7, 0, 14), [0, 25, 0]);
const t = translate(torus(7, 2), [0, -25, 0]);

export default [s, b, c, co, t];
