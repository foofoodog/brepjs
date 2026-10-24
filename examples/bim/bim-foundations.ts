import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A structural section from the ground up: bored piles, pile caps, ground beams,
// columns, and the suspended slab they carry. Foundations are first-class IFC
// elements (IfcPile, IfcFooting), not just boxes below zero, which is what lets
// a structural model schedule and coordinate them.
const model = new BimModel();
model.init({ name: 'Foundations', projectId: 'foundations-demo' });

const project = model.getProject();
const siteId = unwrap(model.addSite({ name: 'Site' }));
const buildingId = unwrap(model.addBuilding({ name: 'Block A' }));
const storeyId = unwrap(model.addStorey({ name: 'Substructure', elevation: -1200 }));
if (project) model.aggregate(project.localId, siteId);
model.aggregate(siteId, buildingId);
model.aggregate(buildingId, storeyId);

const GRID_X = [0, 4000, 8000];
const GRID_Y = [0, 4000];
const PILE_LEN = 6000;
const CAP = 1200;
const CAP_T = 700;
const COL_H = 3400;

// Each grid node gets a pile driven down from the cap soffit, then a pad cap
// sitting on it, then the column above. Piles take a profile like any other
// linear member, so a circular bored pile is just a CIRCULAR section.
for (const x of GRID_X) {
  for (const y of GRID_Y) {
    const pile = model.addPile({
      length: PILE_LEN,
      profile: { kind: 'CIRCULAR', radius: 225 },
      origin: [x, y, -PILE_LEN - CAP_T],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      predefinedType: 'BORED',
      materialName: 'Concrete C32/40',
    });
    if (!pile.ok) throw pile.error;
    model.placeIn(pile.value, storeyId);

    const cap = model.addFooting({
      length: CAP,
      width: CAP,
      thickness: CAP_T,
      origin: [x - CAP / 2, y - CAP / 2, -CAP_T],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      predefinedType: 'PILE_CAP',
      materialName: 'Concrete C32/40',
    });
    if (!cap.ok) throw cap.error;
    model.placeIn(cap.value, storeyId);

    const col = model.addColumn({
      height: COL_H,
      profile: { kind: 'RECTANGULAR', width: 400, height: 400 },
      origin: [x, y, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete C32/40',
    });
    if (!col.ok) throw col.error;
    model.placeIn(col.value, storeyId);
  }
}

// Ground beams tying the caps together, at cap level rather than up at the head.
for (const y of GRID_Y) {
  const gb = model.addBeam({
    length: 8000,
    profile: { kind: 'RECTANGULAR', width: 300, height: 600 },
    origin: [0, y, -CAP_T / 2],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
    predefinedType: 'BEAM',
    materialName: 'Concrete C32/40',
  });
  if (!gb.ok) throw gb.error;
  model.placeIn(gb.value, storeyId);
}

// The suspended slab the columns carry.
const deck = model.addSlab({
  length: 8400,
  width: 4400,
  thickness: 300,
  origin: [-200, -200, COL_H],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  predefinedType: 'FLOOR',
  materialName: 'Concrete C32/40',
});
if (!deck.ok) throw deck.error;
model.placeIn(deck.value, storeyId);

console.log(
  model.getPiles().length + ' piles, ' + model.getFootings().length + ' pile caps, ' +
    model.getColumns().length + ' columns, ' + model.getBeams().length + ' ground beams'
);

// Playground runtime owns the displayed geometry for this eval.
const tint = (cat: string): string => {
  if (cat === 'PILE') return '#6f6a60';
  if (cat === 'FOOTING') return '#8a8378';
  if (cat === 'SLAB') return '#cfcabb';
  return '#a8a196';
};
const shown = model
  .getAllElements()
  .flatMap((el) => unwrap(placedSolids(el)).map((solid) => color(solid, tint(el.category))));

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
