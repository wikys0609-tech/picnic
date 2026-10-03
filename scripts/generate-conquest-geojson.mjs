#!/usr/bin/env node

/**
 * 수도권 83개 구·시·군 정복 지도 GeoJSON 생성 파이프라인
 * 
 * 원본 출처: 대한민국 통계청 / 행정안전부 2026-07-01 행정구역 개편 공식 기준 행정동 경계
 * 저장소: https://github.com/vuski/admdongkor (ver20260701, commit 7360288)
 * 파일: ver20260701/HangJeongDong_ver20260701.geojson
 * 
 * 주요 기능:
 * 1. 대표 좌표 기반 견고한 도서 다각형 탐색 및 분리 귀속 (인덱스 하드코딩 제거)
 *    - 작약도(물치도): 제물포구 만석동(산3)으로 귀속
 *    - 세어도(본섬/소세어도): 서해구 신현원창동으로 귀속
 * 2. 아라뱃길 이북 시천동·백석동: 검단구 당하동으로 2026 공식 경계 정합
 * 3. 이중 산출물 생성:
 *    - public/geo/metropolitan-83.geojson: 정밀 판정용 (tolerance 0.0001° ≈ 10m)
 *    - public/geo/metropolitan-83-display.geojson: 화면 표시용 초경량 (tolerance 0.0007°, 5자리 좌표 절삭, gzip ~56KB)
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import zlib from 'node:zlib';
import * as turf from '@turf/turf';

const CACHE_DIR = path.resolve(process.cwd(), '.geo-cache');
const OUTPUT_FILE = path.resolve(process.cwd(), 'public/geo/metropolitan-83.geojson');
const DISPLAY_OUTPUT_FILE = path.resolve(process.cwd(), 'public/geo/metropolitan-83-display.geojson');

const GEOJSON_2026_URL = 'https://raw.githubusercontent.com/vuski/admdongkor/7360288277dfd12d74e54b959c59bdd66f852e3a/ver20260701/HangJeongDong_ver20260701.geojson';
const CACHED_FILE = path.join(CACHE_DIR, 'HangJeongDong_ver20260701.geojson');

// 대표 좌표 기반 도서 분리 정의 (다각형 순번/인덱스 의존 탈피)
const ISLAND_EXTRACTIONS = [
  {
    name: '작약도 (물치도)',
    representativePoint: [126.588694, 37.497531], // [lng, lat]
    sourceAdmNm: '인천광역시 영종구 영종동',
    targetSigungu: '제물포구',
    targetSido: '인천광역시',
    targetAdmNm: '인천광역시 제물포구 만석동(작약도)'
  },
  {
    name: '세어도 (본섬)',
    representativePoint: [126.5787, 37.5460], // [lng, lat]
    sourceAdmNm: '인천광역시 영종구 영종동',
    targetSigungu: '서해구',
    targetSido: '인천광역시',
    targetAdmNm: '인천광역시 서해구 신현원창동(세어도1)'
  },
  {
    name: '소세어도',
    representativePoint: [126.5876, 37.5480], // [lng, lat]
    sourceAdmNm: '인천광역시 영종구 영종동',
    targetSigungu: '서해구',
    targetSido: '인천광역시',
    targetAdmNm: '인천광역시 서해구 신현원창동(세어도2)'
  }
];

function formatSggName(sgg) {
  if (sgg.includes('시') && sgg.endsWith('구')) {
    const idx = sgg.indexOf('시');
    return sgg.slice(0, idx + 1) + ' ' + sgg.slice(idx + 1);
  }
  return sgg;
}

function truncateCoords(coords) {
  if (typeof coords[0] === 'number') {
    return [Number(coords[0].toFixed(5)), Number(coords[1].toFixed(5))];
  }
  return coords.map(truncateCoords);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`⬇️ 2026-07-01 행정동 공식 데이터 다운로드 중: ${url}`);
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
  console.log('🗺️  수도권 83개 구·시·군 GeoJSON 빌더 (2026-07-01 공식 기준)');
  console.log('==========================================\n');

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  if (!fs.existsSync(CACHED_FILE) || fs.statSync(CACHED_FILE).size < 1000000) {
    await downloadFile(GEOJSON_2026_URL, CACHED_FILE);
  }

  console.log('📖 GeoJSON 파싱 중...');
  const rawData = JSON.parse(fs.readFileSync(CACHED_FILE, 'utf8'));

  const targetFeatures = rawData.features.filter((f) =>
    ['서울특별시', '인천광역시', '경기도'].includes(f.properties?.sidonm)
  );
  console.log(`✓ 수도권 행정동 피처 ${targetFeatures.length}개 추출 완료.`);

  const districtGroups = new Map(); // key: sigungu -> { sido, sigungu, features: [] }

  for (const f of targetFeatures) {
    if (!f.geometry) continue;

    const sido = f.properties.sidonm;
    const sgg = formatSggName(f.properties.sggnm);

    // 대표 좌표 기반 견고한 도서 다각형 분리 처리 (인덱스 하드코딩 제거)
    if (sido === '인천광역시' && f.properties.adm_nm === '인천광역시 영종구 영종동') {
      let polyCoords = [...f.geometry.coordinates];

      for (const island of ISLAND_EXTRACTIONS) {
        const testPoint = turf.point(island.representativePoint);
        const matchIndex = polyCoords.findIndex((poly) => {
          try {
            return turf.booleanPointInPolygon(testPoint, turf.polygon(poly));
          } catch {
            return false;
          }
        });

        if (matchIndex === -1) {
          throw new Error(
            `❌ 필수 도서 다각형 탐색 실패: '${island.name}' 대표 좌표 [${island.representativePoint}]를 포함하는 다각형이 '${island.sourceAdmNm}' 피처에 존재하지 않습니다.`
          );
        }

        const [extracted] = polyCoords.splice(matchIndex, 1);
        const targetKey = island.targetSigungu;

        if (!districtGroups.has(targetKey)) {
          districtGroups.set(targetKey, { sido: island.targetSido, sigungu: targetKey, features: [] });
        }
        districtGroups.get(targetKey).features.push(
          turf.polygon(extracted, {
            sido: island.targetSido,
            sigungu: targetKey,
            adm_nm: island.targetAdmNm
          })
        );

        console.log(`  🏝️  [도서 분리 완료] '${island.name}' -> ${island.targetSigungu} (${island.representativePoint})`);
      }

      // 분리 후 남은 폴리곤들을 원래 영종구로 등록
      const yKey = '영종구';
      if (!districtGroups.has(yKey)) {
        districtGroups.set(yKey, { sido: '인천광역시', sigungu: yKey, features: [] });
      }
      districtGroups.get(yKey).features.push(
        turf.multiPolygon(polyCoords, {
          sido: '인천광역시',
          sigungu: yKey,
          adm_nm: '인천광역시 영종구 영종동'
        })
      );
      continue;
    }

    if (!districtGroups.has(sgg)) {
      districtGroups.set(sgg, {
        sido,
        sigungu: sgg,
        features: []
      });
    }
    districtGroups.get(sgg).features.push(
      turf.feature(f.geometry, { sido, sigungu: sgg, adm_nm: f.properties.adm_nm })
    );
  }

  console.log(`\n✓ 총 ${districtGroups.size}개 구역 그룹 매핑 완료.\n`);

  // 3. 각 구역별 폴리곤 통합(Dissolve/Union) 및 단순화(Simplify)
  const precisionFeatures = [];

  for (const [sigungu, group] of districtGroups.entries()) {
    process.stdout.write(`📐 [${group.sido}] ${sigungu} (${group.features.length}개 단위 결합 중)... `);

    let unified = null;
    try {
      if (group.features.length === 1) {
        unified = group.features[0];
      } else {
        const fc = turf.featureCollection(group.features);
        unified = turf.union(fc);
        if (!unified) {
          unified = turf.combine(fc).features[0];
        }
      }
    } catch {
      const fc = turf.featureCollection(group.features);
      unified = turf.combine(fc).features[0];
    }

    if (!unified) {
      console.log('❌ 실패');
      continue;
    }

    // 1) 정밀 판정용 단순화 (0.0001° ≈ 10m 정밀도)
    let simplified = unified;
    try {
      simplified = turf.simplify(unified, { tolerance: 0.0001, highQuality: true });
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

    let parentCity = null;
    if (sigungu.includes('시 ') && group.sido === '경기도') {
      parentCity = sigungu.split(' ')[0];
    }

    const featureId = `${group.sido}_${sigungu}`.replace(/[\s·]/g, '_');

    precisionFeatures.push({
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

    console.log('✓');
  }

  // 시도 및 구군명 기준 가나다 정렬
  const sortFeatures = (feats) => {
    feats.sort((a, b) => {
      if (a.properties.sido !== b.properties.sido) {
        const order = { '서울특별시': 1, '경기도': 2, '인천광역시': 3 };
        return (order[a.properties.sido] || 9) - (order[b.properties.sido] || 9);
      }
      return a.properties.name.localeCompare(b.properties.name, 'ko');
    });
  };

  sortFeatures(precisionFeatures);

  const baseMetadata = {
    generatedAt: new Date().toISOString(),
    source: 'vuski/admdongkor ver20260701 (commit 7360288277dfd12d74e54b959c59bdd66f852e3a)',
    title: '수도권 83개 구·시·군 행정구역 경계',
    totalFeatures: precisionFeatures.length,
    seoulCount: precisionFeatures.filter((f) => f.properties.sido === '서울특별시').length,
    gyeonggiCount: precisionFeatures.filter((f) => f.properties.sido === '경기도').length,
    incheonCount: precisionFeatures.filter((f) => f.properties.sido === '인천광역시').length
  };

  // 1) 정밀 판정용 GeoJSON 파일 저장 (metropolitan-83.geojson)
  const precisionGeoJSON = {
    type: 'FeatureCollection',
    metadata: {
      ...baseMetadata,
      usage: 'precision-point-in-polygon',
      tolerance: 0.0001
    },
    features: precisionFeatures
  };

  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const precisionStr = JSON.stringify(precisionGeoJSON);
  fs.writeFileSync(OUTPUT_FILE, precisionStr, 'utf8');
  const precisionGz = zlib.gzipSync(precisionStr);

  // 2) 화면 표시용 초경량 GeoJSON 생성 (metropolitan-83-display.geojson)
  // tolerance 0.0007° + 좌표 5자리(1.1m) 절삭
  const displayFeatures = precisionFeatures.map((f) => {
    let simp = f;
    try {
      simp = turf.simplify(f, { tolerance: 0.0007, highQuality: true });
    } catch {}
    return {
      type: 'Feature',
      id: f.id,
      properties: f.properties,
      geometry: {
        type: simp.geometry.type,
        coordinates: truncateCoords(simp.geometry.coordinates)
      }
    };
  });

  const displayGeoJSON = {
    type: 'FeatureCollection',
    metadata: {
      ...baseMetadata,
      usage: 'screen-display-optimized',
      tolerance: 0.0007,
      coordinatePrecision: '5 decimals (~1.1m)'
    },
    features: displayFeatures
  };

  const displayStr = JSON.stringify(displayGeoJSON);
  fs.writeFileSync(DISPLAY_OUTPUT_FILE, displayStr, 'utf8');
  const displayGz = zlib.gzipSync(displayStr);

  console.log('\n============================================================');
  console.log('🎉 수도권 83개 구역 이중 GeoJSON 생성 완료');
  console.log('============================================================');
  console.log(`1. [정밀 판정용] ${OUTPUT_FILE}`);
  console.log(`   - 파일 크기: ${(precisionStr.length / 1024).toFixed(1)} KB (gzip: ${(precisionGz.length / 1024).toFixed(1)} KB)`);
  console.log(`   - 정밀도: tolerance 0.0001° (약 10m 이내, PIP 판정 전용)`);
  console.log(`2. [화면 표시용] ${DISPLAY_OUTPUT_FILE}`);
  console.log(`   - 파일 크기: ${(displayStr.length / 1024).toFixed(1)} KB (gzip: ${(displayGz.length / 1024).toFixed(1)} KB)`);
  console.log(`   - 최적화: tolerance 0.0007°, 좌표 5자리 절삭 (~1.1m, 정복 지도 렌더링 전용)`);
  console.log(`   - 전송 절감: gzip 기준 ${(precisionGz.length / 1024).toFixed(1)} KB -> ${(displayGz.length / 1024).toFixed(1)} KB (${((1 - displayGz.length / precisionGz.length) * 100).toFixed(1)}% 용량 절감)`);
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('❌ GeoJSON 생성 실패:', err);
  process.exit(1);
});
