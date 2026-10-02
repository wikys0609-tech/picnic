/**
 * Point-in-Polygon (PIP) Core Engine
 * 
 * 경위도 좌표(lng, lat)가 수도권 83개 구·시·군 GeoJSON의 어느 폴리곤에
 * 속하는지 Ray-Casting 알고리즘과 Bounding Box 1차 필터링을 통해 고속 판정합니다.
 * 순수 JavaScript로 구현되어 브라우저 클라이언트와 Node.js 스크립트 양쪽에서 모두 동작합니다.
 */

/**
 * 2D 점 [lng, lat]이 다각형 링(Ring) 내부에 있는지 판정하는 Ray-Casting 알고리즘
 * @param {[number, number]} point [lng, lat]
 * @param {Array<[number, number]>} ring [[lng, lat], ...]
 * @returns {boolean}
 */
export function isPointInRing(point, ring) {
  const x = point[0]; // lng
  const y = point[1]; // lat
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * 단일 Polygon 내부 판정 (외곽 링 포함 & 홀(내부 구멍) 제외)
 * @param {[number, number]} point [lng, lat]
 * @param {Array<Array<[number, number]>>} rings [outerRing, hole1, hole2, ...]
 * @returns {boolean}
 */
export function isPointInPolygonCoords(point, rings) {
  if (!rings || rings.length === 0) return false;
  // 1. 외곽 링(outer ring) 내부에 있어야 함
  if (!isPointInRing(point, rings[0])) return false;
  // 2. 내부 구멍(holes) 안에 있으면 제외
  for (let h = 1; h < rings.length; h++) {
    if (isPointInRing(point, rings[h])) return false;
  }
  return true;
}

/**
 * MultiPolygon 내부 판정 (하나라도 속하면 true)
 * @param {[number, number]} point [lng, lat]
 * @param {Array<Array<Array<[number, number]>>>} multiPoly
 * @returns {boolean}
 */
export function isPointInMultiPolygonCoords(point, multiPoly) {
  if (!multiPoly || multiPoly.length === 0) return false;
  for (const rings of multiPoly) {
    if (isPointInPolygonCoords(point, rings)) return true;
  }
  return false;
}

/**
 * Feature의 Bounding Box 계산 또는 캐시 활용
 * @param {any} feature 
 * @returns {[number, number, number, number]} [minLng, minLat, maxLng, maxLat]
 */
export function getFeatureBBox(feature) {
  if (feature._bbox) return feature._bbox;

  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  function updateBounds(ring) {
    for (const pt of ring) {
      if (pt[0] < minLng) minLng = pt[0];
      if (pt[0] > maxLng) maxLng = pt[0];
      if (pt[1] < minLat) minLat = pt[1];
      if (pt[1] > maxLat) maxLat = pt[1];
    }
  }

  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    if (geom.coordinates[0]) updateBounds(geom.coordinates[0]);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (poly[0]) updateBounds(poly[0]);
    }
  }

  feature._bbox = [minLng, minLat, maxLng, maxLat];
  return feature._bbox;
}

/**
 * 좌표({ lat, lng })로 수도권 83개 구역 중 해당하는 행정구역 피처 탐색
 * @param {{ lat: number; lng: number }} coords 
 * @param {any} geoJson FeatureCollection
 * @returns {{ id: string; sido: string; sigungu: string; name: string; parentCity: string | null; isConquestTarget: true } | null}
 */
export function findDistrictByCoords(coords, geoJson) {
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
    return null;
  }
  if (!geoJson || !Array.isArray(geoJson.features)) {
    return null;
  }

  const lng = coords.lng;
  const lat = coords.lat;
  const pt = [lng, lat];

  for (const feature of geoJson.features) {
    const bbox = getFeatureBBox(feature);
    // Bounding Box 1차 고속 필터링 (불일치 시 즉시 건너뜀)
    if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) {
      continue;
    }

    const geom = feature.geometry;
    let matched = false;

    if (geom.type === 'Polygon') {
      matched = isPointInPolygonCoords(pt, geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      matched = isPointInMultiPolygonCoords(pt, geom.coordinates);
    }

    if (matched) {
      const props = feature.properties || {};
      return {
        id: props.id || `${props.sido}_${props.sigungu}`,
        sido: props.sido,
        sigungu: props.sigungu,
        name: props.name || props.sigungu,
        parentCity: props.parentCity || null,
        isConquestTarget: true,
      };
    }
  }

  return null;
}
