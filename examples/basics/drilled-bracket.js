import { box, cut, cylinder, fillet, edgeFinder, unwrap } from 'brepjs/quick';

// The canonical 5-line code-CAD loop:
// drill a hole, fillet the vertical edges, hand back a Solid.
const drilled = unwrap(cut(box(30, 20, 10), cylinder(5, 15, { at: [15, 10, -2] })));
const part = unwrap(fillet(drilled, edgeFinder().inDirection('Z').findAll(drilled), 1.5));

export default part;
