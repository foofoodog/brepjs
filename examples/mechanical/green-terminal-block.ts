import { box, cut, cutAll, cylinder, extrude, fuse, polygon, torus, translate, unwrap } from 'brepjs/quick';

// Green PCB screw-terminal block (Phoenix-style, 5.08 mm pitch). The classic
// snap-together mains connector: a green plastic body with a tall vertical
// front, a flat top ridge carrying a row of slotted silver screws, and a back
// that slopes down to a low rear edge. Each "way" has a rectangular wire-entry
// window in the front face; thin solder pins drop below the PCB line. The whole
// plastic body is one extruded prism (the side silhouette repeats every way),
// so it is a single rigid solid; the metal screws and pins are returned as
// their own separate solids.
function greenTerminalBlock({
  ways = 4, // number of terminal positions
  pitch = 5.08, // centre-to-centre spacing along Y (0.2")
  depth = 7.9, // front-to-back body depth (X)
  ridgeHeight = 10, // height of the raised top ridge where the screws sit
  ridgeDepth = 5, // front-to-back depth of the top ridge
  backHeight = 6.8, // height of the low sloped-back rear edge
  screwR = 1.95, // screw head radius
  frameT = 0.5, // wall thickness around the front wire window
  windowW = 4, // wire-entry window width (Y)
  windowH = 5.4, // wire-entry window height (Z)
} = {}) {
  const width = ways * pitch; // total length of the bar (Y)
  const frontX = depth / 2; // front face plane (+X)
  const backX = -depth / 2; // back face plane (-X)
  const ridgeBackX = frontX - ridgeDepth; // where the flat top ridge ends
  const screwX = frontX - ridgeDepth / 2; // screws ride the ridge centre

  // Side silhouette in the X-Z plane (height runs up +Z, Y held at 0): tall
  // vertical front, flat top ridge, then one slope down to the low rear edge.
  // The profile is identical for every way, so the whole body is a single
  // extrusion along the bar's length (+Y) — one clean solid, no per-cell fusing.
  // Keeping height in Z lines the body up with the Z-up screws, recesses,
  // windows and pins placed below; a flat-in-Z profile would tip on its side.
  const profile = unwrap(
    polygon([
      [frontX, 0, 0],
      [frontX, 0, ridgeHeight],
      [ridgeBackX, 0, ridgeHeight],
      [backX, 0, backHeight],
      [backX, 0, 0],
    ]),
  );
  // Extrude along +Y by the full bar length (the explicit vector form drives the
  // prism perpendicular to the X-Z profile and caps it into a watertight solid),
  // then slide the bar so it is centred on the origin in Y.
  const bar = translate(unwrap(extrude(profile, [0, width, 0])), [0, -width / 2, 0]);

  // Per-way feature cutters: a front wire window and a top screw recess.
  const windowCutters = [];
  const recessCutters = [];
  const yAt = (i: number) => -width / 2 + i * pitch + pitch / 2; // centre of way i
  for (let i = 0; i < ways; i++) {
    const cy = yAt(i);
    // Wire-entry window: a pocket driven in from the front face, stopping short
    // of the back so a contact wall remains. Sits frameT above the PCB line.
    const windowDepth = depth - frameT - 1.5;
    windowCutters.push(
      box(windowDepth, windowW, windowH, {
        at: [frontX - windowDepth / 2 + 1, cy, frameT + windowH / 2],
      }),
    );
    // Screw recess: a shallow bore sunk into the top of the ridge — the well the
    // captive screw turns in.
    recessCutters.push(cylinder(screwR + 0.15, 2.4, { at: [screwX, cy, ridgeHeight - 2.4] }));
  }
  const greenBody = unwrap(cutAll(bar, [...windowCutters, ...recessCutters]));

  // Silver screws: a slotted head disc seated in each recess, plus a threaded
  // shank dropping into the wire-window cage so a real screw is visible through
  // the window (not just a floating head). Returned as separate solids (metal).
  const screws = [];
  const shankR = screwR * 0.58;
  const headBotZ = ridgeHeight - 0.6 - 1.6;
  const shankBotZ = frameT + 0.8; // ends down inside the wire window
  for (let i = 0; i < ways; i++) {
    const cy = yAt(i);
    const headTop = ridgeHeight - 0.6;
    let screw = cylinder(screwR, 1.6, { at: [screwX, cy, headBotZ] });
    const slot = box(screwR * 2 + 1, screwR / 2, 0.7, { at: [screwX, cy, headTop - 0.35] });
    screw = unwrap(cut(screw, slot));
    const shank = cylinder(shankR, headBotZ - shankBotZ + 0.2, { at: [screwX, cy, shankBotZ] });
    screw = unwrap(fuse(screw, shank));
    // Toroidal ring grooves down the shank — the thread you see in the window.
    const grooves = [];
    for (let z = shankBotZ + 0.4; z < headBotZ; z += 0.7) {
      grooves.push(torus(shankR, 0.14, { at: [screwX, cy, z] }));
    }
    screws.push(unwrap(cutAll(screw, grooves)));
  }

  // Solder pins: a thin square pin under each way, dropping below the PCB line.
  const pinSide = 0.7;
  const pinLen = 3.3;
  const pins = [];
  for (let i = 0; i < ways; i++) {
    pins.push(box(pinSide, pinSide, pinLen, { at: [backX + 1.6, yAt(i), -pinLen / 2 + 0.5] }));
  }

  return [greenBody, ...screws, ...pins];
}

export default greenTerminalBlock();