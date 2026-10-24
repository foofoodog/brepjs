import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { present } from 'brepjs/playground';

const model = new BimModel();
model.init({ name: 'Roof gallery' });
const site = unwrap(model.addSite({ name: 'Site' }));
const building = unwrap(model.addBuilding({ name: 'Building' }));
const storey = unwrap(model.addStorey({ name: 'Level', elevation: 0 }));
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const ROOF_L = 2400, ROOF_W = 2000, ROOF_T = 120, GAP = 3200;
const kinds = ['SHED_ROOF', 'GABLE_ROOF', 'HIP_ROOF', 'DOME_ROOF'] ;
kinds.forEach((kind, i) => {
  const roof = model.addRoof({ length: ROOF_L, width: ROOF_W, thickness: ROOF_T, origin: [i * GAP, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: kind, pitch: 35, materialName: 'Tile' });
  if (!roof.ok) throw roof.error;
  model.placeIn(roof.value, storey);
});

// Displayed geometry is owned by the playground runtime for this eval; snippets don't dispose it.
const parts = model.getRoofs().flatMap((e) => unwrap(placedSolids(e)));

export default present(parts, {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
