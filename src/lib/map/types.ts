/**
 * 지도 독립적 공통 데이터 타입 정의
 * 추후 다른 지도 엔진(Leaflet, Naver, Mapbox 등)으로 교체 시에도
 * UI 컴포넌트와 비즈니스 로직은 본 타입을 사용합니다.
 */

export interface WalkSummary {
  id: string;
  title: string;
  date: string;
}

export interface MapPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sido: string;
  sigungu: string;
  type: string;
  facilities?: string[];
  tips?: string;
  hidden?: boolean;
  walks?: WalkSummary[];
}

export interface CourseStop {
  order: number;
  place: MapPlace;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}
