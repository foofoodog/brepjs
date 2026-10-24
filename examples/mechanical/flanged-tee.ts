import { cylinder, cutAll, fuseAll, unwrap } from 'brepjs/quick';

// Flanged pipe tee — a main run and a perpendicular branch, each capped by a
// bolted flange. The run/branch union creates the saddle intersection curve
// (the canonical B-Rep boolean seam), and every bore and bolt leaves an exact
// circular edge. A pure fuse + cut build.
function pipeTee({
  runR = 18, // main run outer radius (mm)
  runLen = 130, // run length, flange face to flange face (mm)
  branchR = 15, // branch outer radius (mm)
  branchH = 60, // branch height above the run centre (mm)
  flangeR = 30, // run flange radius (mm)
  flangeT = 8, // flange disc thickness (mm)
  boltR = 3.5, // bolt hole radius (mm)
  bolts = 4, // bolt holes per flange
} = {}) {
  // Branch flange a touch smaller than the run flanges so its rim stays clear
  // of the run body at the saddle join.
  const topFlangeR = flangeR - 4;

  // Run along X, branch up Z; both cross the origin so the union is clean.
  const run = cylinder(runR, runLen, { axis: [1, 0, 0], at: [-runLen / 2, 0, 0] });
  const branch = cylinder(branchR, branchH, { axis: [0, 0, 1], at: [0, 0, 0] });

  // One flange disc per open end.
  const flangeXPlus = cylinder(flangeR, flangeT, { axis: [1, 0, 0], at: [runLen / 2 - flangeT, 0, 0] });
  const flangeXMinus = cylinder(flangeR, flangeT, { axis: [1, 0, 0], at: [-runLen / 2, 0, 0] });
  const flangeTop = cylinder(topFlangeR, flangeT, { axis: [0, 0, 1], at: [0, 0, branchH - flangeT] });

  const body = unwrap(fuseAll([run, branch, flangeXPlus, flangeXMinus, flangeTop]));

  // Through bores down each pipe.
  const runBore = cylinder(runR - 7, runLen + 10, { axis: [1, 0, 0], at: [-runLen / 2 - 5, 0, 0] });
  const branchBore = cylinder(branchR - 6, branchH + 30, { axis: [0, 0, 1], at: [0, 0, -20] });

  // A bolt circle on each flange face; holes offset half a step so none land on
  // the silhouette.
  const ring = (r: number, axis: 'x' | 'z', fixed: number) => {
    const holes = [];
    for (let i = 0; i < bolts; i++) {
      const a = ((i + 0.5) * (2 * Math.PI)) / bolts;
      const u = r * Math.cos(a);
      const v = r * Math.sin(a);
      holes.push(
        axis === 'x'
          ? cylinder(boltR, flangeT + 4, { axis: [1, 0, 0], at: [fixed, u, v] })
          : cylinder(boltR, flangeT + 4, { axis: [0, 0, 1], at: [u, v, fixed] }),
      );
    }
    return holes;
  };
  const bc = flangeR - 6;
  const bcTop = topFlangeR - 5;
  const boltHoles = [
    ...ring(bc, 'x', runLen / 2 - flangeT - 2),
    ...ring(bc, 'x', -runLen / 2 - 2),
    ...ring(bcTop, 'z', branchH - flangeT - 2),
  ];

  return unwrap(cutAll(body, [runBore, branchBore, ...boltHoles]));
}

export default pipeTee();
