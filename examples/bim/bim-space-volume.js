import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

const model = new BimModel();
model.init({ name: 'Space' });
const site = unwrap(model.addSite({ name: 'Site' }));
const building = unwrap(model.addBuilding({ name: 'Building' }));
const storey = unwrap(model.addStorey({ name: 'Level', elevation: 0 }));
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const L = 4000, W = 3000, H = 2700, T = 200;
// A cutaway enclosure: three walls (back + two sides) with the front wall removed,
// so the tinted space reads as a volume nested *inside* the room rather than a slab
// floating on top. Wall thickness extrudes along local +Y (= axisZ x axisX, which
// is -X for the Y-running sides), placing all three interior faces flush with the
// space at x = T, x = L - T and y = W - T.
const wallDefs = [
  { origin: [T, W - T, 0], axisX: [1, 0, 0], len: L - 2 * T }, // back, between the sides
  { origin: [T, 0, 0], axisX: [0, 1, 0], len: W },             // left side, full depth
  { origin: [L, 0, 0], axisX: [0, 1, 0], len: W },             // right side, full depth
];
for (const d of wallDefs) {
  const wall = model.addWall({ length: d.len, height: H, thickness: T, origin: d.origin, axisX: d.axisX, axisZ: [0, 0, 1], materialName: 'Concrete' });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storey);
}
// The room volume itself: a first-class IfcSpace filling the interior to the wall
// heads, flush with the three inner faces and open at the cut-away front.
const space = model.addSpace({ name: 'Room', length: L - 2 * T, width: W - T, height: H, origin: [T, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Air' });
if (!space.ok) throw space.error;
model.placeIn(space.value, storey);

// Displayed geometry is owned by the playground runtime for this eval; snippets don't dispose it.
const shell = model.getWalls().flatMap((e) => unwrap(placedSolids(e))).map((s) => color(s, '#d8d4c8'));
const room = unwrap(placedSolids(model.getSpaces()[0])).map((s) => color(s, '#4fd1c5'));

export default present([...shell, ...room], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
