#!/usr/bin/env node

/**
 * 수도권 83개 구·시·군 Point-in-Polygon (PIP) 경계 판정 검증 테스트
 * 
 * [독립적 대조군 검증 방식]
 * - 테스트 기대값을 수동으로 하드코딩하지 않고, 카카오 로컬 API(coord2regioncode, region_type: 'H')로
 *   실시간 행정동을 조회한 뒤 README의 인천시 공식 행정동 목록 및 경기/서울 행정동 소속으로 정답 구를 결정합니다.
 * - 우리 지도의 GeoJSON 다각형 내부 판정 결과와 독립 대조군 결과를 1:1 비교합니다.
 * 
 * 실행: npm test (또는 node scripts/test-boundary.mjs)
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { findDistrictByCoords } from '../src/lib/geo/pip-core.mjs';

const geoJsonPath = path.resolve(process.cwd(), 'public/geo/metropolitan-83.geojson');
if (!fs.existsSync(geoJsonPath)) {
  console.error('❌ metropolitan-83.geojson 파일이 존재하지 않습니다.');
  process.exit(1);
}

const geoJson = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));

// README 3절에 기록된 인천시 공식 2026-07-01 행정동 목록
const INCHEON_OFFICIAL_DONGS = {
  제물포구: [
    '신포동', '연안동', '신흥동', '도원동', '율목동', '동인천동', '개항동', '만석동',
    '화수1·화평동', '화수1.화평동', '화수2동', '송현1·2동', '송현1.2동', '송현3동',
    '송림1동', '송림2동', '송림3·5동', '송림3.5동', '송림4동', '송림6동', '금창동'
  ],
  영종구: [
    '영종동', '영종1동', '영종2동', '운서동', '운서1동', '운서2동', '용유동'
  ],
  검단구: [
    '검단동', '불로대곡동', '원당동', '당하동', '오류왕길동', '마전동', '아라동', '아라1동', '아라2동'
  ],
  서해구: [
    '청라1동', '청라2동', '청라3동', '가정1동', '가정2동', '가정3동',
    '석남1동', '석남2동', '석남3동', '가좌1동', '가좌2동', '가좌3동', '가좌4동',
    '신현원창동', '연희동', '검암경서동'
  ]
};

// 카카오 로컬 API(행정동 H 기준)를 독립적 대조군(Ground Truth)으로 호출
async function getKakaoGroundTruth(lng, lat) {
  const options = {
    hostname: 'dapi.kakao.com',
    path: `/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`,
    headers: {
      'Authorization': 'KakaoAK a7ec74f23964ef752a90e8bef05c19ec',
      'Origin': 'http://localhost:4321',
      'KA': 'sdk/1.0.0 os/javascript lang/ko-KR device/pc origin/http%3A%2F%2Flocalhost%3A4321'
    }
  };

  return new Promise((resolve) => {
    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.documents || json.documents.length === 0) return resolve(null);
          const h = json.documents.find((d) => d.region_type === 'H') || json.documents[0];
          if (!h) return resolve(null);

          const r1 = h.region_1depth_name || '';
          const r2 = h.region_2depth_name || '';
          const r3 = h.region_3depth_name || '';

          // 수도권 밖(부산, 제주 등)이거나 해상 공해인 경우 null
          if (!['서울특별시', '경기도', '인천광역시'].includes(r1)) {
            return resolve(null);
          }

          if (r1 === '인천광역시') {
            let resolvedGu = null;
            for (const [gu, dongs] of Object.entries(INCHEON_OFFICIAL_DONGS)) {
              if (dongs.some((d) => r3.includes(d) || d.includes(r3))) {
                resolvedGu = gu;
                break;
              }
            }
            if (!resolvedGu) resolvedGu = r2;
            return resolve({ sido: '인천광역시', sigungu: resolvedGu, dong: r3, raw: h.address_name });
          }

          if (r1 === '경기도') {
            let formattedSgg = r2;
            if (formattedSgg.includes('부천시') && !formattedSgg.includes(' ')) {
              formattedSgg = formattedSgg.replace('부천시', '부천시 ');
            }
            if (formattedSgg.includes('화성시') && !formattedSgg.includes(' ')) {
              formattedSgg = formattedSgg.replace('화성시', '화성시 ');
            }
            return resolve({ sido: '경기도', sigungu: formattedSgg, dong: r3, raw: h.address_name });
          }

          if (r1 === '서울특별시') {
            return resolve({ sido: '서울특별시', sigungu: r2, dong: r3, raw: h.address_name });
          }

          return resolve(null);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// 1. 기존 21개 경계 및 예외 지점 테스트 케이스
const suite1Cases = [
  // [인천 개편 핵심 경계 지점]
  { name: '검암역 (공항철도/인천2호선)', lng: 126.673642, lat: 37.569253 },
  { name: '청라호수공원', lng: 126.634280, lat: 37.532490 },
  { name: '시천동 (경인아라뱃길 가람터)', lng: 126.678029, lat: 37.570663 },
  { name: '시천교 북단 (아라뱃길 북쪽 시천동)', lng: 126.677320, lat: 37.576500 },
  { name: '아라1동 행정복지센터 (당하/원당)', lng: 126.697523, lat: 37.590481 },
  { name: '아라2동 행정복지센터 (검단신도시)', lng: 126.715642, lat: 37.593982 },
  { name: '월미도 (북성동/개항동)', lng: 126.599231, lat: 37.471738 },
  { name: '연안부두 (인천항 연안여객터미널)', lng: 126.598528, lat: 37.454100 },
  { name: '영종도 구읍뱃터 (중산동/영종2동)', lng: 126.580840, lat: 37.492439 },
  { name: '무의도 (하나개해수욕장 일대)', lng: 126.418468, lat: 37.386807 },
  { name: '작약도 / 물치도 (만석동 산3 도서)', lng: 126.588694, lat: 37.497531 },

  // [서울-경기 복잡 경계 지점]
  { name: '스타필드시티 위례 (위례신도시)', lng: 127.148402, lat: 37.480111 },
  { name: '온수역 (서울 구로-부천 경계)', lng: 126.823848, lat: 37.491968 },
  { name: '역곡역 (부천시 소사구/원미구 경계)', lng: 126.811700, lat: 37.485100 },
  { name: '모란역 (성남시 수정-중원 경계)', lng: 127.129970, lat: 37.434038 },
  { name: '북한산성입구 (서울 은평-고양 덕양 경계)', lng: 126.949417, lat: 37.655049 },
  { name: '지축역 (고양시 덕양구 지축동)', lng: 126.913800, lat: 37.648200 },
  { name: '구리한강시민공원 (서울 강동-구리 경계)', lng: 127.135200, lat: 37.575200 },

  // [수도권 밖 / 공해 음성 케이스: null 반환 확인]
  { name: '해운대 해수욕장 (부산)', lng: 129.1585, lat: 35.1587 },
  { name: '제주시청 (제주도)', lng: 126.5312, lat: 33.4996 },
  { name: '서해 외해 먼바다 (공해)', lng: 124.5000, lat: 37.0000 }
];

// 2. 인천 개편 4개 구(제물포구·영종구·검단구·서해구) 경계선 양측(100~200m) 및 도서 지점
const suite3Cases = [
  // [도서 지역 (Islands)]
  { name: '작약도 (물치도, 만석동 산3)', lat: 37.497531, lng: 126.588694 },
  { name: '세어도 (서구 유일 유인도 본섬)', lat: 37.546000, lng: 126.578700 },
  { name: '소세어도 (서해구 신현원창동 부속도서)', lat: 37.548000, lng: 126.587600 },
  { name: '월미도 문화의거리 앞 해안', lat: 37.475000, lng: 126.598500 },
  { name: '무의도 하나개해수욕장', lat: 37.386807, lng: 126.418468 },
  { name: '무의도 큰무리마을 선착장', lat: 37.404800, lng: 126.437000 },
  { name: '실미도 해변', lat: 37.390000, lng: 126.412000 },
  { name: '예단포 인근 도서 (운북동 도서)', lat: 37.527400, lng: 126.576100 },
  { name: '조도 / 매도 (영종도 북서 도서)', lat: 37.516400, lng: 126.488100 },

  // [검단구 vs 서해구 경계선 (경인아라뱃길 축선 150m 양측)]
  { name: '시천교 북단 (+150m 검단)', lat: 37.576500, lng: 126.677320 },
  { name: '시천교 남단 (-150m 서해)', lat: 37.570663, lng: 126.678029 },
  { name: '백석교 북단 한들마을 (+150m 검단)', lat: 37.580000, lng: 126.666000 },
  { name: '검암역 앞 (-150m 서해)', lat: 37.569253, lng: 126.673642 },
  { name: '청운교 북단 (+150m 검단)', lat: 37.575000, lng: 126.630000 },
  { name: '청운교 남단 (-150m 서해)', lat: 37.568000, lng: 126.630000 },
  { name: '정서진 북수문 (+150m 검단)', lat: 37.565000, lng: 126.600000 },
  { name: '정서진 아라빛섬 (-150m 서해)', lat: 37.558000, lng: 126.600000 },
  { name: '아라뱃길 동단 목상교 북쪽 (+150m 검단)', lat: 37.585000, lng: 126.705000 },
  { name: '아라뱃길 동단 목상교 남쪽 (-150m 서해)', lat: 37.568000, lng: 126.695000 },

  // [제물포구 vs 서해구 경계선 (만석/화수/송림 vs 가좌/원창)]
  { name: '만석동 북부 해안 (제물포)', lat: 37.488000, lng: 126.620000 },
  { name: '북항 배후단지 (서해)', lat: 37.498000, lng: 126.620000 },
  { name: '송림동 인천의료원 북쪽 (제물포)', lat: 37.478000, lng: 126.668000 },
  { name: '가좌2동 주택가 (서해)', lat: 37.485000, lng: 126.673000 },

  // [제물포구 vs 영종구 경계선 (월미도 - 구읍뱃터 해상)]
  { name: '월미도 문화의거리 (제물포)', lat: 37.475000, lng: 126.598500 },
  { name: '영종도 구읍뱃터 선착장 (영종)', lat: 37.492439, lng: 126.580840 },
  { name: '인천항 연안부두 터미널 (제물포)', lat: 37.454100, lng: 126.598528 },

  // [서해구 vs 영종구 경계선 (청라/정서진 - 영종도 해협)]
  { name: '청라 북서단 해변 (서해)', lat: 37.545000, lng: 126.620000 },
  { name: '영종도 예단포 선착장 (영종)', lat: 37.531537, lng: 126.501836 }
];

async function runTestSuite() {
  console.log('\n============================================================');
  console.log('🧪 수도권 83개 구·시·군 Point-in-Polygon (PIP) 독립 검증 테스트');
  console.log('   (대조군: 카카오 coord2regioncode H 행정동 및 README 공식 목록)');
  console.log('============================================================\n');

  let totalPass = 0;
  let totalFail = 0;
  const failureList = [];

  // Suite 1 실행
  console.log('▶ [테스트 1] 기존 21개 경계 및 예외 지점 독립 검증');
  console.log('------------------------------------------------------------');

  for (const tc of suite1Cases) {
    const gt = await getKakaoGroundTruth(tc.lng, tc.lat);
    const pip = findDistrictByCoords({ lat: tc.lat, lng: tc.lng }, geoJson);

    const gtStr = gt ? `${gt.sido} ${gt.sigungu}` : 'NULL (정복 대상 외)';
    const pipStr = pip ? `${pip.sido} ${pip.sigungu}` : 'NULL (정복 대상 외)';

    if (gtStr === pipStr) {
      console.log(`✅ [PASS] ${tc.name}`);
      console.log(`         좌표: (${tc.lat}, ${tc.lng}) → 카카오: ${gtStr}${gt?.dong ? ` (${gt.dong})` : ''} | 지도: ${pipStr}`);
      totalPass++;
    } else {
      console.error(`❌ [FAIL] ${tc.name}`);
      console.error(`         카카오 대조군: ${gtStr}${gt?.dong ? ` (${gt.dong})` : ''}`);
      console.error(`         지도 PIP 결과: ${pipStr}`);
      totalFail++;
      failureList.push({ name: tc.name, lat: tc.lat, lng: tc.lng, gt: gtStr, pip: pipStr, dong: gt?.dong });
    }
  }

  // Suite 2 실행 (기존 샘플 장소 10곳)
  console.log('\n▶ [테스트 2] 기존 샘플 장소 10곳 실좌표 독립 검증');
  console.log('------------------------------------------------------------');

  const placesDir = path.resolve(process.cwd(), 'src/content/places');
  const sampleFiles = fs.readdirSync(placesDir).filter((f) => f.endsWith('.md'));

  for (const f of sampleFiles) {
    const content = fs.readFileSync(path.join(placesDir, f), 'utf8');
    const nameMatch = content.match(/name:\s*(.+)/);
    const latMatch = content.match(/lat:\s*([0-9.]+)/);
    const lngMatch = content.match(/lng:\s*([0-9.]+)/);

    const name = nameMatch ? nameMatch[1].trim() : f;
    const lat = latMatch ? parseFloat(latMatch[1]) : 0;
    const lng = lngMatch ? parseFloat(lngMatch[1]) : 0;

    const gt = await getKakaoGroundTruth(lng, lat);
    const pip = findDistrictByCoords({ lat, lng }, geoJson);

    const gtStr = gt ? `${gt.sido} ${gt.sigungu}` : 'NULL (정복 대상 외)';
    const pipStr = pip ? `${pip.sido} ${pip.sigungu}` : 'NULL (정복 대상 외)';

    if (gtStr === pipStr) {
      console.log(`✅ [PASS] ${name} (${f})`);
      console.log(`         좌표: (${lat}, ${lng}) → 카카오: ${gtStr}${gt?.dong ? ` (${gt.dong})` : ''} | 지도: ${pipStr}`);
      totalPass++;
    } else {
      console.error(`❌ [FAIL] ${name} (${f})`);
      console.error(`         카카오 대조군: ${gtStr}${gt?.dong ? ` (${gt.dong})` : ''}`);
      console.error(`         지도 PIP 결과: ${pipStr}`);
      totalFail++;
      failureList.push({ name, lat, lng, gt: gtStr, pip: pipStr, dong: gt?.dong });
    }
  }

  // Suite 3 실행 (인천 개편 4개 구 경계선 양측 및 도서 지역)
  console.log('\n▶ [테스트 3] 인천 개편 4개 구 경계선(100~200m) 및 도서 지역 독립 검증');
  console.log('------------------------------------------------------------');

  for (const tc of suite3Cases) {
    const gt = await getKakaoGroundTruth(tc.lng, tc.lat);
    const pip = findDistrictByCoords({ lat: tc.lat, lng: tc.lng }, geoJson);

    const gtStr = gt ? `${gt.sido} ${gt.sigungu}` : 'NULL (정복 대상 외)';
    const pipStr = pip ? `${pip.sido} ${pip.sigungu}` : 'NULL (정복 대상 외)';

    if (gtStr === pipStr) {
      console.log(`✅ [PASS] ${tc.name}`);
      console.log(`         좌표: (${tc.lat}, ${tc.lng}) → 카카오: ${gtStr}${gt?.dong ? ` (${gt.dong})` : ''} | 지도: ${pipStr}`);
      totalPass++;
    } else {
      console.error(`❌ [FAIL] ${tc.name}`);
      console.error(`         카카오 대조군: ${gtStr}${gt?.dong ? ` (${gt.dong})` : ''}`);
      console.error(`         지도 PIP 결과: ${pipStr}`);
      totalFail++;
      failureList.push({ name: tc.name, lat: tc.lat, lng: tc.lng, gt: gtStr, pip: pipStr, dong: gt?.dong });
    }
  }

  // 최종 요약 리포트
  console.log('\n============================================================');
  console.log('📊 독립 검증 테스트 결과 요약');
  console.log('============================================================');
  console.log(`  - 전체 테스트 지점: ${totalPass + totalFail}개`);
  console.log(`  - 성공(PASS):       ${totalPass}개`);
  console.log(`  - 실패(FAIL):       ${totalFail}개`);

  if (failureList.length > 0) {
    console.log('\n❌ [불일치 발생 목록]');
    console.table(failureList);
    process.exit(1);
  } else {
    console.log('\n🎉 모든 테스트 지점이 카카오 행정동 공식 대조군과 100% 일치합니다.');
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('테스트 실행 에러:', err);
  process.exit(1);
});
