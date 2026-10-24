import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { present } from 'brepjs/playground';

// Eight structural sections, each a real IfcColumn. Beams and columns share one
// profile vocabulary, and every named kind exports as its own parametric IFC
// profile def: IfcLShapeProfileDef, IfcUShapeProfileDef,
// IfcRectangleHollowProfileDef and so on, each swept by an IfcExtrudedAreaSolid.
// The section stays editable data downstream instead of a baked outline.
// Laid out in two rows of four, read left to right then back: I, L, T, U,
// then Z, C, rectangular hollow, circular hollow.
const model = new BimModel();
model.init({ name: 'Profile gallery' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
const storeyId = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

// Short extrusions on purpose: at storey height these read as sticks and the
// section is the thing worth seeing, so each is a stub the camera looks down on.
const HEIGHT = 300;
const GAP = 400;
const ROW = 500;
const PER_ROW = 4;

// filletRadius on the rolled sections is the root fillet a real mill leaves
// where the web meets the flange; the hollow sections take separate inner and
// outer corner radii.
const profiles = [
  {
    kind: 'I_BEAM',
    overallWidth: 150,
    overallDepth: 300,
    flangeThickness: 12,
    webThickness: 8,
    filletRadius: 14,
  },
  { kind: 'L_SHAPE', depth: 200, width: 200, legThickness: 16, filletRadius: 12 },
  {
    kind: 'T_SHAPE',
    depth: 200,
    flangeWidth: 200,
    webThickness: 12,
    flangeThickness: 16,
    filletRadius: 10,
  },
  { kind: 'U_SHAPE', depth: 250, flangeWidth: 100, webThickness: 10, flangeThickness: 14 },
  { kind: 'Z_SHAPE', depth: 200, flangeWidth: 90, webThickness: 10, flangeThickness: 14 },
  { kind: 'C_SHAPE', depth: 200, width: 80, wallThickness: 4, girth: 20, internalFilletRadius: 5 },
  {
    kind: 'RECTANGLE_HOLLOW',
    xDim: 200,
    yDim: 120,
    wallThickness: 8,
    outerFilletRadius: 12,
    innerFilletRadius: 6,
  },
  { kind: 'CIRCLE_HOLLOW', radius: 90, wallThickness: 8 },
] ;

profiles.forEach((profile, i) => {
  const col = model.addColumn({
    height: HEIGHT,
    profile,
    origin: [(i % PER_ROW) * GAP, Math.floor(i / PER_ROW) * ROW, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    materialName: 'Steel',
  });
  if (!col.ok) throw col.error;
  model.placeIn(col.value, storeyId);
});

// Displayed geometry is owned by the playground runtime for this eval.
const parts = model.getColumns().flatMap((e) => unwrap(placedSolids(e)));

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
