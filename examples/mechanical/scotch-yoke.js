import {
  box,
  cylinder,
  cone,
  cut,
  fuse,
  intersect,
  rotate,
  translate,
  unwrap,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Scotch yoke — crank rotation -> sinusoidal linear motion, frozen at theta=35deg.
// Datums: baseplate top at Z=0; crank axis along Y at H_AXIS; yoke slides along X.
// Stroke = 2*crank radius. Three distinct bodies: frame, crank, yoke.
const PLATE_W = 120, PLATE_D = 46, PLATE_H = 8;
const H_AXIS = 46;
const CRANK_R = 16; // pin offset -> 32 mm stroke
const DISC_R = 22, DISC_T = 8, DISC_Y0 = 8;
const SHAFT_R = 4, BORE_R = SHAFT_R + 0.4;
const PIN_R = 4.5, SLOT_W = 2 * PIN_R + 0.4, SLOT_L = 2 * CRANK_R + 2 * PIN_R + 4;
const ROD_R = 6, GUIDE_R = ROD_R + 0.3;
const PILLAR_W = 14, PILLAR_D = 8, PILLAR_TOP = H_AXIS + 8;
const PILLAR_OUTER_Y = -18, PILLAR_INNER_Y = 0;
const YOKE_Y0 = 20, YOKE_T = 6, YOKE_PLATE_W = 22, YOKE_PLATE_H = SLOT_L + 10;
const GUIDE_X = PLATE_W / 2 - 14, GUIDE_W = 16, GUIDE_D = 16, GUIDE_H = H_AXIS + 12;
const DISPLAY_THETA = 35;

// Frame: baseplate + two bored bearing pillars straddling the disc + a bored rod guide boss.
function frame() {
  const plate = box(PLATE_W, PLATE_D, PLATE_H, { at: [0, 0, -PLATE_H / 2] });
  const pillar = (y) => {
    const block = box(PILLAR_W, PILLAR_D, PILLAR_TOP, { at: [0, y, PILLAR_TOP / 2] });
    const bore = cylinder(BORE_R, PILLAR_D + 4, { at: [0, y - PILLAR_D / 2 - 2, H_AXIS], axis: [0, 1, 0] });
    return unwrap(cut(block, bore));
  };
  let body = unwrap(fuse(plate, pillar(PILLAR_OUTER_Y)));
  body = unwrap(fuse(body, pillar(PILLAR_INNER_Y)));

  const boss = box(GUIDE_W, GUIDE_D, GUIDE_H, { at: [GUIDE_X, YOKE_Y0 + YOKE_T / 2 - GUIDE_D / 2, GUIDE_H / 2] });
  body = unwrap(fuse(body, boss));
  // Turned bearing collar on the rod-entry face (a machined seat, not a raw box face).
  const collar = cylinder(GUIDE_R + 3, 3, { at: [GUIDE_X - GUIDE_W / 2 - 3, YOKE_Y0 + YOKE_T / 2, H_AXIS], axis: [1, 0, 0] });
  body = unwrap(fuse(body, collar));
  const guideBore = cylinder(GUIDE_R, GUIDE_W + 10, { at: [GUIDE_X - GUIDE_W / 2 - 5, YOKE_Y0 + YOKE_T / 2, H_AXIS], axis: [1, 0, 0] });
  body = unwrap(cut(body, guideBore));
  return body;
}

// Crank: disc + shaft (through both pillars) + offset pin + crescent counterweight + flywheel holes.
function crank() {
  const disc = cylinder(DISC_R, DISC_T, { at: [0, DISC_Y0, H_AXIS], axis: [0, 1, 0] });
  const shaftY0 = PILLAR_OUTER_Y - 4;
  const shaftLen = DISC_Y0 + DISC_T - PILLAR_OUTER_Y + 4;
  const shaft = cylinder(SHAFT_R, shaftLen, { at: [0, shaftY0, H_AXIS], axis: [0, 1, 0] });
  let body = unwrap(fuse(disc, shaft));
  // Machined lead-in cone on the exposed shaft end + a stepped hub collar at the disc back face.
  body = unwrap(fuse(body, cone(SHAFT_R, SHAFT_R - 1.4, 1.6, { at: [0, shaftY0, H_AXIS], axis: [0, -1, 0] })));
  body = unwrap(fuse(body, cylinder(SHAFT_R + 3, 2, { at: [0, DISC_Y0, H_AXIS], axis: [0, -1, 0] })));
  // Offset pin (parallel to the Y axis) cantilevered forward into the yoke slot.
  const pin = cylinder(PIN_R, YOKE_Y0 + YOKE_T - DISC_Y0, { at: [CRANK_R, DISC_Y0, H_AXIS], axis: [0, 1, 0] });
  body = unwrap(fuse(body, pin));
  // Crescent counterweight: a ring clipped to the anti-pin (-X) half-space.
  const ring = unwrap(cut(
    cylinder(DISC_R + 4, DISC_T, { at: [0, DISC_Y0, H_AXIS], axis: [0, 1, 0] }),
    cylinder(DISC_R - 4, DISC_T + 2, { at: [0, DISC_Y0 - 1, H_AXIS], axis: [0, 1, 0] })
  ));
  const halfSpace = box(DISC_R + 8, DISC_T + 2, 2 * (DISC_R + 8), { at: [-(DISC_R + 8) / 2, DISC_Y0, H_AXIS] });
  body = unwrap(fuse(body, unwrap(intersect(ring, halfSpace))));
  // Bolt-circle lightening holes through the disc web (flywheel look), clear of shaft/pin/crescent.
  for (const deg of [60, 120, 240, 300]) {
    const a = (deg * Math.PI) / 180;
    body = unwrap(cut(body, cylinder(2.6, DISC_T + 4, { at: [11 * Math.cos(a), DISC_Y0 - 2, H_AXIS + 11 * Math.sin(a)], axis: [0, 1, 0] })));
  }
  return body;
}

// Yoke: slotted plate (vertical slot rides the pin) + piston rod into the guide + piston nose.
function yoke() {
  const plate = box(YOKE_PLATE_W, YOKE_T, YOKE_PLATE_H, { at: [CRANK_R, YOKE_Y0 + YOKE_T / 2, H_AXIS] });
  const slot = box(SLOT_W, YOKE_T + 4, SLOT_L, { at: [CRANK_R, YOKE_Y0 + YOKE_T / 2, H_AXIS] });
  let body = unwrap(cut(plate, slot));
  // Weight-relief holes in the top/bottom bands, clear of the pin's Z travel inside the slot.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body = unwrap(cut(body, cylinder(1.8, YOKE_T + 4, { at: [CRANK_R + sx * (YOKE_PLATE_W / 2 - 3.3), YOKE_Y0 - 2, H_AXIS + sz * 22.5], axis: [0, 1, 0] })));
    }
  }
  const rodStartX = CRANK_R + YOKE_PLATE_W / 2;
  const rodLen = GUIDE_X - rodStartX + GUIDE_W / 2 + 2;
  const rodY = YOKE_Y0 + YOKE_T / 2;
  body = unwrap(fuse(body, cylinder(ROD_R, rodLen, { at: [rodStartX, rodY, H_AXIS], axis: [1, 0, 0] })));
  const pistonX0 = rodStartX + rodLen - 6;
  body = unwrap(fuse(body, cylinder(GUIDE_R - 0.2, 6, { at: [pistonX0, rodY, H_AXIS], axis: [1, 0, 0] })));
  body = unwrap(fuse(body, cone(GUIDE_R - 0.2, GUIDE_R - 2, 2, { at: [pistonX0 + 6, rodY, H_AXIS], axis: [1, 0, 0] })));
  return body;
}

// Frozen display pose: crank rotated about Y, yoke shifted X = CRANK_R*cos(theta).
const x = CRANK_R * Math.cos((DISPLAY_THETA * Math.PI) / 180);
const frameBody = frame();
const crankBody = rotate(crank(), DISPLAY_THETA, { at: [0, 0, H_AXIS], axis: [0, 1, 0] });
const yokeBody = translate(yoke(), [x - CRANK_R, 0, 0]);

export default [
  color(frameBody, '#d2d4d9'),
  color(crankBody, '#9aa0a8'),
  color(yokeBody, '#4d5360'),
];
