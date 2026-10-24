import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A single-room shell on a foundation plinth: four walls that meet cleanly at the
// corners, a door + two windows, a gable roof seated on the wall heads, + an IfcSpace.
const model = new BimModel();
model.init({ name: 'Building shell' });
const site = unwrap(model.addSite({ name: 'Site' }));
const building = unwrap(model.addBuilding({ name: 'Building' }));
const storey = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const L = 5000, W = 4000, H = 2700, T = 200;

// Foundation plinth: 100mm proud of the footprint, top flush with the floor (z=0).
const plinth = model.addSlab({ length: L + 200, width: W + 200, thickness: 300, origin: [-100, -100, -300], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'BASESLAB', materialName: 'Concrete' });
if (!plinth.ok) throw plinth.error;
model.placeIn(plinth.value, storey);

// Walls extrude thickness on one side of their origin line. Front/back run the full
// length (y in [0,T] and [W-T,W]); left/right fit BETWEEN them (length W-2T) so the
// corners meet without doubling up.
const wallDefs: { origin: [number, number, number]; axisX: [number, number, number]; len: number }[] = [
  { origin: [0, 0, 0], axisX: [1, 0, 0], len: L },
  { origin: [0, W - T, 0], axisX: [1, 0, 0], len: L },
  { origin: [T, T, 0], axisX: [0, 1, 0], len: W - 2 * T },
  { origin: [L, T, 0], axisX: [0, 1, 0], len: W - 2 * T },
];
const wallIds = [];
for (const d of wallDefs) {
  const wall = model.addWall({ length: d.len, height: H, thickness: T, origin: d.origin, axisX: d.axisX, axisZ: [0, 0, 1], materialName: 'Concrete' });
  if (!wall.ok) throw wall.error;
  model.placeIn(wall.value, storey);
  wallIds.push(wall.value);
}
const door = model.addDoor({ wallLocalId: wallIds[0], width: 1000, height: 2100, offsetAlongWall: 700, offsetFromFloor: 0, materialName: 'Timber' });
if (!door.ok) throw door.error;
model.placeIn(door.value, storey);
const win1 = model.addWindow({ wallLocalId: wallIds[0], width: 1400, height: 1100, offsetAlongWall: 3000, offsetFromFloor: 1000, materialName: 'Aluminium' });
if (!win1.ok) throw win1.error;
model.placeIn(win1.value, storey);
const win2 = model.addWindow({ wallLocalId: wallIds[1], width: 1400, height: 1100, offsetAlongWall: 1800, offsetFromFloor: 1000, materialName: 'Aluminium' });
if (!win2.ok) throw win2.error;
model.placeIn(win2.value, storey);

// Gable roof seated on the wall heads (roof base at z=H).
const roof = model.addRoof({ length: L, width: W, thickness: 150, origin: [0, 0, H], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'GABLE_ROOF', pitch: 32, materialName: 'Tile' });
if (!roof.ok) throw roof.error;
model.placeIn(roof.value, storey);

// The room volume itself — a first-class IfcSpace, kept in the model + IFC tree.
const space = model.addSpace({ name: 'Room', length: L - 2 * T, width: W - 2 * T, height: H, origin: [T, T, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Air' });
if (!space.ok) throw space.error;
model.placeIn(space.value, storey);

// Playground runtime owns the displayed geometry for this eval; snippets don't dispose it.
const walls = model.getWalls().flatMap((e) => unwrap(placedSolids(e))).map((s) => color(s, '#d9d3c7'));
const base = unwrap(placedSolids(model.getSlabs()[0])).map((s) => color(s, '#9a948a'));
const tile = unwrap(placedSolids(model.getRoofs()[0])).map((s) => color(s, '#9c6b52'));

export default present([...walls, ...base, ...tile], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
