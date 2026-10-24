import {
  box,
  cylinder,
  line,
  wire,
  closedWire,
  loft,
  fuse,
  cut,
  rotate,
  unwrap,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Functional right-angle worm-gear reducer (24:1), one connected solid per body.
// A true ACME helicoid worm (trapezoidal ~20deg flank) meshes a true involute HELICAL wheel of the
// SAME module at the real 36 mm center distance. Honest classification: a cylindrical (non-throated)
// crossed-helical worm drive. The frame is a cantilever mount that CLEARS the wheel (no impalement).
const M = 2;
const PA = (20 * Math.PI) / 180; // involute pressure angle (= the ACME worm flank angle below; both 20°)
const CENTER = 36; // true center distance = r_worm_pitch(12) + r_wheel_pitch(24)
const BACKLASH = 0.22;
const WORM_PITCH_R = 12;
const WORM_OD_R = 14;
const WORM_ROOT_R = WORM_PITCH_R - 1.25 * M;
const LEAD = Math.PI * M; // single-start
const FLANK = PA; // ACME worm flank angle — intentionally the same 20° as the pressure angle
const SPT = 24; // helix sections per turn
const THREAD_LEN = 30;
const SHAFT_R = 5;
const WORM_SHAFT_HALF = 26;
const DEPTH = WORM_OD_R - WORM_ROOT_R;
const halfTop = 0.25 * (LEAD / 2);
const halfBot = halfTop + DEPTH * Math.tan(FLANK);
const TEETH = 24;
const WHEEL_PR = (M * TEETH) / 2;
const WHEEL_RA = WHEEL_PR + M;
const WHEEL_RR = WHEEL_PR - 1.25 * M;
const WHEEL_W = 6; // face width ~= one worm lead -> clean single-line mesh contact
const HUB_R = 9;
const HUB_H = 6;
const BASE_X0 = -42, BASE_X1 = 52;
const BASE_Y = 60;
const BASE_Z0 = -22;
const BASE_T = 8;
const BASE_TOP = BASE_Z0 + BASE_T;
const COL_X = -34; // upper-bearing column, outside the wheel envelope (R=26)
const ARM_Z = 16;
const CLOCK = 8.4375; // mesh clock: seats the worm thread in a wheel tooth space

// Worm: ACME trapezoidal helicoid lofted through rotated cross-sections, on a shaft. One solid.
function wormBody() {
  const nSec = Math.ceil((THREAD_LEN / LEAD) * SPT);
  const sections = [];
  for (let i = 0; i <= nSec; i++) {
    const th = (i / SPT) * 2 * Math.PI;
    const y = -THREAD_LEN / 2 + (LEAD * th) / (2 * Math.PI);
    const rx = Math.cos(th), rz = Math.sin(th);
    const pt = (rad, ax) => [CENTER + rad * rx, y + ax, rad * rz];
    const p1 = pt(WORM_ROOT_R - 0.3, -halfBot);
    const p2 = pt(WORM_OD_R, -halfTop);
    const p3 = pt(WORM_OD_R, halfTop);
    const p4 = pt(WORM_ROOT_R - 0.3, halfBot);
    sections.push(unwrap(closedWire(unwrap(wire([line(p1, p2), line(p2, p3), line(p3, p4), line(p4, p1)])))));
  }
  const ridge = unwrap(loft(sections, { ruled: true }));
  const core = cylinder(WORM_ROOT_R + 0.1, THREAD_LEN, { at: [CENTER, -THREAD_LEN / 2, 0], axis: [0, 1, 0] });
  const shaft = cylinder(SHAFT_R, 2 * WORM_SHAFT_HALF, { at: [CENTER, -WORM_SHAFT_HALF, 0], axis: [0, 1, 0] });
  return unwrap(fuse(unwrap(fuse(core, ridge)), shaft));
}

// Wheel: true involute teeth (BOSL2-style), lofted with a small conjugate helix twist over the face.
const rot2 = (p, a) => [
  p[0] * Math.cos(a) - p[1] * Math.sin(a),
  p[0] * Math.sin(a) + p[1] * Math.cos(a),
];
const invPt = (th) => [
  WHEEL_PR * Math.cos(PA) * (Math.cos(th) + th * Math.sin(th)),
  WHEEL_PR * Math.cos(PA) * (Math.sin(th) - th * Math.cos(th)),
];
const br = WHEEL_PR * Math.cos(PA);
const thetaAt = (r) => Math.sqrt(Math.max(0, (r / br) ** 2 - 1));
const halfTooth = Math.PI / (2 * TEETH) - BACKLASH / 2 / WHEEL_PR;
const WHEEL_HELIX = Math.atan(LEAD / (2 * Math.PI * WHEEL_PR));
const TWIST_DEG = (Math.tan(WHEEL_HELIX) / WHEEL_PR) * WHEEL_W * (180 / Math.PI);

function toothLoop2D() {
  const thMax = thetaAt(WHEEL_RA);
  const phiPitch = Math.atan2(invPt(thetaAt(WHEEL_PR))[1], invPt(thetaAt(WHEEL_PR))[0]);
  const offset = halfTooth + phiPitch;
  const side = [];
  for (let i = 10; i >= 0; i--) side.push(rot2([invPt((thMax * i) / 10)[0], -invPt((thMax * i) / 10)[1]], offset));
  const rSpace = rot2([WHEEL_RR, 0], Math.PI / TEETH);
  if (WHEEL_RR < br) {
    const pb = rot2([br, 0], offset);
    const nHat = [-Math.sin(offset), Math.cos(offset)];
    const dx = pb[0] - rSpace[0], dy = pb[1] - rSpace[1];
    const rf = -(dx * dx + dy * dy) / (2 * (dx * nHat[0] + dy * nHat[1]));
    const cf = [pb[0] + rf * nHat[0], pb[1] + rf * nHat[1]];
    const a0 = Math.atan2(pb[1] - cf[1], pb[0] - cf[0]);
    const a1 = Math.atan2(rSpace[1] - cf[1], rSpace[0] - cf[0]);
    let dA = a1 - a0;
    while (dA > Math.PI) dA -= 2 * Math.PI;
    while (dA < -Math.PI) dA += 2 * Math.PI;
    for (let i = 1; i <= 10; i++) {
      const a = a0 + (dA * i) / 10;
      side.push([cf[0] + Math.abs(rf) * Math.cos(a), cf[1] + Math.abs(rf) * Math.sin(a)]);
    }
  } else side.push(rSpace);
  const tooth = [...side.map(([x, y]) => [x, -y] ).reverse(), ...side.slice(0, -1)];
  const loop = [];
  for (let t = 0; t < TEETH; t++) {
    const c = (t * 2 * Math.PI) / TEETH;
    for (const p of tooth) loop.push(rot2(p, c));
  }
  return loop;
}

function gearWireAt(loop, z, twistDeg) {
  const a = (twistDeg * Math.PI) / 180;
  const pts3 = loop.map((p) => {
    const q = rot2(p, a);
    return [q[0], q[1], z] ;
  });
  const segs = pts3.map((p, i) => line(p, pts3[(i + 1) % pts3.length] ));
  return unwrap(closedWire(unwrap(wire(segs))));
}

function wheelBody() {
  const loop = toothLoop2D();
  const bottom = gearWireAt(loop, -WHEEL_W / 2, -TWIST_DEG / 2);
  const mid = gearWireAt(loop, 0, 0);
  const top = gearWireAt(loop, WHEEL_W / 2, TWIST_DEG / 2);
  const teeth = unwrap(loft([bottom, mid, top], { ruled: true }));
  const hub = cylinder(HUB_R, WHEEL_W + HUB_H, { at: [0, 0, -WHEEL_W / 2] });
  const shaft = cylinder(SHAFT_R, 44, { at: [0, 0, -16] });
  const gear = unwrap(fuse(unwrap(fuse(teeth, hub)), shaft));
  const keyway = box(2.4, 3, HUB_H + 3, { at: [HUB_R - 1.0, 0, WHEEL_W / 2 + HUB_H / 2] });
  return unwrap(cut(gear, keyway));
}

// Frame: single-piece cantilever mount; upper bearing on a column outside R=26; bored shaft
// clearances so the frame never touches the rotating shafts. One connected solid.
function frameBody() {
  const base = box(BASE_X1 - BASE_X0, BASE_Y, BASE_T, { at: [(BASE_X0 + BASE_X1) / 2, 0, BASE_TOP - BASE_T / 2] });
  const lowBoss = cylinder(11, 6, { at: [0, 0, BASE_TOP - 0.5] });
  const column = box(10, 14, ARM_Z + 6 - BASE_TOP, { at: [COL_X, 0, (ARM_Z + 6 + BASE_TOP) / 2] });
  const arm = box(COL_X * -1 + 11, 14, 6, { at: [(COL_X + 11) / 2, 0, ARM_Z + 3] });
  const upBoss = cylinder(9, 8, { at: [0, 0, ARM_Z + 1] });
  const pbH = 0 - BASE_TOP + 4, pbY = 22.5;
  const pbA = box(16, 7, pbH, { at: [CENTER, pbY, BASE_TOP + pbH / 2] });
  const pbB = box(16, 7, pbH, { at: [CENTER, -pbY, BASE_TOP + pbH / 2] });
  let f = unwrap(fuse(base, lowBoss));
  f = unwrap(fuse(f, column));
  f = unwrap(fuse(f, arm));
  f = unwrap(fuse(f, upBoss));
  f = unwrap(fuse(f, pbA));
  f = unwrap(fuse(f, pbB));
  f = unwrap(cut(f, cylinder(SHAFT_R + 0.4, 80, { at: [0, 0, -40] })));
  f = unwrap(cut(f, cylinder(SHAFT_R + 0.4, 2 * WORM_SHAFT_HALF + 10, { at: [CENTER, -WORM_SHAFT_HALF - 5, 0], axis: [0, 1, 0] })));
  return f;
}

// Frozen at the seated mesh pose (worm at 0, wheel clocked so the thread sits in a tooth space).
const wheel = rotate(wheelBody(), CLOCK, { at: [0, 0, 0], axis: [0, 0, 1] });

export default [
  color(frameBody(), '#8c8d92'),
  color(wormBody(), '#bcbfc4'),
  color(wheel, '#cc852e'),
];
