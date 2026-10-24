import { box, cut, fuse, unwrap } from 'brepjs/quick';

// Through, four-shouldered mortise-and-tenon T-joint between a rail and a
// stile — the canonical furniture joint (chair stretcher into a leg).
// Rendered exploded along the rail axis so the tenon hangs in mid-air.

const stileD = 40;       // stile depth  (X, along rail axis)
const stileW = 60;       // stile width  (Y)
const stileH = 200;      // stile height (Z)

const railL = 150;       // rail length    (X)
const railW = 50;        // rail width     (Y)
const railT = 30;        // rail thickness (Z)

const tenonH = 30;       // tenon height in Y     (~60% of railW → 10 mm shoulder each side)
const tenonT = 10;       // tenon thickness in Z  (~1/3 of railT → 10 mm shoulder each face)
const clearance = 0.2;   // sliding-fit oversize on the mortise
const gap = 50;          // exploded view: rail body end to stile face (tenon tip sits stileD closer)

// `box`'s `at` option places the box CENTER at the given point.
// Both pieces share Y/Z center on the stile face.
const cy = stileW / 2;
const cz = stileH / 2;

// Stile with through-mortise. The cutter spans the full stile depth plus
// clearance overhang on both X faces, so the slot punches all the way through.
const stile = unwrap(cut(
  box(stileD, stileW, stileH),
  box(stileD + clearance, tenonH + clearance, tenonT + clearance, {
    at: [stileD / 2, cy, cz],
  })
));

// Rail body sits at X < 0, ending at -gap; tenon protrudes another stileD
// toward the (empty) mortise space.
const rail = unwrap(fuse(
  box(railL, railW, railT, { at: [-gap - railL / 2, cy, cz] }),
  box(stileD, tenonH, tenonT, { at: [-gap + stileD / 2, cy, cz] })
));

export default [rail, stile];
