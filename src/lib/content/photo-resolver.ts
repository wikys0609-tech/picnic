import fs from 'node:fs';
import path from 'node:path';

export interface ResolvedPhotos {
  folderName: string | null;
  coverFile: string | null;
  photoFiles: string[];
}

/**
 * 산책(walk)의 photoFolder 또는 date(YYYY-MM-DD)를 바탕으로
 * 실제 public/photos/ 하위의 사진 디렉터리와 사진 파일 목록을 지능적으로 탐색
 * 
 * 탐색 우선순위:
 * 1. photoFolder (예: 2026-09-20-seoul-forest) 디렉터리 직접 매칭
 * 2. date (예: 2026-09-20) 날짜 단독 디렉터리 직접 매칭
 * 3. date로 시작하는 접두사 폴더 매칭 (예: 2026-09-20-*)
 * 4. photoFolder의 날짜 부분 역추적 매칭
 */
export function resolveWalkPhotos(
  photoFolder?: string,
  date?: string,
  preferredCover: string = 'cover.webp'
): ResolvedPhotos {
  const photosRoot = path.join(process.cwd(), 'public', 'photos');
  if (!fs.existsSync(photosRoot)) {
    return { folderName: null, coverFile: null, photoFiles: [] };
  }

  let matchedDirName: string | null = null;

  // 1. photoFolder 명시된 경우 우선 확인
  if (photoFolder && fs.existsSync(path.join(photosRoot, photoFolder))) {
    matchedDirName = photoFolder;
  }

  // 2. date (YYYY-MM-DD) 단독 폴더 확인
  if (!matchedDirName && date && fs.existsSync(path.join(photosRoot, date))) {
    matchedDirName = date;
  }

  // 3. date로 시작하는 서브폴더 검색 (예: 2026-09-20-...)
  if (!matchedDirName && date) {
    try {
      const dirs = fs
        .readdirSync(photosRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      const found = dirs.find(
        (d) => d === date || d.startsWith(`${date}-`) || d.startsWith(`${date}_`)
      );
      if (found) {
        matchedDirName = found;
      }
    } catch {}
  }

  // 4. photoFolder에서 날짜 추출 후 탐색
  if (!matchedDirName && photoFolder) {
    const dateMatch = photoFolder.match(/^\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      const extractedDate = dateMatch[0];
      if (fs.existsSync(path.join(photosRoot, extractedDate))) {
        matchedDirName = extractedDate;
      }
    }
  }

  if (!matchedDirName) {
    return { folderName: null, coverFile: null, photoFiles: [] };
  }

  const targetDir = path.join(photosRoot, matchedDirName);
  let files: string[] = [];
  try {
    files = fs.readdirSync(targetDir).filter((f) => /\.(webp|jpg|jpeg|png)$/i.test(f));
  } catch {
    files = [];
  }

  if (files.length === 0) {
    return { folderName: matchedDirName, coverFile: null, photoFiles: [] };
  }

  // 커버 파일 선정: preferredCover가 있으면 우선, 아니면 cover.*, 없으면 첫 번째 사진
  let coverFile: string | null = null;
  if (files.includes(preferredCover)) {
    coverFile = preferredCover;
  } else {
    coverFile = files.find((f) => f.toLowerCase().startsWith('cover.')) || files[0] || null;
  }

  // 커버가 맨 앞에 오고, 나머지는 파일명 순 정렬
  const photoFiles = [...files].sort((a, b) => {
    if (a === coverFile) return -1;
    if (b === coverFile) return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  return {
    folderName: matchedDirName,
    coverFile,
    photoFiles,
  };
}
