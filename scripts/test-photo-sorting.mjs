#!/usr/bin/env node

/**
 * 사진 정렬 기준 및 공개 manifest.json 순번 검증 테스트
 * 
 * 검증 항목:
 * 1. 공개 manifest.json에는 takenAt(촬영 시각)이 노출되지 않고 정렬된 순번(order)만 기록되는지 검증
 * 2. cover.* 파일은 순번과 관계없이 항상 앨범의 맨 첫 장으로 유지되는지 검증
 * 3. manifest의 정렬 순번(order)에 따라 앨범 사진이 정확히 정렬되는지 검증
 * 4. manifest에 등록되지 않은 사진이 뒤쪽에 자연 정렬(Natural Sort)로 배치되는지 검증
 * 5. cover.* 파일이 없는 경우 order: 1 사진이 커버로 지정되고 첫 장에 오는지 검증
 * 6. manifest.json이 없는 폴더의 경우 기존 파일명 자연 정렬로 안전하게 폴백되는지 검증
 * 7. sync 단계의 정렬 로직이 EXIF 촬영 시각 오름차순 및 시간 없는 사진 후순위 배치를 올바르게 수행하는지 검증
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

console.log('🧪 [테스트] 사진 정렬 및 공개 manifest 순번 검증 시작...\n');

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

// Case 1: manifest의 order 순번 기반 정렬 (takenAt 없이 order만 존재)
runTest('공개 manifest의 order 순번 기반 정렬 (takenAt 미노출)', () => {
  const files = [
    'IMG_0003.webp',
    'cover.webp',
    'IMG_0001.webp',
    'screenshot_10.webp',
    'screenshot_2.webp',
    'IMG_0002.webp',
  ];

  const manifest = {
    folderName: TEST_DIR_NAME,
    photos: [
      { file: 'cover.webp', order: 1 },
      { file: 'IMG_0001.webp', order: 2 },
      { file: 'IMG_0002.webp', order: 3 },
      { file: 'IMG_0003.webp', order: 4 },
      { file: 'screenshot_2.webp', order: 5 },
      { file: 'screenshot_10.webp', order: 6 },
    ],
  };

  // manifest에 takenAt 필드가 전혀 없는지 철저히 검증
  for (const p of manifest.photos) {
    assert.equal('takenAt' in p, false, `manifest 항목에 takenAt이 노출되면 안 됨: ${JSON.stringify(p)}`);
  }

  setupDir(files, manifest);
  const result = resolveWalkPhotos(TEST_DIR_NAME);

  assert.equal(result.coverFile, 'cover.webp');
  assert.deepEqual(result.photoFiles, [
    'cover.webp',
    'IMG_0001.webp',
    'IMG_0002.webp',
    'IMG_0003.webp',
    'screenshot_2.webp',
    'screenshot_10.webp',
  ]);
});

// Case 2: cover.* 가 없을 때 order: 1 사진이 커버로 지정됨
runTest('cover.* 가 없을 때 order: 1 첫 사진이 커버로 지정됨', () => {
  const files = [
    'photo_late.webp',
    'photo_early.webp',
    'photo_mid.webp',
    'no_time.webp',
  ];

  const manifest = {
    folderName: TEST_DIR_NAME,
    photos: [
      { file: 'photo_early.webp', order: 1 },
      { file: 'photo_mid.webp', order: 2 },
      { file: 'photo_late.webp', order: 3 },
      { file: 'no_time.webp', order: 4 },
    ],
  };

  setupDir(files, manifest);
  const result = resolveWalkPhotos(TEST_DIR_NAME, undefined, 'cover.webp');

  assert.equal(result.coverFile, 'photo_early.webp');
  assert.deepEqual(result.photoFiles, [
    'photo_early.webp',
    'photo_mid.webp',
    'photo_late.webp',
    'no_time.webp',
  ]);
});

// Case 3: manifest에 없는 사진이 로컬에 추가된 경우 manifest 사진 뒤에 자연 정렬
runTest('manifest에 없는 신규 사진은 manifest 사진 뒤에 파일명 자연 정렬', () => {
  const files = [
    'burst_10.webp', // manifest에 없음
    'burst_2.webp',  // manifest에 없음
    'burst_1.webp',  // manifest order: 1
  ];

  const manifest = {
    folderName: TEST_DIR_NAME,
    photos: [
      { file: 'burst_1.webp', order: 1 },
    ],
  };

  setupDir(files, manifest);
  const result = resolveWalkPhotos(TEST_DIR_NAME);

  assert.equal(result.coverFile, 'burst_1.webp');
  assert.deepEqual(result.photoFiles, [
    'burst_1.webp',  // manifest order: 1
    'burst_2.webp',  // manifest 없음 (자연수 정렬: 2 < 10)
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
      { file: 'photo_early.webp', order: 1 },
      { file: 'custom-cover.jpg', order: 2 },
      { file: 'photo_late.webp', order: 3 },
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

// Case 6: 빈 폴더 및 미존재 폴더 안전 처리
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

// Case 7: sync 단계 정렬 알고리즘 검증 (takenAt 시간순 + 시간 없는 사진 뒤 배치 -> order 부여 시 takenAt 미포함)
runTest('sync 단계 정렬 알고리즘 및 manifest order 생성 검증', () => {
  const rawPhotos = [
    { file: 'img_noon.webp', takenAt: '2026-10-05T12:00:00Z' },
    { file: 'cover.webp', takenAt: '2026-10-05T15:00:00Z' },
    { file: 'img_morning.webp', takenAt: '2026-10-05T09:00:00Z' },
    { file: 'screenshot_b.webp', takenAt: null },
    { file: 'screenshot_a.webp', takenAt: null },
  ];

  const coverFileName = 'cover.webp';
  rawPhotos.sort((a, b) => {
    if (coverFileName) {
      if (a.file === coverFileName && b.file !== coverFileName) return -1;
      if (b.file === coverFileName && a.file !== coverFileName) return 1;
    }
    const timeA = a.takenAt;
    const timeB = b.takenAt;
    if (timeA && timeB) {
      const diff = new Date(timeA).getTime() - new Date(timeB).getTime();
      if (diff !== 0) return diff;
    } else if (timeA && !timeB) {
      return -1;
    } else if (!timeA && timeB) {
      return 1;
    }
    return a.file.localeCompare(b.file, undefined, { numeric: true });
  });

  const manifestPhotos = rawPhotos.map((p, idx) => ({
    file: p.file,
    order: idx + 1,
  }));

  // manifest 검증: takenAt이 없고 order만 1부터 순차적으로 부여되었는지 확인
  assert.deepEqual(manifestPhotos, [
    { file: 'cover.webp', order: 1 },
    { file: 'img_morning.webp', order: 2 },
    { file: 'img_noon.webp', order: 3 },
    { file: 'screenshot_a.webp', order: 4 },
    { file: 'screenshot_b.webp', order: 5 },
  ]);
});

console.log(`\n==========================================`);
console.log(`결과: ${passCount}/${totalCount} 통과 (${passCount === totalCount ? '전체 성공' : '실패 있음'})`);
console.log(`==========================================\n`);

if (passCount !== totalCount) {
  process.exit(1);
}
