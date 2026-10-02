/**
 * 수도권 83개 구·시·군 정복률 계산기 및 통계 분석 모듈
 */

import type { CollectionEntry } from 'astro:content';

export interface ConqueredDistrictData {
  id: string;
  sido: '서울특별시' | '경기도' | '인천광역시';
  sigungu: string;
  name: string;
  parentCity: string | null;
  center: [number, number]; // [lat, lng]
  places: CollectionEntry<'places'>[];
  walkCount: number;
  latestVisitDate: string | null;
  isRecentlyConquered: boolean;
}

export interface ConquestStats {
  totalDistricts: number;
  conqueredCount: number;
  conquestRate: number; // 0 ~ 100 (%)
  
  // 시·도별 정복 현황
  sidoStats: {
    seoul: { total: number; conquered: number; rate: number };
    gyeonggi: { total: number; conquered: number; rate: number };
    incheon: { total: number; conquered: number; rate: number };
  };

  // 경기도 31개 시·군 단위 정복 현황
  gyeonggiCityStats: {
    totalCities: number;
    conqueredCities: number;
    rate: number;
    cities: { name: string; isConquered: boolean; districtsCount: number; conqueredCount: number }[];
  };

  // 최근 새로 정복한 지역
  mostRecentDistrict: ConqueredDistrictData | null;

  // 전체 83개 구역 리스트 (정복 여부 플래그 포함)
  districtsList: {
    id: string;
    sido: '서울특별시' | '경기도' | '인천광역시';
    sigungu: string;
    name: string;
    parentCity: string | null;
    center: [number, number];
    isConquered: boolean;
    conqueredData: ConqueredDistrictData | null;
  }[];
}

// 경기도 31개 시·군 목록
export const GYEONGGI_31_CITIES = [
  '수원시', '성남시', '고양시', '용인시', '부천시', '안산시', '안양시', '남양주시',
  '화성시', '평택시', '의정부시', '시흥시', '파주시', '김포시', '광명시', '광주시',
  '군포시', '이천시', '오산시', '하남시', '양주시', '구리시', '안성시', '포천시',
  '의왕시', '여주시', '동두천시', '과천시', '가평군', '양평군', '연천군'
];

/**
 * GeoJSON 피처들과 장소/산책 데이터를 기반으로 정복 통계 산출
 */
export function calculateConquestStats(
  geoJson: { features: any[] },
  places: CollectionEntry<'places'>[],
  walks: CollectionEntry<'walks'>[]
): ConquestStats {
  const totalDistricts = geoJson.features.length;

  // 1. 장소별 소속 산책 및 최신 방문일 매핑
  const placeWalkMap = new Map<string, { walks: CollectionEntry<'walks'>[]; latestDate: string | null }>();
  for (const place of places) {
    const relatedWalks = walks
      .filter((w) => w.data.places.some((p) => p.id === place.id))
      .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());
    
    placeWalkMap.set(place.id, {
      walks: relatedWalks,
      latestDate: relatedWalks.length > 0 ? relatedWalks[0].data.date : null,
    });
  }

  // 2. 구역별 방문 장소 집계 (key: sigungu)
  const districtVisitMap = new Map<string, {
    places: CollectionEntry<'places'>[];
    walkCount: number;
    latestDate: string | null;
  }>();

  for (const place of places) {
    const sigungu = place.data.sigungu;
    const walkInfo = placeWalkMap.get(place.id) || { walks: [], latestDate: null };

    if (!districtVisitMap.has(sigungu)) {
      districtVisitMap.set(sigungu, {
        places: [],
        walkCount: 0,
        latestDate: null,
      });
    }

    const entry = districtVisitMap.get(sigungu)!;
    entry.places.push(place);
    entry.walkCount += walkInfo.walks.length;

    if (walkInfo.latestDate) {
      if (!entry.latestDate || new Date(walkInfo.latestDate) > new Date(entry.latestDate)) {
        entry.latestDate = walkInfo.latestDate;
      }
    }
  }

  // 3. 전체 구역 리스트 구성 및 정복 여부 판정
  let seoulTotal = 0, seoulConquered = 0;
  let gyeonggiTotal = 0, gyeonggiConquered = 0;
  let incheonTotal = 0, incheonConquered = 0;

  const districtsList = geoJson.features.map((feature) => {
    const { sido, sigungu, name, parentCity, center } = feature.properties;
    const isVisited = districtVisitMap.has(sigungu);
    const visitInfo = districtVisitMap.get(sigungu);

    // 시도별 카운팅
    if (sido === '서울특별시') {
      seoulTotal++;
      if (isVisited) seoulConquered++;
    } else if (sido === '경기도') {
      gyeonggiTotal++;
      if (isVisited) gyeonggiConquered++;
    } else if (sido === '인천광역시') {
      incheonTotal++;
      if (isVisited) incheonConquered++;
    }

    let conqueredData: ConqueredDistrictData | null = null;
    if (isVisited && visitInfo) {
      conqueredData = {
        id: feature.properties.id || sigungu,
        sido,
        sigungu,
        name,
        parentCity: parentCity || null,
        center: center || [37.5665, 126.9780],
        places: visitInfo.places,
        walkCount: visitInfo.walkCount,
        latestVisitDate: visitInfo.latestDate,
        isRecentlyConquered: false, // 아래에서 산출
      };
    }

    return {
      id: feature.properties.id || sigungu,
      sido: sido as '서울특별시' | '경기도' | '인천광역시',
      sigungu,
      name,
      parentCity: parentCity || null,
      center: (center || [37.5665, 126.9780]) as [number, number],
      isConquered: isVisited,
      conqueredData,
    };
  });

  const conqueredDistricts = districtsList
    .filter((d) => d.isConquered && d.conqueredData)
    .map((d) => d.conqueredData!);

  // 가장 최근에 방문/정복한 구역 식별
  conqueredDistricts.sort((a, b) => {
    const timeA = a.latestVisitDate ? new Date(a.latestVisitDate).getTime() : 0;
    const timeB = b.latestVisitDate ? new Date(b.latestVisitDate).getTime() : 0;
    return timeB - timeA;
  });

  const mostRecentDistrict = conqueredDistricts.length > 0 ? conqueredDistricts[0] : null;
  if (mostRecentDistrict) {
    mostRecentDistrict.isRecentlyConquered = true;
  }

  // 4. 경기도 31개 시·군 단위 정복률 계산
  const ggCityStats = GYEONGGI_31_CITIES.map((cityName) => {
    // 해당 시·군에 속하는 83개 구역들
    const cityDistricts = districtsList.filter(
      (d) => d.sido === '경기도' && (d.parentCity === cityName || d.sigungu === cityName)
    );
    const conqueredInCity = cityDistricts.filter((d) => d.isConquered).length;

    return {
      name: cityName,
      isConquered: conqueredInCity > 0,
      districtsCount: cityDistricts.length,
      conqueredCount: conqueredInCity,
    };
  });

  const conqueredGgCitiesCount = ggCityStats.filter((c) => c.isConquered).length;
  const totalConquered = conqueredDistricts.length;

  return {
    totalDistricts,
    conqueredCount: totalConquered,
    conquestRate: totalDistricts > 0 ? Math.round((totalConquered / totalDistricts) * 100) : 0,
    sidoStats: {
      seoul: {
        total: seoulTotal,
        conquered: seoulConquered,
        rate: seoulTotal > 0 ? Math.round((seoulConquered / seoulTotal) * 100) : 0,
      },
      gyeonggi: {
        total: gyeonggiTotal,
        conquered: gyeonggiConquered,
        rate: gyeonggiTotal > 0 ? Math.round((gyeonggiConquered / gyeonggiTotal) * 100) : 0,
      },
      incheon: {
        total: incheonTotal,
        conquered: incheonConquered,
        rate: incheonTotal > 0 ? Math.round((incheonConquered / incheonTotal) * 100) : 0,
      },
    },
    gyeonggiCityStats: {
      totalCities: GYEONGGI_31_CITIES.length,
      conqueredCities: conqueredGgCitiesCount,
      rate: Math.round((conqueredGgCitiesCount / GYEONGGI_31_CITIES.length) * 100),
      cities: ggCityStats,
    },
    mostRecentDistrict,
    districtsList,
  };
}
