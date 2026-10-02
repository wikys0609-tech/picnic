/**
 * 수도권 83개 시·군·구 행정구역 체계 및 좌표/주소 정규화 유틸리티
 * 
 * 체계 기준:
 * - 서울특별시: 25개 자치구
 * - 인천광역시 (2026-07-01 행정체제 개편 반영): 11개 (제물포구, 영종구, 미추홀구, 연수구, 남동구, 부평구, 계양구, 서구, 검단구, 강화군, 옹진군)
 * - 경기도: 47개 (일반구 24개 + 구가 없는 시·군 23개)
 *   * 부천시 3개 일반구 (원미구, 소사구, 오정구)
 *   * 화성시 4개 일반구 (만세구, 효행구, 병점구, 동탄구)
 *   * 수원(4), 성남(3), 안양(2), 안산(2), 고양(3), 용인(3)
 */

export interface DistrictInfo {
  sido: '서울특별시' | '경기도' | '인천광역시';
  sigungu: string;
  name: string; // 표시용 전체 이름 (예: "수원시 영통구")
}

export const SEOUL_DISTRICTS: string[] = [
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
  '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
  '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
];

export const INCHEON_DISTRICTS_2026: string[] = [
  '제물포구', '영종구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '검단구',
  '강화군', '옹진군'
];

export const GYEONGGI_DISTRICTS: string[] = [
  // 일반구 보유 시 (24개)
  '수원시 장안구', '수원시 권선구', '수원시 팔달구', '수원시 영통구',
  '성남시 수정구', '성남시 중원구', '성남시 분당구',
  '안양시 만안구', '안양시 동안구',
  '안산시 상록구', '안산시 단원구',
  '고양시 덕양구', '고양시 일산동구', '고양시 일산서구',
  '용인시 처인구', '용인시 기흥구', '용인시 수지구',
  '부천시 원미구', '부천시 소사구', '부천시 오정구',
  '화성시 만세구', '화성시 효행구', '화성시 병점구', '화성시 동탄구',
  // 일반구 없는 시·군 (23개)
  '의정부시', '광명시', '평택시', '동두천시', '과천시', '구리시', '남양주시', '오산시',
  '시흥시', '군포시', '의왕시', '하남시', '파주시', '이천시', '안성시', '김포시',
  '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군'
];

export const ALL_83_DISTRICTS: DistrictInfo[] = [
  ...SEOUL_DISTRICTS.map(d => ({ sido: '서울특별시' as const, sigungu: d, name: d })),
  ...INCHEON_DISTRICTS_2026.map(d => ({ sido: '인천광역시' as const, sigungu: d, name: d })),
  ...GYEONGGI_DISTRICTS.map(d => ({ sido: '경기도' as const, sigungu: d, name: d })),
];

// 인천 2026-07-01 개편 동 매핑 테이블
// 영종구 대상 법정동/행정동 키워드
const INCHEON_YEONGJONG_KEYWORDS = [
  '영종', '운서', '운남', '운북', '중산', '을왕', '남북', '덕교', '무의', '용유'
];

// 검단구 대상 법정동/행정동 키워드
const INCHEON_GEOMDAN_KEYWORDS = [
  '검단', '원당', '당하', '마전', '불로', '오류', '왕길', '대곡', '금곡'
];

// 부천시 일반구 동 매핑
const BUCHEON_DISTRICT_MAP: Record<string, string[]> = {
  '부천시 원미구': ['심곡', '원미', '소사동', '역곡', '춘의', '도당', '약대', '중동', '상동'],
  '부천시 소사구': ['소사본', '심곡본', '범박', '괴안', '송내', '옥길', '계수'],
  '부천시 오정구': ['오정', '원종', '고강', '대장', '삼정', '내동', '작동', '여월']
};

// 화성시 일반구 동/읍/면 매핑 (2026.2 출범)
const HWASEONG_DISTRICT_MAP: Record<string, string[]> = {
  '화성시 만세구': ['향남', '우정', '남양', '매송', '비봉', '마도', '송산', '서신', '팔탄', '장안', '양감', '새솔'],
  '화성시 효행구': ['봉담', '정남', '기배', '화산'],
  '화성시 병점구': ['진안', '병점', '반월'],
  '화성시 동탄구': ['동탄', '영천', '청계', '오산동', '신동', '목동', '산척', '장지', '송동']
};

/**
 * 카카오 역지오코딩 주소 문자열로부터 수도권 83개 규격 (sido, sigungu)으로 정규화
 * 
 * @param region1 시·도 (예: 서울특별시, 경기도, 인천광역시)
 * @param region2 시·군·구 (예: 종로구, 수원시 영통구, 부천시, 서구, 화성시)
 * @param region3 읍·면·동 (예: 혜화동, 송도동, 원미동, 동탄동, 청라동)
 */
export function normalizeDistrict(
  region1: string,
  region2: string,
  region3: string = ''
): { sido: '서울특별시' | '경기도' | '인천광역시'; sigungu: string } | null {
  // 1. 시·도 정규화
  let sido: '서울특별시' | '경기도' | '인천광역시' | null = null;
  if (region1.includes('서울')) sido = '서울특별시';
  else if (region1.includes('인천')) sido = '인천광역시';
  else if (region1.includes('경기')) sido = '경기도';
  else return null;

  const r2 = region2.trim();
  const r3 = region3.trim();
  const fullAddress = `${r2} ${r3}`;

  // 2. 서울특별시 (25개 구)
  if (sido === '서울특별시') {
    const matched = SEOUL_DISTRICTS.find(d => r2.includes(d));
    if (matched) return { sido, sigungu: matched };
    return { sido, sigungu: r2 || '종로구' };
  }

  // 3. 인천광역시 (2026 개편 11개 구·군)
  if (sido === '인천광역시') {
    // 중구 또는 동구인 경우 -> 영종구 or 제물포구 판별 (남동구 제외)
    const isJungOrDong = (r2 === '중구' || r2 === '동구' || /^([^\w\s]+\s+)?(중구|동구)$/.test(r2)) && !r2.includes('남동구');
    if (isJungOrDong) {
      const isYeongjong = INCHEON_YEONGJONG_KEYWORDS.some(k => fullAddress.includes(k));
      return { sido, sigungu: isYeongjong ? '영종구' : '제물포구' };
    }

    // 서구인 경우 -> 검단구 or 서구 판별 (강서구 등 타 지역 방어)
    const isSeoGu = r2 === '서구' || /^([^\w\s]+\s+)?서구$/.test(r2);
    if (isSeoGu) {
      const isGeomdan = INCHEON_GEOMDAN_KEYWORDS.some(k => fullAddress.includes(k));
      return { sido, sigungu: isGeomdan ? '검단구' : '서구' };
    }

    // 기존 구/군 매칭 (남동구, 미추홀구, 연수구, 부평구, 계양구, 강화군, 옹진군)
    const matched = INCHEON_DISTRICTS_2026.find(d => r2.includes(d));
    if (matched) return { sido, sigungu: matched };

    return { sido, sigungu: r2 || '연수구' };
  }

  // 4. 경기도 (47개)
  if (sido === '경기도') {
    // 4-1. 부천시 세분화 (원미구 / 소사구 / 오정구)
    if (r2.includes('부천')) {
      for (const [district, keywords] of Object.entries(BUCHEON_DISTRICT_MAP)) {
        if (keywords.some(k => fullAddress.includes(k))) {
          return { sido, sigungu: district };
        }
      }
      return { sido, sigungu: '부천시 원미구' };
    }

    // 4-2. 화성시 세분화 (만세구 / 효행구 / 병점구 / 동탄구)
    if (r2.includes('화성')) {
      for (const [district, keywords] of Object.entries(HWASEONG_DISTRICT_MAP)) {
        if (keywords.some(k => fullAddress.includes(k))) {
          return { sido, sigungu: district };
        }
      }
      return { sido, sigungu: '화성시 동탄구' };
    }

    // 4-3. 이미 일반구가 포함된 형태인지 확인 (예: "수원시 영통구", "고양시 일산동구")
    const matchedFull = GYEONGGI_DISTRICTS.find(d => r2.includes(d) || fullAddress.includes(d));
    if (matchedFull) return { sido, sigungu: matchedFull };

    // 4-4. 일반구가 있는 시인데 시 이름만 들어온 경우 기본 매핑 또는 포함 검색
    const generalCities = ['수원시', '성남시', '안양시', '안산시', '고양시', '용인시'];
    for (const city of generalCities) {
      if (r2.includes(city.replace('시', ''))) {
        const districtMatch = GYEONGGI_DISTRICTS.find(d => d.startsWith(city) && fullAddress.includes(d.replace(city, '').trim()));
        if (districtMatch) return { sido, sigungu: districtMatch };
        // 기본 1구 매칭
        const defaultMatch = GYEONGGI_DISTRICTS.find(d => d.startsWith(city));
        if (defaultMatch) return { sido, sigungu: defaultMatch };
      }
    }

    // 4-5. 일반구 없는 시·군 (예: 파주시, 광명시, 양평군 등)
    const singleMatch = GYEONGGI_DISTRICTS.find(d => !d.includes(' ') && r2.includes(d.slice(0, 2)));
    if (singleMatch) return { sido, sigungu: singleMatch };

    return { sido, sigungu: r2 || '수원시 팔달구' };
  }

  return null;
}

/**
 * 위도/경도 두 지점 간 거리 계산 (Haversine 공식, 단위: 미터)
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // 지구 반경 (미터)
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * 반경 내 기존 장소 감지
 */
export function findNearbyPlaces<T extends { lat: number; lng: number }>(
  targetLat: number,
  targetLng: number,
  existingPlaces: T[],
  radiusMeters: number = 200
): Array<{ place: T; distance: number }> {
  const results: Array<{ place: T; distance: number }> = [];

  for (const place of existingPlaces) {
    const distance = calculateDistance(targetLat, targetLng, place.lat, place.lng);
    if (distance <= radiusMeters) {
      results.push({ place, distance });
    }
  }

  return results.sort((a, b) => a.distance - b.distance);
}
