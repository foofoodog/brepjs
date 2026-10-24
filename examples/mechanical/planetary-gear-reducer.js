import { polygon, extrude, cylinder, cut, cutAll, fuse, unwrap } from 'brepjs/quick';

// 5:1 planetary (epicyclic) gear reducer — sun in, carrier out, ring fixed.
// Reduction = 1 + Zring/Zsun. The ring tooth count is forced by the coaxial
// constraint Zring = Zsun + 2*Zplanet, so the three gears share one module and
// mesh on a common pitch circle; equal planet spacing needs (Zsun+Zring) % planets == 0.
// Real 20° involute flanks (BOSL2 math), built as one polygon of all teeth -> extrude.
function planetaryReducer({
  module = 2, // m = pitch diameter / teeth (mm) — the size unit shared by all 3 gears
  teethSun = 12, // 5:1 set: 12 / 18 / 48
  teethPlanet = 18,
  planetCount = 3, // equally spaced; (Zsun+Zring) must divide by this
  faceWidth = 12, // gear thickness (mm)
  pressureAngleDeg = 20, // 20° is the industry standard
  backlash = 0.15, // tooth-thinning clearance so flanks don't jam (mm)
  addendumFactor = 1.0, // full-depth teeth (the trochoid-style root fillet clears interference)
  wall = 8, // ring rim beyond the pitch circle (mm)
  flangeWidth = 12, // mounting flange overhang beyond the wall (mm)
  flangeThick = 5, // flange / floor thickness (mm)
  boltCount = 6,
  boltHole = 2.6, // M5 clearance radius
  pinRadius = 5, // planet-pin radius
  outputShaft = 11, // output boss radius (mm)
  outputProtrude = 12, // how far the output boss drops below the mounting face (mm)
  inputJournal = 6, // sun input-shaft journal radius (mm)
  hexAcrossFlats = 6, // sun hex drive socket (mm)
} = {}) {
  const teethRing = teethSun + 2 * teethPlanet;
  const PA = (pressureAngleDeg * Math.PI) / 180;
  const STEPS = 16; // involute samples per flank
  const m = module;

  const prRing = (m * teethRing) / 2; // 48 — ring pitch radius
  const orbit = (m * (teethSun + teethPlanet)) / 2; // 30 — planet carrier radius
  const ringOuter = prRing + wall; // 56
  const flangeR = ringOuter + flangeWidth; // 68
  const boltCircle = ringOuter + flangeWidth / 2; // 62

  // Vertical stack (z up, mounting face on z=0).
  const plateT = 3; // carrier plate thickness
  const plateZ0 = flangeThick + 0.5; // plate floats just above the floor
  const gearZ0 = plateZ0 + plateT + 0.5; // 9 — gear band bottom
  const spiderT = 3;
  const spiderZ0 = gearZ0 + faceWidth + 0.5; // 21.5 — open top spider
  const housingH = gearZ0 + faceWidth + 2; // 23 — rim ~2mm above the gear tops
  const carrierR = orbit + pinRadius + 3; // 38 — clears ring teeth, reaches the pins

  const rot = (p, a) => [
    p[0] * Math.cos(a) - p[1] * Math.sin(a),
    p[0] * Math.sin(a) + p[1] * Math.cos(a),
  ];

  // One closed CCW loop of all the involute teeth, a tooth centred at angle 0.
  // The +angle flank uses the MIRRORED involute (offset = halfTooth + phiPitch) so
  // the tooth narrows to the tip like a real cut gear; where the root dips below
  // the base circle a circular root fillet (tangent to the flank, running to the
  // shared space-centre point) replaces the sharp radial root, clearing the mating
  // tip. ra/rr are the radii the involute spans; blHalf thins each flank (backlash).
  const gearToothLoop = (
    teeth,
    ra,
    rr,
    blHalf,
  ) => {
    const pr = (m * teeth) / 2;
    const br = pr * Math.cos(PA);
    const halfTooth = Math.PI / (2 * teeth) - blHalf;
    const invPt = (th) => [
      br * (Math.cos(th) + th * Math.sin(th)),
      br * (Math.sin(th) - th * Math.cos(th)),
    ];
    const thetaAt = (r) => Math.sqrt(Math.max(0, (r / br) ** 2 - 1));
    const phiPitch = Math.atan2(invPt(thetaAt(pr))[1], invPt(thetaAt(pr))[0]);
    const offset = halfTooth + phiPitch;
    const thMax = thetaAt(ra);
    const thStart = thetaAt(Math.max(rr, br));

    // +angle flank, tip -> base (mirrored involute curves back toward centre).
    const right = [];
    for (let i = STEPS; i >= 0; i--) {
      const p = invPt(thStart + ((thMax - thStart) * i) / STEPS);
      right.push(rot([p[0], -p[1]], offset));
    }
    const rSpace = rot([rr, 0], Math.PI / teeth); // shared root point at the space centre
    if (rr < br) {
      const pb = rot([br, 0], offset); // involute base point (flank tangent is radial)
      const nHat = [-Math.sin(offset), Math.cos(offset)]; // perp to flank, toward space
      const dx = pb[0] - rSpace[0];
      const dy = pb[1] - rSpace[1];
      const rf = -(dx * dx + dy * dy) / (2 * (dx * nHat[0] + dy * nHat[1]));
      const cf = [pb[0] + rf * nHat[0], pb[1] + rf * nHat[1]];
      const a0 = Math.atan2(pb[1] - cf[1], pb[0] - cf[0]);
      const a1 = Math.atan2(rSpace[1] - cf[1], rSpace[0] - cf[0]);
      let dA = a1 - a0;
      while (dA > Math.PI) dA -= 2 * Math.PI;
      while (dA < -Math.PI) dA += 2 * Math.PI;
      for (let i = 1; i <= STEPS; i++) {
        const a = a0 + (dA * i) / STEPS;
        right.push([cf[0] + Math.abs(rf) * Math.cos(a), cf[1] + Math.abs(rf) * Math.sin(a)]);
      }
    } else {
      right.push(rSpace); // root above the base circle — straight root land
    }
    // mirror the +angle flank across x for the -angle flank; drop the trailing
    // space-centre point (it is the next tooth's leading point — avoids a dup vertex).
    const left = right.map(([x, y]) => [x, -y] ).reverse();
    const tooth = [...left, ...right.slice(0, -1)];

    const loop = [];
    for (let t = 0; t < teeth; t++) {
      const c = (t * 2 * Math.PI) / teeth;
      for (const p of tooth) loop.push(rot(p, c));
    }
    return loop;
  };

  const blHalf = (teeth) => backlash / 2 / ((m * teeth) / 2); // per-flank thinning angle

  // External spur gear, spun in place, placed at (cx,cy), extruded up from the gear band.
  const spurGear = (teeth, spin, cx, cy) => {
    const pr = (m * teeth) / 2;
    const loop = gearToothLoop(teeth, pr + addendumFactor * m, pr - 1.25 * m, blHalf(teeth));
    const pts = loop.map(([x, y]) => {
      const q = rot([x, y], spin);
      return [q[0] + cx, q[1] + cy, gearZ0];
    });
    return unwrap(extrude(unwrap(polygon(pts)), faceWidth));
  };

  // Sun tooth on +X (spin 0); planet i phased to mesh by the external sun-planet
  // condition  θ = ψ(Zs+Zp)/Zp + π(Zp-1)/Zp  (mod 2π/Zp).
  const planetSpin = (psi) =>
    (psi * (teethSun + teethPlanet)) / teethPlanet + (Math.PI * (teethPlanet - 1)) / teethPlanet;
  const ringSpin = Math.PI / teethRing; // seats a ring tooth in each planet's outward gap

  // Housing: a flanged pot whose inner wall is the full-height internal ring gear.
  // The former's teeth are the ring's gaps (so backlash widens them: -blHalf); the
  // flange fills the bottom of the toothed bore into a solid floor + bolt skirt.
  const housing = () => {
    const loop = gearToothLoop(
      teethRing,
      prRing + 1.25 * m,
      prRing - addendumFactor * m,
      -blHalf(teethRing),
    );
    const pts = loop.map(([x, y]) => {
      const q = rot([x, y], ringSpin);
      return [q[0], q[1], 0];
    });
    const former = unwrap(extrude(unwrap(polygon(pts)), housingH));
    const wallPot = unwrap(cut(cylinder(ringOuter, housingH), former));
    const body = unwrap(fuse(wallPot, cylinder(flangeR, flangeThick)));
    const tools = [cylinder(outputShaft + 2, flangeThick + 2, { at: [0, 0, -1] })];
    for (let k = 0; k < boltCount; k++) {
      const a = (k * 2 * Math.PI) / boltCount;
      tools.push(
        cylinder(boltHole, flangeThick + 2, {
          at: [boltCircle * Math.cos(a), boltCircle * Math.sin(a), -1],
        }),
      );
    }
    return unwrap(cutAll(body, tools));
  };

  // Carrier (one rigid body): lightened bottom plate + 3 pins + output boss + open
  // top spider, welded pairwise with real z-overlap at every joint.
  const carrier = () => {
    // one lightening hole between each adjacent pair of pins — count follows
    // planetCount, orbit/radius derived so they clear the boss, pins and each other.
    const plateHoleOrbit = (outputShaft + orbit) / 2;
    const plateHoleR = Math.min(
      (orbit - outputShaft) / 3.5,
      plateHoleOrbit * Math.sin(Math.PI / planetCount) - 1,
    );
    const holes = [];
    if (plateHoleR > 1) {
      for (let i = 0; i < planetCount; i++) {
        const a = Math.PI / planetCount + (i * 2 * Math.PI) / planetCount;
        holes.push(
          cylinder(plateHoleR, plateT + 2, {
            at: [plateHoleOrbit * Math.cos(a), plateHoleOrbit * Math.sin(a), plateZ0 - 1],
          }),
        );
      }
    }
    const blank = cylinder(carrierR, plateT, { at: [0, 0, plateZ0] });
    const plate = holes.length ? unwrap(cutAll(blank, holes)) : blank;
    const boss = cylinder(outputShaft, plateZ0 + plateT + outputProtrude, {
      at: [0, 0, -outputProtrude],
    });

    // Spider: a bored hub (bore clears the sun journal) welded to three flat arms
    // that start at the hub rim — not the centre — so the bore stays open.
    const hubBore = inputJournal + 1;
    let spider = unwrap(
      cut(
        cylinder(hubBore + 6, spiderT, { at: [0, 0, spiderZ0] }),
        cylinder(hubBore, spiderT + 2, { at: [0, 0, spiderZ0 - 1] }),
      ),
    );
    for (let i = 0; i < planetCount; i++) {
      const psi = (i * 2 * Math.PI) / planetCount;
      const u = [Math.cos(psi), Math.sin(psi)];
      const v = [-Math.sin(psi), Math.cos(psi)];
      const corner = (r, s) => [
        r * u[0] + (s * 9) / 2 * v[0],
        r * u[1] + (s * 9) / 2 * v[1],
        spiderZ0,
      ];
      const arm = unwrap(
        extrude(
          unwrap(
            polygon([
              corner(hubBore + 3, -1),
              corner(orbit + 3, -1),
              corner(orbit + 3, 1),
              corner(hubBore + 3, 1),
            ]),
          ),
          spiderT,
        ),
      );
      spider = unwrap(fuse(spider, arm));
    }

    let body = unwrap(fuse(plate, boss));
    for (let i = 0; i < planetCount; i++) {
      const psi = (i * 2 * Math.PI) / planetCount;
      const pin = cylinder(pinRadius, spiderZ0 + spiderT - plateZ0, {
        at: [orbit * Math.cos(psi), orbit * Math.sin(psi), plateZ0],
      });
      body = unwrap(fuse(body, pin));
    }
    return unwrap(fuse(body, spider));
  };

  // Sun: 12T gear + input journal, with a hex drive socket bored through both.
  const sun = () => {
    const gear = spurGear(teethSun, 0, 0, 0);
    const stub = cylinder(inputJournal, 8, { at: [0, 0, gearZ0 + faceWidth] });
    const rHex = hexAcrossFlats / (2 * Math.cos(Math.PI / 6));
    const hex = Array.from({ length: 6 }, (_, k) => {
      const a = (k * Math.PI) / 3 + Math.PI / 6;
      return [rHex * Math.cos(a), rHex * Math.sin(a), gearZ0 - 1];
    });
    return unwrap(cut(unwrap(fuse(gear, stub)), unwrap(extrude(unwrap(polygon(hex)), faceWidth + 10))));
  };

  // Planet: 18T gear bored for its pin, lightened by a ring of holes.
  const planet = (psi) => {
    const cx = orbit * Math.cos(psi);
    const cy = orbit * Math.sin(psi);
    const boreR = pinRadius + 0.4;
    const rootR = (m * teethPlanet) / 2 - 1.25 * m; // planet root circle
    const tools = [cylinder(boreR, faceWidth + 2, { at: [cx, cy, gearZ0 - 1] })];
    // five lightening holes in the web between the bore and the root circle — derived
    // from the gear geometry so they scale with the module and never breach the root.
    const holeOrbit = (boreR + rootR) / 2;
    const holeR = 0.85 * m;
    if (holeOrbit - holeR > boreR + 0.3 && holeOrbit + holeR < rootR - 0.3) {
      for (let k = 0; k < 5; k++) {
        const a = (k * 2 * Math.PI) / 5;
        tools.push(
          cylinder(holeR, faceWidth + 2, {
            at: [cx + holeOrbit * Math.cos(a), cy + holeOrbit * Math.sin(a), gearZ0 - 1],
          }),
        );
      }
    }
    return unwrap(cutAll(spurGear(teethPlanet, planetSpin(psi), cx, cy), tools));
  };

  const planets = Array.from({ length: planetCount }, (_, i) =>
    planet((i * 2 * Math.PI) / planetCount),
  );
  return [housing(), carrier(), sun(), ...planets];
}

export default planetaryReducer();
