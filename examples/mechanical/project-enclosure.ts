import {
  box,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  thread,
  translate,
  unwrap,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Two-part PCB box drawn as an exploded assembly that really screws together:
// a base tray with four full-height tapped corner bosses, a lid lifted straight
// up on the boss axes, and four steel M3 screws bridging the gap so the whole
// boss-to-lid fastening path is visible. Each screw is a slotted head, a shank,
// and a run of real lofted thread on its tip.
function projectEnclosure({
  pcbLength = 150, // PCB extent along X (mm)
  pcbWidth = 100, // PCB extent along Y (mm)
  padding = 2, // gap between PCB and inner wall (mm)
  wall = 2, // side-wall thickness (mm)
  floor = 1.5, // base / lid plane thickness (mm)
  baseWall = 24, // base wall height (mm)
  lidWall = 12, // lid skirt height (mm)
  ridge = 4, // registration-ridge height (mm)
  slack = 0.3, // ridge-to-lid radial clearance (mm)
  round = 3, // rounded vertical-edge radius (mm)
  bossD = 9, // corner-boss diameter (mm)
  threadR = 1.6, // tapped-thread nominal radius (mm)
  threadPitch = 1.4, // thread pitch, shared by tap and screw (mm)
  threadDepth = 8, // tapped length down each boss (mm)
  clearR = 1.8, // lid clearance-hole radius for the M3 shank (mm)
  explode = 10, // gap the lid is lifted for the assembly view (mm)
} = {}) {
  const innerX = pcbLength + 2 * padding;
  const innerY = pcbWidth + 2 * padding;
  const outerX = innerX + 2 * wall;
  const outerY = innerY + 2 * wall;
  const innerR = Math.max(round - wall, 0.5);

  // Centred box with its four vertical edges filleted — every wall and cavity.
  const roundedPrism = (w: number, d: number, h: number, z: number, r: number) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z'), r));
  };

  // Four boss/hole centres, inset from the corners.
  const sx = innerX / 2 - bossD / 2 - 1;
  const sy = innerY / 2 - bossD / 2 - 1;
  const bossCenters: [number, number][] = [
    [-sx, -sy],
    [sx, -sy],
    [sx, sy],
    [-sx, sy],
  ];

  // BASE: a hollow tray — cap at z = 0, opening upward.
  const baseTopZ = floor + baseWall;
  const baseOuter = roundedPrism(outerX, outerY, baseTopZ, 0, round);
  const baseCavity = roundedPrism(innerX, innerY, baseWall + round, floor, innerR);
  let base = unwrap(cut(baseOuter, baseCavity));

  // Registration ridge on the top rim, inset by slack so the lid groove clears it.
  const ridgeOuterW = innerX + 2 * wall - 2 * slack;
  const ridgeOuterD = innerY + 2 * wall - 2 * slack;
  const ridgeBand = unwrap(
    cut(
      roundedPrism(ridgeOuterW, ridgeOuterD, ridge, baseTopZ, Math.max(round - slack, 0.5)),
      roundedPrism(innerX, innerY, ridge + 1, baseTopZ - 0.5, innerR),
    ),
  );
  base = unwrap(fuse(base, ridgeBand));

  // Full-height tapped corner bosses (also PCB standoffs): they rise the whole
  // base-wall height to meet the lid, then are bored and tapped from the top so
  // the screw bites real thread. Tapping one standalone boss and fusing four
  // copies is far cheaper than carving the helix from the whole enclosure.
  const tapThread = unwrap(
    thread({ radius: threadR, pitch: threadPitch, height: threadDepth, inward: true, sectionsPerTurn: 10 }),
  );
  let boss = cylinder(bossD / 2, baseTopZ, { at: [0, 0, 0] });
  boss = unwrap(cut(boss, cylinder(threadR, threadDepth + 1, { at: [0, 0, baseTopZ - threadDepth] })));
  boss = unwrap(cut(boss, translate(tapThread, [0, 0, baseTopZ - threadDepth])));
  for (const [cx, cy] of bossCenters) {
    base = unwrap(fuse(base, translate(boss, [cx, cy, 0])));
  }

  // LID: hollow shell built cap-up (cavity open at the bottom) so it nests onto
  // the base with no flip; the skirt rim is grooved to swallow the base ridge.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerX, outerY, lidH, 0, round);
  const lidCavity = roundedPrism(innerX, innerY, lidWall + 1, -1, innerR);
  let lid = unwrap(cut(lidOuter, lidCavity));
  const groove = roundedPrism(
    ridgeOuterW + 2 * slack,
    ridgeOuterD + 2 * slack,
    ridge + 0.5,
    -0.25,
    Math.max(round - slack, 0.5),
  );
  lid = unwrap(cut(lid, groove));

  // Clearance holes through the lid cap, coaxial with the bosses.
  const lidHoles = bossCenters.map(([cx, cy]) => cylinder(clearR, lidH + 2, { at: [cx, cy, -1] }));
  lid = unwrap(cutAll(lid, lidHoles));

  // Exploded view: lift the lid straight up so its holes stay coaxial with the bosses.
  const lidLiftZ = baseTopZ + explode;
  const placedLid = translate(lid, [0, 0, lidLiftZ]);
  const lidCapTopZ = lidLiftZ + lidH;

  // One steel M3 screw, built head-up with its head top at z = 0 and the tip
  // hanging down: a slotted cheese head, a plain shank, and a run of real lofted
  // thread on the tip.
  const headR = bossD / 2 - 0.6;
  const headH = 2.2;
  const shankR = clearR - 0.3;
  const screwLen = floor + lidWall + threadDepth - 1; // real M3 length: lid cap → boss engagement, not the explode gap
  const threadLen = threadDepth + 3;
  const makeScrew = () => {
    let head = cylinder(headR, headH, { at: [0, 0, -headH] });
    const slot = box(headR * 2 + 1, 1, 1.2, { at: [0, 0, -0.6] });
    head = unwrap(cut(head, slot));
    const shank = cylinder(shankR, screwLen, { at: [0, 0, -headH - screwLen] });
    const screw = unwrap(fuse(head, shank));
    const ridge = unwrap(
      thread({ radius: shankR, pitch: threadPitch, height: threadLen, sectionsPerTurn: 10 }),
    );
    return unwrap(fuse(screw, translate(ridge, [0, 0, -headH - screwLen])));
  };

  // A screw on each boss axis: tip in the tapped boss, head proud above the lid.
  const screwTopZ = lidCapTopZ + 3;
  const screws = bossCenters.map(([cx, cy]) =>
    color(translate(makeScrew(), [cx, cy, screwTopZ]), '#b9bec6'),
  );

  return [base, placedLid, ...screws];
}

export default projectEnclosure();