import * as THREE from 'three';
import type { MeshData } from 'brepjs-viewer';

const DEFAULT_LAYERLING_COLOR = '#0098c7';

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .slice(1);
  return `${prefix}-${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

function normalizeHexColor(cssColor?: string): string {
  if (!cssColor) return DEFAULT_LAYERLING_COLOR;
  try {
    return `#${new THREE.Color(cssColor).getHexString()}`;
  } catch {
    return DEFAULT_LAYERLING_COLOR;
  }
}

interface ExtractedMesh {
  rawPositions: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  color: string;
}

export interface LayerlingClipboardShape {
  id: string;
  name: string;
  kind: 'mesh';
  color: string;
  x: number;
  z: number;
  elevation?: number;
  size: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  rotationX: number;
  rotationZ: number;
  importedMesh: {
    positions: number[];
    baseWidth: number;
    baseDepth: number;
    baseHeight: number;
    triangleCount: number;
    sourceFormat: 'stl';
    assetId: string;
  };
  locked: boolean;
  hidden: boolean;
}

export function meshesToLayerlingClipboard(
  meshes: readonly MeshData[],
  designName = 'brepjs'
): { text: string; count: number } | null {
  const extracted: ExtractedMesh[] = [];
  let globalMinY = Infinity;

  for (const mesh of meshes) {
    const { position, index } = mesh;
    if (index.length < 3 || position.length < 9) continue;

    const rawPositions: number[] = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    // Convert from brepjs (Z-up) to Layerling (Y-up): (x, y, z) -> (x, z, -y)
    for (let k = 0; k + 2 < index.length; k += 3) {
      for (let corner = 0; corner < 3; corner++) {
        const vi = index[k + corner] * 3;
        if (vi + 2 >= position.length) continue;
        const x = position[vi];
        const y = position[vi + 2];
        const z = -position[vi + 1];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        rawPositions.push(x, y, z);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }

    if (rawPositions.length < 9 || rawPositions.length % 9 !== 0) continue;
    if (minY < globalMinY) globalMinY = minY;

    extracted.push({
      rawPositions,
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
      color: normalizeHexColor(mesh.color),
    });
  }

  if (extracted.length === 0) return null;

  const shapes: LayerlingClipboardShape[] = extracted.map((item, idx) => {
    const { rawPositions, minX, maxX, minY, maxY, minZ, maxZ, color } = item;
    const width = Math.max(0.01, maxX - minX);
    const height = Math.max(0.01, maxY - minY);
    const depth = Math.max(0.01, maxZ - minZ);
    const size = Math.max(width, depth);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const elevation = Math.max(0, minY - globalMinY);

    // Local positions: centered on X and Z, sitting on the workplane at Y = 0
    const localPositions = new Array<number>(rawPositions.length);
    for (let i = 0; i < rawPositions.length; i += 3) {
      localPositions[i] = Number((rawPositions[i] - centerX).toFixed(5));
      localPositions[i + 1] = Number((rawPositions[i + 1] - minY).toFixed(5));
      localPositions[i + 2] = Number((rawPositions[i + 2] - centerZ).toFixed(5));
    }

    return {
      id: generateId('uploaded-mesh'),
      name: extracted.length === 1 ? designName : `${designName} ${idx + 1}`,
      kind: 'mesh',
      color,
      x: Number(centerX.toFixed(2)),
      z: Number(centerZ.toFixed(2)),
      ...(elevation > 0 ? { elevation: Number(elevation.toFixed(2)) } : {}),
      size: Number(size.toFixed(2)),
      width: Number(width.toFixed(2)),
      depth: Number(depth.toFixed(2)),
      height: Number(height.toFixed(2)),
      rotation: 0,
      rotationX: 0,
      rotationZ: 0,
      importedMesh: {
        positions: localPositions,
        baseWidth: Number(width.toFixed(2)),
        baseDepth: Number(depth.toFixed(2)),
        baseHeight: Number(height.toFixed(2)),
        triangleCount: localPositions.length / 9,
        sourceFormat: 'stl',
        assetId: generateId('asset').replace(/-/g, ''),
      },
      locked: false,
      hidden: false,
    };
  });

  const payload = {
    copiedAt: Date.now(),
    shapes,
  };

  return {
    text: `LAYERLING/1\n${JSON.stringify(payload)}`,
    count: shapes.length,
  };
}
