import {
  box,
  cylinder,
  cone,
  cut,
  fuse,
  fillet,
  rotate,
  translate,
  getBounds,
  edgeFinder,
  rectangularPattern,
  polygon,
  extrude,
  getSolids,
  validSolid,
  unwrap,
} from 'brepjs/quick';
import type { Edge } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Rack & pinion (same module m=2 on both members), frozen mid-travel with teeth meshed.
// Mesh: pinion pitch circle (r=18) tangent to the rack pitch line -> axis 18 mm above it.
const MODULE = 2.0;
const PA = (20 * Math.PI) / 180; // 20deg pressure angle
const PITCH = Math.PI * MODULE; // circular pitch 6.283
const WHOLE_DEPTH = 2.25 * MODULE;
const ADDENDUM = MODULE;
const BACKLASH = 0.5;
const PINION_TEETH = 18;
const PITCH_R = (MODULE * PINION_TEETH) / 2; // 18
const OUTER_R = PITCH_R + ADDENDUM; // 20 -> OD 40
const ROOT_R = PITCH_R - 1.25 * MODULE; // 15.5
const RAIL_H = 10, CHANNEL_FLOOR_Z = 4, RACK_BODY_H = 12;
const RACK_TIP_Z = CHANNEL_FLOOR_Z + RACK_BODY_H; // 16
const RACK_PITCH_Z = RACK_TIP_Z - ADDENDUM; // 14
const PINION_AXIS_Z = RACK_PITCH_Z + PITCH_R; // 32
const RAIL_LEN = 140, RAIL_WIDTH = 22, STOP_W = 8, STOP_H = 14;
const CHANNEL_W = 14, RACK_W = CHANNEL_W - 1.0, RACK_LEN = 96;
const GEAR_THICK = 10, SHAFT_R = 4, BORE_R = 5, POST_THICK = 8, POST_W = 26;
const FROZEN_THETA = 10;

// Frame: U-channel guide rail + lightening pockets + 2 end stops (bumpers) + bored bearing post + gussets.
function frame() {
  const rail = box(RAIL_LEN, RAIL_WIDTH, RAIL_H, { at: [0, 0, RAIL_H / 2] });
  const channel = box(RAIL_LEN + 2, CHANNEL_W, RAIL_H - CHANNEL_FLOOR_Z + 2, { at: [0, 0, CHANNEL_FLOOR_Z + (RAIL_H - CHANNEL_FLOOR_Z + 2) / 2] });
  let body = unwrap(cut(rail, channel));
  const nPockets = 7, pocketPitch = 16, pocketSpan = (nPockets - 1) * pocketPitch;
  for (let i = 0; i < nPockets; i++) {
    const px = -pocketSpan / 2 + i * pocketPitch;
    for (const sy of [-1, 1]) {
      body = unwrap(cut(body, box(12, 3.5, 5, { at: [px, sy * (RAIL_WIDTH / 2 - 0.75), RAIL_H / 2] })));
    }
  }
  const stopXL = -RAIL_LEN / 2 + STOP_W / 2, stopXR = RAIL_LEN / 2 - STOP_W / 2, stopZ = RAIL_H + STOP_H / 2;
  body = unwrap(fuse(body, box(STOP_W, RAIL_WIDTH, STOP_H, { at: [stopXL, 0, stopZ] })));
  body = unwrap(fuse(body, box(STOP_W, RAIL_WIDTH, STOP_H, { at: [stopXR, 0, stopZ] })));
  body = unwrap(fuse(body, cylinder(3.5, 2, { at: [stopXL + STOP_W / 2 + 1, 0, RAIL_H + 5], axis: [1, 0, 0] })));
  body = unwrap(fuse(body, cylinder(3.5, 2, { at: [stopXR - STOP_W / 2 - 1, 0, RAIL_H + 5], axis: [1, 0, 0] })));

  const postY = -(RAIL_WIDTH / 2 + POST_THICK / 2);
  const post = box(POST_W, POST_THICK, PINION_AXIS_Z + 8, { at: [0, postY, (PINION_AXIS_Z + 8) / 2] });
  const bore = cylinder(SHAFT_R + 0.3, POST_THICK + 4, { at: [0, postY - (POST_THICK + 4) / 2, PINION_AXIS_Z], axis: [0, 1, 0] });
  const postSolid = unwrap(validSolid(getSolids(unwrap(cut(post, bore)))[0]));
  const postEdges = edgeFinder().inDirection('Y').when((f: Edge) => getBounds(f).zMax > PINION_AXIS_Z + 6).findAll(postSolid);
  let postBody = postEdges.length > 0 ? unwrap(fillet(postSolid, postEdges, 3)) : postSolid;
  // Bracing gussets: triangular webs (X-Z plane) tying the post back to the rail top.
  const gussetPrism = unwrap(extrude(unwrap(polygon([[-9, RAIL_H, 0], [9, RAIL_H, 0], [-9, RAIL_H + 26, 0]])), 6));
  const gussetUp = rotate(gussetPrism, 90, { axis: [1, 0, 0] });
  for (const gx of [-POST_W / 4, POST_W / 4]) {
    postBody = unwrap(fuse(postBody, translate(gussetUp, [gx, -(RAIL_WIDTH / 2) - 3, 0])));
  }
  return unwrap(fuse(body, postBody));
}

// Rack: bar with trapezoidal (20deg-flank) tooth gaps cut by a rectangularPattern at the circular pitch.
function rack() {
  const bar = box(RACK_LEN, RACK_W, RACK_BODY_H, { at: [0, 0, CHANNEL_FLOOR_Z + RACK_BODY_H / 2] });
  const halfPitch = (PITCH / 2 + BACKLASH) / 2;
  const overTip = (RACK_TIP_Z + 0.4 - RACK_PITCH_Z) * Math.tan(PA);
  const underRoot = (RACK_PITCH_Z - (RACK_TIP_Z - WHOLE_DEPTH - 0.4)) * Math.tan(PA);
  const zTop = RACK_TIP_Z + 0.4, zBot = RACK_TIP_Z - WHOLE_DEPTH - 0.4;
  const wTop = halfPitch + overTip, wBot = Math.max(0.4, halfPitch - underRoot);
  // trapezoid authored in X-Y (sketch-Y carries Z height), extruded then rotated upright.
  const slab = unwrap(extrude(unwrap(polygon([[-wBot, zBot, 0], [wBot, zBot, 0], [wTop, zTop, 0], [-wTop, zTop, 0]])), RACK_W + 4));
  const cutter = translate(rotate(slab, 90, { axis: [1, 0, 0] }), [0, (RACK_W + 4) / 2, 0]);
  const nGaps = Math.floor(RACK_LEN / PITCH) - 1;
  const cutters = unwrap(rectangularPattern(cutter, { xDir: [1, 0, 0], xCount: nGaps, xSpacing: PITCH, yDir: [0, 1, 0], yCount: 1, ySpacing: 1 }));
  return unwrap(cut(bar, translate(cutters, [-((nGaps - 1) * PITCH) / 2, 0, 0])));
}

// Pinion: a true involute spur gear (18 teeth) — straight radial teeth jam against the rack, so the
// flanks are generated from the involute of the base circle (ported from BOSL2 gears.scad).
const BASE_R = PITCH_R * Math.cos(PA);
const INV_STEPS = 10;
const invPt = (th: number): [number, number] => [BASE_R * (Math.cos(th) + th * Math.sin(th)), BASE_R * (Math.sin(th) - th * Math.cos(th))];
const thetaAt = (r: number) => Math.sqrt(Math.max(0, (r / BASE_R) ** 2 - 1));
const rot2 = (p: [number, number], a: number): [number, number] => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];

function pinionProfile(): [number, number, number][] {
  const halfTooth = Math.PI / (2 * PINION_TEETH) - BACKLASH / 2 / PITCH_R;
  const thMax = thetaAt(OUTER_R);
  const phiPitch = Math.atan2(invPt(thetaAt(PITCH_R))[1], invPt(thetaAt(PITCH_R))[0]);
  const offset = halfTooth + phiPitch;
  const side: [number, number][] = [];
  for (let i = INV_STEPS; i >= 0; i--) {
    const p = invPt((thMax * i) / INV_STEPS);
    side.push(rot2([p[0], -p[1]], offset));
  }
  const rSpace = rot2([ROOT_R, 0], Math.PI / PINION_TEETH);
  if (ROOT_R < BASE_R) {
    const pb = rot2([BASE_R, 0], offset);
    const nHat: [number, number] = [-Math.sin(offset), Math.cos(offset)];
    const dx = pb[0] - rSpace[0], dy = pb[1] - rSpace[1];
    const rf = -(dx * dx + dy * dy) / (2 * (dx * nHat[0] + dy * nHat[1]));
    const cf: [number, number] = [pb[0] + rf * nHat[0], pb[1] + rf * nHat[1]];
    const a0 = Math.atan2(pb[1] - cf[1], pb[0] - cf[0]);
    const a1 = Math.atan2(rSpace[1] - cf[1], rSpace[0] - cf[0]);
    let dA = a1 - a0;
    while (dA > Math.PI) dA -= 2 * Math.PI;
    while (dA < -Math.PI) dA += 2 * Math.PI;
    for (let i = 1; i <= INV_STEPS; i++) {
      const a = a0 + (dA * i) / INV_STEPS;
      side.push([cf[0] + Math.abs(rf) * Math.cos(a), cf[1] + Math.abs(rf) * Math.sin(a)]);
    }
  } else {
    side.push(rSpace);
  }
  const tooth = [...side.map(([x, y]) => [x, -y] as [number, number]).reverse(), ...side.slice(0, -1)];
  const pts3: [number, number, number][] = [];
  for (let t = 0; t < PINION_TEETH; t++) {
    const c = (t * 2 * Math.PI) / PINION_TEETH;
    for (const p of tooth) {
      const q = rot2(p, c);
      pts3.push([q[0], q[1], 0]);
    }
  }
  return pts3;
}

function pinion() {
  let gear = translate(unwrap(extrude(unwrap(polygon(pinionProfile())), GEAR_THICK)), [0, 0, -GEAR_THICK / 2]);
  const HUB_PROUD = 3;
  gear = unwrap(fuse(gear, cylinder(BORE_R + 4, HUB_PROUD, { at: [0, 0, GEAR_THICK / 2 + HUB_PROUD / 2] })));
  gear = unwrap(cut(gear, cylinder(BORE_R, GEAR_THICK + 4 + HUB_PROUD, { at: [0, 0, -(GEAR_THICK + 4) / 2 + HUB_PROUD / 2] })));
  gear = unwrap(cut(gear, box(2.2, 1.6, GEAR_THICK + HUB_PROUD + 2, { at: [0, BORE_R, GEAR_THICK / 2 + HUB_PROUD / 2 - 1] })));
  let shaft = cylinder(SHAFT_R, 22, { at: [0, 0, -7] });
  const ringOuter = cylinder(SHAFT_R + 1, 1.4, { at: [0, 0, -7.1] });
  const ringInner = cone(SHAFT_R - 1.2, SHAFT_R + 1, 1.4, { at: [0, 0, -7.1] });
  shaft = unwrap(cut(shaft, unwrap(cut(ringOuter, ringInner))));
  gear = unwrap(fuse(gear, shaft));
  return rotate(gear, 90, { axis: [1, 0, 0] }); // lay axis along Y
}

// Frozen mesh pose: pinion spun +theta about Y, rack rolled -pitchRadius*theta along X.
const FRAME = frame();
const RACK0 = rack();
const PINION0 = pinion();
const thetaRad = (FROZEN_THETA * Math.PI) / 180;
const rackBody = translate(RACK0, [-PITCH_R * thetaRad, 0, 0]);
const pinionBody = translate(rotate(PINION0, FROZEN_THETA, { axis: [0, 1, 0] }), [0, 0, PINION_AXIS_Z]);

export default [
  color(FRAME, '#8c8f96'),
  color(rackBody, '#b3b7bd'),
  color(pinionBody, '#d1a847'),
];
