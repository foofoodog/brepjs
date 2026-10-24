import {
  box,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  sketchPolysides,
  sketchRoundedRectangle,
  translate,
  unwrap,
} from 'brepjs/quick';

// Vented louvre instrument case (base + slotted lid). A rounded-corner project
// box split into a deep base shell and a shallow lid. The base FLOOR is a
// ventilation panel: a honeycomb of hexagonal perforations beside a square grid
// of round drill holes for passive airflow. The LID is louvred — a row of
// rounded slots across its top cap. The halves register on a ridge: the base
// wall carries an inset lip that the lid's inner groove drops over. Drawn side
// by side along Y, the way a print plate would lay the two parts out.
function ventedCase({
  innerLength = 120, // cavity extent along X (mm)
  innerWidth = 80, // cavity extent along Y (mm)
  wall = 2.4, // side-wall thickness (mm)
  floor = 2, // base / lid plane thickness (mm)
  baseWall = 26, // base side-wall height above the floor (mm)
  lidWall = 10, // lid skirt height (mm)
  cornerR = 4, // outer vertical corner radius (mm)
  ridge = 5, // overlap-ridge height (mm)
  slack = 0.3, // ridge-to-lid radial clearance (mm)
  hexAcross = 7, // honeycomb cell width across flats (mm)
  hexGap = 1.6, // wall left between adjacent honeycomb cells (mm)
  ventHoleD = 4, // round perforation diameter (mm)
  ventPitch = 9, // round-perforation grid pitch (mm)
  slots = 6, // louvre slots across the lid (count)
  slotWidth = 5, // louvre slot width (mm)
} = {}) {
  const outerL = innerLength + 2 * wall;
  const outerW = innerWidth + 2 * wall;
  const innerR = Math.max(cornerR - wall, 0.5);

  // Rounded-corner rectangular prism: a centred box with its four vertical
  // (Z-running) edges filleted. The base for every wall, cavity and lip. (A
  // direct shell() is fragile here — inDirection('Z') would also catch the flat
  // faces; cutting an inner cavity keeps the floor/cap solid.)
  const roundedPrism = (w: number, d: number, h: number, z: number, r: number) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z').findAll(blk), r));
  };

  // --- BASE: a rounded tray, floor on z = 0, opening upward. ---
  const baseOuter = roundedPrism(outerL, outerW, floor + baseWall, 0, cornerR);
  const baseCavity = roundedPrism(innerLength, innerWidth, baseWall + 1, floor, innerR);
  let base = unwrap(cut(baseOuter, baseCavity));

  // Registration ridge: a thin perimeter lip rising from the top of the base
  // wall, pulled in by `slack` so the lid clears it on assembly. Built as a
  // rounded outer band with its inner cavity removed, then fused to the tray.
  const ridgeTop = floor + baseWall;
  const ridgeOuterL = innerLength + 2 * wall - 2 * slack;
  const ridgeOuterW = innerWidth + 2 * wall - 2 * slack;
  const ridgeBand = unwrap(
    cut(
      roundedPrism(ridgeOuterL, ridgeOuterW, ridge, ridgeTop, Math.max(cornerR - slack, 0.5)),
      // dip 0.5 mm into the wall top so the band overlaps the tray and welds
      // instead of merely kissing the z = ridgeTop face as a floating ring.
      roundedPrism(innerLength, innerWidth, ridge + 1, ridgeTop - 0.5, innerR),
    ),
  );
  base = unwrap(fuse(base, ridgeBand));

  // --- Floor ventilation: honeycomb hexagons + a square grid of round holes. ---
  // Both vent fields sit inside a margin so the perforations never break the
  // wall. Each cutter is over-tall (z from -1 through the floor) to punch a
  // clean through-hole; all are subtracted in one cutAll, so the base stays one
  // solid (cuts can't split a single body the way a bad fuse can).
  const ventMargin = wall + 3;
  const fieldHalfL = innerLength / 2 - ventMargin;
  const fieldHalfW = innerWidth / 2 - ventMargin;
  const cutters = [];

  // Honeycomb occupies the back half of the floor (−X side). Hex prisms on a
  // staggered (brick-offset) grid, flat-topped, sized across flats.
  const hexCircumR = hexAcross / 2 / Math.cos(Math.PI / 6); // flats → vertex radius
  const colPitch = 1.5 * hexCircumR + hexGap; // flat-top hex column step: 3/4 width + wall
  const rowPitch = hexAcross + hexGap; // hex row step (flat-to-flat + wall)
  const hexZoneMaxX = -3; // honeycomb stays on the back half
  for (let ci = -6; ci <= 6; ci++) {
    const hx = ci * colPitch;
    if (hx < -fieldHalfL || hx > Math.min(fieldHalfL, hexZoneMaxX)) continue;
    const stagger = ci % 2 === 0 ? 0 : rowPitch / 2;
    for (let ri = -6; ri <= 6; ri++) {
      const hy = ri * rowPitch + stagger;
      if (hy < -fieldHalfW || hy > fieldHalfW) continue;
      const hex = sketchPolysides(hexCircumR, 6, 0, 'XY').extrude(floor + 2);
      cutters.push(translate(hex, [hx, hy, -1]));
    }
  }

  // Round perforations occupy the front half (+X side): a plain square grid.
  for (let gx = 1; gx * ventPitch < fieldHalfL; gx++) {
    const px = gx * ventPitch;
    for (let gy = -5; gy <= 5; gy++) {
      const py = gy * ventPitch;
      if (Math.abs(py) > fieldHalfW) continue;
      cutters.push(cylinder(ventHoleD / 2, floor + 2, { at: [px, py, -1] }));
    }
  }
  base = unwrap(cutAll(base, cutters));

  // --- LID: a shallow inverted tray (cap up, skirt hanging down). ---
  // Built cap-up directly so it needs no flip; on assembly the skirt drops over
  // the base ridge.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerL, outerW, lidH, 0, cornerR);
  const lidCavity = roundedPrism(innerLength, innerWidth, lidWall + 1, -1, innerR);
  let lid = unwrap(cut(lidOuter, lidCavity));

  // Ridge groove: a thin perimeter band recess on the SKIRT side (z = 0 up, the
  // open face), NOT the cap. Cutting a band sized to the base ridge footprint
  // (matching `ridgeOuterL/W`) over the bottom `ridge` mm carves the inner part
  // of the skirt wall away so the base lip nests with clearance, while leaving
  // the cap (z = lidWall..lidH) fully solid for the louvre slots to cut. The
  // earlier version sized this to the full outer footprint and placed it at the
  // cap end, which sheared the entire cap off — leaving an empty rim.
  const groove = roundedPrism(
    ridgeOuterL,
    ridgeOuterW,
    ridge + slack, // clearance under the lip so the skirt seats on the wall top
    0,
    Math.max(cornerR - slack, 0.5),
  );
  lid = unwrap(cut(lid, groove));

  // Louvre slots across the lid cap: evenly spaced rounded-rectangle channels
  // running along Y, each over-tall to punch clean through the cap.
  const slotLen = innerWidth - 2 * (wall + 4);
  const slotSpan = outerL * 0.6; // slots fill the central 60% of the lid
  const slotCutters = [];
  for (let i = 0; i < slots; i++) {
    const t = slots === 1 ? 0.5 : i / (slots - 1);
    const sx = -slotSpan / 2 + slotSpan * t;
    const slot = translate(
      sketchRoundedRectangle(slotWidth, slotLen, slotWidth * 0.45).extrude(floor + 2),
      [sx, 0, lidH - floor - 1],
    );
    slotCutters.push(slot);
  }
  lid = unwrap(cutAll(lid, slotCutters));

  // Lay the lid beside the base along Y with a print gap, both open faces up.
  const placedLid = translate(lid, [0, outerW + 12, 0]);
  return [base, placedLid];
}

export default ventedCase();