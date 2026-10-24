import {
  box,
  chamfer,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fuse,
  rotate,
  torus,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Panel-mount rotary potentiometer (16 mm carbon pot, 3/8" / M10 bushing). A
// crimped sheet-metal can carries a raised boss on its front face, a threaded
// mounting bushing rising from the boss, an anti-rotation locating pin beside
// it, and a keyed (D-flat) control shaft up the centre. Three solder lugs hang
// off the back. Built along +Z: can z=0..bodyH, then boss, bushing and shaft.
// Everything is fused pairwise with ~1 mm interpenetration so the whole vitamin
// stays a single rigid solid; the D-flat and the thread grooves are cut.
function rotaryPot({
  bodyDia = 24, // diameter of the metal can (mm)
  bodyH = 14, // height of the can (mm)
  bushingDia = 10, // mounting thread OD (M10 / 3/8") (mm)
  bushingH = 7.5, // height of the threaded bushing (mm)
  bossDia = 14, // raised plinth between can and bushing (mm)
  bossH = 2.5, // boss height (mm)
  shaftDia = 6, // control-shaft diameter (mm)
  shaftLen = 20, // shaft length above the bushing top (mm)
  flatOffset = 2, // distance from shaft axis to the milled D-flat plane (mm)
  flatLen = 14, // length of the flatted (keyed) portion (mm)
  tabOffset = 11, // anti-rotation pin offset from shaft axis (mm)
} = {}) {
  const bodyR = bodyDia / 2;
  const bushR = bushingDia / 2;
  const bossR = bossDia / 2;
  const shaftR = shaftDia / 2;

  // Reference heights along the central axis.
  const bodyTop = bodyH;
  const bossTop = bodyTop + bossH;
  const bushTop = bossTop + bushingH;
  const shaftTop = bushTop + shaftLen;

  // --- The metal can: chamfer the front rim so it reads as a rolled crimp. ---
  const can0 = cylinder(bodyR, bodyH, { at: [0, 0, 0] });
  const rimEdges = edgeFinder().ofCurveType('CIRCLE').findAll(can0);
  let can = unwrap(chamfer(unwrap(validSolid(can0)), rimEdges, 1.2));

  // --- Raised boss / plinth on the front face (sinks 1 mm into the can). ---
  const boss = cylinder(bossR, bossH + 1, { at: [0, 0, bodyTop - 1] });

  // --- Threaded mounting bushing rising from the boss. Chamfer both rims so
  // the thread lead-in reads cleanly at the top. ---
  const bushing0 = cylinder(bushR, bushingH + 1, { at: [0, 0, bossTop - 1] });
  const bushRimEdges = edgeFinder().ofCurveType('CIRCLE').findAll(bushing0);
  const bushing = unwrap(chamfer(unwrap(validSolid(bushing0)), bushRimEdges, 0.6));

  // --- Anti-rotation locating pin on the front face, offset from the axis. ---
  const pin = box(1.4, 3, bossH + 2.2, { at: [tabOffset, 0, bodyTop + (bossH + 2.2) / 2 - 1] });

  // --- Control shaft up the centre, with a neck step at its base. ---
  const neck = cylinder(shaftR + 0.6, 2, { at: [0, 0, bushTop - 1] });
  const shaft = cylinder(shaftR, shaftLen + 1, { at: [0, 0, bushTop - 1] });

  // --- Solder lugs: three thin tabs hanging off the back of the can. ---
  const lugs = [];
  for (let i = 0; i < 3; i++) {
    const lug = box(3.2, 0.6, 5, { at: [0, bodyR - 0.5, -5 / 2 + 1] });
    lugs.push(rotate(lug, 90 + (i - 1) * 35, { axis: [0, 0, 1], at: [0, 0, 0] }));
  }

  // --- Fuse everything PAIRWISE into one rigid body (real overlap each time). ---
  let pot = can;
  pot = unwrap(fuse(pot, boss));
  pot = unwrap(fuse(pot, bushing));
  pot = unwrap(fuse(pot, pin));
  pot = unwrap(fuse(pot, neck));
  pot = unwrap(fuse(pot, shaft));
  for (const lug of lugs) pot = unwrap(fuse(pot, lug));

  // --- Mill the D-flat on the upper part of the shaft (a keyed drive). The
  // cutter is a slab whose near face sits at y = flatOffset (inside the shaft
  // radius) and which extends outward past the shaft, removing the cap. ---
  const flatZ0 = shaftTop - flatLen;
  const cutDepth = shaftDia; // reaches well past the far wall
  const flatCutter = box(shaftDia + 2, cutDepth, flatLen + 2, {
    at: [0, flatOffset + cutDepth / 2, (flatZ0 + shaftTop) / 2 + 1],
  });
  pot = unwrap(cut(pot, flatCutter));

  // --- Score the bushing with a few thread grooves (toroidal ring cuts). ---
  const grooves = [];
  const pitch = 1.0;
  for (let z = bossTop + 1.2; z < bushTop - 0.8; z += pitch) {
    grooves.push(torus(bushR, 0.28, { at: [0, 0, z] }));
  }
  return unwrap(cutAll(pot, grooves));
}

export default rotaryPot();