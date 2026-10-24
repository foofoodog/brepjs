import {
  box,
  cylinder,
  cone,
  fuse,
  cut,
  translate,
  rotate,
  fillet,
  edgeFinder,
  unwrap,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Cardan (Hooke) universal joint — display mechanism frozen at a 25° bend.
// Datums: joint center at origin; shaft A along -X, shaft B tilted by BEND about Z.
// Built as distinct solids (yokeA, cross, yokeB, 4 pins) so each colors separately.
const HUB_R = 11; // yoke hub radius (Ø22)
const HUB_LEN = 8; // hub axial length
const SHAFT_R = 5; // Ø10 shaft
const SHAFT_LEN = 16; // shaft length outboard of the hub
const ARM_W = 6; // fork-arm thickness (across the bore axis)
const ARM_H = 11; // fork-arm height (kept < FORK_GAP so perpendicular forks clear)
const FORK_GAP = 14; // clear gap between the two arms
const ARM_FILLET = 2; // round the proud arm corners
const ARM_COVER = 2; // arm material outboard of the bore center
const BORE_R = 2.9; // fork bore radius (radial bearing clearance over the trunnion)
const CROSS_BODY = 8; // central cross cube edge
const TRUN_R = 2.5; // cross trunnion radius
const TRUN_REACH = FORK_GAP / 2 + ARM_W - 1;
const BORE_X = 14; // bore station radius from the joint center
const BEND_DEG = 25; // display articulation

// Yoke in a local frame: shaft along +X, fork opens toward +X, bore axis along Y.
// After the bore cut it is shifted so the bore station sits at the origin.
function makeYoke() {
  const hub = cylinder(HUB_R, HUB_LEN, { axis: [1, 0, 0], at: [-HUB_LEN / 2, 0, 0] });
  const shaft = cylinder(SHAFT_R, SHAFT_LEN, { axis: [-1, 0, 0], at: [-HUB_LEN / 2, 0, 0] });
  let body = unwrap(fuse(hub, shaft));

  // Machined collar where the shaft emerges from the hub face.
  body = unwrap(fuse(body, cylinder(SHAFT_R + 1.6, 2, { axis: [-1, 0, 0], at: [-HUB_LEN / 2, 0, 0] })));

  // Chamfer-look lead-in at the free shaft end (flat-capped cone — no spheres).
  const endX = -HUB_LEN / 2 - SHAFT_LEN;
  const lead = cone(SHAFT_R, SHAFT_R - 2, 2, { axis: [-1, 0, 0], at: [endX + 2, 0, 0] });
  const rimCut = cylinder(SHAFT_R + 0.5, 2, { axis: [-1, 0, 0], at: [endX + 2, 0, 0] });
  body = unwrap(fuse(unwrap(cut(body, rimCut)), lead));

  // Two fork arms straddling the cross, proud corners rounded.
  const armCenterY = FORK_GAP / 2 + ARM_W / 2;
  const armRootX = HUB_LEN / 2 - 1;
  const armTipX = BORE_X + ARM_COVER;
  const armLen = armTipX - armRootX;
  const armCenterX = (armRootX + armTipX) / 2;
  for (const sy of [1, -1]) {
    let arm = box(armLen, ARM_W, ARM_H, { at: [armCenterX, sy * armCenterY, 0] });
    arm = unwrap(fillet(arm, edgeFinder().inDirection('X'), ARM_FILLET));
    body = unwrap(fuse(body, arm));
  }

  // Coaxial trunnion bores through both arms (pin axis = Y).
  const bore = cylinder(BORE_R, FORK_GAP + 2 * ARM_W + 4, {
    axis: [0, 1, 0],
    at: [BORE_X, -(FORK_GAP / 2 + ARM_W + 2), 0],
  });
  return translate(unwrap(cut(body, bore)), [-BORE_X, 0, 0]);
}

// Cross/spider: central cube + a Y-trunnion and a Z-trunnion (a '+'), with a
// grease boss + blind lube hole on each free ±X face (the canonical Cardan detail).
function makeCross() {
  let body = box(CROSS_BODY, CROSS_BODY, CROSS_BODY, { at: [0, 0, 0] });
  body = unwrap(fuse(body, cylinder(TRUN_R, 2 * TRUN_REACH, { axis: [0, 1, 0], at: [0, -TRUN_REACH, 0] })));
  body = unwrap(fuse(body, cylinder(TRUN_R, 2 * TRUN_REACH, { axis: [0, 0, 1], at: [0, 0, -TRUN_REACH] })));
  for (const sx of [1, -1]) {
    body = unwrap(fuse(body, cylinder(3, 1.4, { axis: [sx, 0, 0], at: [(sx * CROSS_BODY) / 2, 0, 0] })));
    body = unwrap(cut(body, cylinder(1.1, 2.4, { axis: [-sx, 0, 0], at: [(sx * CROSS_BODY) / 2 + sx * 1.4, 0, 0] })));
  }
  return body;
}

// Assemble at the 25° display pose. yokeA unrotated; cross at origin; yokeB
// re-framed (shaft +X, bore Y -> Z) then tilted by BEND about Z. At this pose the
// exact Cardan precession is zero, so each fork bore seats on its cross trunnion
// (bore radius > trunnion radius = a visible bearing gap) by construction.
const yokeA = makeYoke();
const cross = makeCross();
const yokeBBase = rotate(rotate(makeYoke(), 180, { axis: [0, 0, 1] }), 90, { axis: [1, 0, 0] });
const yokeB = rotate(yokeBBase, BEND_DEG, { axis: [0, 0, 1] });

export default [color(yokeA, '#b4b9c0'), color(yokeB, '#878d96'), color(cross, '#6b7177')];
