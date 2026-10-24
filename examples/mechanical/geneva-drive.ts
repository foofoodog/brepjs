import {
  box,
  cylinder,
  cone,
  cut,
  cutAll,
  fuseAll,
  rotate,
  translate,
  unwrap,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Geneva (Maltese cross) 4-slot intermittent drive on a baseplate so it reads as
// one mechanism. The driver's crank rides in a gap UNDER the wheel; only its drive
// pin rises into a slot and its locking cam rises (relieved) alongside the wheel
// rim, so nothing else enters the wheel's swept envelope. The wheel indexes 90°
// per driver revolution; the convex cam locks it between steps.
const CENTER_DIST = 36; // C: wheel axis (origin) to driver axis
const PIN_PITCH_R = CENTER_DIST / Math.SQRT2; // crank/pin radius p = C/√2 (≈25.46)
const PIN_R = 3; // drive-pin radius
const PIN_LEADIN_H = 1.5; // conical lead-in at the pin tip
const PLATE_H = 4; // baseplate thickness
const GAP_Z = 3; // gap between plate top and wheel disc (the crank lives here)
const CRANK_Z0 = PLATE_H; // crank bottom face
const CRANK_H = GAP_Z; // crank thickness (sits entirely in the gap)
const WHEEL_Z0 = PLATE_H + GAP_Z; // wheel disc bottom face
const WHEEL_H = 8; // wheel disc thickness
const WHEEL_R = PIN_PITCH_R - 0.5; // slot tangent to the pin circle (≈24.96)
const SLOT_W = 2 * PIN_R + 1; // radial slot width (pin Ø6 + clearance)
const SLOT_INNER_R = CENTER_DIST - PIN_PITCH_R - PIN_R - 1; // slot depth (≈6.5)
const CAM_R = CENTER_DIST - WHEEL_R - 0.4; // convex locking-cam radius (≈10.6)
const CAM_TOP_Z = WHEEL_Z0 + WHEEL_H; // cam reaches the top of the wheel disc
const CAM_RELIEF_R = WHEEL_R + 1.5; // kidney notch (about the wheel axis)
const ARM_W = 2 * PIN_R + 0.6; // crank-arm width
const PIN_TOP_Z = WHEEL_Z0 + WHEEL_H / 2 + 1.5; // pin reaches just above mid-slot
const DRIVER_FOOTPRINT_R = PIN_PITCH_R + PIN_R; // crank reach (sets the baseplate)
const SHAFT_R = 6; // stub-shaft radius
const SHAFT_H = 6; // stub-shaft length into the baseplate boss
const BORE_R = 4.2; // center bore radius
const HUB_R = 8; // raised hub-boss collar radius
const HUB_H = 3; // hub boss proud of the top face
const PLATE_MARGIN = 6; // plate overhang beyond the wheels' footprint
const BOSS_R = SHAFT_R + 2.5; // bearing-boss outer radius
const BOSS_H = SHAFT_H + 1; // boss height
const BOSS_BORE_R = SHAFT_R + 0.4; // boss bore (clearance over the stub shaft)

// Driven Maltese wheel: 4 radial slots + 4 concave lock recesses, stub shaft, hub.
function drivenWheel() {
  const z0 = WHEEL_Z0;
  const disc = cylinder(WHEEL_R, WHEEL_H, { at: [0, 0, z0] });
  const slotLen = WHEEL_R - SLOT_INNER_R + 2;
  const slotTool = box(slotLen, SLOT_W, WHEEL_H + 4, { at: [SLOT_INNER_R + slotLen / 2, 0, z0 + WHEEL_H / 2] });
  let body = unwrap(cutAll(disc, [0, 90, 180, 270].map((a) => rotate(slotTool, a, { axis: [0, 0, 1] }))));

  const recessTool = cylinder(CAM_R + 0.5, WHEEL_H + 4, { at: [CENTER_DIST, 0, z0 - 2] });
  for (const a of [45, 135, 225, 315]) {
    body = unwrap(cut(body, rotate(recessTool, a, { axis: [0, 0, 1] })));
  }

  const shaft = cylinder(SHAFT_R, z0 + WHEEL_H, { at: [0, 0, 0] });
  const hub = cylinder(HUB_R, HUB_H + 1, { at: [0, 0, z0 + WHEEL_H - 1] });
  body = unwrap(fuseAll([body, shaft, hub], { unsafe: true, strategy: 'pairwise' }));
  return unwrap(cut(body, cylinder(BORE_R, z0 + WHEEL_H + HUB_H + 4, { at: [0, 0, -2] })));
}

// Driver: a kidney-relieved locking-cam disc + a crank arm carrying the drive pin,
// all riding in the gap under the wheel; stub shaft + hub.
function driver() {
  const camDisc = cylinder(CAM_R, CAM_TOP_Z - CRANK_Z0, { at: [0, 0, CRANK_Z0] });
  const relief = cylinder(CAM_RELIEF_R, CAM_TOP_Z - CRANK_Z0 + 4, { at: [-CENTER_DIST, 0, CRANK_Z0 - 2] });
  const cam = unwrap(cut(camDisc, relief));

  const armLen = PIN_PITCH_R + PIN_R;
  const arm = box(armLen, ARM_W, CRANK_H, { at: [-armLen / 2, 0, CRANK_Z0 + CRANK_H / 2] });

  const pinShaftH = PIN_TOP_Z - CRANK_Z0 - PIN_LEADIN_H;
  const pin = cylinder(PIN_R, pinShaftH, { at: [-PIN_PITCH_R, 0, CRANK_Z0] });
  const pinTip = cone(PIN_R, PIN_R - PIN_LEADIN_H, PIN_LEADIN_H + 0.01, { at: [-PIN_PITCH_R, 0, CRANK_Z0 + pinShaftH] });

  const shaft = cylinder(SHAFT_R, CRANK_Z0 + CRANK_H, { at: [0, 0, 0] });
  const hub = cylinder(HUB_R, HUB_H + 1, { at: [0, 0, CAM_TOP_Z - 1] });

  let body = unwrap(fuseAll([cam, arm, pin, pinTip, shaft, hub], { unsafe: true, strategy: 'pairwise' }));
  return unwrap(cut(body, cylinder(BORE_R, CAM_TOP_Z + HUB_H + 4, { at: [0, 0, -2] })));
}

// Baseplate with two raised bearing bosses at the shaft centres.
function baseplate() {
  const xMin = -WHEEL_R - PLATE_MARGIN;
  const xMax = CENTER_DIST + DRIVER_FOOTPRINT_R + PLATE_MARGIN;
  const yHalf = Math.max(WHEEL_R, DRIVER_FOOTPRINT_R) + PLATE_MARGIN;
  const plate = box(xMax - xMin, 2 * yHalf, PLATE_H, { at: [(xMin + xMax) / 2, 0, PLATE_H / 2] });
  const wheelBoss = cylinder(BOSS_R, BOSS_H + 1, { at: [0, 0, PLATE_H - 1] });
  const driverBoss = cylinder(BOSS_R, BOSS_H + 1, { at: [CENTER_DIST, 0, PLATE_H - 1] });
  let body = unwrap(fuseAll([plate, wheelBoss, driverBoss], { unsafe: true, strategy: 'pairwise' }));
  const wheelBore = cylinder(BOSS_BORE_R, BOSS_H + PLATE_H + 4, { at: [0, 0, -2] });
  const driverBore = cylinder(BOSS_BORE_R, BOSS_H + PLATE_H + 4, { at: [CENTER_DIST, 0, -2] });
  return unwrap(cutAll(body, [wheelBore, driverBore]));
}

// Seated display pose: drive pin centred in a slot on the line of centers.
export default [
  color(baseplate(), '#565b61'),
  color(drivenWheel(), '#b98a3c'),
  color(translate(driver(), [CENTER_DIST, 0, 0]), '#8f99a3'),
];
