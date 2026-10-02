#!/usr/bin/env node

/**
 * 수도권 83개 구·시·군 정복 지도 GeoJSON 생성 파이프라인
 * 
 * 원본 출처: 대한민국 통계청/행안부 행정동 경계 오픈소스 (raqoon886/Local_HangJeongDong)
 * 반영 사항:
 * - 2026-07-01 인천광역시 행정구역 개편 (제물포구, 영종구, 검단구, 서구 분할/통합)
 * - 경기도 일반구 세분화 (부천시 3개구, 화성시 4개구, 수원·성남·안양·안산·고양·용인 일반구)
 * - 83개 구역 (서울 25, 경기 47, 인천 11) 디졸브(Dissolve) 및 경계 최적화(Simplify)
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import * as turf from '@turf/turf';

const CACHE_DIR = path.resolve(process.cwd(), '.geo-cache');
const OUTPUT_FILE = path.resolve(process.cwd(), 'public/geo/metropolitan-83.geojson');

const SOURCES = [
  {
    sido: '서울특별시',
    filename: 'hangjeongdong_서울특별시.geojson',
    url: 'https://raw.githubusercontent.com/raqoon886/Local_HangJeongDong/master/hangjeongdong_%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C.geojson'
  },
  {
    sido: '인천광역시',
    filename: 'hangjeongdong_인천광역시.geojson',
    url: 'https://raw.githubusercontent.com/raqoon886/Local_HangJeongDong/master/hangjeongdong_%EC%9D%B8%EC%B2%9C%EA%B4%91%EC%97%AD%EC%8B%9C.geojson'
  },
  {
    sido: '경기도',
    filename: 'hangjeongdong_경기도.geojson',
    url: 'https://raw.githubusercontent.com/raqoon886/Local_HangJeongDong/master/hangjeongdong_%EA%B2%BD%EA%B8%B0%EB%8F%84.geojson'
  }
];

// 인천 2026-07-01 개편 동 매핑 키워드
const INCHEON_YEONGJONG_KEYWORDS = [
  '영종', '운서', '운남', '운북', '중산', '을왕', '남북', '덕교', '무의', '용유'
];
const INCHEON_GEOMDAN_KEYWORDS = [
  '검단', '원당', '당하', '마전', '불로', '오류', '왕길', '대곡', '금곡'
];

// 부천시 일반구 동 매핑
const BUCHEON_DISTRICT_MAP = {
  '부천시 원미구': ['심곡', '원미', '소사동', '역곡', '춘의', '도당', '약대', '중동', '상동'],
  '부천시 소사구': ['소사본', '심곡본', '범박', '괴안', '송내', '옥길', '계수'],
  '부천시 오정구': ['오정', '원종', '고강', '대장', '삼정', '내동', '작동', '여월']
};

// 화성시 일반구 동 매핑
const HWASEONG_DISTRICT_MAP = {
  '화성시 만세구': ['향남', '우정', '남양', '매송', '비봉', '마도', '송산', '서신', '팔탄', '장안', '양감', '새솔'],
  '화성시 효행구': ['봉담', '정남', '기배', '화산'],
  '화성시 병점구': ['진안', '병점', '반월'],
  '화성시 동탄구': ['동탄', '영천', '청계', '오산동', '신동', '목동', '산척', '장지', '송동']
};

const SEOUL_DISTRICTS = [
  '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
  '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
  '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'
];

const INCHEON_DISTRICTS = [
  '제물포구', '영종구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '검단구',
  '강화군', '옹진군'
];

const GYEONGGI_DISTRICTS = [
  '수원시 장안구', '수원시 권선구', '수원시 팔달구', '수원시 영통구',
  '성남시 수정구', '성남시 중원구', '성남시 분당구',
  '안양시 만안구', '안양시 동안구',
  '안산시 상록구', '안산시 단원구',
  '고양시 덕양구', '고양시 일산동구', '고양시 일산서구',
  '용인시 처인구', '용인시 기흥구', '용인시 수지구',
  '부천시 원미구', '부천시 소사구', '부천시 오정구',
  '화성시 만세구', '화성시 효행구', '화성시 병점구', '화성시 동탄구',
  '의정부시', '광명시', '평택시', '동두천시', '과천시', '구리시', '남양주시', '오산시',
  '시흥시', '군포시', '의왕시', '하남시', '파주시', '이천시', '안성시', '김포시',
  '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군'
];

function normalizeFeatureDistrict(sido, sggnm, adm_nm) {
  const fullAddress = `${sggnm} ${adm_nm}`.replace(/\s+/g, ' ');

  if (sido === '서울특별시') {
    const matched = SEOUL_DISTRICTS.find(d => sggnm.includes(d));
    return matched || sggnm;
  }

  if (sido === '인천광역시') {
    // 중구 또는 동구인 경우 -> 영종구 or 제물포구 판별 (남동구 제외!)
    if ((sggnm === '중구' || sggnm === '동구') && !sggnm.includes('남동')) {
      const isYeongjong = INCHEON_YEONGJONG_KEYWORDS.some(k => fullAddress.includes(k));
      return isYeongjong ? '영종구' : '제물포구';
    }
    if (sggnm === '서구') {
      const isGeomdan = INCHEON_GEOMDAN_KEYWORDS.some(k => fullAddress.includes(k));
      return isGeomdan ? '검단구' : '서구';
    }
    const matched = INCHEON_DISTRICTS.find(d => sggnm.includes(d));
    return matched || sggnm;
  }

  if (sido === '경기도') {
    if (sggnm.includes('부천')) {
      for (const [dist, kws] of Object.entries(BUCHEON_DISTRICT_MAP)) {
        if (kws.some(k => fullAddress.includes(k))) return dist;
      }
      return '부천시 원미구';
    }
    if (sggnm.includes('화성')) {
      for (const [dist, kws] of Object.entries(HWASEONG_DISTRICT_MAP)) {
        if (kws.some(k => fullAddress.includes(k))) return dist;
      }
      return '화성시 동탄구';
    }

    // 일반구 분할 시 (수원, 성남, 안양, 안산, 고양, 용인)
    const matchedExact = GYEONGGI_DISTRICTS.find(d => {
      const parts = d.split(' ');
      if (parts.length === 2) {
        return sggnm.includes(parts[0].replace('시', '')) && sggnm.includes(parts[1]);
      }
      return false;
    });
    if (matchedExact) return matchedExact;

    // 일반구 없는 시·군 (광명시, 남양주시, 김포시, 군포시 등 - 반드시 끝글자 시/군 제거)
    const singleMatched = GYEONGGI_DISTRICTS.find(d => !d.includes(' ') && sggnm.includes(d.replace(/(시|군)$/, '')));
    if (singleMatched) return singleMatched;

    return sggnm;
  }

  return sggnm;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`⬇️ 다운로드 중: ${url}`);
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  console.log('\n==========================================');
  console.log('🗺️  수도권 83개 구·시·군 GeoJSON 빌더');
  console.log('==========================================\n');

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  // 1. 원본 행정동 데이터 다운로드 및 캐싱
  for (const src of SOURCES) {
    const dest = path.join(CACHE_DIR, src.filename);
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
      await downloadFile(src.url, dest);
    }
  }

  // 2. 83개 구역별 행정동 피처 그룹화
  const districtGroups = new Map(); // key: sigunguName -> { sido, features: [] }

  for (const src of SOURCES) {
    const filePath = path.join(CACHE_DIR, src.filename);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    for (const feat of data.features) {
      if (!feat.geometry) continue;

      const sido = src.sido;
      const sggnm = feat.properties.sggnm || feat.properties.adm_nm || '';
      const adm_nm = feat.properties.adm_nm || '';

      const normalizedSigungu = normalizeFeatureDistrict(sido, sggnm, adm_nm);
      if (!districtGroups.has(normalizedSigungu)) {
        districtGroups.set(normalizedSigungu, {
          sido,
          sigungu: normalizedSigungu,
          features: []
        });
      }
      districtGroups.get(normalizedSigungu).features.push(feat);
    }
  }

  console.log(`✓ 총 ${districtGroups.size}개 구역 그룹 매핑 완료.\n`);

  // 3. 각 구역별 폴리곤 통합(Dissolve/Union) 및 단순화(Simplify)
  const finalFeatures = [];

  for (const [sigungu, group] of districtGroups.entries()) {
    process.stdout.write(`📐 [${group.sido}] ${sigungu} (${group.features.length}개 동 경계 결합 중)... `);

    let unified = null;
    try {
      if (group.features.length === 1) {
        unified = group.features[0];
      } else {
        // Turf.js union으로 내부 행정동 경선 제거
        const fc = turf.featureCollection(group.features);
        unified = turf.union(fc);
        if (!unified) {
          unified = turf.combine(fc).features[0];
        }
      }
    } catch {
      // union 실패 시 combine fallback
      const fc = turf.featureCollection(group.features);
      unified = turf.combine(fc).features[0];
    }

    if (!unified) {
      console.log('❌ 실패');
      continue;
    }

    // 경계 단순화 (0.001도 ≈ 100m 정밀도, 웹 렌더링 초고속 최적화)
    let simplified = unified;
    try {
      simplified = turf.simplify(unified, { tolerance: 0.0012, highQuality: false });
    } catch {}

    // 중심 좌표 계산
    let center = [37.5665, 126.9780];
    try {
      const pt = turf.pointOnFeature(simplified);
      center = [
        Number(pt.geometry.coordinates[1].toFixed(6)),
        Number(pt.geometry.coordinates[0].toFixed(6))
      ];
    } catch {}

    // 부모 시 (일반구인 경우)
    let parentCity = null;
    if (sigungu.includes('시 ') && group.sido === '경기도') {
      parentCity = sigungu.split(' ')[0];
    }

    const featureId = `${group.sido}_${sigungu}`.replace(/[\s·]/g, '_');

    finalFeatures.push({
      type: 'Feature',
      id: featureId,
      properties: {
        id: featureId,
        sido: group.sido,
        sigungu: sigungu,
        name: sigungu,
        parentCity: parentCity,
        center: center,
        dongCount: group.features.length
      },
      geometry: simplified.geometry
    });

    console.log('✓ 완료');
  }

  // 4. 시도 및 구군명 기준 가나다 정렬
  finalFeatures.sort((a, b) => {
    if (a.properties.sido !== b.properties.sido) {
      const order = { '서울특별시': 1, '경기도': 2, '인천광역시': 3 };
      return (order[a.properties.sido] || 9) - (order[b.properties.sido] || 9);
    }
    return a.properties.name.localeCompare(b.properties.name, 'ko');
  });

  const finalGeoJSON = {
    type: 'FeatureCollection',
    metadata: {
      generatedAt: new Date().toISOString(),
      title: '수도권 83개 구·시·군 행정구역 경계',
      totalFeatures: finalFeatures.length,
      seoulCount: finalFeatures.filter(f => f.properties.sido === '서울특별시').length,
      gyeonggiCount: finalFeatures.filter(f => f.properties.sido === '경기도').length,
      incheonCount: finalFeatures.filter(f => f.properties.sido === '인천광역시').length
    },
    features: finalFeatures
  };

  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalGeoJSON), 'utf8');

  const stats = fs.statSync(OUTPUT_FILE);
  const sizeKb = (stats.size / 1024).toFixed(1);

  console.log('\n==========================================');
  console.log(`🎉 83개 구역 GeoJSON 생성 완료: ${OUTPUT_FILE}`);
  console.log(`   - 파일 크기: ${sizeKb} KB (경량화 최적화 완료)`);
  console.log(`   - 전체 구역 수: ${finalFeatures.length}개`);
  console.log(`     * 서울특별시: ${finalGeoJSON.metadata.seoulCount}개`);
  console.log(`     * 경기도:     ${finalGeoJSON.metadata.gyeonggiCount}개`);
  console.log(`     * 인천광역시: ${finalGeoJSON.metadata.incheonCount}개`);
  console.log('==========================================\n');
}

main().catch(err => {
  console.error('❌ GeoJSON 생성 실패:', err);
  process.exit(1);
});
