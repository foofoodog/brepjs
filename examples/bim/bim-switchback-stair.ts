import { BimModel, placedSolids, toIfc } from 'brepjs-bim';
import { unwrap } from 'brepjs/quick';
import { color, present } from 'brepjs/playground';

// A half-turn (switchback) stair. Two straight flights run in opposite directions
// in parallel lanes separated by an open well; flight 1 climbs from the ground to a
// half-landing, you turn 180 degrees, and flight 2 climbs the other way to a top
// landing. Each flight is a real stepped solid read back via placedSolids().
const model = new BimModel();
model.init({ name: 'Stair core' });
const site = unwrap(model.addSite({ name: 'Site' }));
const building = unwrap(model.addBuilding({ name: 'Building' }));
const storey = unwrap(model.addStorey({ name: 'Ground Floor', elevation: 0 }));
const project = model.getProject();
if (project) model.aggregate(project.localId, site);
model.aggregate(site, building);
model.aggregate(building, storey);

const RISERS = 9, RH = 175, TL = 260, W = 1100, LT = 200;
const run = RISERS * TL, rise = RISERS * RH;   // 2340 long, 1575 tall per flight
const GAP = 300;                                 // open well between the two lanes
const SPANY = 2 * W + GAP;                       // far edge of the upper lane (2500)
const LANE2 = W + GAP;                           // near edge of the upper lane (1400)
const LD = 1100;                                 // half-landing depth (along X)

// A flight's local solid climbs +X/+Z with its width on +Y; placement maps that frame.
const flight = { width: W, riserHeight: RH, treadLength: TL, numberOfRisers: RISERS, axisZ: [0, 0, 1] as [number, number, number], materialName: 'Concrete' };
const stair = model.addStair({
  name: 'Stair',
  predefinedType: 'HALF_TURN_STAIR',
  flights: [
    // Flight 1: foot at origin, climbing +X in the lower lane y in [0, W], z 0 -> rise.
    { ...flight, origin: [0, 0, 0], axisX: [1, 0, 0] },
    // Flight 2: foot at the turn (x = run), climbing back -X one level up. The -X axis
    // flips its width onto -Y, so it sits in the upper lane y in [LANE2, SPANY],
    // separated from flight 1 by the open well. z rise -> 2*rise.
    { ...flight, origin: [run, SPANY, rise], axisX: [-1, 0, 0] },
  ],
  materialName: 'Concrete',
});
if (!stair.ok) throw stair.error;
model.placeIn(stair.value, storey);

// Half-landing at the turn: spans both lanes + the well at the east end, top flush
// with the flight-1 head (z = rise); both flights seat on it.
const landing = model.addSlab({ length: LD, width: SPANY, thickness: LT, origin: [run - 100, 0, rise - LT], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'LANDING', materialName: 'Concrete' });
if (!landing.ok) throw landing.error;
model.placeIn(landing.value, storey);

// Top landing: the upper-floor arrival pad under flight 2's head (x = 0, z = 2*rise).
const topLanding = model.addSlab({ length: 500, width: W, thickness: LT, origin: [-300, LANE2, 2 * rise - LT], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'LANDING', materialName: 'Concrete' });
if (!topLanding.ok) throw topLanding.error;
model.placeIn(topLanding.value, storey);

// Posted guardrail along the half-landing's open (south) edge.
const rail = model.addRailing({ length: LD, height: 1000, thickness: 80, origin: [run - 100, 0, rise], axisX: [1, 0, 0], axisZ: [0, 0, 1], predefinedType: 'GUARDRAIL', infill: 'POSTED', materialName: 'Steel' });
if (!rail.ok) throw rail.error;
model.placeIn(rail.value, storey);

// Playground runtime owns the displayed geometry for this eval; snippets don't dispose it.
const concrete = [...unwrap(placedSolids(model.getStairs()[0])), ...model.getSlabs().flatMap((e) => unwrap(placedSolids(e)))].map((s) => color(s, '#cccccc'));
const steel = unwrap(placedSolids(model.getRailings()[0])).map((s) => color(s, '#8a99ad'));

export default present([...concrete, ...steel], {
  bimTree: model.toTreeSummary(),
  ifc: async () => {
    const r = await toIfc(model, { applicationName: 'brepjs playground', applicationVersion: '1.0' });
    if (!r.ok) throw r.error;
    return r.value;
  },
});
