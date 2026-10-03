#!/usr/bin/env node

/**
 * 사진 정렬 기준 종합 검증 테스트
 * 
 * 검증 항목:
 * 1. cover.* 파일은 촬영 시각과 관계없이 항상 앨범의 맨 첫 장으로 유지되는지 검증
 * 2. EXIF 촬영 시각(takenAt)이 있는 사진들이 시간순(오름차순)으로 정확히 정렬되는지 검증
 * 3. 촬영 시각이 없는 사진(스크린샷, 메신저 등)이 시간순 사진들의 뒤쪽에 자연 정렬(Natural Sort)로 배치되는지 검증
 * 4. 동일한 촬영 시각을 가진 사진들 간에는 파일명 자연 정렬로 순서가 결정되는지 검증
 * 5. cover.* 파일이 없는 경우 시간순 가장 이른 사진이 커버로 지정되고 첫 장에 오는지 검증
 * 6. manifest.json이 없는 폴더의 경우 기존 파일명 자연 정렬로 안전하게 폴백되는지 검증
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// ESM 동적 임포트
const { resolveWalkPhotos } = await import('../src/lib/content/photo-resolver.ts');

const TEST_PHOTOS_ROOT = path.join(process.cwd(), 'public', 'photos');
const TEST_DIR_NAME = 'test-sorting-walk-temp';
const TEST_DIR = path.join(TEST_PHOTOS_ROOT, TEST_DIR_NAME);

function setupDir(files, manifest = null) {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });

  for (const f of files) {
    fs.writeFileSync(path.join(TEST_DIR, f), 'fake-image-bytes', 'utf8');
  }

  if (manifest) {
    fs.writeFileSync(
      path.join(TEST_DIR, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );
  }
}

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

console.log('🧪 [테스트] 사진 정렬 및 manifest 연동 규칙 검증 시작...\n');

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
  } finally {
    cleanup();
  }
}

// Case 1: cover.* 최우선 + 시간순 정렬 + 시간 없는 사진 뒤 배치
runTest('cover.* 최우선 + 시간순(takenAt) + 시간 없는 사진 뒤 배치', () => {
  const files = [
    'IMG_0003.webp', // 12:00
    'cover.webp',     // 15:00 (늦은 시각이어도 커버이므로 1등이어야 함)
    'IMG_0001.webp', // 10:00
    'screenshot_10.webp', // takenAt 없음
    'screenshot_2.webp',  // takenAt 없음
    'IMG_0002.webp', // 11:00
  ];

  const manifest = {
    folderName: TEST_DIR_NAME,
    photos: [
      { file: 'cover.webp', takenAt: '2026-10-05T15:00:00Z' },
      { file: 'IMG_0001.webp', takenAt: '2026-10-05T10:00:00Z' },
      { file: 'IMG_0002.webp', takenAt: '2026-10-05T11:00:00Z' },
      { file: 'IMG_0003.webp', takenAt: '2026-10-05T12:00:00Z' },
      { file: 'screenshot_2.webp', takenAt: null },
      { file: 'screenshot_10.webp', takenAt: null },
    ],
  };

  setupDir(files, manifest);
  const result = resolveWalkPhotos(TEST_DIR_NAME);

  assert.equal(result.coverFile, 'cover.webp');
  assert.deepEqual(result.photoFiles, [
    'cover.webp',        // 1. 커버 최우선
    'IMG_0001.webp',    // 2. 10:00
    'IMG_0002.webp',    // 3. 11:00
    'IMG_0003.webp',    // 4. 12:00
    'screenshot_2.webp', // 5. 시간 없음 (자연수 정렬: 2 < 10)
    'screenshot_10.webp' // 6. 시간 없음
  ]);
});

// Case 2: cover.* 가 없을 때 시간순 가장 첫 사진이 커버로 지정됨
runTest('cover.* 가 없을 때 시간순 가장 이른 사진이 커버로 지정됨', () => {
  const files = [
    'photo_late.webp',  // 14:00
    'photo_early.webp', // 09:00
    'photo_mid.webp',   // 11:00
    'no_time.webp',     // takenAt 없음
  ];

  const manifest = {
    folderName: TEST_DIR_NAME,
    photos: [
      { file: 'photo_late.webp', takenAt: '2026-10-05T14:00:00Z' },
      { file: 'photo_early.webp', takenAt: '2026-10-05T09:00:00Z' },
      { file: 'photo_mid.webp', takenAt: '2026-10-05T11:00:00Z' },
      { file: 'no_time.webp', takenAt: null },
    ],
  };

  setupDir(files, manifest);
  const result = resolveWalkPhotos(TEST_DIR_NAME, undefined, 'cover.webp');

  assert.equal(result.coverFile, 'photo_early.webp');
  assert.deepEqual(result.photoFiles, [
    'photo_early.webp', // 09:00 (가장 빨라서 커버 및 1등)
    'photo_mid.webp',   // 11:00
    'photo_late.webp',  // 14:00
    'no_time.webp',     // 시간 없음 (뒤 배치)
  ]);
});

// Case 3: 동일한 촬영 시각인 경우 파일명 자연 정렬
runTest('동일한 촬영 시각일 때 파일명 자연 정렬(Natural Numeric Sort)', () => {
  const files = [
    'burst_10.webp', // 10:00:00
    'burst_2.webp',  // 10:00:00
    'burst_1.webp',  // 10:00:00
  ];

  const manifest = {
    folderName: TEST_DIR_NAME,
    photos: [
      { file: 'burst_10.webp', takenAt: '2026-10-05T10:00:00Z' },
      { file: 'burst_2.webp', takenAt: '2026-10-05T10:00:00Z' },
      { file: 'burst_1.webp', takenAt: '2026-10-05T10:00:00Z' },
    ],
  };

  setupDir(files, manifest);
  const result = resolveWalkPhotos(TEST_DIR_NAME);

  assert.equal(result.coverFile, 'burst_1.webp');
  assert.deepEqual(result.photoFiles, [
    'burst_1.webp',
    'burst_2.webp',
    'burst_10.webp',
  ]);
});

// Case 4: manifest.json이 없는 경우 파일명 자연 정렬로 정상 폴백
runTest('manifest.json이 없는 경우 파일명 자연 정렬 폴백', () => {
  const files = [
    'image10.webp',
    'cover.webp',
    'image2.webp',
    'image1.webp',
  ];

  setupDir(files, null); // no manifest
  const result = resolveWalkPhotos(TEST_DIR_NAME);

  assert.equal(result.coverFile, 'cover.webp');
  assert.deepEqual(result.photoFiles, [
    'cover.webp',
    'image1.webp',
    'image2.webp',
    'image10.webp',
  ]);
});

// Case 5: preferredCover가 지정된 경우 최우선 커버로 지정
runTest('preferredCover가 지정된 경우 최우선 커버로 지정', () => {
  const files = [
    'custom-cover.jpg',
    'photo_early.webp',
    'photo_late.webp',
  ];

  const manifest = {
    folderName: TEST_DIR_NAME,
    photos: [
      { file: 'custom-cover.jpg', takenAt: '2026-10-05T12:00:00Z' },
      { file: 'photo_early.webp', takenAt: '2026-10-05T08:00:00Z' },
      { file: 'photo_late.webp', takenAt: '2026-10-05T16:00:00Z' },
    ],
  };

  setupDir(files, manifest);
  const result = resolveWalkPhotos(TEST_DIR_NAME, undefined, 'custom-cover.jpg');

  assert.equal(result.coverFile, 'custom-cover.jpg');
  assert.deepEqual(result.photoFiles, [
    'custom-cover.jpg',
    'photo_early.webp',
    'photo_late.webp',
  ]);
});

// Case 6: 빈 폴더이거나 없는 폴더인 경우 안전하게 빈 배열 반환
runTest('빈 폴더 및 미존재 폴더 안전 처리', () => {
  setupDir([], null);
  const emptyRes = resolveWalkPhotos(TEST_DIR_NAME);
  assert.equal(emptyRes.coverFile, null);
  assert.deepEqual(emptyRes.photoFiles, []);

  const nonExistent = resolveWalkPhotos('non-existent-folder-xyz');
  assert.equal(nonExistent.folderName, null);
  assert.equal(nonExistent.coverFile, null);
  assert.deepEqual(nonExistent.photoFiles, []);
});

console.log(`\n==========================================`);
console.log(`결과: ${passCount}/${totalCount} 통과 (${passCount === totalCount ? '전체 성공' : '실패 있음'})`);
console.log(`==========================================\n`);

if (passCount !== totalCount) {
  process.exit(1);
}
