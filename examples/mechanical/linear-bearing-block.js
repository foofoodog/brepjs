import { box, cutAll, cylinder, fuse, rotate, translate, unwrap } from 'brepjs/quick';

// Linear-bearing pillow block (LM8UU clamp mount): a split-clamp housing that
// grips a round linear-bearing cartridge running along X. Bore = bearing OD (15
// mm), housing wall 3 mm. A flat base sits on the build surface; two clamp ears
// rise above the bore, split by a 5 mm flex gap, and a counterbored cross-bolt
// pinches them shut. Axis horizontal (X); whole part centred on the origin.
function linearBearingBlock(
  bore = 15, // bearing cartridge outer diameter (clamped)
  length = 24, // cartridge / block length along X
  wall = 3, // housing wall thickness around the bore
  base = 4, // base slab height below the bore centreline
  gap = 5, // clamp flex-gap width
  tabWall = 5, // material either side of the gap (each ear)
  earRise = 9, // how far the clamp ears stand above the bore top
  boltR = 1.6, // cross-bolt clearance radius (~M3)
  headR = 3, // counterbore radius for the bolt head
) {
  const housingR = bore / 2 + wall; // outer radius of the round housing
  const earSpan = gap + 2 * tabWall; // total ear width across Y
  const boltZ = housingR + earRise / 2; // bolt runs through the ears above the bore
  const earTop = housingR + earRise; // top of the ears in Z

  // Round housing barrel, axis along X, centred on the origin.
  const barrel = cylinder(housingR, length, { at: [-length / 2, 0, 0], axis: [1, 0, 0] });

  // Flat base slab hanging below the barrel so the block sits on a surface. Its
  // top rises 1 mm into the round barrel (a flat tangent to a cylinder is only a
  // line of contact — no volume to fuse), so it welds instead of floating off.
  const baseSlab = box(length, housingR * 2, base + 1, { at: [0, 0, -housingR - base / 2 + 0.5] });

  // Solid ear stock above the barrel; the flex gap is cut from it next.
  const earBlockH = earRise + housingR;
  const earStock = box(length, earSpan, earBlockH, { at: [0, 0, earBlockH / 2] });

  // Pairwise fuse the overlapping barrel, base and ear block into one solid
  // (fuseAll would leave them as separate bodies in a compound).
  const body = unwrap(fuse(unwrap(fuse(barrel, baseSlab)), earStock));

  // Bearing bore: cartridge passes straight through, slightly proud each end.
  const bearingBore = cylinder(bore / 2, length + 2, {
    at: [-length / 2 - 1, 0, 0],
    axis: [1, 0, 0],
  });

  // Flex slot splitting the two ears, opening down into the bore so the clamp
  // can actually squeeze. Runs the full length along X.
  const flexSlot = box(length + 2, gap, earTop, { at: [0, 0, earTop / 2] });

  // Cross-bolt: clearance hole through both ears plus a head counterbore on one
  // side. Built Z-up at the origin, laid onto +Y, then lifted to the bolt line.
  const boltShaft = cylinder(boltR, earSpan + 2, { at: [0, 0, -(earSpan / 2 + 1)] });
  const boltHead = cylinder(headR, tabWall + 1, { at: [0, 0, gap / 2] });
  const boltZup = unwrap(fuse(boltShaft, boltHead));
  const boltOnY = rotate(boltZup, -90, { axis: [1, 0, 0] });
  const bolt = translate(boltOnY, [0, 0, boltZ]);

  return unwrap(cutAll(body, [bearingBore, flexSlot, bolt]));
}

export default linearBearingBlock();
