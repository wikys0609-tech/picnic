/**
 * TypeScript wrapper for Point-in-Polygon (PIP) engine
 */
import {
  isPointInRing as _isPointInRing,
  isPointInPolygonCoords as _isPointInPolygonCoords,
  isPointInMultiPolygonCoords as _isPointInMultiPolygonCoords,
  getFeatureBBox as _getFeatureBBox,
  findDistrictByCoords as _findDistrictByCoords,
} from './pip-core.mjs';

export interface DistrictMatch {
  id: string;
  sido: string;
  sigungu: string;
  name: string;
  parentCity: string | null;
  isConquestTarget: true;
}

export function isPointInRing(point: [number, number], ring: [number, number][]): boolean {
  return _isPointInRing(point, ring);
}

export function isPointInPolygonCoords(point: [number, number], rings: [number, number][][]): boolean {
  return _isPointInPolygonCoords(point, rings);
}

export function isPointInMultiPolygonCoords(
  point: [number, number],
  multiPoly: [number, number][][][]
): boolean {
  return _isPointInMultiPolygonCoords(point, multiPoly);
}

export function getFeatureBBox(feature: any): [number, number, number, number] {
  return _getFeatureBBox(feature);
}

export function findDistrictByCoords(
  coords: { lat: number; lng: number },
  geoJson: any
): DistrictMatch | null {
  return _findDistrictByCoords(coords, geoJson) as DistrictMatch | null;
}
