#!/usr/bin/env node

/**
 * 폴더 이름 규칙 및 자동 매칭 정밀 검증 테스트
 */

import assert from 'node:assert/strict';
import { normalizeText, parseFolderName, matchWalksAndFolders } from '../src/lib/content/folder-matcher.js';

console.log('🧪 [테스트] 폴더 이름 규칙 및 자동 매칭 정밀 검증 시작...\n');

let passCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

// 1. 문자열 정규화 테스트 (NFC, 공백, 하이픈, 언더바, 대소문자)
runTest('문자열 정규화 (NFC, 앞뒤 공백, 연속 공백/하이픈/언더바 통일, 소문자화)', () => {
  // NFD로 분리된 '서울숲' (\u1109\u1165\u110b\u116e\u11af\u1109\u1170\u11b8)
  const nfdText = '서울숲';
  const normalizedNfd = normalizeText(nfdText);
  assert.equal(normalizedNfd, '서울숲');

  // 앞뒤 공백 및 연속 공백/하이픈/언더바
  assert.equal(normalizeText('  2026-10-05   올림픽공원  '), '2026 10 05 올림픽공원');
  assert.equal(normalizeText('2026_10_05__올림픽공원'), '2026 10 05 올림픽공원');
  assert.equal(normalizeText('2026-10-05---OLYMPIC_PARK'), '2026 10 05 olympic park');
});

// 2. 폴더명 파싱 테스트
runTest('폴더명 날짜 및 장소명 파싱 (공백, 하이픈, 언더바)', () => {
  // 공백 구분자
  const p1 = parseFolderName('2026-10-05 올림픽공원');
  assert.equal(p1.date, '2026-10-05');
  assert.equal(p1.remainder, '올림픽공원');
  assert.equal(p1.normalizedRemainder, '올림픽공원');

  // 언더바 구분자
  const p2 = parseFolderName('2026-10-19_서울숲_아침');
  assert.equal(p2.date, '2026-10-19');
  assert.equal(p2.remainder, '서울숲_아침');
  assert.equal(p2.normalizedRemainder, '서울숲 아침');

  // 하이픈 영문 구분자
  const p3 = parseFolderName('2026-10-05-olympic-park');
  assert.equal(p3.date, '2026-10-05');
  assert.equal(p3.remainder, 'olympic-park');
  assert.equal(p3.normalizedRemainder, 'olympic park');

  // 날짜 단독 폴더
  const p4 = parseFolderName('2026-10-05');
  assert.equal(p4.date, '2026-10-05');
  assert.equal(p4.remainder, '');
});

// 3. photoFolder 명시된 산책 우선 매칭 (규칙 2-1)
runTest('기록에 photoFolder가 명시되어 있는 경우 최우선 매칭', () => {
  const walks = [
    {
      slug: '2026-09-20-seoul-forest',
      date: '2026-09-20',
      photoFolder: '2026-09-20-seoul-forest',
      places: ['seoul-forest'],
      placeNames: ['서울숲'],
    }
  ];
  const folders = [
    { id: 'f1', name: '2026-09-20-seoul-forest' }
  ];

  const result = matchWalksAndFolders(walks, folders);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].walkSlug, '2026-09-20-seoul-forest');
  assert.equal(result.matches[0].folderId, 'f1');
  assert.equal(result.matches[0].outputDir, '2026-09-20-seoul-forest');
  assert.equal(result.matches[0].matchType, 'explicit_photo_folder');
});

// 4. 날짜 일치 + 장소명 포함 자동 매칭 (한글 폴더명 -> 영문 안전 slug 저장)
runTest('날짜 일치 + 장소명 포함 자동 매칭 (한글 폴더 -> 영문 slug)', () => {
  const walks = [
    {
      slug: '2026-10-05-olympic-park',
      date: '2026-10-05',
      photoFolder: '', // 미지정 -> 자동 매칭 대상
      places: ['olympic-park'],
      placeNames: ['올림픽공원'],
    }
  ];
  const folders = [
    { id: 'drive_olyp1', name: '2026-10-05 올림픽공원' }
  ];

  const result = matchWalksAndFolders(walks, folders);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].walkSlug, '2026-10-05-olympic-park');
  assert.equal(result.matches[0].folderName, '2026-10-05 올림픽공원');
  assert.equal(result.matches[0].outputDir, '2026-10-05-olympic-park'); // 영문 안전 slug!
  assert.equal(result.matches[0].matchType, 'date_and_place');
});

// 5. 단일 산책 + 단일 폴더 폴백 매칭 (장소명이 달라도 연결)
runTest('그날 산책 1개, 그날 폴더 1개일 때 장소명이 달라도 연결', () => {
  const walks = [
    {
      slug: '2026-10-15-han-river',
      date: '2026-10-15',
      places: ['yeouido'],
      placeNames: ['여의도한강공원'],
    }
  ];
  const folders = [
    // 폴더명이 '2026-10-15' 날짜만 있거나 장소명이 조금 다른 경우
    { id: 'f_single', name: '2026-10-15 한강 산책' }
  ];

  const result = matchWalksAndFolders(walks, folders);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].walkSlug, '2026-10-15-han-river');
  assert.equal(result.matches[0].folderName, '2026-10-15 한강 산책');
  assert.equal(result.matches[0].outputDir, '2026-10-15-han-river');
  assert.equal(result.matches[0].matchType, 'single_date_fallback');
});

// 6. 같은 날 같은 장소 후보가 여러 개인 경우 (모호함 -> 자동 연결 금지 및 경고)
runTest('후보가 여러 개인 경우 자동 연결하지 않고 경고 및 선택 후보 제공', () => {
  const walks = [
    {
      slug: '2026-10-19-seoul-forest',
      date: '2026-10-19',
      places: ['seoul-forest'],
      placeNames: ['서울숲'],
    }
  ];
  const folders = [
    { id: 'f_m', name: '2026-10-19 서울숲 아침' },
    { id: 'f_n', name: '2026-10-19 서울숲 저녁' },
  ];

  const result = matchWalksAndFolders(walks, folders);
  assert.equal(result.matches.length, 0); // 자동 연결 금지!
  assert.equal(result.ambiguousWalks.length, 1);
  assert.equal(result.ambiguousWalks[0].candidates.length, 2);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /일치하는 폴더 후보가 여러 개/);
});

// 7. 아직 산책이 작성되지 않은 미매칭 드라이브 폴더의 영문 안전 저장 경로
runTest('미매칭 드라이브 폴더의 영문 안전 저장 경로 (drive-${id})', () => {
  const walks = [];
  const folders = [
    { id: '1ABCxyz99', name: '2026-10-30 북서울꿈의숲' }
  ];

  const result = matchWalksAndFolders(walks, folders);
  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatchedFolders.length, 1);
  assert.equal(result.unmatchedFolders[0].outputDir, 'drive-1ABCxyz99');
});

console.log(`\n==========================================`);
console.log(`결과: ${passCount}/${totalCount} 통과 (${passCount === totalCount ? '전체 성공' : '실패 있음'})`);
console.log(`==========================================\n`);

if (passCount !== totalCount) {
  process.exit(1);
}
