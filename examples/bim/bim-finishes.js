import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// Finishes and an accessible entrance. Coverings are the layer a specification
// and a maintenance schedule live on: a floor finish is its own IfcCovering
// with its own material, not a property of the slab underneath. The ramp is
// built to a 1:15 gradient with a landing and a guardrail.
const model = new BimModel();
model.init({ name: 'Finishes and access', projectId: 'finishes-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Block A' }));
const storeyId = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const L = 6000;
const W = 4500;
const H = 3000;
const T = 200;
const RISE = 450; // entrance threshold above external ground

// Structural slab at the raised floor level, plus the wall behind it.
const slab = model.addSlab({
  length: L,
  width: W,
  thickness: 250,
  origin: [0, 0, RISE - 250],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOOR',
  materialName: 'Concrete',
});
if (!slab.ok) throw slab.error;
model.placeIn(slab.value, storeyId);

const wall = model.addWall({
  length: L,
  height: H,
  thickness: T,
  origin: [0, W - T, RISE],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Blockwork',
  isExternal: true,
});
if (!wall.ok) throw wall.error;
model.placeIn(wall.value, storeyId);

// Three coverings, each a separate element with its own thickness and material:
// the floor finish on top of the slab, the ceiling below the soffit, and
// external cladding on the wall face. Floor and ceiling stop at the wall's
// inner face (width W - T) rather than running through the wall.
const flooring = model.addCovering({
  length: L,
  width: W - T,
  thickness: 18,
  origin: [0, 0, RISE],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOORING',
  materialName: 'Oak parquet',
});
if (!flooring.ok) throw flooring.error;
model.placeIn(flooring.value, storeyId);

const ceiling = model.addCovering({
  length: L,
  width: W - T,
  thickness: 12,
  origin: [0, 0, RISE + H - 400],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'CEILING',
  materialName: 'Acoustic tile',
});
if (!ceiling.ok) throw ceiling.error;
model.placeIn(ceiling.value, storeyId);

// A vertical covering needs its frame handed correctly: a covering's local +Y
// is axisZ x axisX, so axisZ=[0,1,0] with axisX=[1,0,0] would point the panel's
// height at world -Z and hang it below ground. axisX=[-1,0,0] flips it upright,
// which is why the panel runs back from x = L.
const cladding = model.addCovering({
  length: L,
  width: H,
  thickness: 40,
  origin: [L, W, RISE],
  axisX: [-1, 0, 0],
  axisZ: [0, 1, 0],
  predefinedType: 'CLADDING',
  materialName: 'Fibre cement panel',
});
if (!cladding.ok) throw cladding.error;
model.placeIn(cladding.value, storeyId);

// A 1:15 ramp reaching the threshold, plus its top landing. slope is rise over
// run, so the run follows from the rise the ramp has to climb. Flight width
// extrudes along local +Y (= axisZ x axisX, -X for this Y-running flight), so
// the origin sits on the ramp's east edge; the run ends where the landing
// begins, meeting its top flush at z = RISE.
const SLOPE = 1 / 15;
const RUN = RISE / SLOPE;
const ramp = model.addRamp({
  name: 'Entrance ramp',
  predefinedType: 'STRAIGHT_RUN_RAMP',
  materialName: 'Concrete',
  flights: [
    {
      width: 1500,
      length: RUN,
      slope: SLOPE,
      thickness: 180,
      origin: [2500, -RUN - 1500, 0],
      axisX: [0, 1, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
      predefinedType: 'STRAIGHT',
    },
  ],
});
if (!ramp.ok) throw ramp.error;
model.placeIn(ramp.value, storeyId);

const landing = model.addSlab({
  length: 1500,
  width: 1500,
  thickness: 180,
  origin: [1000, -1500, RISE - 180],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'LANDING',
  materialName: 'Concrete',
});
if (!landing.ok) throw landing.error;
model.placeIn(landing.value, storeyId);

// A posted guardrail on the landing's open west edge. Railings are horizontal
// bodies, so the sloped run itself stays unrailed (the switchback-stair example
// rails only its flat landing for the same reason).
const rail = model.addRailing({
  length: 1500,
  height: 1100,
  thickness: 60,
  origin: [1060, -1500, RISE],
  axisX: [0, 1, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'GUARDRAIL',
  infill: 'POSTED',
  materialName: 'Steel',
});
if (!rail.ok) throw rail.error;
model.placeIn(rail.value, storeyId);

console.log('ramp: rise ' + RISE + ' mm over ' + RUN + ' mm run (1:15), landing 1500 mm deep');
for (const c of model.getCoverings()) {
  const spec = c.spec ;
  console.log(
    '  ' + (spec.predefinedType ?? 'COVERING').padEnd(10) + spec.materialName.padEnd(22) + spec.thickness + ' mm'
  );
}

// Playground runtime owns the displayed geometry for this eval.
const tint = (cat, spec) => {
  if (cat === 'COVERING') {
    const t = (spec ).predefinedType;
    if (t === 'FLOORING') return '#a9743f';
    if (t === 'CEILING') return '#e8e4dc';
    return '#7d8b8f';
  }
  if (cat === 'RAILING') return '#8a99ad';
  if (cat === 'RAMP') return '#b9b2a6';
  return '#cfcabb';
};
const shown = model
  .getAllElements()
  .flatMap((el) => unwrap(placedSolids(el)).map((solid) => color(solid, tint(el.category, el.spec))));

export default present(shown, {
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
