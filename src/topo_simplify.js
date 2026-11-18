function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (!dx && !dy) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / Math.hypot(dx, dy);
}

function dpSimplify(points, tolerance) {
  if (points.length <= 2 || tolerance <= 0) return points;
  let maxDist = 0;
  let splitIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }
  if (maxDist <= tolerance) return [start, end];
  const left = dpSimplify(points.slice(0, splitIdx + 1), tolerance);
  const right = dpSimplify(points.slice(splitIdx), tolerance);
  return left.slice(0, -1).concat(right);
}

function fmtCoord(n, decimals) {
  const s = n.toFixed(decimals);
  return decimals > 0 ? s.replace(/\.?0+$/, "") : s;
}

function ringToSvgPath(pts, decimals) {
  if (!pts || pts.length < 3) return "";
  let d = "";
  for (let i = 0; i < pts.length; i += 1) {
    const x = fmtCoord(pts[i][0], decimals);
    const y = fmtCoord(pts[i][1], decimals);
    const sep = y.startsWith("-") ? "" : " ";
    d += `${i === 0 ? "M" : "L"}${x}${sep}${y}`;
  }
  return `${d}Z`;
}

/**
 * Shared-arc topological simplifier for a collection of polygon features and optional outline features.
 * Guarantees adjacent polygons share bit-for-bit identical simplified border coordinates (zero gaps / zero overlaps).
 */
function buildTopologicalLayerPaths(features, outlines, project, tolerance = 0.15) {
  const decimals = tolerance >= 0.08 ? 1 : 2;
  const quantScale = 1000; // 0.001 SVG unit snapping (~50m at national viewBox, ~2m at city)
  const coordsByKey = new Map();
  const neighborsByKey = new Map();

  const registerPoint = rawCoord => {
    const [px, py] = project(rawCoord);
    const qx = Math.round(px * quantScale);
    const qy = Math.round(py * quantScale);
    const key = `${qx},${qy}`;
    if (!coordsByKey.has(key)) coordsByKey.set(key, [qx / quantScale, qy / quantScale]);
    return key;
  };

  const addNeighbor = (a, b) => {
    let setA = neighborsByKey.get(a);
    if (!setA) { setA = new Set(); neighborsByKey.set(a, setA); }
    setA.add(b);
    let setB = neighborsByKey.get(b);
    if (!setB) { setB = new Set(); neighborsByKey.set(b, setB); }
    setB.add(a);
  };

  const extractRings = geom => {
    if (!geom || !geom.coordinates) return [];
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    const rings = [];
    for (const poly of polys) {
      for (const rawRing of poly) {
        if (!rawRing || rawRing.length < 3) continue;
        const keys = [];
        for (let i = 0; i < rawRing.length; i += 1) {
          const k = registerPoint(rawRing[i]);
          if (!keys.length || keys[keys.length - 1] !== k) keys.push(k);
        }
        if (keys.length > 1 && keys[0] === keys[keys.length - 1]) keys.pop();
        if (keys.length < 3) continue;
        for (let i = 0; i < keys.length; i += 1) {
          addNeighbor(keys[i], keys[(i + 1) % keys.length]);
        }
        rings.push(keys);
      }
    }
    return rings;
  };

  const featureRingSets = features.map(f => extractRings(f.geometry));
  const outlineRingSets = (outlines || []).map(f => extractRings(f.geometry));

  // Identify topological junction nodes (degree != 2)
  const junctions = new Set();
  for (const [k, nb] of neighborsByKey.entries()) {
    if (nb.size !== 2) junctions.add(k);
  }

  // Ensure isolated closed loops (e.g. islands with 0 shared borders) have 2 pinned anchor points so DP never collapses them
  const ensureLoopAnchors = ring => {
    let count = 0;
    for (let i = 0; i < ring.length; i += 1) {
      if (junctions.has(ring[i])) {
        count += 1;
        if (count >= 2) return;
      }
    }
    let minIdx = 0;
    for (let i = 1; i < ring.length; i += 1) {
      if (ring[i] < ring[minIdx]) minIdx = i;
    }
    junctions.add(ring[minIdx]);
    const p0 = coordsByKey.get(ring[minIdx]);
    let farIdx = (minIdx + Math.floor(ring.length / 2)) % ring.length;
    let maxD = -1;
    for (let i = 0; i < ring.length; i += 1) {
      if (i === minIdx) continue;
      const p = coordsByKey.get(ring[i]);
      const d = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
      if (d > maxD) { maxD = d; farIdx = i; }
    }
    junctions.add(ring[farIdx]);
  };

  for (const rSet of featureRingSets) rSet.forEach(ensureLoopAnchors);
  for (const rSet of outlineRingSets) rSet.forEach(ensureLoopAnchors);

  // Decompose rings into shared canonical arcs and simplify each canonical arc ONCE
  const simplifiedArcCache = new Map();

  const simplifyChain = chainKeys => {
    const fwdId = chainKeys.join("|");
    const revKeys = [...chainKeys].reverse();
    const revId = revKeys.join("|");
    const isRev = revId < fwdId;
    const canonId = isRev ? revId : fwdId;
    let simpPts = simplifiedArcCache.get(canonId);
    if (!simpPts) {
      const canonKeys = isRev ? revKeys : chainKeys;
      const rawPts = canonKeys.map(k => coordsByKey.get(k));
      simpPts = dpSimplify(rawPts, tolerance);
      simplifiedArcCache.set(canonId, simpPts);
    }
    return isRev ? [...simpPts].reverse() : simpPts;
  };

  const reconstructRingSet = rings => {
    if (!rings.length) return "";
    let d = "";
    let fallbackLargest = "";
    let largestSpan = -1;

    for (const ring of rings) {
      let startIdx = -1;
      for (let i = 0; i < ring.length; i += 1) {
        if (junctions.has(ring[i])) { startIdx = i; break; }
      }
      if (startIdx < 0) startIdx = 0;
      const rotated = ring.slice(startIdx).concat(ring.slice(0, startIdx));

      // Find all junction positions in rotated (rotated[0] is guaranteed junction)
      const jPos = [0];
      for (let i = 1; i < rotated.length; i += 1) {
        if (junctions.has(rotated[i])) jPos.push(i);
      }

      const assembled = [];
      for (let s = 0; s < jPos.length; s += 1) {
        const from = jPos[s];
        const to = s + 1 < jPos.length ? jPos[s + 1] : rotated.length;
        const chain = rotated.slice(from, to).concat([rotated[to % rotated.length]]);
        const segPts = simplifyChain(chain);
        for (let k = 0; k < segPts.length - 1; k += 1) assembled.push(segPts[k]);
      }

      // Deduplicate any accidental adjacent identical points
      const cleanPts = [];
      for (let i = 0; i < assembled.length; i += 1) {
        const pt = assembled[i];
        const prev = cleanPts[cleanPts.length - 1];
        if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-4) cleanPts.push(pt);
      }

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const pt of ring.map(k => coordsByKey.get(k))) {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }
      const span = Math.hypot(maxX - minX, maxY - minY);
      const ptsForRing = cleanPts.length >= 3 ? cleanPts : rotated.slice(0, 3).map(k => coordsByKey.get(k));
      const ringPath = ringToSvgPath(ptsForRing, decimals);

      if (span > largestSpan) {
        largestSpan = span;
        fallbackLargest = ringPath;
      }
      if (rings.length > 4 && span < tolerance * 0.65) continue;
      d += ringPath;
    }
    return d || fallbackLargest;
  };

  return {
    featurePaths: featureRingSets.map(reconstructRingSet),
    outlinePaths: outlineRingSets.map(reconstructRingSet),
  };
}

module.exports = {
  buildTopologicalLayerPaths,
  dpSimplify,
  ringToSvgPath,
};
