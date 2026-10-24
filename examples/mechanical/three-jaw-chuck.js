import {
  box,
  cylinder,
  polygon,
  extrude,
  fuse,
  cut,
  translate,
  rotate,
  circularPattern,
  unwrap,
} from 'brepjs/quick';

import { color } from 'brepjs/playground';

// Functional self-centering 3-jaw scroll chuck (DIN 6350, 100 mm). The headline mechanism is REAL:
// a flat Archimedean spiral r(theta)=r0+k*theta/2pi on a plate; each jaw has scroll ridges on its
// underside engaging the spiral 120deg apart on successive turns, so one scroll rotation drives all
// three jaws to the SAME radius jaw_radius(theta)=R0-(k/2pi)*theta -> self-centering by construction.
const BODY_R = 50;
const BODY_H = 30;
const BORE_R = 10; // O20 through-hole
const SCROLL_R = 42;
const SCROLL_H = 8;
const SCROLL_Z = 4;
const K = 6; // spiral radial pitch (mm per scroll turn)
const SPIRAL_R0 = 12;
const SPIRAL_TURNS = 4;
const SPIRAL_WIDTH = 1.6;
const SPIRAL_RIDGE_H = 3;
const SPIRAL_PTS_PER_TURN = 22;
const JAW_W = 14;
const JAW_L = 22;
const JAW_H = 26;
const JAW_RIDGES = 2;
const JAW_Z = SCROLL_Z + SCROLL_H;
const STEP_DEPTH = 3;
const STEP_COUNT = 3;
const PINION_R = 8;
const PINION_H = 16;
const PINION_TEETH = 8;
const BASE_R = 38; // jaw inner radius when open
const BAR_R = 15; // gripped O30 bar
const THETA_CLOSED = ((BASE_R - BAR_R) / K) * 2 * Math.PI;
const SCROLL_TO_PINION = SCROLL_R / PINION_R;
const jawRadius = (theta) => BASE_R - (K / (2 * Math.PI)) * theta;

// Chuck body: bored disk + recessed scroll pocket + three radial jaw slots + a rim pinion socket.
function chuckBody() {
  let body = cylinder(BODY_R, BODY_H);
  body = unwrap(cut(body, cylinder(BORE_R, BODY_H + 4, { at: [0, 0, -2] })));
  body = unwrap(cut(body, cylinder(SCROLL_R + 1, SCROLL_H + 2, { at: [0, 0, SCROLL_Z - 1] })));
  for (let i = 0; i < 3; i++) {
    const slot = box(JAW_W + 0.4, BODY_R, JAW_H + 2, { at: [0, BODY_R / 2, JAW_Z + (JAW_H + 2) / 2 - 1] });
    body = unwrap(cut(body, rotate(slot, i * 120, { axis: [0, 0, 1] })));
  }
  const sock = cylinder(PINION_R + 1, PINION_H + 2, { at: [0, BODY_R - 2, SCROLL_Z + SCROLL_H / 2], axis: [0, 1, 0] });
  return unwrap(cut(body, sock));
}

// Scroll plate: a real extruded Archimedean spiral ridge + rim teeth the pinion drives.
function scrollPlate() {
  let plate = cylinder(SCROLL_R, SCROLL_H, { at: [0, 0, SCROLL_Z] });
  plate = unwrap(cut(plate, cylinder(BORE_R, SCROLL_H + 4, { at: [0, 0, SCROLL_Z - 2] })));
  const zTop = SCROLL_Z + SCROLL_H;
  const nOut = [];
  const nBack = [];
  const steps = SPIRAL_TURNS * SPIRAL_PTS_PER_TURN;
  for (let i = 0; i <= steps; i++) {
    const th = (i / SPIRAL_PTS_PER_TURN) * 2 * Math.PI;
    const r = SPIRAL_R0 + (K * th) / (2 * Math.PI);
    nOut.push([r * Math.cos(th), r * Math.sin(th), zTop]);
    const rb = r + SPIRAL_WIDTH;
    nBack.push([rb * Math.cos(th), rb * Math.sin(th), zTop]);
  }
  const spiralRidge = unwrap(extrude(unwrap(polygon([...nOut, ...nBack.reverse()])), SPIRAL_RIDGE_H));
  plate = unwrap(fuse(plate, spiralRidge));
  // rim teeth (engaged by the pinion): one tooth patterned around the rim, then a single fuse.
  const tooth0 = box(2.2, 2.2, SCROLL_H, { at: [SCROLL_R, 0, SCROLL_Z + SCROLL_H / 2] });
  const rimTeeth = unwrap(circularPattern(tooth0, [0, 0, 1], 18));
  return unwrap(fuse(plate, rimTeeth));
}

// One master jaw: T-block + stepped gripping front + scroll ridges (mesh the spiral) on the underside.
function jaw(r) {
  const cy = r + JAW_L / 2;
  let j = box(JAW_W, JAW_L, JAW_H, { at: [0, cy, JAW_Z + JAW_H / 2] });
  for (let s = 1; s <= STEP_COUNT; s++) {
    const cutter = box(JAW_W + 2, STEP_DEPTH, (JAW_H * s) / (STEP_COUNT + 1), { at: [0, r + STEP_DEPTH / 2 - 0.01, JAW_Z + (JAW_H * s) / (STEP_COUNT + 1) / 2] });
    j = unwrap(cut(j, translate(cutter, [0, (s - 1) * STEP_DEPTH, 0])));
  }
  const ridgeH = SPIRAL_RIDGE_H + 2.5;
  const ridge0 = r + JAW_L - 2 - (JAW_RIDGES - 1) * K;
  for (let g = 0; g < JAW_RIDGES; g++) {
    const ridge = box(JAW_W + 1, SPIRAL_WIDTH, ridgeH, { at: [0, ridge0 + g * K, JAW_Z - SPIRAL_RIDGE_H + ridgeH / 2] });
    j = unwrap(fuse(j, ridge));
  }
  return j;
}

// Pinion: toothed cylinder in the rim socket, engaging the scroll rim teeth, with a drive square.
function pinion() {
  let p = cylinder(PINION_R, PINION_H, { at: [0, BODY_R - 1, SCROLL_Z + SCROLL_H / 2], axis: [0, 1, 0] });
  let teeth;
  const yc = BODY_R - 1 + PINION_H / 2;
  const zc = SCROLL_Z + SCROLL_H / 2;
  for (let i = 0; i < PINION_TEETH; i++) {
    const a = (i / PINION_TEETH) * 2 * Math.PI;
    const t = box(1.8, PINION_H, 1.8, { at: [PINION_R * Math.cos(a), yc, zc + PINION_R * Math.sin(a)] });
    teeth = teeth ? unwrap(fuse(teeth, t)) : t;
  }
  if (teeth) p = unwrap(fuse(p, teeth));
  return unwrap(fuse(p, box(5, 6, 5, { at: [0, BODY_R - 1 + PINION_H + 2, zc] })));
}

// Frozen at the fully-closed pose: jaws grip the O30 bar; scroll + pinion at the matching angle.
const r = jawRadius(THETA_CLOSED);
const scrollDeg = (THETA_CLOSED * 180) / Math.PI;
const jaws = [0, 1, 2].map((i) => rotate(jaw(r), i * 120, { axis: [0, 0, 1] }));
const scroll = rotate(scrollPlate(), scrollDeg, { axis: [0, 0, 1] });
const pin = rotate(pinion(), -scrollDeg * SCROLL_TO_PINION, { at: [0, BODY_R - 1, 0], axis: [0, 1, 0] });
const bar = cylinder(BAR_R, BODY_H + 20, { at: [0, 0, -5] });

export default [
  color(chuckBody(), '#8a8f98'),
  color(scroll, '#b08d3a'),
  ...jaws.map((j) => color(j, '#5a6470')),
  color(pin, '#c2c7cd'),
  color(bar, '#9aa3ad'),
];
