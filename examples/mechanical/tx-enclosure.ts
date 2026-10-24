import {
  box,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  rotate,
  sketchRoundedRectangle,
  thread,
  translate,
  unwrap,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Two-part transmitter/receiver project enclosure, drawn exploded. A deep base
// shell carries full-height corner screw bosses and a mating-lip recess; its side
// walls are pierced by an RF board's I/O — a coax antenna bulkhead (back), a barrel
// power jack (front), and an RJ12 data jack (front). A shallow lid is lifted on the
// boss axes, and four steel self-tapping screws bridge lid to boss so the whole
// fastening path — and the thread — is visible.
function txEnclosure({
  pcbLength = 62, // PCB X extent (mm)
  pcbWidth = 50, // PCB Y extent (mm)
  pad = 1.5, // clearance between PCB and inner wall (mm)
  wall = 1.8, // side-wall thickness (mm)
  floor = 1.5, // base / lid plane thickness (mm)
  baseWall = 14, // base side-wall height above the floor (mm)
  lidWall = 6, // lid skirt height (mm)
  cornerR = 2.5, // outer vertical corner radius (mm)
  bossR = 3, // corner screw-boss radius (mm)
  pilotR = 1.1, // self-tap pilot-bore radius (mm)
  pilotDepth = 9, // pilot depth down from the boss top (mm)
  explode = 8, // gap the lid is lifted for the assembly view (mm)
} = {}) {
  // Outer footprint = PCB + clearance both sides + both walls.
  const outerL = pcbLength + 2 * pad + 2 * wall;
  const outerW = pcbWidth + 2 * pad + 2 * wall;
  const innerL = pcbLength + 2 * pad;
  const innerW = pcbWidth + 2 * pad;
  const innerR = Math.max(cornerR - wall, 0.5);

  // A rounded-corner rectangular prism: a centred box with its four vertical
  // (Z-running) edges filleted. (A direct shell() is fragile here — inDirection()
  // matches BOTH horizontal faces; cutting an inner cavity keeps the floor intact.)
  const roundedPrism = (w: number, d: number, h: number, z: number, r: number) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z'), r));
  };

  // --- BASE: a rounded tray, floor on z = 0, opening upward. ---
  const baseHeight = floor + baseWall;
  const baseOuter = roundedPrism(outerL, outerW, baseHeight, 0, cornerR);
  const baseCavity = roundedPrism(innerL, innerW, baseWall + 1, floor, innerR);
  const baseTray = unwrap(cut(baseOuter, baseCavity));

  // Mating-lip recess: rabbet a shallow step into the inner top rim so the lid
  // skirt nests inside it.
  const lipDepth = 3.5;
  const lipStep = roundedPrism(
    innerL + wall,
    innerW + wall,
    lipDepth + 1,
    baseHeight - lipDepth,
    Math.max(innerR + wall / 2, 0.5),
  );
  const baseStepped = unwrap(cut(baseTray, lipStep));

  // --- Full-height corner screw bosses (also the PCB standoffs) ---
  // Each boss rises the whole base-wall height to meet the lid, so the screw
  // driven down through the lid bites a continuous column instead of a peg
  // floating at the bottom of the box. Welded one at a time (the N-way fuseAll
  // leaves overlapping bosses as separate solids in a compound).
  const px = innerL / 2 - 5;
  const py = innerW / 2 - 5;
  const bossCenters: [number, number][] = [
    [-px, -py],
    [px, -py],
    [px, py],
    [-px, py],
  ];
  let baseWithBosses = baseStepped;
  for (const [x, y] of bossCenters) {
    baseWithBosses = unwrap(fuse(baseWithBosses, cylinder(bossR, baseHeight, { at: [x, y, 0] })));
  }

  // --- Cutters: self-tap pilot bores down each boss + side I/O ports ---
  const ioZ = floor + 8; // PCB connector centreline above the floor
  const tools = [];
  // Blind self-tap pilots, bored from each boss top down (the screw cuts its own
  // thread into these on assembly).
  for (const [x, y] of bossCenters) {
    tools.push(cylinder(pilotR, pilotDepth + 1, { at: [x, y, baseHeight - pilotDepth] }));
  }
  // Coax antenna bulkhead: round hole centred on the back (+Y) wall.
  tools.push(
    rotate(cylinder(3.2, wall + 4, { at: [0, 0, -wall - 2] }), 90, {
      axis: [1, 0, 0],
      at: [-pcbLength * 0.22, outerW / 2, ioZ],
    }),
  );
  // Barrel power jack: round hole low on the front (-Y) wall.
  tools.push(
    rotate(cylinder(4, wall + 4, { at: [0, 0, -wall - 2] }), 90, {
      axis: [1, 0, 0],
      at: [pcbLength * 0.3, -outerW / 2, floor + 5],
    }),
  );
  // RJ12 data jack: a rounded rectangular port through the front wall.
  const rjBlock = translate(sketchRoundedRectangle(14, 11, 1.5).extrude(wall + 4), [
    0,
    0,
    -(wall + 4) / 2,
  ]);
  tools.push(
    translate(rotate(rjBlock, 90, { axis: [1, 0, 0] }), [-pcbLength * 0.18, -outerW / 2, ioZ]),
  );

  const base = unwrap(cutAll(baseWithBosses, tools));

  // --- LID: a shallow inverted tray — cap on top, skirt hanging down. ---
  // Built cap-up directly (cavity open at the bottom) so it needs no flip; the
  // downward skirt drops over the base rim on assembly.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerL, outerW, lidH, 0, cornerR);
  const lidCavity = roundedPrism(innerL, innerW, lidWall + 1, -1, innerR);
  const lidTray = unwrap(cut(lidOuter, lidCavity));

  // Clearance holes through the lid cap, coaxial with the bosses.
  const clearR = 1.5;
  const lidHoles = bossCenters.map(([x, y]) => cylinder(clearR, lidH + 2, { at: [x, y, -1] }));
  const lidBored = unwrap(cutAll(lidTray, lidHoles));

  const lidLiftZ = baseHeight + explode;
  const lid = translate(lidBored, [0, 0, lidLiftZ]);
  const lidCapTopZ = lidLiftZ + lidH;

  // --- Steel self-tapping screws spanning lid → boss, real length ---
  // Pan head, plain shank, and a run of real lofted thread on the tip; sized to
  // the actual lid + engagement span (not the explode gap), so each reads as a
  // believable self-tapper, not a stretched pin.
  const headR = 2.7;
  const headH = 1.8;
  const shankR = clearR - 0.2;
  const engage = 6; // depth the screw threads into the boss pilot
  const screwLen = floor + lidWall + engage; // real length: lid cap → boss engagement
  const threadLen = screwLen - 1;
  const makeScrew = () => {
    let head = cylinder(headR, headH, { at: [0, 0, -headH] });
    head = unwrap(cut(head, box(headR * 2 + 1, 0.8, 1, { at: [0, 0, -0.5] })));
    const shank = cylinder(shankR, screwLen, { at: [0, 0, -headH - screwLen] });
    const screw = unwrap(fuse(head, shank));
    const ridge = unwrap(
      thread({ radius: shankR, pitch: 1.4, height: threadLen, sectionsPerTurn: 10 }),
    );
    return unwrap(fuse(screw, translate(ridge, [0, 0, -headH - screwLen])));
  };

  // A screw on each boss axis: tip just above the boss pilot, head proud of the lid.
  const screwTopZ = lidCapTopZ + 2.5;
  const screws = bossCenters.map(([x, y]) =>
    color(translate(makeScrew(), [x, y, screwTopZ]), '#b9bec6'),
  );

  return [base, lid, ...screws];
}

export default txEnclosure();