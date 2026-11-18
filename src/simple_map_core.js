const fs = require("fs");
const path = require("path");
const { buildTopologicalLayerPaths } = require("./topo_simplify");

const DEFAULT_COLORS = ["#2c5e8a", "#3f87b5", "#6bc0c4", "#bfe3b4", "#f5cf86", "#eb8a4c", "#c8413a", "#781530"];
const DEFAULT_BREAKS = [0, 5500, 8000, 12000, 18000, 30000, 55000, 90000, 200000];

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

function fmt(value) {
  return Number(value).toLocaleString("zh-CN");
}

function fmtWanNumber(value) {
  const w = Number(value) / 10000;
  const digits = w < 1 ? 2 : 1;
  return Number(w.toFixed(digits)).toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

function fmtWanLabel(value) {
  return `${fmtWanNumber(value)}万`;
}

function formatBeijingTime(value) {
  const date = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} 北京时间`;
}

function readGeoFeatures(rootDir, specs) {
  return specs.flatMap(spec => {
    const geo = JSON.parse(fs.readFileSync(path.join(rootDir, spec.file), "utf8"));
    return geo.features.map(feature => {
      const props = feature.properties || {};
      const city = typeof spec.city === "function" ? spec.city(props, feature) : spec.city;
      const name = spec.name ? spec.name(props, feature) : props.name;
      return {
        ...feature,
        properties: {
          ...props,
          city,
          name,
          showName: spec.showName ? spec.showName(props, feature) : false,
        },
      };
    });
  });
}

function walkCoords(geom, fn) {
  const recur = arr => {
    if (typeof arr[0] === "number") fn(arr);
    else for (const x of arr) recur(x);
  };
  recur(geom.coordinates);
}

function mercator([lon, lat]) {
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const rad = (clampedLat * Math.PI) / 180;
  return [lon, (Math.log(Math.tan(Math.PI / 4 + rad / 2)) * 180) / Math.PI];
}

function buildProjection(features, mapBox) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const feature of features) {
    walkCoords(feature.geometry, coord => {
      const [x, y] = mercator(coord);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
  }
  const scale = Math.min(mapBox.w / (maxX - minX), mapBox.h / (maxY - minY)) * 0.92;
  const ox = mapBox.x + (mapBox.w - (maxX - minX) * scale) / 2;
  const oy = mapBox.y + (mapBox.h + (maxY - minY) * scale) / 2;
  const project = coord => {
    const [x, y] = mercator(coord);
    return [ox + (x - minX) * scale, oy - (y - minY) * scale];
  };
  const projectedMapBounds = {
    minX: ox,
    minY: oy - (maxY - minY) * scale,
    maxX: ox + (maxX - minX) * scale,
    maxY: oy,
  };
  return { minX, minY, maxX, maxY, scale, ox, oy, project, projectedMapBounds };
}

function fmtNum(n, decimals = 1) {
  const s = n.toFixed(decimals);
  return decimals > 0 ? s.replace(/\.?0+$/, "") : s;
}

function pointsToCompactSvgRing(points, decimals = 1) {
  if (!points || points.length < 3) return "";
  let d = "";
  for (let i = 0; i < points.length; i += 1) {
    const x = fmtNum(points[i][0], decimals);
    const y = fmtNum(points[i][1], decimals);
    const sep = y.startsWith("-") ? "" : " ";
    d += `${i === 0 ? "M" : "L"}${x}${sep}${y}`;
  }
  return `${d}Z`;
}

function geomToPath(geom, project, decimals = 2) {
  const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let d = "";
  for (const poly of polygons) {
    for (const ring of poly) {
      const pts = ring.map(project);
      d += pointsToCompactSvgRing(pts, decimals);
    }
  }
  return d;
}

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (!dx && !dy) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  return Math.abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / Math.hypot(dx, dy);
}

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let splitIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = i;
    }
  }
  if (maxDistance <= tolerance) return [start, end];
  return simplifyLine(points.slice(0, splitIndex + 1), tolerance)
    .slice(0, -1)
    .concat(simplifyLine(points.slice(splitIndex), tolerance));
}

function simplifyClosedRingDP(openRing, tolerance) {
  if (openRing.length <= 6) return openRing;
  // Split closed ring at farthest vertex from index 0 so Douglas-Peucker preserves loop shape
  let farIdx = Math.floor(openRing.length / 2);
  let maxDist = -1;
  const p0 = openRing[0];
  for (let i = 1; i < openRing.length; i += 1) {
    const d = Math.hypot(openRing[i][0] - p0[0], openRing[i][1] - p0[1]);
    if (d > maxDist) {
      maxDist = d;
      farIdx = i;
    }
  }
  // Skip tiny degenerate sea-rock slivers when tolerance is coarse, but always keep primary polygons
  const half1 = simplifyLine(openRing.slice(0, farIdx + 1), tolerance);
  const half2 = simplifyLine(openRing.slice(farIdx).concat([p0]), tolerance);
  const merged = half1.slice(0, -1).concat(half2.slice(0, -1));
  return merged.length >= 3 ? merged : openRing.slice(0, 3);
}

function geomToSimplifiedPath(geom, project, tolerance = 0) {
  const decimals = tolerance > 0 && tolerance >= 0.08 ? 1 : 2;
  if (!tolerance) return geomToPath(geom, project, decimals);
  const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let d = "";
  let largestFallback = "";
  let largestLen = 0;
  for (const poly of polygons) {
    for (let rIdx = 0; rIdx < poly.length; rIdx += 1) {
      const ring = poly[rIdx];
      const projected = ring.map(project);
      const hasClosingPoint = projected.length > 2
        && Math.hypot(projected[0][0] - projected[projected.length - 1][0], projected[0][1] - projected[projected.length - 1][1]) < 1e-5;
      const openRing = hasClosingPoint ? projected.slice(0, -1) : projected;
      if (openRing.length < 3) continue;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const pt of openRing) {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }
      const span = Math.hypot(maxX - minX, maxY - minY);
      const ringStr = pointsToCompactSvgRing(simplifyClosedRingDP(openRing, tolerance), decimals);
      if (span > largestLen) {
        largestLen = span;
        largestFallback = ringStr;
      }
      // Drop sub-pixel micro-islets at coarse national simplification while keeping at least the main ring
      if (rIdx === 0 && span < tolerance * 0.85 && polygons.length > 3) continue;
      d += ringStr;
    }
  }
  return d || largestFallback;
}

function signedArea(points) {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += (points[j][0] * points[i][1]) - (points[i][0] * points[j][1]);
  }
  return sum / 2;
}

function ringCentroid(points) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const cross = points[j][0] * points[i][1] - points[i][0] * points[j][1];
    a += cross;
    cx += (points[j][0] + points[i][0]) * cross;
    cy += (points[j][1] + points[i][1]) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const avg = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [avg[0] / points.length, avg[1] / points.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
  }
  return inside;
}

function distToSegment(point, a, b) {
  const [x, y] = point;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(x - a[0], y - a[1]);
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

function minDistToRing(point, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    best = Math.min(best, distToSegment(point, ring[j], ring[i]));
  }
  return best;
}

function bestLabelPoint(feature, project) {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  let bestRing = null;
  let bestArea = 0;
  for (const poly of polygons) {
    if (!poly?.[0]) continue;
    const ring = poly[0].map(project);
    const area = Math.abs(signedArea(ring));
    if (area > bestArea) {
      bestArea = area;
      bestRing = ring;
    }
  }
  if (!bestRing) return [0, 0, { w: 1, h: 1 }];
  const xs = bestRing.map(p => p[0]);
  const ys = bestRing.map(p => p[1]);
  const bbox = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  const candidates = [ringCentroid(bestRing), [(bbox.minX + bbox.maxX) / 2, (bbox.minY + bbox.maxY) / 2]];
  for (let ix = 1; ix < 10; ix++) {
    for (let iy = 1; iy < 10; iy++) {
      candidates.push([bbox.minX + ((bbox.maxX - bbox.minX) * ix) / 10, bbox.minY + ((bbox.maxY - bbox.minY) * iy) / 10]);
    }
  }
  let best = candidates[0];
  let bestScore = -Infinity;
  const step = Math.max(1, Math.floor(bestRing.length / 220));
  const sampleRing = step > 1 ? bestRing.filter((_, idx) => idx % step === 0) : bestRing;
  for (const p of candidates) {
    if (!pointInRing(p, sampleRing)) continue;
    const score = minDistToRing(p, sampleRing);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return [Number(best[0].toFixed(1)), Number(best[1].toFixed(1)), {
    w: Number((bbox.maxX - bbox.minX).toFixed(1)),
    h: Number((bbox.maxY - bbox.minY).toFixed(1)),
  }];
}

function cleanName(name) {
  const raw = String(name || "").replace(/市辖区$/, "").replace(/特别行政区$/, "");
  if (raw.length <= 2) return raw;
  if (raw === "松山湖园区") return "松山湖";
  if (raw === "东莞生态园") return "生态园";
  if (/(火炬开发区|经济开发区|高新技术开发区)$/.test(raw)) return raw.replace(/开发区$/, "区");
  return raw
    .replace(/(黎族苗族自治县|藏族羌族自治州|蒙古族藏族自治州|哈萨克自治州|柯尔克孜自治州|傈僳族自治州|土家族苗族自治州|布依族苗族自治州|苗族侗族自治州|哈尼族彝族自治州|壮族苗族自治州|傣族景颇族自治州|傣族自治州|白族自治州|彝族自治州|藏族自治州|回族自治州|蒙古自治州|朝鲜族自治州|自治县|自治州|自治旗|地区|林区)$/, "")
    .replace(/新区$/, "")
    .replace(/(?<!园|开发|保税|合作|工业|风景)[区县市省盟]$/g, "");
}

function pathBounds(d) {
  const values = [...String(d || "").matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
  if (values.length < 2) return null;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < values.length - 1; i += 2) {
    bounds.minX = Math.min(bounds.minX, values[i]);
    bounds.maxX = Math.max(bounds.maxX, values[i]);
    bounds.minY = Math.min(bounds.minY, values[i + 1]);
    bounds.maxY = Math.max(bounds.maxY, values[i + 1]);
  }
  if (!Number.isFinite(bounds.minX)) return null;
  return {
    minX: Number(bounds.minX.toFixed(1)),
    minY: Number(bounds.minY.toFixed(1)),
    maxX: Number(bounds.maxX.toFixed(1)),
    maxY: Number(bounds.maxY.toFixed(1)),
  };
}

function mergeBounds(items) {
  const source = items.map(item => item.bounds).filter(Boolean);
  if (!source.length) return null;
  return source.reduce((acc, bounds) => ({
    minX: Math.min(acc.minX, bounds.minX),
    minY: Math.min(acc.minY, bounds.minY),
    maxX: Math.max(acc.maxX, bounds.maxX),
    maxY: Math.max(acc.maxY, bounds.maxY),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

function addPresentField(target, key, value) {
  if (value !== undefined && value !== null && value !== "" && value !== false) target[key] = value;
}

function regionMetadata(record, defaultDataLevel = "") {
  const metadata = {};
  addPresentField(metadata, "mom", record?.mom);
  addPresentField(metadata, "yoy", record?.yoy);
  addPresentField(metadata, "newMom", record?.newMom);
  addPresentField(metadata, "newYoy", record?.newYoy);
  addPresentField(metadata, "source", record?.source);
  addPresentField(metadata, "quality", record?.quality);
  addPresentField(metadata, "dataLevel", record?.dataLevel || defaultDataLevel);
  addPresentField(metadata, "priceType", record?.priceType);
  addPresentField(metadata, "newPrice", record?.newPrice);
  addPresentField(metadata, "resalePrice", record?.resalePrice);
  addPresentField(metadata, "newPriceEstimated", Boolean(record?.newPriceEstimated));
  addPresentField(metadata, "resalePriceEstimated", Boolean(record?.resalePriceEstimated));
  if (record?.newPriceEstimated || record?.resalePriceEstimated || String(record?.priceType || "").includes("estimated")) {
    addPresentField(metadata, "estimateRatio", record?.estimateRatio);
    addPresentField(metadata, "estimateBasis", record?.estimateBasis);
  }
  addPresentField(metadata, "rentYield", record?.rentYield);
  addPresentField(metadata, "priceToIncome", record?.priceToIncome);
  addPresentField(metadata, "priceToWage", record?.priceToWage);
  addPresentField(metadata, "peakPrice", record?.peakPrice);
  addPresentField(metadata, "peakDate", record?.peakDate);
  addPresentField(metadata, "troughPrice", record?.troughPrice);
  addPresentField(metadata, "troughDate", record?.troughDate);
  addPresentField(metadata, "drawdownPct", record?.drawdownPct);
  addPresentField(metadata, "trendKey", record?.trendKey);
  addPresentField(metadata, "newSource", record?.newSource);
  addPresentField(metadata, "newQuality", record?.newQuality);
  addPresentField(metadata, "resaleSource", record?.resaleSource);
  addPresentField(metadata, "resaleQuality", record?.resaleQuality);
  addPresentField(metadata, "rawSourcePrice", record?.rawSourcePrice);
  addPresentField(metadata, "rawNewPrice", record?.rawNewPrice);
  addPresentField(metadata, "calibrationFactor", record?.calibrationFactor);
  addPresentField(metadata, "realDistFund", Boolean(record?.realDistrictFundamentals));
  addPresentField(metadata, "inherited", Boolean(record?.inheritedCityAverage));
  addPresentField(metadata, "supplemental", Boolean(record?.supplemental));
  return metadata;
}

function colorFor(value, breaks = DEFAULT_BREAKS, colors = DEFAULT_COLORS) {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) <= 0) return "#dce5ea";
  for (let i = 0; i < breaks.length - 1; i++) {
    if (value >= breaks[i] && value < breaks[i + 1]) return colors[i];
  }
  return colors[colors.length - 1];
}

function legendLabel(index, breaks, colors) {
  if (index === 0) return `<${fmtWanNumber(breaks[1])}万`;
  if (index === colors.length - 1) return `${fmtWanNumber(breaks[index])}万+`;
  return `${fmtWanNumber(breaks[index])}-${fmtWanNumber(breaks[index + 1])}`;
}

function createInteractiveMap(config) {
  const width = config.width || 1800;
  const height = config.height || 1320;
  const mapBox = config.mapBox || { x: 64, y: 198, w: 1120, h: 920 };
  const colors = config.colors || DEFAULT_COLORS;
  const breaks = config.breaks || DEFAULT_BREAKS;
  const features = config.features;
  const outlines = config.outlines || [];
  const pathSimplifyTolerance = config.pathSimplifyTolerance || 0;
  const projection = buildProjection(features, mapBox);
  const mapViewPadding = 56;
  const mapViewBox = {
    x: Math.max(0, projection.projectedMapBounds.minX - mapViewPadding),
    y: Math.max(0, projection.projectedMapBounds.minY - mapViewPadding),
    w: Math.min(width, projection.projectedMapBounds.maxX + mapViewPadding) - Math.max(0, projection.projectedMapBounds.minX - mapViewPadding),
    h: Math.min(height, projection.projectedMapBounds.maxY + mapViewPadding) - Math.max(0, projection.projectedMapBounds.minY - mapViewPadding),
  };
  const getRecord = config.getRecord;
  const { featurePaths, outlinePaths } = buildTopologicalLayerPaths(features, outlines, projection.project, pathSimplifyTolerance || 0.32);
  const svgRegions = features.map((feature, index) => {
    const province = feature.properties.province || feature.properties.city;
    const record = getRecord(feature.properties.city, feature.properties.name, feature);
    const price = record?.price || null;
    const [cx, cy, labelBox] = bestLabelPoint(feature, projection.project);
    const label = cleanName(feature.properties.name);
    const d = featurePaths[index];
    return {
      id: `r${index}`,
      province,
      city: feature.properties.city,
      name: feature.properties.name,
      label,
      price,
      ...regionMetadata(record, "city"),
      d,
      fill: colorFor(price, breaks, colors),
      cx,
      cy,
      labelMinScale: Number(Math.max(1.25, Math.min(4.8, ((label.length + 4) * 6.4) / Math.max(10, Math.min(labelBox.w, labelBox.h * 2)))).toFixed(2)),
    };
  });

  // Strip .d from serialized client JSON to avoid duplicating 850KB of SVG path coordinates
  const clientRegions = svgRegions.map(({ d, ...rest }) => rest);

  const cityBoundaries = outlines.map((_, index) => ({
    id: `c${index}`,
    d: outlinePaths[index],
  })).filter(o => o.d);

  // Build South China Sea inset paths (106E..122E, 3N..23.5N)
  const scsNW = projection.project([106.5, 23.2]);
  const scsSE = projection.project([121.8, 3.6]);
  const scsViewBox = `${scsNW[0].toFixed(1)} ${scsNW[1].toFixed(1)} ${(scsSE[0] - scsNW[0]).toFixed(1)} ${(scsSE[1] - scsNW[1]).toFixed(1)}`;
  const scsOutlines = cityBoundaries.filter((_, idx) => {
    const cName = outlines[idx]?.properties?.city || "";
    return ["广东", "广西", "海南", "台湾", "香港", "澳门", "福建"].some(k => cName.includes(k));
  });

  const cityLabels = Object.entries(config.labelCenters || {}).map(([label, coord]) => {
    const [x, y] = projection.project(coord);
    return { label, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });

  const isInheritedRegion = r => Boolean(r.inherited || r.dataLevel === "city-inherited");
  const regionClasses = r => `region${isInheritedRegion(r) ? " inheritedRegion" : ""}`;
  const detailLabelText = r => `${esc(r.label)} ${fmtWanLabel(r.price)}`;

  const initialCenter = config.initialView?.center || [105.2, 35.4];
  const initialScale = config.initialView?.scale || 1.24;
  const trendsUrl = config.trendsUrl || "data/china_city_trends.json";
  const streetPlatesUrl = config.streetPlatesUrl || "data/china_street_plates.json";

  return `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${esc(config.subtitle || "全国城市及区县住宅挂牌价、新房均价、租金回报率、房价收入比与近12个月走势交互地图")}">
<title>${esc(config.pageTitle)}</title>
<style>
  :root {
    --bg-ocean: #e6eff5;
    --bg-ocean-accent: #dbe8f0;
    --bg-panel: #ffffff;
    --bg-subtle: #f3f7fa;
    --bg-hover: #e9f2f7;
    --bg-hud: rgba(255, 255, 255, 0.90);
    --ink: #0f222d;
    --ink-secondary: #37505e;
    --ink-muted: #466170;
    --line: #d4e1e8;
    --line-strong: #b3c8d4;
    --brand: #0c6e8c;
    --brand-ink: #085066;
    --brand-soft: #e3f3f8;
    --accent: #d97706;
    --up: #c2392f;
    --up-bg: #fdeeed;
    --down: #0c7b5e;
    --down-bg: #eaf8f3;
    --province-stroke: #173e4d;
    --region-stroke: #f4f8fb;
    --label-fill: #132936;
    --label-halo: rgba(255, 255, 255, 0.94);
    --hud-shadow: 0 8px 24px rgba(15, 34, 45, 0.09);
    --overlay-opacity: 0.72;
    --label-scale: 1.38;
    --inv-scale: 1;
  }
  [data-theme="dark"] {
    --bg-ocean: #09141e;
    --bg-ocean-accent: #0d1c29;
    --bg-panel: #0f1d2a;
    --bg-subtle: #152738;
    --bg-hover: #1b3247;
    --bg-hud: rgba(15, 29, 42, 0.90);
    --ink: #e7f1f7;
    --ink-secondary: #b0c7d6;
    --ink-muted: #93afc2;
    --line: #1f3548;
    --line-strong: #31506b;
    --brand: #38bdf8;
    --brand-ink: #7dd3fc;
    --brand-soft: rgba(56, 189, 248, 0.15);
    --accent: #fbbf24;
    --up: #f87171;
    --up-bg: rgba(248, 113, 113, 0.15);
    --down: #34d399;
    --down-bg: rgba(52, 211, 153, 0.15);
    --province-stroke: #cbe3f0;
    --region-stroke: #0c1a27;
    --label-fill: #f0f7fc;
    --label-halo: rgba(9, 20, 30, 0.92);
    --hud-shadow: 0 10px 28px rgba(0, 0, 0, 0.38);
  }
  * { box-sizing: border-box; }
  ::selection { background: var(--brand); color: #fff; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 999px; }
  html, body { margin: 0; padding: 0; height: 100%; background: var(--bg-ocean); color: var(--ink); font-family: "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, -apple-system, sans-serif; font-size: 14px; -webkit-font-smoothing: antialiased; }
  .num, .price, .swatchCount, .kpiVal, .calcVal, .row, .legendLabels, .tooltip { font-variant-numeric: tabular-nums; }
  button, select, input { font: inherit; color: var(--ink); }
  button:focus-visible, select:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

  .app { height: 100dvh; width: 100vw; display: grid; grid-template-columns: minmax(0, 1fr) 436px; overflow: hidden; transition: grid-template-columns 0.24s cubic-bezier(0.22, 1, 0.36, 1); }
  body.sidebarCollapsed .app { grid-template-columns: minmax(0, 1fr) 0px; }
  body.sidebarCollapsed .side { border-left-width: 0; opacity: 0; pointer-events: none; }

  .mapShell { position: relative; min-width: 0; height: 100dvh; overflow: hidden; overscroll-behavior: contain; background: radial-gradient(circle at 52% 44%, var(--bg-ocean) 0%, var(--bg-ocean-accent) 100%); }
  svg#map { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; user-select: none; }
  svg#map.dragging { cursor: grabbing; }
  #viewport { will-change: transform; }

  /* HUD Overlays */
  .hudCard { background: var(--bg-hud); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid var(--line); box-shadow: var(--hud-shadow); border-radius: 12px; }
  .hudTopStack { position: absolute; z-index: 6; left: 16px; right: 16px; top: 14px; display: flex; flex-direction: column; gap: 7px; pointer-events: none; }
  .hudTopBar { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; pointer-events: none; }
  .hudSubStack { display: flex; flex-direction: column; gap: 7px; pointer-events: none; }
  .hudSubStack > * { pointer-events: auto; }
  .hudTopLeft { display: flex; flex-direction: column; gap: 7px; min-width: 0; flex: 1 1 auto; pointer-events: none; }
  .hudTopLeft > * { pointer-events: auto; }
  .brandBlock { padding: 7px 12px; display: inline-flex; align-items: center; gap: 9px; flex-wrap: nowrap; width: fit-content; max-width: 100%; min-width: 0; }
  .brandBlock h1 { margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; white-space: nowrap; flex-shrink: 0; }
  .brandMeta { font-size: 12px; color: var(--ink-secondary); display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .liveDot { width: 7px; height: 7px; border-radius: 50%; background: #10b981; display: inline-block; flex-shrink: 0; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18); }
  .brandGuideLink { height: 25px; padding: 0 9px; border-radius: 999px; border: 1px solid var(--brand); background: var(--brand-soft); color: var(--brand-ink); font-size: 12px; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; flex-shrink: 0; transition: background 0.15s, color 0.15s; }
  .brandGuideLink:hover { background: var(--brand); color: #ffffff; }
  [data-theme="dark"] .brandGuideLink:hover { color: #06131c; }
  .brandGuideLink svg { width: 13.5px; height: 13.5px; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
  .brandGuideLink i { font-style: normal; font-size: 11px; opacity: 0.85; }

  .metricTabs { display: inline-flex; padding: 3px; gap: 2px; width: fit-content; max-width: 100%; overflow-x: auto; scrollbar-width: none; }
  .metricTabs::-webkit-scrollbar { display: none; }
  .metricTab { border: 0; background: transparent; color: var(--ink-secondary); height: 29px; padding: 0 10px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: background 0.15s, color 0.15s; white-space: nowrap; }
  .metricTab:hover { color: var(--ink); background: var(--bg-hover); }
  .metricTab.active { background: var(--brand); color: #fff; font-weight: 800; }
  [data-theme="dark"] .metricTab.active { color: #06131c; }

  .presetBar { display: flex; gap: 5px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; max-width: 100%; padding-bottom: 2px; }
  .presetBar::-webkit-scrollbar { display: none; }
  .presetButton { border: 1px solid var(--line); background: var(--bg-hud); backdrop-filter: blur(8px); color: var(--ink-secondary); height: 27px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; transition: border-color 0.15s, background 0.15s, color 0.15s; white-space: nowrap; flex-shrink: 0; }
  .presetButton:hover { border-color: var(--brand); color: var(--ink); }
  .presetButton.active { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-ink); font-weight: 800; }

  .hudTopRight { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: 0 0 auto; pointer-events: none; }
  .hudTopRight > * { pointer-events: auto; }
  .toolbar { display: flex; gap: 4px; flex-wrap: nowrap; justify-content: flex-end; padding: 4px; }
  .toolBtn { border: 0; background: transparent; color: var(--ink); height: 31px; min-width: 31px; padding: 0 8px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 4px; transition: background 0.15s, color 0.15s; white-space: nowrap; }
  .toolBtn:hover { background: var(--bg-hover); }
  .toolBtn.active { background: var(--brand-soft); color: var(--brand-ink); }
  .toolBtn svg { width: 15px; height: 15px; stroke: currentColor; stroke-width: 1.85; fill: none; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
  .toolSep { width: 1px; height: 20px; background: var(--line); align-self: center; margin: 0 1px; }

  .popoverPanel { position: absolute; top: calc(100% + 8px); right: 0; z-index: 12; width: 292px; padding: 12px 14px; display: none; flex-direction: column; gap: 11px; }
  .popoverPanel.open { display: flex; }
  .popRow { display: grid; grid-template-columns: 74px minmax(0, 1fr) 42px; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: var(--ink-secondary); }
  .popRow input[type="range"] { width: 100%; accent-color: var(--brand); cursor: pointer; }
  .popRow span { text-align: right; font-weight: 700; color: var(--ink); }
  .budgetPanel { position: absolute; top: calc(100% + 8px); right: 0; z-index: 12; width: 326px; padding: 12px 14px; display: none; flex-direction: column; gap: 10px; }
  .budgetPanel.open { display: flex; }
  .budgetHead { display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 13px; }
  .budgetSummary { font-size: 12px; color: var(--ink-secondary); background: var(--bg-subtle); border-radius: 8px; padding: 7px 9px; line-height: 1.5; }
  .budgetSummary b { color: var(--brand-ink); }
  .modeSwitch { display: grid; grid-template-columns: 1fr 1fr; background: var(--bg-subtle); border: 1px solid var(--line); border-radius: 9px; padding: 4px; gap: 4px; }
  .modeSwitchBtn { border: 0; background: transparent; color: var(--ink-secondary); height: 29px; padding: 0 10px; border-radius: 6px; font-size: 12px; font-weight: 750; cursor: pointer; }
  .modeSwitchBtn.active { background: var(--bg-panel); color: var(--brand-ink); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
  .profileGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .profileBtn { border: 1px solid var(--line); background: var(--bg-panel); border-radius: 8px; padding: 6px 5px; font-size: 11.5px; font-weight: 750; color: var(--ink-secondary); cursor: pointer; text-align: center; line-height: 1.35; }
  .profileBtn:hover { border-color: var(--brand); color: var(--ink); }
  .profileBtn.active { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-ink); }
  .profileBtn small { display: block; font-size: 11px; font-weight: 600; color: var(--ink-muted); margin-top: 2px; }

  .radiusPanel { position: absolute; top: calc(100% + 8px); right: 0; z-index: 12; width: 372px; padding: 12px 14px; display: none; flex-direction: column; gap: 9px; }
  .radiusPanel.open { display: flex; }
  .poiSearchRow { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; }
  .poiCandList { display: flex; flex-direction: column; gap: 4px; background: var(--bg-subtle); border: 1px solid var(--line); border-radius: 8px; padding: 8px; max-height: 136px; overflow-y: auto; }
  .poiCandItem { border: 0; background: var(--bg-panel); border-radius: 6px; padding: 6px 8px; text-align: left; font-size: 12px; color: var(--ink); cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
  .poiCandItem:hover { background: var(--brand-soft); color: var(--brand-ink); }
  .poiCandItem small { font-size: 11px; color: var(--ink-muted); }
  .commuteActionRow { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .commuteActionRow .miniBtn { flex: 1 1 auto; justify-content: center; height: 28px; font-size: 12px; }
  .ringModeBar { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
  .ringModeBtn { flex: 1 1 auto; border: 1px solid var(--line); background: var(--bg-subtle); color: var(--ink-secondary); height: 26px; padding: 0 6px; border-radius: 6px; font-size: 11.5px; font-weight: 750; cursor: pointer; white-space: nowrap; }
  .ringModeBtn:hover, .ringModeBtn.active { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-ink); font-weight: 800; }
  .commuteOriginPin { cursor: grab; }
  .commuteOriginPin:active, svg.draggingPin .commuteOriginPin { cursor: grabbing; }
  svg.commuteFreeClick { cursor: crosshair; }
  .ringStatGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .ringStatCell { background: var(--bg-subtle); border: 1px solid var(--line); border-radius: 7px; padding: 6px 7px; text-align: center; }
  .ringStatCell span { display: block; font-size: 11px; color: var(--ink-muted); }
  .ringStatCell b { display: block; font-size: 12.5px; font-weight: 800; color: var(--ink); margin-top: 2px; }
  .arbList { display: flex; flex-direction: column; gap: 4px; max-height: 164px; overflow-y: auto; }
  .arbItem { border: 1px solid var(--line); background: var(--bg-panel); border-radius: 7px; padding: 5px 8px; display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 11.5px; cursor: pointer; }
  .arbItem:hover { border-color: var(--brand); background: var(--brand-soft); }

  /* Timeline Playback Bar */
  .timelineDock { position: absolute; z-index: 10; left: 50%; bottom: 16px; transform: translateX(-50%); display: none; align-items: center; gap: 10px; padding: 8px 13px; width: min(560px, calc(100% - 240px)); }
  .timelineDock.open { display: flex; }
  .tlPlayBtn { border: 0; background: var(--brand); color: #fff; width: 30px; height: 30px; border-radius: 999px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  [data-theme="dark"] .tlPlayBtn { color: #06131c; }
  .tlPlayBtn svg { width: 14px; height: 14px; fill: currentColor; }
  .tlMonth { font-size: 13px; font-weight: 800; color: var(--ink); min-width: 58px; white-space: nowrap; }
  .tlSlider { flex: 1 1 auto; accent-color: var(--brand); cursor: pointer; min-width: 90px; }

  /* Commute Ring SVG Styles */
  .commuteRing { fill: rgba(12, 110, 140, 0.04); stroke: var(--brand); stroke-width: 1.5; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; pointer-events: none; }
  .commuteRingLabel { font-size: 11px; font-weight: 800; fill: var(--brand-ink); paint-order: stroke; stroke: var(--label-halo); stroke-width: 3px; pointer-events: none; }
  .rulerLine { stroke: var(--accent); stroke-width: 2; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; pointer-events: none; }
  .rulerBadge { font-size: 11.5px; font-weight: 800; fill: #fff; pointer-events: none; }
  .linkBtn { border: 0; background: none; color: var(--brand); font-size: 12px; font-weight: 700; cursor: pointer; padding: 2px 4px; }
  .linkBtn:hover { text-decoration: underline; }

  /* SVG Map Paths & Labels */
  .detailDataset { transition: opacity 0.16s; }
  .detailDataset.hidden { display: none; }
  #priceOverlay { transition: opacity 0.15s; }
  .mapTilesOn #priceOverlay { opacity: var(--overlay-opacity); }
  .region { stroke: var(--region-stroke); stroke-width: 0.85; vector-effect: non-scaling-stroke; paint-order: fill stroke; stroke-linejoin: round; stroke-linecap: round; fill-rule: evenodd; cursor: pointer; transition: opacity 0.14s; }
  svg.dragging .region, .mapShell.isMoving .region { transition: none; pointer-events: none; }
  .coveredByDetail { visibility: hidden; pointer-events: none; }
  .underlaySeal { pointer-events: none; stroke: none; }
  .cityBoundary { fill: none; stroke: var(--province-stroke); stroke-width: 1.55; vector-effect: non-scaling-stroke; pointer-events: none; opacity: 0.58; stroke-linejoin: round; stroke-linecap: round; }
  .highlightPath { fill: none; pointer-events: none; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: round; }
  #hoverHighlight { stroke: #fbbf24; stroke-width: 2.8; opacity: 0.96; }
  #selectedHighlight { fill: rgba(14, 165, 233, 0.16); stroke: #0ea5e9; stroke-width: 3.4; opacity: 1; }
  #selectedPulse { stroke: #0ea5e9; stroke-width: 7; opacity: 0.22; animation: selectedPulse 2s ease-in-out infinite; }
  .inheritedRegion { stroke-dasharray: 2.6 2; }
  @keyframes selectedPulse { 0%, 100% { opacity: 0.10; stroke-width: 4.5; } 50% { opacity: 0.28; stroke-width: 7.5; } }
  .dimmed { opacity: 0.14 !important; }

  .cityLabel { font-size: calc(15px * var(--label-scale)); font-weight: 800; fill: var(--label-fill); paint-order: stroke; stroke: var(--label-halo); stroke-width: 3.8px; pointer-events: none; }
  .detailLabel { display: none; font-size: calc(8.2px * var(--label-scale)); font-weight: 750; fill: var(--label-fill); paint-order: stroke; stroke: var(--label-halo); stroke-width: 2.2px; pointer-events: none; }
  .plateNode { cursor: pointer; }
  svg.dragging .plateNode, .mapShell.isMoving .plateNode { pointer-events: none; }
  .plateBg { fill: var(--bg-panel); fill-opacity: 0.94; stroke: var(--line-strong); stroke-width: 1; }
  .plateNode:hover .plateBg, .plateNode.active .plateBg { stroke: var(--brand); stroke-width: 1.65; fill: var(--brand-soft); }
  .plateTxt { font-size: 11px; font-weight: 750; fill: var(--ink); pointer-events: none; }

  .tileBuffer { opacity: 0; transition: opacity 0.16s ease; }
  .tileBuffer.active { opacity: 1; }
  .tileImage { opacity: 0.82; }
  [data-theme="dark"] .tileImage { filter: brightness(0.76) contrast(1.08) saturate(0.85); }

  /* Legend & South China Sea Inset */
  .legend { position: absolute; z-index: 5; left: 16px; bottom: 16px; padding: 10px 13px; max-width: calc(100% - 140px); }
  .legendHead { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 7px; }
  .legendTitle { font-size: 12px; font-weight: 800; color: var(--ink); }
  .legendHint { font-size: 11px; color: var(--ink-muted); display: flex; align-items: center; gap: 8px; }
  .legendDistBar { display: flex; height: 5px; border-radius: 999px; overflow: hidden; background: var(--bg-subtle); margin-bottom: 6px; gap: 1px; }
  .legendDistSeg { height: 100%; min-width: 2px; transition: width 0.22s ease; }
  .swatches { display: grid; grid-template-columns: repeat(8, minmax(46px, 56px)); gap: 4px; }
  .swatchBtn { border: 1px solid rgba(0, 0, 0, 0.08); height: 14px; border-radius: 4px; cursor: pointer; padding: 0; transition: transform 0.12s, box-shadow 0.12s, opacity 0.12s; }
  .swatchBtn:hover { transform: translateY(-1px); }
  .swatchBtn.active { box-shadow: 0 0 0 2px var(--ink); transform: translateY(-1px); }
  .swatchBtn.muted { opacity: 0.28; }
  .legendLabels { display: grid; grid-template-columns: repeat(8, minmax(46px, 56px)); gap: 4px; margin-top: 4px; color: var(--ink-secondary); font-size: 11px; text-align: center; white-space: nowrap; }
  .legendFoot { margin-top: 6px; padding-top: 5px; border-top: 1px solid var(--line); display: flex; align-items: center; gap: 12px; font-size: 11.5px; color: var(--ink-muted); }
  .dashSample { width: 16px; border-top: 2px dashed var(--ink-muted); display: inline-block; vertical-align: middle; margin-right: 4px; }

  .hudBottomRight { position: absolute; z-index: 5; right: 16px; bottom: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .scsInset { width: 88px; height: 112px; padding: 4px; cursor: pointer; position: relative; overflow: hidden; transition: border-color 0.15s; }
  .scsInset:hover { border-color: var(--brand); }
  .scsInset svg { width: 100%; height: 100%; display: block; background: var(--bg-ocean); border-radius: 7px; }
  .scsInset path { fill: #cbd9e2; stroke: var(--province-stroke); stroke-width: 1; vector-effect: non-scaling-stroke; }
  [data-theme="dark"] .scsInset path { fill: #1e3547; }
  .scsLabel { position: absolute; right: 7px; bottom: 6px; font-size: 11px; font-weight: 700; color: var(--ink-secondary); background: var(--bg-hud); padding: 1px 4px; border-radius: 4px; pointer-events: none; }
  .scaleBadge { padding: 4px 9px; font-size: 11.5px; font-weight: 700; color: var(--ink-secondary); display: flex; align-items: center; gap: 6px; }
  .tileAttribution { display: none; font-size: 11px; color: var(--ink-muted); padding: 3px 7px; }
  .mapTilesOn .tileAttribution { display: block; }

  /* Sidebar Analytical Workbench */
  .side { background: var(--bg-panel); border-left: 1px solid var(--line); height: 100dvh; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
  .sideScroll { flex: 1; overflow-y: auto; padding: 16px 18px 24px; display: flex; flex-direction: column; gap: 14px; }
  .kpiWrap { display: flex; flex-direction: column; gap: 6px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
  .kpiHeadRow { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: var(--ink-muted); font-weight: 700; }
  .kpiStrip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .kpiItem { background: var(--bg-subtle); border-radius: 9px; padding: 8px 9px; min-width: 0; }
  .kpiLabel { font-size: 11px; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kpiVal { font-size: 15px; font-weight: 800; color: var(--ink); margin-top: 2px; white-space: nowrap; }

  /* Selected Region Dossier */
  .dossier { border: 1px solid var(--line); background: var(--bg-subtle); border-radius: 12px; padding: 13px 14px; display: flex; flex-direction: column; gap: 10px; }
  .dossierHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .dossierCrumb { font-size: 11.5px; color: var(--ink-muted); font-weight: 600; }
  .dossierTitle { font-size: 19px; font-weight: 800; color: var(--ink); margin-top: 1px; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
  .dossierActions { display: flex; gap: 5px; flex-shrink: 0; }
  .miniBtn { border: 1px solid var(--line-strong); background: var(--bg-panel); color: var(--ink-secondary); height: 27px; padding: 0 8px; border-radius: 7px; font-size: 11.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .miniBtn:hover { border-color: var(--brand); color: var(--brand-ink); }
  .miniBtn.active { background: var(--brand-soft); border-color: var(--brand); color: var(--brand-ink); }

  .priceHeroRow { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .priceHero { font-size: 27px; font-weight: 850; letter-spacing: -0.02em; color: var(--ink); }
  .priceHero small { font-size: 13px; font-weight: 700; color: var(--ink-secondary); margin-left: 2px; }
  .deltaGroup { display: flex; gap: 5px; flex-wrap: wrap; }
  .pill { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 6px; font-size: 11.5px; font-weight: 750; white-space: nowrap; }
  .pill.up { color: var(--up); background: var(--up-bg); }
  .pill.down { color: var(--down); background: var(--down-bg); }
  .pill.neutral { color: var(--ink-secondary); background: var(--bg-panel); border: 1px solid var(--line); }

  .metricGrid4 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
  .mCell { background: var(--bg-panel); border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; }
  .mCell span { display: block; font-size: 11px; color: var(--ink-muted); }
  .mCell b { display: block; font-size: 13.5px; font-weight: 800; margin-top: 2px; color: var(--ink); }
  .mCell em { font-style: normal; font-size: 11px; color: var(--ink-secondary); }

  /* 10-Year Range Gauge */
  .rangeBox { background: var(--bg-panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .rangeTop { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--ink-secondary); margin-bottom: 6px; }
  .rangeTrack { position: relative; height: 7px; border-radius: 999px; background: linear-gradient(90deg, #3f87b5, #bfe3b4, #f5cf86, #c8413a); }
  .rangePin { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%; background: var(--ink); border: 2px solid var(--bg-panel); transform: translate(-50%, -50%); box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
  .rangeEnds { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-muted); margin-top: 5px; }

  /* 12-Month SVG Trend Chart */
  .trendBox { background: var(--bg-panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
  .trendHead { display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 4px; }
  .trendLegend { display: flex; gap: 10px; font-size: 11.5px; color: var(--ink-secondary); }
  .legendLine { display: inline-block; width: 12px; height: 2.5px; vertical-align: middle; margin-right: 4px; border-radius: 2px; }
  .trendSvg { width: 100%; height: 96px; display: block; overflow: visible; }

  /* Mortgage & Rent Calculator */
  details.calcBox { background: var(--bg-panel); border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; }
  details.calcBox summary { cursor: pointer; font-size: 12px; font-weight: 800; color: var(--ink-secondary); list-style: none; display: flex; justify-content: space-between; align-items: center; }
  details.calcBox summary::-webkit-details-marker { display: none; }
  .calcControls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; }
  .calcControls label { font-size: 11px; color: var(--ink-muted); display: flex; flex-direction: column; gap: 3px; }
  .calcControls select { height: 28px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg-subtle); padding: 0 5px; font-size: 12px; font-weight: 700; }
  .calcResult { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .calcVal span { display: block; font-size: 11px; color: var(--ink-muted); }
  .calcVal b { font-size: 13px; font-weight: 800; color: var(--ink); }

  .quickPick { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
  .quickChip { border: 1px solid var(--line); background: var(--bg-panel); color: var(--ink-secondary); border-radius: 999px; height: 26px; padding: 0 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .quickChip:hover { border-color: var(--brand); color: var(--brand-ink); }
  .sourceFoot { font-size: 12.5px; color: var(--ink-muted); line-height: 1.55; }

  /* Street & Business-Circle Sub-Layer UI */
  .plateBox { background: var(--bg-panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
  .plateHead { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: var(--ink); flex-wrap: wrap; }
  .plateHead small { font-size: 11px; font-weight: 600; color: var(--ink-muted); }
  .plateGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; max-height: 196px; overflow-y: auto; padding-right: 2px; }
  .plateChip { border: 1px solid var(--line); background: var(--bg-subtle); border-radius: 7px; padding: 5px 7px; display: flex; justify-content: space-between; align-items: center; gap: 5px; cursor: pointer; text-align: left; font-size: 11.5px; transition: border-color 0.14s, background 0.14s; }
  .plateChip:hover, .plateChip.active { border-color: var(--brand); background: var(--brand-soft); }
  .plateChipName { font-weight: 750; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plateChipVal { font-weight: 800; color: var(--brand-ink); white-space: nowrap; font-size: 11.5px; }
  .plateSelectedBanner { background: var(--brand-soft); border: 1px solid var(--brand); border-radius: 7px; padding: 7px 9px; font-size: 12px; color: var(--ink); line-height: 1.5; }
  .streetDirList { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .streetTag { display: inline-block; padding: 2px 7px; border-radius: 999px; background: var(--bg-subtle); border: 1px solid var(--line); font-size: 11px; color: var(--ink-secondary); }

  /* Community (Xiaoqu) On-Demand Drilldown & Pins */
  .xqPinNode { cursor: pointer; }
  svg.dragging .xqPinNode, .mapShell.isMoving .xqPinNode { pointer-events: none; }
  .xqPinBg { fill: #0f222d; fill-opacity: 0.94; stroke: #38bdf8; stroke-width: 1.5; }
  .xqPinNode.active .xqPinBg, .xqPinNode:hover .xqPinBg { fill: var(--brand); stroke: #fbbf24; stroke-width: 2; }
  .xqPinTxt { font-size: 11px; font-weight: 800; fill: #ffffff; pointer-events: none; }
  .xqBox { background: var(--bg-panel); border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; display: flex; flex-direction: column; gap: 7px; margin-top: 4px; }
  .xqRows { display: flex; flex-direction: column; gap: 5px; max-height: 224px; overflow-y: auto; padding-right: 2px; }
  .xqRow { border: 1px solid var(--line); background: var(--bg-subtle); border-radius: 7px; padding: 7px 9px; display: grid; grid-template-columns: 18px minmax(0, 1fr) auto auto auto; align-items: center; gap: 6px; font-size: 11.5px; cursor: pointer; }
  .xqRow:hover, .xqRow.active { border-color: var(--brand); background: var(--brand-soft); }
  .xqRow .price { color: var(--ink); font-weight: 800; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .xqRow .iconAct { display: inline-flex; align-items: center; justify-content: center; }
  .xqName { font-weight: 750; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .xqSpecCard { background: var(--bg-subtle); border: 1px solid var(--brand); border-radius: 8px; padding: 9px 10px; display: flex; flex-direction: column; gap: 7px; }
  .xqSpecGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
  .xqSpecCell { background: var(--bg-panel); border: 1px solid var(--line); border-radius: 6px; padding: 7px 8px; }
  .xqSpecCell span { display: block; font-size: 11px; color: var(--ink-muted); }
  .xqSpecCell b { display: block; font-size: 12px; font-weight: 800; color: var(--ink); margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* 5-Dimension Local Home-Buying Advisor & Optional BYOK AI */
  .adviceBox { background: var(--bg-panel); border: 1px solid var(--line-strong); border-radius: 9px; padding: 10px 11px; display: flex; flex-direction: column; gap: 8px; }
  .adviceHead { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; }
  .adviceTitle { font-size: 12.5px; font-weight: 800; color: var(--ink); }
  .adviceList { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--ink-secondary); line-height: 1.52; }
  .adviceList li b { color: var(--ink); }
  .aiForm { display: flex; flex-direction: column; gap: 7px; margin-top: 8px; }
  .aiInput { width: 100%; height: 32px; padding: 0 9px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--bg-subtle); font-size: 12px; }
  .aiGrid2 { display: grid; grid-template-columns: 1.3fr 1fr; gap: 6px; }
  .aiOutput { background: var(--bg-subtle); border: 1px solid var(--line); border-radius: 7px; padding: 9px 10px; font-size: 12px; line-height: 1.6; color: var(--ink); white-space: pre-wrap; max-height: 280px; overflow-y: auto; }

  /* Dual-Persona Mode Bar & Beginner 3-Step Matchmaker */
  .intentBar { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; padding: 5px; background: var(--bg-subtle); border: 1px solid var(--line); border-radius: 10px; align-items: center; }
  .intentBtn { border: 0; background: transparent; color: var(--ink-secondary); height: 32px; border-radius: 7px; font-size: 12.5px; font-weight: 800; cursor: pointer; transition: background 0.15s, color 0.15s; }
  .intentBtn:hover { color: var(--ink); }
  .intentBtn.active { background: var(--bg-panel); color: var(--brand-ink); box-shadow: 0 1px 3px rgba(15, 34, 45, 0.08); }
  .intentActionBtn { border: 1px solid var(--brand); background: var(--brand-soft); color: var(--brand-ink); height: 32px; padding: 0 12px; border-radius: 7px; font-size: 12.5px; font-weight: 800; cursor: pointer; white-space: nowrap; transition: background 0.15s, color 0.15s; }
  .intentActionBtn:hover, .intentActionBtn.active { background: var(--brand); color: #ffffff; }

  .mmBox { background: var(--bg-panel); border: 1px solid var(--brand); border-radius: 11px; padding: 11px 12px; display: flex; flex-direction: column; gap: 10px; }
  .mmHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .mmHead strong { display: block; font-size: 14px; font-weight: 800; color: var(--ink); }
  .mmSub { display: block; font-size: 12px; color: var(--ink-muted); margin-top: 2px; }
  .mmStep { display: flex; flex-direction: column; gap: 6px; }
  .mmStepLabel { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12.5px; font-weight: 750; color: var(--ink); }
  .mmStepLabel b { font-size: 12px; font-weight: 800; color: var(--brand-ink); }
  .mmWorkRow { display: grid; grid-template-columns: minmax(0, 1fr) 114px; gap: 6px; }
  .mmSelect { height: 32px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--bg-subtle); padding: 0 6px; font-size: 12px; font-weight: 700; color: var(--ink); }
  .mmSpotRow { display: flex; flex-wrap: wrap; gap: 5px; }
  .mmSpotChip { border: 1px solid var(--line); background: var(--bg-subtle); color: var(--ink-secondary); border-radius: 999px; height: 25px; padding: 0 9px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .mmSpotChip:hover, .mmSpotChip.active { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-ink); }
  .mmRange { width: 100%; accent-color: var(--brand); cursor: pointer; }
  .mmPillRow { display: flex; flex-wrap: wrap; gap: 5px; }
  .mmOptBtn { flex: 1 1 auto; border: 1px solid var(--line); background: var(--bg-subtle); color: var(--ink-secondary); height: 28px; padding: 0 8px; border-radius: 7px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .mmOptBtn:hover, .mmOptBtn.active { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-ink); font-weight: 800; }
  .mmSubmitBtn { border: 0; background: var(--brand); color: #ffffff; height: 35px; border-radius: 8px; font-size: 13px; font-weight: 800; cursor: pointer; transition: opacity 0.15s; }
  .mmSubmitBtn:hover { opacity: 0.92; }
  .mmSubmitBtn:disabled { opacity: 0.6; cursor: wait; }
  .mmResHead { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; font-weight: 800; color: var(--ink); padding-top: 6px; border-top: 1px solid var(--line); }
  .mmResHead small { font-size: 11.5px; font-weight: 600; color: var(--ink-muted); }
  .mmResList { display: flex; flex-direction: column; gap: 6px; max-height: 256px; overflow-y: auto; padding-right: 2px; }
  .mmResCard { border: 1px solid var(--line); background: var(--bg-subtle); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; cursor: pointer; transition: border-color 0.14s, background 0.14s; }
  .mmResCard:hover { border-color: var(--brand); background: var(--brand-soft); }
  .mmResTop { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 13px; }
  .mmResTop small { font-size: 11.5px; color: var(--ink-muted); font-weight: 600; margin-left: 4px; }
  .mmScoreBadge { background: var(--brand-soft); color: var(--brand-ink); border: 1px solid var(--brand); border-radius: 999px; padding: 2px 7px; font-size: 11px; font-weight: 800; white-space: nowrap; }
  .mmResMid { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 12px; }
  .mmResMid b { color: var(--ink); font-weight: 800; font-size: 13px; }
  .mmResMid span { color: var(--ink-secondary); font-size: 12px; }
  .mmResFoot { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; color: var(--ink-muted); }
  .mmGoTxt { color: var(--brand-ink); font-weight: 800; white-space: nowrap; }
  .mmEmpty { font-size: 12.5px; color: var(--ink-muted); padding: 8px; background: var(--bg-subtle); border-radius: 7px; }

  /* Breadcrumb, Legend Plain-Language Guide & Rent Layout Switcher */
  .navBreadcrumb { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; padding: 6px 10px; font-size: 12px; max-width: 380px; }
  .crumbBtn { border: 0; background: none; color: var(--brand-ink); font-size: 12px; font-weight: 750; padding: 1px 4px; border-radius: 4px; cursor: pointer; }
  .crumbBtn:hover { background: var(--brand-soft); }
  .crumbSep { color: var(--ink-muted); font-size: 12px; user-select: none; }
  .crumbCur { color: var(--ink); font-weight: 800; padding: 1px 2px; }
  .legendExplain { font-size: 12px; color: var(--ink-secondary); line-height: 1.45; margin: 2px 0 4px; }
  .rentLayoutBar { display: inline-flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .rentLayoutBtn { border: 1px solid var(--line); background: var(--bg-panel); color: var(--ink-secondary); height: 26px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 750; cursor: pointer; }
  .rentLayoutBtn:hover, .rentLayoutBtn.active { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-ink); font-weight: 800; }
  .popDivider { height: 1px; background: var(--line); margin: 4px 0; }
  .popActionsGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .popActionsGrid .toolBtn { width: 100%; justify-content: center; height: 31px; font-size: 12px; border: 1px solid var(--line); }
  .popLinksRow { display: flex; flex-direction: column; gap: 5px; }
  .popExtLink { display: flex; justify-content: space-between; align-items: center; padding: 6px 9px; border-radius: 7px; border: 1px solid var(--line); background: var(--bg-subtle); color: var(--ink-secondary); font-size: 12px; font-weight: 750; text-decoration: none; transition: border-color 0.14s, color 0.14s, background 0.14s; }
  .popExtLink:hover { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-ink); }

  /* Filter & Ranking Controls */
  .filterBlock { display: flex; flex-direction: column; gap: 8px; }
  .searchRow { display: grid; grid-template-columns: minmax(0, 1fr) 126px; gap: 7px; }
  .searchWrap { position: relative; display: flex; align-items: center; }
  .search { width: 100%; height: 36px; padding: 0 28px 0 11px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--bg-panel); font-size: 13px; }
  .search::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; display: none; }
  .searchClear { position: absolute; right: 6px; border: 0; background: none; color: var(--ink-muted); cursor: pointer; font-size: 15px; display: none; padding: 2px 5px; }
  .provSelect { height: 36px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--bg-panel); padding: 0 7px; font-size: 12.5px; font-weight: 700; }

  .subFilterRow { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; }
  .scopePills { display: inline-flex; background: var(--bg-subtle); padding: 2px; border-radius: 8px; border: 1px solid var(--line); }
  .scopePill { border: 0; background: transparent; color: var(--ink-secondary); height: 25px; padding: 0 9px; border-radius: 6px; font-size: 11.5px; font-weight: 700; cursor: pointer; }
  .scopePill.active { background: var(--bg-panel); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }

  .sortBar { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
  .sortBar button { border: 1px solid var(--line); background: var(--bg-panel); color: var(--ink-secondary); height: 29px; padding: 0 4px; border-radius: 7px; font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .sortBar button:hover { border-color: var(--line-strong); color: var(--ink); }
  .sortBar button.active { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-ink); font-weight: 800; }

  /* Ranking Rows */
  .listMeta { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: var(--ink-muted); }
  .rows { display: flex; flex-direction: column; gap: 3px; }
  .row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto auto auto auto; gap: 7px; align-items: center; padding: 7px 8px; border-radius: 8px; cursor: pointer; content-visibility: auto; contain-intrinsic-size: 36px; border: 1px solid transparent; }
  .row:hover { background: var(--bg-subtle); }
  .row.active { background: var(--brand-soft); border-color: var(--brand); }
  .rankNum { font-size: 11px; font-weight: 800; color: var(--ink-muted); text-align: right; }
  .rowName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 750; }
  .rowName small { color: var(--ink-muted); font-weight: 600; font-size: 11.5px; margin-right: 4px; }
  .row .price { color: var(--ink); font-weight: 800; font-size: 13px; white-space: nowrap; }
  .rowDelta { font-size: 12px; font-weight: 700; white-space: nowrap; min-width: 50px; text-align: right; }
  .up { color: var(--up); }
  .down { color: var(--down); }
  .levelBadge { border: 1px solid var(--line-strong); border-radius: 999px; color: var(--ink-secondary); font-size: 11px; font-weight: 750; line-height: 1; padding: 3px 6px; background: var(--bg-subtle); white-space: nowrap; }
  .levelBadge.inherited { border-color: #e4c17b; color: #785208; background: #fef7e0; }
  [data-theme="dark"] .levelBadge.inherited { border-color: #855c0a; color: #fcd34d; background: rgba(245, 158, 11, 0.15); }
  .levelBadge.district { border-color: #8cc9be; color: #0b5e52; background: #e8f8f5; }
  [data-theme="dark"] .levelBadge.district { border-color: #115e59; color: #5eead4; background: rgba(20, 184, 166, 0.14); }
  .levelBadge.supplement { border-color: #c3b2e6; color: #523580; background: #f3effc; }
  [data-theme="dark"] .levelBadge.supplement { border-color: #5b21b6; color: #c4b5fd; background: rgba(139, 92, 246, 0.15); }
  .rowBtns { display: inline-flex; gap: 3px; }
  .iconAct { border: 1px solid var(--line); background: var(--bg-panel); color: var(--ink-secondary); height: 24px; padding: 0 6px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; }
  .iconAct:hover { border-color: var(--brand); color: var(--brand-ink); }
  .iconAct.inCompare { background: var(--brand); color: #fff; border-color: var(--brand); }

  .authorCard { border: 1px solid var(--line-strong); background: var(--bg-subtle); border-radius: 11px; padding: 12px 13px; display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .authorHead { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--ink); }
  .authorTag { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 999px; background: var(--brand-soft); border: 1px solid var(--brand); color: var(--brand-ink); font-size: 11px; font-weight: 800; letter-spacing: 0.02em; }
  .authorDesc { margin: 0; font-size: 12px; color: var(--ink-secondary); line-height: 1.58; }
  .authorLinks { display: flex; flex-wrap: wrap; gap: 6px; }
  .authorLink { display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--line-strong); background: var(--bg-panel); color: var(--ink-secondary); font-size: 12px; font-weight: 750; text-decoration: none; white-space: nowrap; transition: border-color 0.14s, background 0.14s, color 0.14s; }
  .authorLink:hover { border-color: var(--brand); color: var(--brand-ink); }
  .authorLink.primary { border-color: var(--brand); background: var(--brand-soft); color: var(--brand-ink); font-weight: 800; }
  .authorLink.primary:hover { background: var(--brand); color: #ffffff; }
  [data-theme="dark"] .authorLink.primary:hover { color: #06131c; }

  .notes { border-top: 1px solid var(--line); padding-top: 12px; font-size: 12.5px; color: var(--ink-muted); line-height: 1.68; }

  /* Comparison Drawer */
  .compareDock { position: fixed; z-index: 15; left: 50%; bottom: 16px; transform: translateX(-50%); display: none; flex-direction: column; max-width: min(860px, calc(100vw - 24px)); width: max-content; }
  .compareDock.hasItems { display: flex; }
  .compareBar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; }
  .compareSheet { display: none; padding: 14px 16px; margin-bottom: 8px; width: min(840px, calc(100vw - 24px)); overflow-x: auto; }
  .compareSheet.open { display: block; }
  .cmpTable { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .cmpTable th, .cmpTable td { padding: 7px 10px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
  .cmpTable th { color: var(--ink-muted); font-weight: 700; width: 110px; }
  .cmpHeadCell { font-weight: 800; font-size: 13.5px; color: var(--ink); }

  /* Tooltip & Toast */
  .tooltip { position: fixed; z-index: 20; min-width: 210px; max-width: 290px; padding: 10px 12px; background: rgba(12, 25, 36, 0.95); color: #f1f7fb; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28); pointer-events: none; display: none; font-size: 12px; line-height: 1.5; }
  .tooltip strong { display: block; font-size: 14.5px; margin-bottom: 3px; color: #fff; }
  .tooltip .tipMain { font-size: 13.5px; font-weight: 800; color: #7dd3fc; margin-bottom: 3px; }
  .tooltip span { display: block; color: #cbdce7; }
  .toast { position: fixed; z-index: 30; top: 18px; left: 50%; transform: translateX(-50%) translateY(-16px); opacity: 0; pointer-events: none; background: #0f222d; color: #fff; padding: 8px 16px; border-radius: 999px; font-size: 12.5px; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,0.22); transition: opacity 0.2s, transform 0.2s; }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* Responsive Layout */
  @media (max-width: 1120px) {
    .app, body.sidebarCollapsed .app { height: auto; min-height: 100dvh; grid-template-columns: 1fr; overflow: visible; }
    .mapShell { height: 68dvh; min-height: 460px; }
    .side { height: auto; border-left: 0; border-top: 1px solid var(--line); opacity: 1 !important; pointer-events: auto !important; }
    .sideScroll { overflow: visible; }
    #toggleSidebar { display: none; }
  }
  @media (max-width: 1480px) {
    .brandMeta { display: none; }
  }
  @media (max-width: 760px) {
    .mapShell { height: 64dvh; min-height: 410px; }
    .hudTopStack { left: 8px; right: 8px; top: 8px; gap: 5px; }
    .hudTopBar { gap: 6px; }
    .hudSubStack { padding-right: 44px; gap: 5px; }
    .hudTopLeft { max-width: calc(100% - 48px); gap: 5px; }
    .brandBlock { padding: 6px 10px; gap: 6px; }
    .brandBlock h1 { font-size: 16px; }
    .brandMeta { display: none; }
    .brandGuideLink { height: 23px; padding: 0 7px; font-size: 11px; }
    .brandGuideLink svg { width: 12px; height: 12px; }
    .metricTabs { overflow-x: auto; max-width: 100%; flex-wrap: nowrap; }
    .metricTab { height: 27px; padding: 0 8px; font-size: 11.5px; }
    .presetBar { overflow-x: auto; max-width: 100%; flex-wrap: nowrap; padding-bottom: 2px; }
    .presetButton { height: 25px; padding: 0 8px; font-size: 11px; }
    .toolbar { flex-direction: column; padding: 3px; gap: 3px; }
    .toolBtn span.btnTxt, .toolSep, #exportPng { display: none; }
    .toolBtn { width: 34px; height: 34px; padding: 0; }
    .legend { left: 8px; bottom: 8px; padding: 7px 9px; max-width: calc(100% - 88px); }
    .swatches { grid-template-columns: repeat(8, minmax(22px, 1fr)); gap: 2px; }
    .swatchBtn { height: 12px; }
    .legendLabels { grid-template-columns: repeat(4, 1fr); gap: 2px; font-size: 11px; }
    .legendLabels span:nth-child(even):not(:last-child) { display: none; }
    .legendFoot, .legendHint { display: none; }
    .hudBottomRight { right: 8px; bottom: 8px; }
    .scsInset { width: 62px; height: 80px; }
    .scaleBadge { display: none; }
    .sortBar { grid-template-columns: repeat(3, 1fr); }
    .kpiStrip { grid-template-columns: repeat(2, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  }
</style>
</head>
<body>
<main class="app">
  <section class="mapShell" aria-label="全国房价交互地图">
    <div class="hudTopStack">
    <div class="hudTopBar">
    <div class="hudTopLeft">
      <div class="brandBlock hudCard">
        <h1>${esc(config.title)}</h1>
        <div class="brandMeta"><span class="liveDot"></span><span>${esc(config.updateLine)}</span></div>
        <a class="brandGuideLink" href="https://heroliss.github.io/liss-works/projects/china-house-price-map/" target="_blank" rel="noopener" title="查看四步上手演示、功能亮点与作者作品站 (Liss Works)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.4 2.4 0 1 1 3.5 2.1c-.7.4-1.1.8-1.1 1.7"/><circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none"/></svg><span>上手指南</span><i aria-hidden="true">↗</i></a>
      </div>
    </div>

    <div class="hudTopRight">
      <div class="toolbar hudCard">
        <button class="toolBtn" id="zoomIn" title="放大地图 (+)" aria-label="放大地图"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
        <button class="toolBtn" id="zoomOut" title="缩小地图 (-)" aria-label="缩小地图"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
        <button class="toolBtn" id="reset" title="回到初始全国视角 (R)" aria-label="重置视图"><svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg><span class="btnTxt">重置</span></button>
        <div class="toolSep"></div>
        <button class="toolBtn" id="toggleTiles" title="叠加高德真实道路与地铁生活底图" aria-label="真实底图"><svg viewBox="0 0 24 24"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg><span class="btnTxt">底图</span></button>
        <button class="toolBtn" id="toggleRadius" title="15/30/50km 都市通勤圈与跨区低价洼地测距" aria-label="通勤圈测距"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg><span class="btnTxt">通勤圈</span></button>
        <button class="toolBtn" id="toggleTimeline" title="近12个月房价动态回放时光机" aria-label="时光轴回放"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg><span class="btnTxt">时光轴</span></button>
        <button class="toolBtn" id="toggleBudget" title="按预算或置业模型在地图高亮筛选区域" aria-label="预算筛选"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 12 16.5 7.5"/><circle cx="12" cy="12" r="2"/></svg><span class="btnTxt">筛选</span></button>
        <button class="toolBtn" id="toggleDisplay" title="显示设置、标注开关与导出高清图片" aria-label="显示与导出"><svg viewBox="0 0 24 24"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="2" y1="14" x2="6" y2="14"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="16" x2="22" y2="16"/></svg><span class="btnTxt">更多</span></button>
        <button class="toolBtn" id="toggleTheme" title="切换深色/浅色主题" aria-label="切换主题"><svg id="themeIcon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>
        <button class="toolBtn" id="toggleSidebar" title="收起或展开右侧数据工作台" aria-label="收放侧栏"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>
      </div>

      <div id="displayPopover" class="popoverPanel hudCard">
        <div class="popRow"><label for="labelScale">标注字号</label><input id="labelScale" type="range" min="60" max="190" value="100"><span id="labelScaleValue">100%</span></div>
        <div class="popRow"><label for="overlayOpacity">色块不透明</label><input id="overlayOpacity" type="range" min="15" max="100" value="${config.overlayOpacity ?? 75}"><span id="overlayOpacityValue">${config.overlayOpacity ?? 75}%</span></div>
        <div class="popDivider"></div>
        <div class="popActionsGrid">
          <button class="toolBtn active" id="toggleLabels" title="显示或隐藏地图文字标注" aria-label="切换标注">标注显示</button>
          <button class="toolBtn active" id="toggleFineMode" title="放大时自动展开区县、街道与小区" aria-label="自动下钻细化">街道细化</button>
          <button class="toolBtn" id="exportPng" title="导出当前地图高清PNG图片" aria-label="导出高清图">导出图片</button>
        </div>
        <div class="popDivider"></div>
        <div class="popLinksRow">
          <a class="popExtLink" href="https://heroliss.github.io/liss-works/projects/china-house-price-map/" target="_blank" rel="noopener"><span>四步上手指南与项目介绍</span><span>↗</span></a>
          <a class="popExtLink" href="https://heroliss.github.io/liss-works/" target="_blank" rel="noopener"><span>作者个人作品站 · Liss Works</span><span>↗</span></a>
        </div>
      </div>

      <div id="budgetPopover" class="budgetPanel hudCard">
        <div class="budgetHead"><span>智能选房与预算雷达</span><button id="clearBudget" class="linkBtn" type="button">重置筛选</button></div>
        <div class="modeSwitch" role="tablist">
          <button type="button" class="modeSwitchBtn active" id="tabModeBudget">按总价预算</button>
          <button type="button" class="modeSwitchBtn" id="tabModeSmart">按置业模型</button>
        </div>
        <div id="budgetPane" style="display:flex;flex-direction:column;gap:9px">
          <div class="popRow"><label for="budgetTotal">购房总预算</label><input id="budgetTotal" type="range" min="40" max="1200" step="10" value="180"><span id="budgetTotalVal">180万</span></div>
          <div class="popRow"><label for="budgetArea">目标面积</label><input id="budgetArea" type="range" min="50" max="180" step="5" value="90"><span id="budgetAreaVal">90㎡</span></div>
        </div>
        <div id="smartPane" style="display:none;flex-direction:column;gap:8px">
          <div class="profileGrid">
            <button type="button" class="profileBtn" data-profile="afford">刚需友好<small>低收入比优先</small></button>
            <button type="button" class="profileBtn" data-profile="yield">高租售比<small>现金流回报</small></button>
            <button type="button" class="profileBtn" data-profile="value">超跌寻优<small>深回撤+安全垫</small></button>
          </div>
        </div>
        <div id="budgetSummary" class="budgetSummary">开启后将在地图高亮符合预算或高分置业区域，并在右侧排行优先展示。</div>
      </div>

      <div id="radiusPopover" class="radiusPanel hudCard">
        <div class="budgetHead"><span id="radiusTitleSpan">都市通勤圈 · 任意点测距</span><button id="closeRadius" class="linkBtn" type="button">关闭</button></div>
        <div class="poiSearchRow">
          <input id="commutePoiInput" class="aiInput" type="text" placeholder="搜写字楼/地铁站/地名设圆心 (如 深圳湾科技生态园)">
          <button id="commutePoiBtn" type="button" class="miniBtn active">设圆心</button>
        </div>
        <div id="commutePoiCandidates" class="poiCandList" style="display:none"></div>
        <div class="commuteActionRow">
          <button type="button" id="toggleFreeClickBtn" class="miniBtn active" title="开启后点击地图任意位置即可设为圆心，也可直接拖拽地图上的起点图钉">点图自由设圆心: 开</button>
          <button type="button" id="commuteMyLocBtn" class="miniBtn" title="获取当前定位设为通勤圆心">定位当前处</button>
        </div>
        <div class="ringModeBar" role="group" aria-label="通勤圈半径档位">
          <button type="button" class="ringModeBtn active" data-rmode="auto" title="随地图放大自动缩小通勤圈半径">自动</button>
          <button type="button" class="ringModeBtn" data-rmode="micro">1/2/3km</button>
          <button type="button" class="ringModeBtn" data-rmode="street">2/5/10km</button>
          <button type="button" class="ringModeBtn" data-rmode="urban">5/10/20km</button>
          <button type="button" class="ringModeBtn" data-rmode="metro">15/30/50km</button>
        </div>
        <div id="radiusAnchorInfo" class="budgetSummary">可直接点击地图任意位置、拖拽地图起点图钉或输入大厦名称设为圆心；放大地图自动切换至 1–10km 精细圈。</div>
        <div id="radiusRingStats" class="ringStatGrid"></div>
        <div id="radiusArbitrage" class="arbList"></div>
      </div>
    </div>
    </div>
    <div class="hudSubStack">
      <div class="metricTabs hudCard" role="tablist" aria-label="地图指标切换">
        <button class="metricTab active" role="tab" aria-selected="true" data-metric="resale" title="各地二手商品住宅挂牌参考均价">二手挂牌</button>
        <button class="metricTab" role="tab" aria-selected="false" data-metric="newPrice" title="各地在售新建住宅参考均价">新房均价</button>
        <button class="metricTab" role="tab" aria-selected="false" data-metric="estRent" title="按所选租住户型估算整月房租（元/月）">月租参考</button>
        <button class="metricTab" role="tab" aria-selected="false" data-metric="yoy" title="与去年同期相比的房价涨跌幅">同比涨跌</button>
        <button class="metricTab" role="tab" aria-selected="false" data-metric="rentYield" title="年租金除以房价的现金流回报率">租金回报</button>
        <button class="metricTab" role="tab" aria-selected="false" data-metric="priceToIncome" title="当地普通家庭买一套90㎡住宅所需年数">房价收入比</button>
        <button class="metricTab" role="tab" aria-selected="false" data-metric="drawdown" title="当前房价相比近十年最高点的回调幅度">峰值回撤</button>
        <button class="metricTab" role="tab" aria-selected="false" data-metric="spread" title="新房相比同区二手房的倒挂或溢价幅度">一二手价差</button>
      </div>
      ${config.showPresetButtons === false ? "" : `<div class="presetBar" aria-label="重点城市群快速定位">${(config.viewPresets || []).map(preset => `<button class="presetButton" data-preset="${esc(preset.id)}">${esc(preset.shortLabel || preset.label)}</button>`).join("")}</div>`}
    </div>
    </div>

    <svg id="map" viewBox="${mapViewBox.x.toFixed(1)} ${mapViewBox.y.toFixed(1)} ${mapViewBox.w.toFixed(1)} ${mapViewBox.h.toFixed(1)}" preserveAspectRatio="xMidYMid meet">
      <g id="viewport">
        <g id="tileLayerA" class="tileBuffer active"></g>
        <g id="tileLayerB" class="tileBuffer"></g>
        <g id="priceOverlay">
          <g id="regionLayer">${svgRegions.map(r => `<path id="${r.id}" class="${regionClasses(r)}" data-prov="${esc(r.province)}" fill-rule="evenodd" d="${r.d}" fill="${r.fill}"></path>`).join("")}</g>
          <g id="detailLayer"></g>
        </g>
        <g id="cityBoundaries">${cityBoundaries.map(r => `<path id="${r.id}" class="cityBoundary" d="${r.d}"></path>`).join("")}</g>
        <g id="detailBoundaries"></g>
        <g id="commuteRingLayer"></g>
        <g id="highlightLayer">
          <path id="selectedPulse" class="highlightPath"></path>
          <path id="selectedHighlight" class="highlightPath"></path>
          <path id="hoverHighlight" class="highlightPath"></path>
        </g>
        <g id="cityLabels">${cityLabels.map(item => `<text class="cityLabel" x="${item.x}" y="${item.y}" text-anchor="middle">${esc(item.label)}</text>`).join("")}</g>
        <g id="detailLabels">${svgRegions.filter(r => r.price).map(r => `<text class="detailLabel" data-id="${r.id}" x="${r.cx}" y="${r.cy}" data-min-scale="${r.labelMinScale}" text-anchor="middle">${detailLabelText(r)}</text>`).join("")}</g>
        <g id="dynamicLabels"></g>
        <g id="streetPlateLayer"></g>
        <g id="communityPinLayer"></g>
        <g id="commuteOriginLayer"></g>
      </g>
    </svg>

    <div class="legend hudCard">
      <div class="legendHead">
        <span id="legendTitle" class="legendTitle">二手住宅挂牌均价（万/㎡）</span>
        <span class="legendHint"><span id="legendFilterTip">点击色块筛选区间</span><button id="clearBinFilter" class="linkBtn" style="display:none" type="button">重置区间</button></span>
      </div>
      <div id="legendExplain" class="legendExplain">颜色越暖代表二手房价越高；滚动滚轮放大地图会自动展开区县、街道与代表小区。</div>
      <div id="legendDistBar" class="legendDistBar" title="当前各色阶样本占比分布"></div>
      <div id="swatches" class="swatches">${colors.map((c, i) => `<button type="button" class="swatchBtn" data-bin="${i}" style="background:${c}" aria-label="筛选区间 ${legendLabel(i, breaks, colors)}"></button>`).join("")}</div>
      <div id="legendLabels" class="legendLabels">${colors.map((_, i) => `<span>${legendLabel(i, breaks, colors)}</span>`).join("")}</div>
      <div class="legendFoot">
        <span>实线：城市/区县实测</span>
        <span><i class="dashSample"></i>虚线：区县沿用市均底色</span>
      </div>
    </div>

    <div class="hudBottomRight">
      <div id="scsInset" class="scsInset hudCard" title="点击定位南海诸岛 / 再次点击返回全国">
        <svg viewBox="${scsViewBox}" preserveAspectRatio="xMidYMid meet">
          ${scsOutlines.map(o => `<path d="${o.d}"></path>`).join("")}
        </svg>
        <span class="scsLabel">南海诸岛</span>
      </div>
      <nav id="navBreadcrumb" class="navBreadcrumb hudCard" aria-label="地图层级返回导航"><span class="crumbCur">全国总览</span></nav>
      <div id="scaleBadge" class="scaleBadge hudCard">城市级视图 · 放大自动加载区县</div>
      <div class="tileAttribution hudCard">底图 © 高德地图</div>
    </div>

    <div id="timelineDock" class="timelineDock hudCard" aria-label="近12个月房价时光机">
      <button type="button" id="tlPlayBtn" class="tlPlayBtn" title="自动播放或暂停月度演变" aria-label="播放"><svg id="tlPlayIcon" viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"/></svg></button>
      <span id="tlMonthLabel" class="tlMonth num">2026-10</span>
      <input id="tlSlider" class="tlSlider" type="range" min="0" max="11" step="1" value="11" aria-label="选择历史月份">
      <button type="button" id="tlModeBtn" class="miniBtn" title="切换显示当月绝对均价或较首月累计涨跌幅">当月均价</button>
      <button type="button" id="tlCloseBtn" class="linkBtn" title="退出时光轴回放">退出</button>
    </div>
  </section>

  <aside class="side" aria-label="区域房价与租房决策工作台">
    <div class="sideScroll">
      <div class="intentBar" role="tablist" aria-label="买房或租房模式切换">
        <button type="button" class="intentBtn active" role="tab" aria-selected="true" data-intent="buy">买房置业</button>
        <button type="button" class="intentBtn" role="tab" aria-selected="false" data-intent="rent">租房安居</button>
        <button type="button" class="intentActionBtn" id="openMatchmakerBtn" title="填写预算与上班地点，自动筛选最适合您的片区">帮我找房</button>
      </div>
      <div id="matchmakerMount"></div>

      <div class="kpiWrap">
        <div class="kpiHeadRow">
          <span id="kpiScopeTitle">全国城市基准统计</span>
          <button type="button" id="toggleKpiViewport" class="linkBtn" title="切换随地图视野实时联动或锁定全国总览">视野联动: 开</button>
        </div>
        <div class="kpiStrip" id="kpiStrip">
          <div class="kpiItem"><div class="kpiLabel">中位单价</div><div class="kpiVal" id="kpiMedian">--</div></div>
          <div class="kpiItem"><div class="kpiLabel">中位租金回报</div><div class="kpiVal" id="kpiYield">--</div></div>
          <div class="kpiItem"><div class="kpiLabel">中位收入比</div><div class="kpiVal" id="kpiPti">--</div></div>
          <div class="kpiItem"><div class="kpiLabel">统计样本</div><div class="kpiVal" id="kpiCount">--</div></div>
        </div>
      </div>

      <div id="selected" class="dossier"></div>

      <div class="filterBlock">
        <div class="searchRow">
          <div class="searchWrap">
            <input id="search" class="search" type="search" placeholder="搜索省、市、区县或街道商圈 (如 后海 / 陆家嘴 / 珠江新城)" aria-label="搜索城市、区县或街道商圈">
            <button id="searchClear" class="searchClear" type="button" aria-label="清空搜索">×</button>
          </div>
          <select id="provFilter" class="provSelect" aria-label="按省份筛选"><option value="">全部省份</option></select>
        </div>
        <div class="subFilterRow">
          <div class="scopePills" role="group" aria-label="层级筛选">
            <button type="button" class="scopePill active" data-scope="all">全部层级</button>
            <button type="button" class="scopePill" data-scope="city">仅看城市</button>
            <button type="button" class="scopePill" data-scope="district">独立区县</button>
            <button type="button" class="scopePill" data-scope="fav" id="favScopeBtn">已收藏</button>
          </div>
          <button type="button" id="exportCsv" class="miniBtn" title="导出当前筛选列表为CSV表格">导出 CSV</button>
        </div>
        <div class="sortBar">
          <button type="button" data-sort="metricDesc" class="active">数值高</button>
          <button type="button" data-sort="metricAsc">数值低</button>
          <button type="button" data-sort="chgDesc">涨幅高</button>
          <button type="button" data-sort="chgAsc">跌幅大</button>
          <button type="button" data-sort="yieldDesc">回报高</button>
          <button type="button" data-sort="ptiAsc">收入比低</button>
        </div>
        <div class="listMeta"><span id="listSummary">正在加载样本...</span><span>点击行查看详情 · 定位飞往</span></div>
      </div>

      <div id="rows" class="rows"></div>
      <div class="authorCard">
        <div class="authorHead"><span class="authorTag">Liss Works</span><strong>关于本图与快速上手</strong></div>
        <p class="authorDesc">由 Liss 独立设计与开发。初次使用可先看四步交互演示与找房教学，也欢迎访问我的个人作品站查看更多工具与作品。</p>
        <div class="authorLinks">
          <a class="authorLink primary" href="https://heroliss.github.io/liss-works/projects/china-house-price-map/" target="_blank" rel="noopener">四步上手指南 ↗</a>
          <a class="authorLink" href="https://heroliss.github.io/liss-works/" target="_blank" rel="noopener">更多作品 · Liss Works ↗</a>
          <a class="authorLink" href="https://github.com/heroliss/china-house-price-map" target="_blank" rel="noopener">GitHub 源码 ↗</a>
        </div>
      </div>
      <div class="notes">${config.notesHtml || ""}</div>
    </div>
  </aside>
</main>

<div id="compareDock" class="compareDock">
  <div id="compareSheet" class="compareSheet hudCard"></div>
  <div class="compareBar hudCard">
    <strong id="compareCount">对比篮 (0/4)</strong>
    <button type="button" id="toggleCompareSheet" class="miniBtn active">展开PK对比</button>
    <button type="button" id="clearCompare" class="linkBtn">清空</button>
  </div>
</div>

<div id="tooltip" class="tooltip"></div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>

<script>
const regions = ${JSON.stringify(clientRegions)};
const viewPresets = ${JSON.stringify(config.viewPresets || [])};
const detailSources = ${JSON.stringify(config.detailSources || [])};
const trendsUrl = ${JSON.stringify(trendsUrl)};
const streetPlatesUrl = ${JSON.stringify(streetPlatesUrl)};
const initialCenter = ${JSON.stringify(initialCenter)};
const initialScale = ${Number(initialScale)};
const projection = ${JSON.stringify({ minX: projection.minX, minY: projection.minY, maxX: projection.maxX, maxY: projection.maxY, scale: projection.scale, ox: projection.ox, oy: projection.oy })};
const mapBounds = ${JSON.stringify(projection.projectedMapBounds)};
const minScale = 0.72, maxScale = ${Number(config.maxScale || 2400)}, maxDetailLoadsPerPass = ${Number(config.maxDetailLoadsPerPass || 4)};

${fs.readFileSync(path.join(__dirname, "client_xiaoqu_advisor.js"), "utf8")}
${fs.readFileSync(path.join(__dirname, "client_matchmaker_ux.js"), "utf8")}
${fs.readFileSync(path.join(__dirname, "client_map_app.js"), "utf8")}
</script>
</body>
</html>`;
}

module.exports = {
  createInteractiveMap,
  readGeoFeatures,
  formatBeijingTime,
  buildProjection,
  bestLabelPoint,
  cleanName,
  colorFor,
  pathBounds,
  mergeBounds,
  geomToSimplifiedPath,
};
