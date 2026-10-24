import {
  box,
  cylinder,
  fuse,
  cut,
  cutAll,
  translate,
  rotate,
  fillet,
  thread,
  edgeFinder,
  getBounds,
  unwrap,
  type Edge,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Machine vise (drill-press style). A solid cast bed carries a fixed jaw at one
// end; the movable jaw saddles the central bed bar and slides along it (a box
// way). A lead screw is captured in the movable jaw with the crank at the front
// and threads through a nut in the fixed jaw — its tail runs out the back as
// travel reserve, so the jaw genuinely opens and closes. Datums: bed bottom at
// Z=0, screw axis along X.
const P = {
  bedLen: 96, // ends just past the movable jaw so the crank cantilevers off the front
  flangeW: 78, // wide mounting foot
  flangeH: 11,
  barW: 46, // central slide bar the movable jaw saddles
  barTopZ: 30,
  jawWidth: 56, // jaws overhang the bar a little
  jawTopZ: 66,
  fixedThick: 22,
  movThick: 26,
  jawGap: 34, // fixed grip face to movable grip face (display, partway open)
  screwR: 7, // fat lead-screw core so the shallow thread reads as a rod, not a coil
  pitch: 4,
  screwZ: 41, // axis above the bar, in the open mouth
  boreR: 7.6, // nut bore through the fixed jaw (thread engages here)
  movBoreR: 7.4, // smooth bore through the movable jaw (screw is captured, free to spin)
  tailLen: 5, // small thread run behind the fixed jaw, capped by a retaining collar
  plateThick: 6,
  plateWidth: 46,
  plateBotZ: 52, // jaw plates sit clear above the thread crest (8.4 -> top Z=49.4)
  plateTopZ: 64,
  boltR: 2.4,
  cboreR: 4.2,
  cboreDepth: 3,
  collarR: 9, // thrust collar capturing the screw at the movable-jaw front face
  collarThick: 6,
  handleR: 3.5,
  handleLen: 46,
  handleHubR: 7,
  handleHubLen: 12,
  handleStandoff: 34, // crank stands clear off the front edge so the knobs swing freely
  knobR: 5,
  knobLen: 8,
  mountX0: 14, // mounting holes in the flange ears (clear of the bar + jaws)
  mountX1: 86,
  mountY: 31,
  mountHoleR: 3.5,
  mountCboreR: 6.5,
  mountCboreDepth: 5,
};

const fixedGrip = P.fixedThick; // 22 — fixed-jaw grip face
const movGrip = fixedGrip + P.jawGap; // 56 — movable-jaw grip face
const movBack = movGrip + P.movThick; // movable-jaw back face
const tailX = -P.tailLen; // rear thread end (behind the fixed jaw)
const crankX = movBack + P.handleStandoff; // crank crossbar, out in front
const plateH = P.plateTopZ - P.plateBotZ;
const plateInset = P.plateThick - 1; // plate face proud of the jaw face by this much

// Bed casting: wide filleted flange + central slide bar + fixed jaw, bored along
// X for the screw nut, with counterbored bolt holes in the flange ears.
function buildBed() {
  let flange = box(P.bedLen, P.flangeW, P.flangeH, { at: [P.bedLen / 2, 0, P.flangeH / 2] });
  const botEdges = edgeFinder()
    .inDirection('X')
    .when((f: Edge) => getBounds(f).zMin < 1)
    .findAll(flange);
  flange = unwrap(fillet(flange, botEdges, 3));

  // Bar sinks into the flange so the fuse welds into one casting.
  const bar = box(P.bedLen, P.barW, P.barTopZ - 8, { at: [P.bedLen / 2, 0, (8 + P.barTopZ) / 2] });
  const fixedJaw = box(P.fixedThick, P.jawWidth, P.jawTopZ, {
    at: [P.fixedThick / 2, 0, P.jawTopZ / 2],
  });

  let bed = unwrap(fuse(flange, bar));
  bed = unwrap(fuse(bed, fixedJaw));

  const bore = cylinder(P.boreR, P.fixedThick + P.tailLen + 12, {
    at: [tailX - 6, 0, P.screwZ],
    axis: [1, 0, 0],
  });
  bed = unwrap(cut(bed, bore));

  // Round the fixed-jaw top edges (cast look).
  const jawTop = edgeFinder()
    .inDirection('X')
    .when((f: Edge) => getBounds(f).zMax > P.jawTopZ - 0.5)
    .findAll(bed);
  bed = unwrap(fillet(bed, jawTop, 2.5));

  const mounts = [];
  for (const mx of [P.mountX0, P.mountX1]) {
    for (const my of [-P.mountY, P.mountY]) {
      mounts.push(cylinder(P.mountHoleR, P.flangeH + 6, { at: [mx, my, -3], axis: [0, 0, 1] }));
      mounts.push(
        cylinder(P.mountCboreR, P.mountCboreDepth + 1, {
          at: [mx, my, P.flangeH - P.mountCboreDepth],
          axis: [0, 0, 1],
        })
      );
    }
  }
  return unwrap(cutAll(bed, mounts));
}

// Movable jaw: a saddle that straddles the bed bar (channel underneath) and
// slides along it, with a smooth bore that captures the spinning screw.
function buildMovingJaw() {
  const cx = movGrip + P.movThick / 2;
  const botZ = P.flangeH - 1; // feet tuck 1 mm into the flange top; never reach Z=0
  let jaw = box(P.movThick, P.jawWidth, P.jawTopZ - botZ, {
    at: [cx, 0, (botZ + P.jawTopZ) / 2],
  });
  // Saddle channel: clears the bar (top + both sides) so the jaw rides the way.
  const channel = box(P.movThick + 2, P.barW + 1, P.barTopZ + 1 - botZ, {
    at: [cx, 0, (botZ + P.barTopZ + 1) / 2],
  });
  jaw = unwrap(cut(jaw, channel));
  const bore = cylinder(P.movBoreR, P.movThick + 8, { at: [cx - P.movThick / 2 - 4, 0, P.screwZ], axis: [1, 0, 0] });
  jaw = unwrap(cut(jaw, bore));
  const topEdges = edgeFinder()
    .inDirection('X')
    .when((f: Edge) => getBounds(f).zMax > P.jawTopZ - 0.5)
    .findAll(jaw);
  return unwrap(fillet(jaw, topEdges, 2.5));
}

// Lead-screw body (steel): a long threaded run from the rear tail, through the
// fixed nut and across the open mouth, then a smooth journal captured in the
// movable jaw by a thrust collar. The T-handle is added in world coords by the
// caller. Built about +Z, laid along +X by the caller (worldX = localZ + tailX).
function buildScrew() {
  const shankLen = crankX + 6 - tailX; // tail .. just past the crank
  let screw = cylinder(P.screwR, shankLen, { at: [0, 0, 0] });

  // Coarse Acme (trapezoidal, flat-crest) thread — the power-screw profile a
  // real vise uses, not a sharp V. Runs from the tail to the movable-jaw front.
  const threadLen = movGrip - tailX;
  const ridge = unwrap(
    thread({
      radius: P.screwR,
      pitch: P.pitch,
      height: threadLen,
      depth: 1.4, // shallow on a fat core -> a textured rod, not a standoff coil
      toothHalfWidth: 1.7,
      crest: 0.9,
      sectionsPerTurn: 20,
    })
  );
  screw = unwrap(fuse(screw, ridge));

  // Thrust collar at the movable-jaw front face (worldX = movBack -> localZ),
  // capturing the screw axially, and a retaining collar at the rear that caps the
  // thread end against the fixed-jaw back (so the tail is a finished boss, not a
  // raw stub). worldX = localZ + tailX, so localZ = worldX - tailX.
  const frontCollarZ = movBack - tailX;
  screw = unwrap(fuse(screw, cylinder(P.collarR, P.collarThick, { at: [0, 0, frontCollarZ] })));
  const rearCollarZ = -5 - tailX; // collar from worldX -5 (screw end) forward 6 mm
  return unwrap(fuse(screw, cylinder(P.collarR - 0.5, 6, { at: [0, 0, rearCollarZ] })));
}

// T-handle crank, built directly in world coords at the front crank station so
// the crossbar is unambiguously horizontal (along Y) — knobs to the sides, not
// stabbing below the bed. Fused onto the world-placed screw.
function addCrank(screw: ReturnType<typeof buildScrew>) {
  const cz = P.screwZ;
  const hub = cylinder(P.handleHubR, P.handleHubLen, {
    at: [crankX - P.handleHubLen / 2, 0, cz],
    axis: [1, 0, 0],
  });
  const bar = cylinder(P.handleR, P.handleLen, { at: [crankX, -P.handleLen / 2, cz], axis: [0, 1, 0] });
  const yEnd = P.handleLen / 2 - 1;
  const knobPlus = cylinder(P.knobR, P.knobLen, { at: [crankX, yEnd, cz], axis: [0, 1, 0] });
  const knobMinus = cylinder(P.knobR, P.knobLen, { at: [crankX, -yEnd, cz], axis: [0, -1, 0] });
  let out = unwrap(fuse(screw, hub));
  out = unwrap(fuse(out, bar));
  out = unwrap(fuse(out, knobPlus));
  return unwrap(fuse(out, knobMinus));
}

// Hardened jaw plate: horizontal serrations on the grip face + two counterbored
// bolt holes. Grip face is at X = plateThick (the +X face).
function buildPlate() {
  let plate = box(P.plateThick, P.plateWidth, plateH, {
    at: [P.plateThick / 2, 0, P.plateBotZ + plateH / 2],
  });
  const tools = [];
  for (const cy of [-15, 15]) {
    const cz = P.plateBotZ + plateH / 2;
    tools.push(cylinder(P.boltR, P.plateThick + 4, { at: [-2, cy, cz], axis: [1, 0, 0] }));
    tools.push(
      cylinder(P.cboreR, P.cboreDepth + 0.5, { at: [P.plateThick - P.cboreDepth, cy, cz], axis: [1, 0, 0] })
    );
  }
  plate = unwrap(cutAll(plate, tools));

  const grooves = [];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const gz = P.plateBotZ + 2 + (i * (plateH - 4)) / (n - 1);
    grooves.push(box(1.4, P.plateWidth + 2, 1.0, { at: [P.plateThick - 0.3, 0, gz] }));
  }
  return unwrap(cutAll(plate, grooves));
}

// Spin about Z so the iso view reads the serrated faces, the thread across the
// mouth, and the T-handle crank all at once.
const SPIN = 250;
const up: [number, number, number] = [0, 0, 1];

const bed = buildBed();
const movingJaw = buildMovingJaw();
const screw = addCrank(translate(rotate(buildScrew(), 90, { axis: [0, 1, 0] }), [tailX, 0, P.screwZ]));
const plateFixed = translate(buildPlate(), [fixedGrip + plateInset - P.plateThick, 0, 0]);
const plateMoving = translate(rotate(buildPlate(), 180, { axis: [0, 0, 1] }), [movGrip - plateInset + P.plateThick, 0, 0]);

export default [
  color(rotate(bed, SPIN, { axis: up }), '#4d525a'),
  color(rotate(movingJaw, SPIN, { axis: up }), '#565b63'),
  color(rotate(screw, SPIN, { axis: up }), '#c3c8ce'),
  color(rotate(plateFixed, SPIN, { axis: up }), '#74797f'),
  color(rotate(plateMoving, SPIN, { axis: up }), '#74797f'),
];
