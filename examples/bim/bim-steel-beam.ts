import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { present } from 'brepjs/playground';
import { unwrap } from 'brepjs/quick';

// A parametric structural-steel I-beam authored through the BIM model.
// filletRadius adds the rolled root fillets real wide-flange sections carry
// where the web meets the flanges. Placed in a project → site → building →
// storey so the BIM panel shows a real model tree.
const model = new BimModel();
model.init({ name: 'Beam example' });

// Spatial structure — what makes this a BIM model, not just geometry.
const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const beam = model.addBeam({
  length: 1500,
  profile: {
    kind: 'I_BEAM',
    overallWidth: 150,
    overallDepth: 300,
    flangeThickness: 12,
    webThickness: 8,
    filletRadius: 14,
  },
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Steel',
});
if (!beam.ok) throw beam.error;
model.placeIn(beam.value, storeyId);

// placedSolids() applies the element's (origin, axisX, axisZ) frame, so the
// scene matches the IFC. Reading .geometry instead would show the unplaced
// local solid, identical here only because this beam sits at the origin.
export default present(unwrap(placedSolids(model.getBeams()[0])), {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, {
      applicationName: 'brepjs playground',
      applicationVersion: '1.0',
    });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
