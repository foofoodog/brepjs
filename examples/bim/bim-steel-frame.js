import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A two-bay steel frame: 3x2 columns, a beam grid over their heads, a floor deck.
const model = new BimModel();
model.init({ name: 'Steel frame' });
const site = unwrap(model.addSite({ name: 'Site' }));
const building = unwrap(model.addBuilding({ name: 'Building' }));
const storey = unwrap(model.addStorey({ name: 'Level 1', elevation: 0 }));
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const COLS = [0, 3500, 7000];   // column lines along X (two bays)
const ROWS = [0, 3000];          // column lines along Y
const SPAN_X = 7000, SPAN_Y = 3000, COL_H = 3200;
const I = { kind: 'I_BEAM', overallWidth: 150, overallDepth: 200, flangeThickness: 12, webThickness: 8 } ;

for (const x of COLS) for (const y of ROWS) {
  const col = model.addColumn({ height: COL_H, profile: I, origin: [x, y, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Steel' });
  if (!col.ok) throw col.error;
  model.placeIn(col.value, storey);
}
// Beams are centred on z=COL_H, so the I-section (+/-100 deep) straddles the column
// heads — the joints overlap rather than just touch.
for (const y of ROWS) {
  const b = model.addBeam({ length: SPAN_X, profile: I, origin: [0, y, COL_H], axisX: [1, 0, 0], axisZ: [0, 0, 1], materialName: 'Steel' });
  if (!b.ok) throw b.error;
  model.placeIn(b.value, storey);
}
for (const x of COLS) {
  const b = model.addBeam({ length: SPAN_Y, profile: I, origin: [x, 0, COL_H], axisX: [0, 1, 0], axisZ: [0, 0, 1], materialName: 'Steel' });
  if (!b.ok) throw b.error;
  model.placeIn(b.value, storey);
}
// Deck seated on the beams: beam tops are at COL_H+100, so a deck bottom at COL_H+70
// overlaps them by 30mm — no floating gap.
const deck = model.addSlab({ length: SPAN_X, width: SPAN_Y, thickness: 150, origin: [0, 0, COL_H + 70], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'FLOOR', materialName: 'Concrete' });
if (!deck.ok) throw deck.error;
model.placeIn(deck.value, storey);

const assembly = unwrap(model.addElementAssembly({ name: 'Frame' }));
for (const e of [...model.getColumns(), ...model.getBeams(), ...model.getSlabs()]) model.aggregate(assembly, e.localId);

// Playground runtime owns the displayed geometry for this eval; snippets don't dispose it.
const steel = [...model.getColumns(), ...model.getBeams()].flatMap((e) => unwrap(placedSolids(e))).map((s) => color(s, '#8a99ad'));
const deckSolids = unwrap(placedSolids(model.getSlabs()[0])).map((s) => color(s, '#cfcabb'));

export default present([...steel, ...deckSolids], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
