import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { present } from 'brepjs/playground';
import { unwrap } from 'brepjs/quick';

// A parametric wall hosting a door and a window, organised into a real IFC
// spatial structure (project → site → building → storey). Each opening is a void
// boolean-cut into the wall solid. The BIM panel (top-right) shows the model
// tree; the IFC button exports the model as a real IFC-SPF file.
const model = new BimModel();
model.init({ name: 'Wall example' });

// Spatial structure — what makes this a BIM model, not just geometry.
const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const wall = model.addWall({
  length: 3000,
  height: 2400,
  thickness: 200,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Concrete',
});
if (!wall.ok) throw wall.error;
model.placeIn(wall.value, storeyId);

const door = model.addDoor({
  wallLocalId: wall.value,
  width: 900,
  height: 2000,
  offsetAlongWall: 400,
  offsetFromFloor: 0,
  materialName: 'Timber',
});
if (!door.ok) throw door.error;
model.placeIn(door.value, storeyId);

const win = model.addWindow({
  wallLocalId: wall.value,
  width: 1200,
  height: 1000,
  offsetAlongWall: 1600,
  offsetFromFloor: 900,
  materialName: 'Aluminium',
});
if (!win.ok) throw win.error;
model.placeIn(win.value, storeyId);

// Show the wall solid (with its openings), the IFC tree for the panel, and an
// IFC export. placedSolids() applies the wall's frame so the scene matches the
// exported file. The ifc thunk runs only when you click the IFC button —
// serializing IFC re-initializes web-ifc, so it's deferred from every render.
export default present(unwrap(placedSolids(model.getWalls()[0])), {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const result = await toIfc(model, {
      applicationName: 'brepjs playground',
      applicationVersion: '1.0',
    });
    if (!result.ok) throw result.error;
    return result.value;
  },
});
