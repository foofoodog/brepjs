import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { present } from 'brepjs/playground';
import { unwrap } from 'brepjs/quick';

// A parametric curtain wall: a columns x rows grid of glazing panels framed by
// mullions, standing on a wall line that runs 30 degrees off the X axis.
// Placed in a project → site → building → storey so the BIM panel shows a tree.
const model = new BimModel();
model.init({ name: 'Curtain wall' });

// Spatial structure — what makes this a BIM model, not just geometry.
const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

// A facade rarely runs along world X, so this one is skewed 30 degrees to make
// the placement real rather than incidental.
const A = Math.PI / 6;
const cw = model.addCurtainWall({
  width: 2700,
  height: 2000,
  columns: 3,
  rows: 2,
  panelThickness: 24,
  mullionWidth: 50,
  mullionDepth: 120,
  origin: [0, 0, 0],
  axisX: [Math.cos(A), Math.sin(A), 0],
  axisZ: [0, 0, 1],
  materialName: 'Aluminium',
});
if (!cw.ok) throw cw.error;
model.placeIn(cw.value, storeyId);

// Curtain-wall placement is two-level: each panel/mullion carries a grid-local
// origin, and the whole grid then sits on the wall's own frame. placedSolids()
// applies both. Translating by the component origin alone would build the grid
// flat along X and silently drop the 30-degree rotation.
const parts = unwrap(placedSolids(model.getCurtainWalls()[0]));

export default present(parts, {
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
