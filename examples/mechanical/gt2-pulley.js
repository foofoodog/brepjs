import {
  cutAll,
  cylinder,
  fuseAll,
  rotate,
  sketchRoundedRectangle,
  translate,
  unwrap,
} from 'brepjs/quick';

// GT2 timing pulley: a toothed body caged between two flanges on a bored hub,
// with a radial grub-screw hole. Defaults model the common GT2x20 for a 5 mm shaft.
function gt2Pulley(
  teeth = 20, // number of belt grooves around the rim
  beltWidth = 7, // axial height of the toothed body (mm)
  bore = 5, // shaft bore diameter (mm)
  hubDia = 12, // hub outer diameter (mm)
  hubLength = 6, // hub height below the body (mm)
  flangeThickness = 1, // each flange disc thickness (mm)
) {
  const pitch = 2; // GT2 belt pitch (standard)
  const toothDepth = 0.75; // GT2 groove depth (standard)
  const bodyR = (teeth * pitch) / Math.PI / 2; // from the pitch circle
  const flangeR = bodyR + 1.5; // flanges overhang the rim to cage the belt

  // Toothed body: carve evenly-spaced rounded grooves into a plain disc; the
  // lands left between them are the teeth.
  const body = cylinder(bodyR, beltWidth);
  const grooveW = pitch * 0.9; // groove mouth width
  const grooveR = grooveW / 2; // rounded ends → lens-shaped groove
  const cutterDepth = toothDepth + 1;
  const cutterCx = bodyR + cutterDepth / 2 - toothDepth;
  const grooveCutters = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * 360;
    const flat = sketchRoundedRectangle(cutterDepth, grooveW, grooveR);
    const cutter = translate(flat.extrude(beltWidth + 2), [cutterCx, 0, -1]);
    grooveCutters.push(rotate(cutter, a, { axis: [0, 0, 1] }));
  }
  const toothed = unwrap(cutAll(body, grooveCutters));

  // Flanges: two discs wider than the body, capping the belt channel.
  const bottomFlange = cylinder(flangeR, flangeThickness, { at: [0, 0, 0] });
  const topFlange = cylinder(flangeR, flangeThickness, {
    at: [0, 0, beltWidth - flangeThickness],
  });

  // Hub: solid stub below the body for the grub screw.
  const hub = cylinder(hubDia / 2, hubLength, { at: [0, 0, -hubLength] });

  const blank = unwrap(fuseAll([toothed, bottomFlange, topFlange, hub]));

  // Through bore plus a radial grub-screw hole through the hub wall. The radial
  // cutter is centred and only just clears the hub (no long tail hanging into
  // empty space — that tail was surviving the boolean as a stray rod).
  const totalH = hubLength + beltWidth;
  const boreCut = cylinder(bore / 2, totalH + 2, { at: [0, 0, -hubLength - 1] });
  const grubLen = hubDia + 2;
  const grubScrew = translate(
    rotate(cylinder(1.5, grubLen, { at: [0, 0, -grubLen / 2] }), 90, { axis: [1, 0, 0] }),
    [0, 0, -hubLength / 2],
  );

  return unwrap(cutAll(blank, [boreCut, grubScrew]));
}

export default gt2Pulley();