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
import exifr from 'exifr';
import { matchWalksAndFolders } from '../src/lib/content/folder-matcher.js';

const CACHE_FILE = path.resolve(process.cwd(), '.photo-cache.json');
const OUTPUT_DIR = path.resolve(process.cwd(), 'public/photos');

// 로컬 산책 및 장소 메타데이터 로드
function loadLocalWalksAndPlaces() {
  const placesDir = path.resolve(process.cwd(), 'src/content/places');
  const walksDir = path.resolve(process.cwd(), 'src/content/walks');

  const placesMap = {};
  if (fs.existsSync(placesDir)) {
    const placeFiles = fs.readdirSync(placesDir).filter(f => f.endsWith('.md'));
    for (const file of placeFiles) {
      const id = path.parse(file).name;
      const content = fs.readFileSync(path.join(placesDir, file), 'utf8');
      const nameMatch = content.match(/name:\s*([^\r\n]+)/);
      const name = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : id;
      placesMap[id] = { id, name };
    }
  }

  const walksList = [];
  if (fs.existsSync(walksDir)) {
    const walkFiles = fs.readdirSync(walksDir).filter(f => f.endsWith('.md'));
    for (const file of walkFiles) {
      const slug = path.parse(file).name;
      const content = fs.readFileSync(path.join(walksDir, file), 'utf8');
      const dateMatch = content.match(/date:\s*([^\r\n]+)/);
      const photoFolderMatch = content.match(/photoFolder:\s*([^\r\n]+)/);
      const date = dateMatch ? dateMatch[1].trim().replace(/^["']|["']$/g, '') : '';
      const photoFolder = photoFolderMatch ? photoFolderMatch[1].trim().replace(/^["']|["']$/g, '') : '';

      const places = [];
      const placesBlockMatch = content.match(/places:\s*\r?\n((?:[ \t]*-[^\r\n]+\r?\n?)*)/);
      if (placesBlockMatch && placesBlockMatch[1]) {
        const lines = placesBlockMatch[1].split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('-')) {
            places.push(trimmed.slice(1).trim().replace(/^["']|["']$/g, ''));
          }
        }
      }

      const placeNames = places.map(p => placesMap[p]?.name).filter(Boolean);

      walksList.push({
        slug,
        date,
        photoFolder,
        places,
        placeNames,
      });
    }
  }

  return { placesMap, walksList };
}

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

// 4. Google Drive API 페이지네이션(nextPageToken) 전체 조회 헬퍼
async function listAllDriveFiles(drive, params) {
  const allFiles = [];
  let pageToken = undefined;

  let fieldsParam = params.fields;
  if (fieldsParam && !fieldsParam.includes('nextPageToken')) {
    fieldsParam = `nextPageToken, ${fieldsParam}`;
  }

  do {
    const res = await drive.files.list({
      ...params,
      fields: fieldsParam,
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const items = res.data.files || [];
    allFiles.push(...items);
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return allFiles;
}

// 5. 메인 동기화 함수
async function syncPhotos() {
  console.log('\n==========================================');
  console.log('📷 소풍(Picnic) — 구글 드라이브 사진 파이프라인');
  console.log('==========================================');

  const credentials = loadCredentials();
  const rootFolderId = process.env.GDRIVE_ROOT_FOLDER_ID?.trim();

  const debugInfo = {
    syncedAt: new Date().toISOString(),
    hasCredentials: !!credentials,
    clientEmail: credentials?.client_email || null,
    rootFolderIdInput: rootFolderId || null,
    actualRootId: null,
    foldersFound: [],
    allAccessibleFolders: [],
    totalDownloaded: 0,
    totalCached: 0,
    totalErrors: 0,
    logs: [],
  };

  const addLog = (msg) => {
    console.log(msg);
    debugInfo.logs.push(msg);
  };

  const writeDebugInfo = () => {
    try {
      if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(
        path.resolve(process.cwd(), 'public', 'photos-debug.json'),
        JSON.stringify(debugInfo, null, 2),
        'utf8'
      );
    } catch {}
  };

  const ensureFoldersJson = () => {
    const foldersJsonPath = path.join(OUTPUT_DIR, 'folders.json');
    if (!fs.existsSync(foldersJsonPath)) {
      const localFolders = [];
      const walksMap = {};
      const driveNames = {};
      if (fs.existsSync(OUTPUT_DIR)) {
        const entries = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const dirPath = path.join(OUTPUT_DIR, entry.name);
            const files = fs.readdirSync(dirPath).filter(f => /\.(webp|jpg|jpeg|png)$/i.test(f));
            localFolders.push({
              id: entry.name,
              name: entry.name,
              outputDir: entry.name,
              matchedWalkSlug: null,
              photoCount: files.length,
              status: 'unmatched',
            });
            driveNames[entry.name] = entry.name;
          }
        }
      }
      try {
        fs.writeFileSync(
          foldersJsonPath,
          JSON.stringify(
            {
              syncedAt: new Date().toISOString(),
              folders: localFolders,
              walks: walksMap,
              driveNames,
              ambiguousWalks: [],
            },
            null,
            2
          ),
          'utf8'
        );
      } catch {}
    }
  };

  if (!credentials || !rootFolderId) {
    addLog('\n💡 [안내] 구글 드라이브 연동 설정이 없습니다:');
    if (!credentials) addLog('   - GDRIVE_SERVICE_ACCOUNT_JSON 미설정');
    if (!rootFolderId) addLog('   - GDRIVE_ROOT_FOLDER_ID 미설정');
    addLog('   사진 동기화를 건너뛰고 기존 로컬 사진으로 빌드를 계속합니다.\n');
    ensureFoldersJson();
    writeDebugInfo();
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

  let actualRootId = rootFolderId;

  // 루트 폴더 유효성 검사 및 폴더명/ID 자동 해결
  try {
    const rootCheck = await drive.files.get({
      fileId: actualRootId,
      fields: 'id, name, mimeType',
      supportsAllDrives: true,
    });
    addLog(`📁 루트 폴더 확인: "${rootCheck.data.name}" (${actualRootId})`);
    debugInfo.actualRootId = actualRootId;
  } catch (err) {
    addLog(`⚠️ ID로 폴더 확인 실패 (${err.message}). 폴더명 또는 전체 접근 가능 폴더 검색 시도...`);
    // 만약 ID 직접 조회가 실패한 경우, 폴더 이름으로 검색 시도 (사용자가 폴더명을 등록했을 때 대비)
    try {
      const searchRes = await drive.files.list({
        q: `name = '${actualRootId.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 10,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      if (searchRes.data.files && searchRes.data.files.length > 0) {
        const found = searchRes.data.files[0];
        addLog(`📁 폴더명 "${actualRootId}"에 해당하는 Google Drive 폴더 ID(${found.id})를 자동 탐색했습니다.`);
        actualRootId = found.id;
        debugInfo.actualRootId = actualRootId;
      } else {
        addLog(`⚠️ 루트 폴더 ID/이름("${actualRootId}")을 찾을 수 없습니다: ${err.message}`);
      }
    } catch (searchErr) {
      addLog(`⚠️ 루트 폴더 탐색 실패: ${searchErr.message}`);
    }
  }

  addLog(`\n📁 루트 폴더(${actualRootId})의 서브폴더 검색 중...`);

  // 서비스 계정이 접근 가능한 모든 폴더 목록 수집 (진단 및 매칭 보강용)
  try {
    const allAccessible = await drive.files.list({
      q: `mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, parents)',
      pageSize: 50,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const accList = allAccessible.data.files || [];
    debugInfo.allAccessibleFolders = accList.map(f => `${f.name} (${f.id})`);
    addLog(`ℹ️ 서비스 계정 접근 가능 폴더: ${accList.map(f => f.name).join(', ') || '없음'}`);
  } catch (accErr) {
    addLog(`⚠️ 접근 가능 폴더 목록 조회 실패: ${accErr.message}`);
  }

  // 1. 루트 폴더 내의 산책별 서브폴더 목록 조회 (nextPageToken 페이지네이션 적용)
  let folders = [];
  try {
    folders = await listAllDriveFiles(drive, {
      q: `'${actualRootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });
  } catch (err) {
    addLog(`❌ 루트 폴더의 서브폴더 목록 조회 실패: ${err.message}`);
  }

  // 2. 만약 서브폴더가 없고, 접근 가능한 폴더 중에 자식 폴더나 seoul-forest 등이 있다면 후보에 추가
  if (folders.length === 0 && debugInfo.allAccessibleFolders.length > 0) {
    try {
      const allAccessible = await listAllDriveFiles(drive, {
        q: `mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name, parents)',
      });
      const candidates = (allAccessible || []).filter(
        f => f.id !== actualRootId && f.name !== 'picnic-photos'
      );
      if (candidates.length > 0) {
        addLog(`💡 접근 가능한 폴더 중 서브폴더 감지: ${candidates.map(c => c.name).join(', ')}`);
        folders = candidates;
      }
    } catch {}
  }

  // 3. 여전히 폴더가 없다면, 루트 폴더 자체에 사진이 바로 들어있는지 확인
  if (folders.length === 0) {
    try {
      const rootImages = await drive.files.list({
        q: `'${actualRootId}' in parents and (mimeType contains 'image/' or name contains '.jpg' or name contains '.png' or name contains '.jpeg' or name contains '.webp' or name contains '.heic' or name contains '.heif') and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 10,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      if (rootImages.data.files && rootImages.data.files.length > 0) {
        let rootName = 'photos';
        try {
          const rootInfo = await drive.files.get({ fileId: actualRootId, fields: 'name', supportsAllDrives: true });
          if (rootInfo.data.name) rootName = rootInfo.data.name;
        } catch {}
        addLog(`📁 루트 폴더(${rootName})에 직접 ${rootImages.data.files.length}장의 사진이 존재합니다.`);
        folders = [{ id: actualRootId, name: rootName }];
      }
    } catch {}
  }

  debugInfo.foldersFound = folders.map(f => f.name);
  addLog(`✓ 총 ${folders.length}개의 산책 사진 폴더를 찾았습니다.\n`);

  // 로컬 산책 및 장소 메타데이터 로드 후 지능형 자동 매칭 수행
  const { placesMap, walksList } = loadLocalWalksAndPlaces();
  const matchResult = matchWalksAndFolders(walksList, folders, placesMap);

  for (const w of matchResult.warnings) {
    addLog(w);
  }

  const matchByFolderId = new Map(matchResult.matches.map(m => [m.folderId, m]));
  const unmatchedByFolderId = new Map(matchResult.unmatchedFolders.map(u => [u.id, u]));
  const folderPhotoCounts = {};

  let totalDownloaded = 0;
  let totalCached = 0;
  let totalErrors = 0;

  for (const folder of folders) {
    const folderName = folder.name.trim();
    const match = matchByFolderId.get(folder.id);
    const unmatched = unmatchedByFolderId.get(folder.id);

    // 영문 안전 출력 디렉터리 이름 결정 (산책 slug 또는 drive-ID)
    const outputDirName = match?.outputDir || unmatched?.outputDir || `drive-${folder.id}`;
    const folderOutputDir = path.join(OUTPUT_DIR, outputDirName);
    if (!fs.existsSync(folderOutputDir)) {
      fs.mkdirSync(folderOutputDir, { recursive: true });
    }

    if (match) {
      addLog(`🔗 [자동 연결] "${folderName}" → 산책 "${match.walkSlug}" (출력: ${outputDirName})`);
    } else {
      addLog(`📁 [미연결 폴더] "${folderName}" → 영문 보관 폴더: ${outputDirName}`);
    }

    // 폴더 내 이미지 파일 조회 (HEIC, HEIF 포함, nextPageToken으로 100장 초과 사진도 끝까지 수집)
    let images = [];
    try {
      images = await listAllDriveFiles(drive, {
        q: `'${folder.id}' in parents and (mimeType contains 'image/' or name contains '.jpg' or name contains '.png' or name contains '.jpeg' or name contains '.webp' or name contains '.heic' or name contains '.heif' or name contains '.HEIC' or name contains '.HEIF') and trashed = false`,
        fields: 'files(id, name, mimeType, md5Checksum, modifiedTime, size)',
      });
    } catch (err) {
      addLog(`⚠️ [${folderName}] 사진 목록 조회 실패: ${err.message}`);
      totalErrors++;
      continue;
    }

    if (images.length === 0) continue;

    if (images.length > 30) {
      addLog(`⚠️ [${folderName}] 사진이 ${images.length}장으로 권장 장수(10~30장)를 초과했습니다. 모바일 환경 최적화를 위해 10~30장을 권장합니다. (모든 사진은 정상 처리됩니다)`);
    }

    addLog(`📸 [${folderName}] ${images.length}개 사진 동기화 확인...`);

    // 파일 이름순 정렬
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const hasExplicitCover = images.some(img => img.name.toLowerCase().startsWith('cover.'));
    const folderPhotos = [];

    for (let i = 0; i < images.length; i++) {
      const file = images[i];
      const baseName = path.parse(file.name).name;
      const targetFileName = `${baseName}.webp`;
      const targetFilePath = path.join(folderOutputDir, targetFileName);

      const cacheKey = `${folderName}/${file.id}`;
      const cached = cache.files[cacheKey];

      let takenAt = null;

      // 캐시 유효성 검사 (md5Checksum 일치 및 실제 파일 존재)
      if (
        cached &&
        cached.md5Checksum === file.md5Checksum &&
        fs.existsSync(targetFilePath)
      ) {
        totalCached++;
        if ('takenAt' in cached) {
          // 이미 신규 파이프라인에서 처리되어 takenAt 필드가 존재하는 경우
          takenAt = cached.takenAt ?? null;
        } else {
          // 기존 캐시 보정: 이번 변경 전 캐시되어 takenAt이 없는 사진은 원본에서 EXIF를 다시 읽어 캐시에 채움 (WebP 재변환 불필요)
          try {
            const downloadRes = await drive.files.get(
              { fileId: file.id, alt: 'media', supportsAllDrives: true },
              { responseType: 'stream' }
            );
            const buffer = await streamToBuffer(downloadRes.data);
            try {
              const exif = await exifr.parse(buffer, ['DateTimeOriginal']);
              if (exif?.DateTimeOriginal) {
                const d = exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : new Date(exif.DateTimeOriginal);
                if (!isNaN(d.getTime())) {
                  takenAt = d.toISOString();
                }
              }
            } catch {}
            cached.takenAt = takenAt;
            cached.syncedAt = new Date().toISOString();
            addLog(`   ℹ️ [기존 캐시 보정] ${file.name}: 원본 EXIF에서 촬영 시각 보정 완료 (${takenAt ? takenAt : '촬영 시각 없음'})`);
          } catch (err) {
            addLog(`   ⚠️ [캐시 보정 실패] ${file.name}: ${err.message}`);
            cached.takenAt = null;
          }
        }
      } else {
        // 새 파일 또는 변경된 파일 다운로드
        try {
          const downloadRes = await drive.files.get(
            { fileId: file.id, alt: 'media', supportsAllDrives: true },
            { responseType: 'stream' }
          );

          const buffer = await streamToBuffer(downloadRes.data);

          // EXIF 메타데이터 제거 전 DateTimeOriginal 추출
          try {
            const exif = await exifr.parse(buffer, ['DateTimeOriginal']);
            if (exif?.DateTimeOriginal) {
              const d = exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : new Date(exif.DateTimeOriginal);
              if (!isNaN(d.getTime())) {
                takenAt = d.toISOString();
              }
            }
          } catch {
            // EXIF가 없거나 파싱 불가 시 takenAt = null
          }

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
          const isCoverCandidate = file.name.toLowerCase().startsWith('cover.') || (!hasExplicitCover && i === 0);
          const coverFilePath = path.join(folderOutputDir, 'cover.webp');
          if (isCoverCandidate && (!fs.existsSync(coverFilePath) || file.name.toLowerCase().startsWith('cover.'))) {
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
            targetFileName,
            md5Checksum: file.md5Checksum,
            modifiedTime: file.modifiedTime,
            takenAt,
            syncedAt: new Date().toISOString(),
          };

          totalDownloaded++;
          addLog(`   ✓ 변환 완료: ${targetFileName} (1600px WebP, EXIF 제거됨${takenAt ? `, 촬영: ${takenAt}` : ''})`);
        } catch (err) {
          addLog(`   ❌ 변환 실패 (${file.name}): ${err.message}`);
          totalErrors++;
          continue;
        }
      }

      folderPhotos.push({
        file: targetFileName,
        originalName: file.name,
        takenAt,
      });
    }

    // 만약 별도의 cover.webp 파일이 생성되어 있고 folderPhotos에 포함되지 않았다면 등록
    const coverFilePath = path.join(folderOutputDir, 'cover.webp');
    if (fs.existsSync(coverFilePath) && !folderPhotos.some(p => p.file === 'cover.webp')) {
      folderPhotos.unshift({
        file: 'cover.webp',
        originalName: 'cover.webp (auto-generated)',
        takenAt: folderPhotos[0]?.takenAt ?? null,
      });
    }

    // 앨범 사진 정렬 규칙 적용:
    // 1. cover.* 파일 최우선 (항상 맨 첫 장 표지)
    // 2. EXIF 촬영 시각(takenAt) 오름차순
    // 3. 촬영 시각이 없는 사진은 파일명 자연 정렬
    // 4. 촬영 시각이 동일한 사진 간에는 파일명 자연 정렬
    const coverPhoto = folderPhotos.find(p => p.file.toLowerCase().startsWith('cover.'));
    const coverFileName = coverPhoto?.file || null;

    folderPhotos.sort((a, b) => {
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

    folderPhotoCounts[folder.id] = folderPhotos.length;

    // 공개 manifest.json 작성:
    // 사이트와 함께 배포되므로 촬영 시각(takenAt)을 노출하지 않고 정렬된 순번(order)만 기록
    // (촬영 시각은 배포되지 않는 .photo-cache.json에만 보관)
    if (folderPhotos.length > 0) {
      const manifestPath = path.join(folderOutputDir, 'manifest.json');
      const manifestData = {
        folderName: outputDirName,
        driveFolderName: folderName,
        syncedAt: new Date().toISOString(),
        photos: folderPhotos.map((p, idx) => ({
          file: p.file,
          order: idx + 1,
        })),
      };
      try {
        fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf8');
      } catch (manifestErr) {
        addLog(`   ⚠️ [${folderName}] manifest.json 저장 실패: ${manifestErr.message}`);
      }
    }
  }

  // 전체 사진 폴더 요약(folders.json) 생성 (작성 도구 /write 및 렌더러 연동)
  const foldersSummary = {
    syncedAt: new Date().toISOString(),
    folders: folders.map(f => {
      const m = matchByFolderId.get(f.id);
      const u = unmatchedByFolderId.get(f.id);
      const dirName = m?.outputDir || u?.outputDir || `drive-${f.id}`;
      const photoCount = folderPhotoCounts[f.id] || 0;
      const isAmbiguous = matchResult.ambiguousWalks.some(a => a.candidates.some(c => c.id === f.id));
      return {
        id: f.id,
        name: f.name,
        date: parseFolderName(f.name).date,
        outputDir: dirName,
        matchedWalkSlug: m?.walkSlug || null,
        photoCount,
        status: m ? 'matched' : (isAmbiguous ? 'ambiguous' : 'unmatched'),
      };
    }),
    walks: {},
    driveNames: {},
    ambiguousWalks: matchResult.ambiguousWalks,
  };

  for (const m of matchResult.matches) {
    foldersSummary.walks[m.walkSlug] = {
      folderId: m.folderId,
      folderName: m.folderName,
      outputDir: m.outputDir,
      photoCount: folderPhotoCounts[m.folderId] || 0,
    };
    foldersSummary.driveNames[m.folderName] = m.outputDir;
  }

  try {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'folders.json'),
      JSON.stringify(foldersSummary, null, 2),
      'utf8'
    );
    addLog(`✓ public/photos/folders.json 생성 완료`);
  } catch (err) {
    addLog(`⚠️ folders.json 저장 실패: ${err.message}`);
  }

  saveCache(cache);

  debugInfo.totalDownloaded = totalDownloaded;
  debugInfo.totalCached = totalCached;
  debugInfo.totalErrors = totalErrors;
  writeDebugInfo();

  addLog('\n==========================================');
  addLog(`🎉 동기화 완료:`);
  addLog(`   - 신규 다운로드/변환: ${totalDownloaded}장`);
  addLog(`   - 캐시 유지(스킵): ${totalCached}장`);
  if (totalErrors > 0) {
    addLog(`   - 처리 실패: ${totalErrors}건`);
  }
  addLog('==========================================\n');
}

syncPhotos().catch((err) => {
  console.error('❌ 사진 동기화 프로세스 오류:', err);
  try {
    fs.writeFileSync(
      path.resolve(process.cwd(), 'public', 'photos-debug.json'),
      JSON.stringify({ fatalError: err.message, stack: err.stack }, null, 2),
      'utf8'
    );
  } catch {}
  // 빌드가 중단되지 않도록 경고만 출력하고 정상 종료
  process.exit(0);
});
