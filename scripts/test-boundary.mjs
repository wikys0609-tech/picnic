#!/usr/bin/env node

/**
 * 수도권 83개 구·시·군 Point-in-Polygon (PIP) 경계 판정 검증 테스트
 * 실행: node scripts/test-boundary.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { findDistrictByCoords } from '../src/lib/geo/pip-core.mjs';

const geoJsonPath = path.resolve(process.cwd(), 'public/geo/metropolitan-83.geojson');
if (!fs.existsSync(geoJsonPath)) {
  console.error('❌ metropolitan-83.geojson 파일이 존재하지 않습니다.');
  process.exit(1);
}

const geoJson = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));

// 1. 카카오 장소 검색으로 확인한 경계 인근 핵심 장소들 테스트 케이스
const boundaryTestCases = [
  // [인천 개편 핵심 경계 구역]
  { name: '검암역 (공항철도/인천2호선)', lng: 126.673642, lat: 37.569253, expectedSido: '인천광역시', expectedSigungu: '서해구' },
  { name: '청라호수공원', lng: 126.634280, lat: 37.532490, expectedSido: '인천광역시', expectedSigungu: '서해구' },
  { name: '아라2동 행정복지센터 (검단신도시)', lng: 126.715642, lat: 37.593982, expectedSido: '인천광역시', expectedSigungu: '검단구' },
  { name: '아라1동 행정복지센터 (당하동)', lng: 126.697523, lat: 37.590481, expectedSido: '인천광역시', expectedSigungu: '검단구' },
  { name: '시천동 (경인아라뱃길 시천가람터)', lng: 126.678029, lat: 37.570663, expectedSido: '인천광역시', expectedSigungu: '서해구' },
  { name: '시천교 북단 (아라뱃길 북쪽 시천동)', lng: 126.677320, lat: 37.576500, expectedSido: '인천광역시', expectedSigungu: '서해구' },
  { name: '월미도 (북성동)', lng: 126.599231, lat: 37.471738, expectedSido: '인천광역시', expectedSigungu: '제물포구' },
  { name: '연안부두 (인천항 연안여객터미널)', lng: 126.598528, lat: 37.454100, expectedSido: '인천광역시', expectedSigungu: '제물포구' },
  { name: '영종도 구읍뱃터 (중산동)', lng: 126.580840, lat: 37.492439, expectedSido: '인천광역시', expectedSigungu: '영종구' },
  { name: '무의도 (하나개해수욕장 일대)', lng: 126.418468, lat: 37.386807, expectedSido: '인천광역시', expectedSigungu: '영종구' },
  { name: '작약도 / 물치도 (만석동 도서)', lng: 126.588694, lat: 37.497531, expectedSido: '인천광역시', expectedSigungu: '영종구' },

  // [서울-경기 복잡 경계 구역]
  { name: '스타필드시티 위례 (위례신도시)', lng: 127.148402, lat: 37.480111, expectedSido: '경기도', expectedSigungu: '하남시' },
  { name: '온수역 (서울 구로-부천 역곡 경계)', lng: 126.823848, lat: 37.491968, expectedSido: '서울특별시', expectedSigungu: '구로구' },
  { name: '역곡역 (부천시 원미구)', lng: 126.811700, lat: 37.485100, expectedSido: '경기도', expectedSigungu: '부천시 원미구' },
  { name: '모란역 (성남시 수정-중원 경계)', lng: 127.129970, lat: 37.434038, expectedSido: '경기도', expectedSigungu: '성남시 수정구' },
  { name: '북한산성입구 (서울 은평-고양 덕양 경계)', lng: 126.949417, lat: 37.655049, expectedSido: '서울특별시', expectedSigungu: '은평구' },
  { name: '지축역 (고양시 덕양구 지축동)', lng: 126.913800, lat: 37.648200, expectedSido: '경기도', expectedSigungu: '고양시 덕양구' },
  { name: '구리한강시민공원 (서울 강동-구리 경계)', lng: 127.135200, lat: 37.575200, expectedSido: '경기도', expectedSigungu: '구리시' },

  // [수도권 밖 / 해상 음성 케이스: null 반환 확인]
  { name: '해운대 해수욕장 (부산)', lng: 129.1585, lat: 35.1587, expectedSido: null, expectedSigungu: null },
  { name: '제주시청 (제주도)', lng: 126.5312, lat: 33.4996, expectedSido: null, expectedSigungu: null },
  { name: '서해 외해 먼바다 (해상)', lng: 126.0000, lat: 37.2000, expectedSido: null, expectedSigungu: null },
];

console.log('\n============================================================');
console.log('🧪 수도권 83개 구·시·군 Point-in-Polygon (PIP) 경계 판정 테스트');
console.log('============================================================\n');

let failed = 0;
let passed = 0;

for (const tc of boundaryTestCases) {
  const result = findDistrictByCoords({ lat: tc.lat, lng: tc.lng }, geoJson);

  let ok = false;
  if (tc.expectedSido === null) {
    ok = result === null;
  } else {
    ok = result !== null && result.sido === tc.expectedSido && result.sigungu === tc.expectedSigungu;
  }

  const resultStr = result ? `${result.sido} ${result.sigungu}` : 'NULL (정복 대상 외)';
  const expectedStr = tc.expectedSido ? `${tc.expectedSido} ${tc.expectedSigungu}` : 'NULL (정복 대상 외)';

  if (ok) {
    console.log(`✅ [PASS] ${tc.name}`);
    console.log(`         좌표: (${tc.lat}, ${tc.lng}) → ${resultStr}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${tc.name}`);
    console.error(`         기대값: ${expectedStr}`);
    console.error(`         실제값: ${resultStr}`);
    failed++;
  }
}

// 2. 기존 샘플 장소 10개 검증
console.log('\n------------------------------------------------------------');
console.log('📚 기존 샘플 장소 10곳 GeoJSON 일치 검증');
console.log('------------------------------------------------------------\n');

const placesDir = path.resolve(process.cwd(), 'src/content/places');
const sampleFiles = fs.readdirSync(placesDir).filter(f => f.endsWith('.md'));

let samplePassed = 0;
let sampleFailed = 0;

for (const f of sampleFiles) {
  const content = fs.readFileSync(path.join(placesDir, f), 'utf8');
  const nameMatch = content.match(/name:\s*(.+)/);
  const latMatch = content.match(/lat:\s*([0-9.]+)/);
  const lngMatch = content.match(/lng:\s*([0-9.]+)/);
  const sidoMatch = content.match(/sido:\s*(.+)/);
  const sigunguMatch = content.match(/sigungu:\s*(.+)/);

  if (nameMatch && latMatch && lngMatch && sidoMatch && sigunguMatch) {
    const name = nameMatch[1].trim();
    const lat = parseFloat(latMatch[1]);
    const lng = parseFloat(lngMatch[1]);
    const sido = sidoMatch[1].trim();
    const sigungu = sigunguMatch[1].trim();

    const result = findDistrictByCoords({ lat, lng }, geoJson);
    const ok = result !== null && result.sido === sido && result.sigungu === sigungu;

    if (ok) {
      console.log(`✅ [PASS] ${name} (${f}) → ${sido} ${sigungu}`);
      samplePassed++;
    } else {
      console.error(`❌ [FAIL] ${name} (${f})`);
      console.error(`         파일 내용: ${sido} ${sigungu}`);
      console.error(`         GeoJSON 판정: ${result ? `${result.sido} ${result.sigungu}` : 'NULL'}`);
      sampleFailed++;
    }
  }
}

console.log('\n============================================================');
console.log(`📊 테스트 결과 요약:`);
console.log(`   - 경계 및 예외 장소: ${passed} / ${passed + failed} PASS`);
console.log(`   - 기존 샘플 장소:     ${samplePassed} / ${samplePassed + sampleFailed} PASS`);
console.log('============================================================\n');

if (failed > 0 || sampleFailed > 0) {
  process.exit(1);
}
