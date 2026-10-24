import {
  box,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuseAll,
  line,
  loft,
  rotate,
  unwrap,
  wire,
} from 'brepjs/quick';

// Axial cooling fan (57×15 form factor): rounded square frame, air bore,
// four corner mounting holes, a central hub, and a ring of swept, twisted blades.
function axialFan({
  width = 57, // outer square width and height (mm)
  depth = 15, // frame thickness (mm)
  bore = 48.5, // screw-hole center-to-center separation (mm)
  hub = 29, // central hub diameter (mm)
  hubHeight = 2, // hub protrusion above the top face (mm)
  screwDia = 4.3, // mounting-screw clearance hole diameter (mm)
  blades = 9, // number of impeller blades
} = {}) {
  const cornerR = (width - bore) / 2; // 4.25 mm for the 57x15 default

  // Frame: round the four vertical corners of a plain box.
  const blank = box(width, width, depth, { at: [0, 0, depth / 2] });
  const verticalEdges = edgeFinder().inDirection('Z').findAll(blank);
  const plate = unwrap(fillet(blank, verticalEdges, cornerR));

  // Air bore through the centre.
  const airBore = cylinder(width / 2 - 4, depth + 2, { at: [0, 0, -1] });

  // Four corner mounting holes.
  const screwHoles = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      screwHoles.push(
        cylinder(screwDia / 2, depth + 2, {
          at: [(sx * bore) / 2, (sy * bore) / 2, -1],
        }),
      );
    }
  }

  const frame = unwrap(cutAll(plate, [airBore, ...screwHoles]));

  // Hub: solid cylinder protruding above the top face.
  const hubBody = cylinder(hub / 2, depth + hubHeight, { at: [0, 0, 0] });

  // A ring of swept, twisted blades. Each blade is lofted through three thin
  // cross-sections from hub to rim — wider and steeper at the root, narrower and
  // flatter at the tip — so it reads as a real impeller instead of a flat tab.
  // Sections are built as wires (4 lines) in planes perpendicular to the radial
  // axis, each tilted to its local pitch; a non-ruled loft curves between them.
  const thick = 1.2; // blade thickness
  const rInner = hub / 2 - 1; // root bites into the hub for a clean fuse
  const rOuter = width / 2 - 5; // tip stays inside the air bore radius
  const zMid = depth - 4; // blade mid-plane just below the top face

  const bladeSection = (r, c, pitchDeg) => {
    const th = (pitchDeg * Math.PI) / 180;
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    // A chord×thick rectangle in the (tangential, axial) plane at radius r,
    // tilted by the local pitch about the radial axis.
    const corner = (y0, z0) => [
      r,
      y0 * cs - z0 * sn,
      zMid + y0 * sn + z0 * cs,
    ];
    const a = corner(-c / 2, -thick / 2);
    const b = corner(c / 2, -thick / 2);
    const cc = corner(c / 2, thick / 2);
    const d = corner(-c / 2, thick / 2);
    return unwrap(wire([line(a, b), line(b, cc), line(cc, d), line(d, a)]));
  };
  const makeBlade = () =>
    unwrap(
      loft(
        [
          bladeSection(rInner, 10, 40),
          bladeSection((rInner + rOuter) / 2, 8.5, 30),
          bladeSection(rOuter, 7, 22),
        ],
        { ruled: false },
      ),
    );
  const bladeRing = [];
  for (let i = 0; i < blades; i++) {
    bladeRing.push(rotate(makeBlade(), (360 * i) / blades, { axis: [0, 0, 1] }));
  }

  return unwrap(fuseAll([frame, hubBody, ...bladeRing]));
}

export default axialFan();