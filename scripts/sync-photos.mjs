#!/usr/bin/env node

/**
 * 구글 드라이브 사진 자동 동기화 & WebP 변환 & EXIF 제거 파이프라인
 * 
 * - 구글 드라이브 서비스 계정 API 연동
 * - 루트 폴더 내의 산책별 서브폴더(photoFolder) 자동 탐색
 * - sharp 기반 1600px 리사이즈, WebP 변환, 개인정보(GPS/EXIF) 완전 제거
 * - .photo-cache.json 기반 증분 다운로드(캐싱) 지원
 * - 자격증명 미설정 시 graceful warning 출력 후 빌드 정상 진행 (Exit 0)
 */

import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import sharp from 'sharp';
import decodeHeic from 'heic-decode';

const CACHE_FILE = path.resolve(process.cwd(), '.photo-cache.json');
const OUTPUT_DIR = path.resolve(process.cwd(), 'public/photos');

// 1. 자격 증명(Service Account Credentials) 확인 및 로드
function loadCredentials() {
  const envCreds = process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
  if (envCreds && envCreds.trim()) {
    const raw = envCreds.trim();
    // 1-1. JSON 문자열 직접 전달
    if (raw.startsWith('{')) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error('❌ GDRIVE_SERVICE_ACCOUNT_JSON JSON 파싱 실패:', e.message);
        return null;
      }
    }
    // 1-2. Base64 인코딩 문자열
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded.startsWith('{')) {
        return JSON.parse(decoded);
      }
    } catch {
      // Not base64
    }
    // 1-3. 파일 경로인 경우
    const resolvedPath = path.resolve(process.cwd(), raw);
    if (fs.existsSync(resolvedPath)) {
      try {
        return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      } catch (e) {
        console.error(`❌ 파일(${resolvedPath}) 읽기 실패:`, e.message);
        return null;
      }
    }
  }

  // 1-4. 기본 로컬 파일 (service-account.json)
  const defaultLocalFile = path.resolve(process.cwd(), 'service-account.json');
  if (fs.existsSync(defaultLocalFile)) {
    try {
      return JSON.parse(fs.readFileSync(defaultLocalFile, 'utf8'));
    } catch (e) {
      console.warn('⚠️ service-account.json 읽기 실패:', e.message);
      return null;
    }
  }

  return null;
}

// 2. 캐시 매니페스트 읽기 및 저장
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {
      return { files: {} };
    }
  }
  return { files: {} };
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ 캐시 저장 실패:', err.message);
  }
}

// 3. 파일 스트림 다운로드 헬퍼
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// 4. 메인 동기화 함수
async function syncPhotos() {
  console.log('\n==========================================');
  console.log('📷 소풍(Picnic) — 구글 드라이브 사진 파이프라인');
  console.log('==========================================');

  const credentials = loadCredentials();
  const rootFolderId = process.env.GDRIVE_ROOT_FOLDER_ID?.trim();

  if (!credentials || !rootFolderId) {
    console.log('\n💡 [안내] 구글 드라이브 연동 설정이 없습니다:');
    if (!credentials) console.log('   - GDRIVE_SERVICE_ACCOUNT_JSON 미설정');
    if (!rootFolderId) console.log('   - GDRIVE_ROOT_FOLDER_ID 미설정');
    console.log('   사진 동기화를 건너뛰고 기존 로컬 사진으로 빌드를 계속합니다.\n');
    return;
  }

  // Google Drive 클라이언트 초기화
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  const drive = google.drive({ version: 'v3', auth });
  const cache = loadCache();
  if (!cache.files) cache.files = {};

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`\n📁 루트 폴더(${rootFolderId})의 서브폴더 검색 중...`);

  // 루트 폴더 내의 산책별 서브폴더 목록 조회
  let folders = [];
  try {
    const res = await drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100,
    });
    folders = res.data.files || [];
  } catch (err) {
    console.error('❌ 구글 드라이브 폴더 목록 조회 실패:', err.message);
    return;
  }

  console.log(`✓ 총 ${folders.length}개의 산책 사진 폴더를 찾았습니다.\n`);

  let totalDownloaded = 0;
  let totalCached = 0;
  let totalErrors = 0;

  for (const folder of folders) {
    const folderName = folder.name.trim();
    const folderOutputDir = path.join(OUTPUT_DIR, folderName);
    if (!fs.existsSync(folderOutputDir)) {
      fs.mkdirSync(folderOutputDir, { recursive: true });
    }

    // 폴더 내 이미지 파일 조회 (HEIC, HEIF 포함)
    let images = [];
    try {
      const res = await drive.files.list({
        q: `'${folder.id}' in parents and (mimeType contains 'image/' or name contains '.jpg' or name contains '.png' or name contains '.jpeg' or name contains '.webp' or name contains '.heic' or name contains '.heif' or name contains '.HEIC' or name contains '.HEIF') and trashed = false`,
        fields: 'files(id, name, mimeType, md5Checksum, modifiedTime, size)',
        pageSize: 100,
      });
      images = res.data.files || [];
    } catch (err) {
      console.warn(`⚠️ [${folderName}] 사진 목록 조회 실패:`, err.message);
      totalErrors++;
      continue;
    }

    if (images.length === 0) continue;

    console.log(`📸 [${folderName}] ${images.length}개 사진 동기화 확인...`);

    // 파일 이름순 정렬
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const baseName = path.parse(file.name).name;
      const targetFileName = `${baseName}.webp`;
      const targetFilePath = path.join(folderOutputDir, targetFileName);

      const cacheKey = `${folderName}/${file.id}`;
      const cached = cache.files[cacheKey];

      // 캐시 유효성 검사 (md5Checksum 일치 및 실제 파일 존재)
      if (
        cached &&
        cached.md5Checksum === file.md5Checksum &&
        fs.existsSync(targetFilePath)
      ) {
        totalCached++;
        continue;
      }

      // 새 파일 또는 변경된 파일 다운로드
      try {
        const downloadRes = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'stream' }
        );

        const buffer = await streamToBuffer(downloadRes.data);

        // HEIC/HEIF 포맷 여부 판별
        const isHeic =
          /\.(heic|heif)$/i.test(file.name) ||
          file.mimeType?.toLowerCase().includes('heic') ||
          file.mimeType?.toLowerCase().includes('heif');

        let imageBufferForSharp;
        let sharpOptions = {};

        if (isHeic) {
          try {
            console.log(`   📱 아이폰 HEIC 사진 감지: ${file.name} 디코딩 중...`);
            const { data, width, height } = await decodeHeic({ buffer });
            imageBufferForSharp = Buffer.from(data);
            sharpOptions = {
              raw: { width, height, channels: 4 },
            };
          } catch (heicErr) {
            console.warn(`   ⚠️ HEIC 디코딩 실패, 기본 버퍼 시도:`, heicErr.message);
            imageBufferForSharp = buffer;
          }
        } else {
          imageBufferForSharp = buffer;
        }

        // sharp를 통한 리사이징, WebP 변환 및 EXIF/GPS 완전 제거
        // (.withMetadata()를 호출하지 않으므로 Sharp가 모든 EXIF/GPS 메타데이터를 자동 제거)
        await sharp(imageBufferForSharp, sharpOptions)
          .rotate() // 원본 방향에 맞게 회전 보정
          .resize({
            width: 1600,
            height: 1600,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toFile(targetFilePath);

        // 커버 사진 자동 생성 (이름이 cover.* 이거나 첫 번째 사진인 경우)
        const isCover = file.name.toLowerCase().startsWith('cover.') || i === 0;
        const coverFilePath = path.join(folderOutputDir, 'cover.webp');
        if (isCover && (!fs.existsSync(coverFilePath) || file.name.toLowerCase().startsWith('cover.'))) {
          await sharp(imageBufferForSharp, sharpOptions)
            .rotate()
            .resize({
              width: 800,
              height: 800,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .webp({ quality: 85 })
            .toFile(coverFilePath);
        }

        cache.files[cacheKey] = {
          name: file.name,
          md5Checksum: file.md5Checksum,
          modifiedTime: file.modifiedTime,
          syncedAt: new Date().toISOString(),
        };

        totalDownloaded++;
        console.log(`   ✓ 변환 완료: ${targetFileName} (1600px WebP, EXIF 제거됨)`);
      } catch (err) {
        console.warn(`   ❌ 변환 실패 (${file.name}):`, err.message);
        totalErrors++;
      }
    }
  }

  saveCache(cache);

  console.log('\n==========================================');
  console.log(`🎉 동기화 완료:`);
  console.log(`   - 신규 다운로드/변환: ${totalDownloaded}장`);
  console.log(`   - 캐시 유지(스킵): ${totalCached}장`);
  if (totalErrors > 0) {
    console.log(`   - 처리 실패: ${totalErrors}건`);
  }
  console.log('==========================================\n');
}

syncPhotos().catch((err) => {
  console.error('❌ 사진 동기화 프로세스 오류:', err);
  // 빌드가 중단되지 않도록 경고만 출력하고 정상 종료
  process.exit(0);
});
