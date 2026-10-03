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
 * 1. photoFolder (예: 2026-09-20-seoul-forest, seoul-forest) 디렉터리 직접 매칭
 * 2. date (예: 2026-09-20) 날짜 단독 디렉터리 직접 매칭
 * 3. date로 시작하는 접두사 폴더 매칭 (예: 2026-09-20-*)
 * 4. photoFolder의 날짜 부분 역추적 매칭
 * 5. photoFolder에서 날짜를 뺀 장소 슬러그 매칭 (예: 2026-09-20-seoul-forest -> seoul-forest)
 * 6. 등록된 장소 ID(places) 매칭
 * 7. 폴더명 상호 포함 및 접미사 유연 매칭
 */
export function resolveWalkPhotos(
  photoFolder?: string,
  date?: string,
  preferredCover: string = 'cover.webp',
  places?: (string | { id: string })[]
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

  // 4. photoFolder에서 날짜 추출 후 탐색 (예: 2026-09-20-seoul-forest -> 2026-09-20)
  if (!matchedDirName && photoFolder) {
    const dateMatch = photoFolder.match(/^\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      const extractedDate = dateMatch[0];
      if (fs.existsSync(path.join(photosRoot, extractedDate))) {
        matchedDirName = extractedDate;
      }
    }
  }

  // 5. photoFolder에서 날짜(YYYY-MM-DD-)를 제거한 장소명/슬러그 확인 (예: 2026-09-20-seoul-forest -> seoul-forest)
  if (!matchedDirName && photoFolder) {
    const slugWithoutDate = photoFolder.replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '').trim();
    if (slugWithoutDate && fs.existsSync(path.join(photosRoot, slugWithoutDate))) {
      matchedDirName = slugWithoutDate;
    }
  }

  // 6. places 목록(장소 ID)으로 매칭 확인
  if (!matchedDirName && places && places.length > 0) {
    for (const p of places) {
      const placeId = typeof p === 'string' ? p : p.id;
      if (placeId && fs.existsSync(path.join(photosRoot, placeId))) {
        matchedDirName = placeId;
        break;
      }
    }
  }

  // 7. 디렉터리 목록 순회하며 접미사/부분 매칭 (예: seoul-forest <-> 2026-09-20-seoul-forest 상호 매칭)
  if (!matchedDirName && photoFolder) {
    try {
      const dirs = fs
        .readdirSync(photosRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      const cleanFolder = photoFolder.toLowerCase();
      const slugWithoutDate = photoFolder.replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '').toLowerCase().trim();

      const found = dirs.find((d) => {
        const dLower = d.toLowerCase();
        if (slugWithoutDate && dLower === slugWithoutDate) return true;
        if (slugWithoutDate && (dLower.endsWith(`-${slugWithoutDate}`) || dLower.endsWith(`_${slugWithoutDate}`))) return true;
        if (slugWithoutDate && (slugWithoutDate.endsWith(`-${dLower}`) || slugWithoutDate.endsWith(`_${dLower}`))) return true;
        if (cleanFolder.includes(dLower) || dLower.includes(cleanFolder)) return true;
        return false;
      });

      if (found) {
        matchedDirName = found;
      }
    } catch {}
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

  // manifest.json이 존재하면 로드하여 EXIF 촬영 시각(takenAt) 매핑 구성
  const manifestMap: Record<string, string | null> = {};
  const manifestPath = path.join(targetDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
      const manifestData = JSON.parse(manifestRaw);
      if (Array.isArray(manifestData?.photos)) {
        for (const item of manifestData.photos) {
          if (item?.file) {
            manifestMap[item.file] = item.takenAt || null;
          }
        }
      }
    } catch {}
  }

  // 커버 파일 선정: preferredCover가 있으면 우선, 아니면 cover.* 검색
  let coverFile: string | null = null;
  if (files.includes(preferredCover)) {
    coverFile = preferredCover;
  } else {
    coverFile = files.find((f) => f.toLowerCase().startsWith('cover.')) || null;
  }

  // 사진 정렬 기준:
  // 1. coverFile 최우선 (항상 맨 첫 장 표지 유지)
  // 2. EXIF 촬영 시각(DateTimeOriginal / takenAt) 오름차순 (시간순)
  // 3. 촬영 시각이 없는 사진(스크린샷, 메신저 등)은 파일 이름 자연 정렬(Natural Numeric Sort)로 뒤에 배치
  // 4. 촬영 시각이 동일한 경우 파일 이름 자연 정렬로 순서 결정
  const comparePhotos = (a: string, b: string): number => {
    if (coverFile) {
      if (a === coverFile && b !== coverFile) return -1;
      if (b === coverFile && a !== coverFile) return 1;
    }

    const timeA = manifestMap[a];
    const timeB = manifestMap[b];

    if (timeA && timeB) {
      const diff = new Date(timeA).getTime() - new Date(timeB).getTime();
      if (diff !== 0) return diff;
    } else if (timeA && !timeB) {
      return -1; // 촬영 시각 있는 사진 우선
    } else if (!timeA && timeB) {
      return 1;
    }

    return a.localeCompare(b, undefined, { numeric: true });
  };

  const photoFiles = [...files].sort(comparePhotos);

  // coverFile이 명시적으로 지정되지 않은 경우, 시간순/자연정렬 첫 번째 사진을 커버로 지정
  if (!coverFile && photoFiles.length > 0) {
    coverFile = photoFiles[0];
  }

  return {
    folderName: matchedDirName,
    coverFile,
    photoFiles,
  };
}
