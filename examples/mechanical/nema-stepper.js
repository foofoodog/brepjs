import {
  box,
  chamfer,
  cutAll,
  cylinder,
  edgeFinder,
  fuse,
  unwrap,
} from 'brepjs/quick';

// NEMA stepper motor body: the square-bodied stepper that drives most desktop
// 3D printers and CNC gantries. A chamfered square can, a raised round plinth
// (pilot boss) on the mounting face with the output shaft rising from its
// center, and four tapped corner mount holes on the standard square pitch.
// Defaults model a NEMA 17 (42.3 mm body, 31 mm bolt pitch, 5 mm shaft).
function nemaStepper({
  bodyWidth = 42.3, // square can width/depth (mm) — the "NEMA 17" face size
  bodyHeight = 40, // can length along the shaft axis (mm)
  edgeChamfer = 2, // 45° chamfer on the four long body edges (mm)
  plinthDiam = 22, // raised pilot boss diameter on the mounting face (mm)
  plinthHeight = 2, // boss height above the face (mm)
  shaftDiam = 5, // output shaft diameter (mm)
  shaftLen = 24, // shaft length above the mounting face (mm)
  screwPitch = 31, // center-to-center of the corner mount holes (mm)
  screwDiam = 3, // M3 tapped mount-hole diameter (mm)
  screwDepth = 4.5, // tapped depth into the face (mm)
} = {}) {
  // Build with the mounting (shaft) face on the z=0 plane; the can hangs below
  // it (z from -bodyHeight to 0). Every feature above then references z=0.
  const blank = box(bodyWidth, bodyWidth, bodyHeight, { at: [0, 0, -bodyHeight / 2] });

  // Bevel the four vertical (long) edges of the can — the recognizable NEMA
  // corner chamfer. The end faces stay square.
  const longEdges = edgeFinder().inDirection('Z').findAll(blank);
  const can = unwrap(chamfer(blank, longEdges, edgeChamfer));

  // Raised pilot boss (plinth) centered on the mounting face — the spigot that
  // locates the motor in its bracket. The shaft rises from its center. Both dig
  // 1 mm into the can (base at z = -1) for real volumetric overlap — a part that
  // merely kissed the z = 0 face would stay a separate, floating solid.
  const plinth = cylinder(plinthDiam / 2, plinthHeight + 1, { at: [0, 0, -1] });
  const shaft = cylinder(shaftDiam / 2, shaftLen + 1, { at: [0, 0, -1] });
  // Weld pairwise: the N-way fuseAll glues via BuilderAlgo and leaves the solids
  // separate in a compound; pairwise fuse unifies the overlapping bodies into one.
  const motor = unwrap(fuse(unwrap(fuse(can, plinth)), shaft));

  // Four tapped corner holes on the square bolt pitch, sunk from the face.
  const o = screwPitch / 2;
  const holes = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      holes.push(
        cylinder(screwDiam / 2, screwDepth + 1, {
          at: [sx * o, sy * o, -screwDepth],
        }),
      );
    }
  }

  return unwrap(cutAll(motor, holes));
}

export default nemaStepper();