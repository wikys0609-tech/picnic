/**
 * 사진 폴더 이름 자동 매칭 및 문자열 정규화 모듈
 * 
 * 규칙:
 * 1. 폴더 형식: `YYYY-MM-DD 장소명` (구분자: 공백, 하이픈, 언더바 모두 허용)
 * 2. 정규화: 유니코드 NFC, 앞뒤 공백 제거, 연속 공백/하이픈/언더바 통일, 대소문자 무시
 * 3. 자동 매칭:
 *    - photoFolder 명시 시 최우선 사용
 *    - 날짜 일치 + 장소명(places의 name 또는 id) 포함 시 매칭
 *    - 그날 산책이 1개, 그날 폴더도 1개면 장소명 달라도 자동 연결
 *    - 후보가 여러 개면 모호함(ambiguous) 처리 후 작성 도구에서 선택할 수 있도록 목록 제공
 */

/**
 * 비교용 문자열 정규화
 * - 유니코드 NFC 정규화 (한글 자모 분리 방지)
 * - 앞뒤 공백 제거
 * - 대소문자 소문자 통일
 * - 연속 공백, 하이픈, 언더바를 단일 공백으로 통일
 */
export function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, ' ')
    .trim();
}

/**
 * 폴더 이름에서 날짜(YYYY-MM-DD)와 나머지(장소명/키워드) 추출
 * 예:
 * - "2026-10-05 올림픽공원" -> { date: "2026-10-05", remainder: "올림픽공원" }
 * - "2026-10-19_서울숲_아침" -> { date: "2026-10-19", remainder: "서울숲 아침" }
 * - "2026-10-05-olympic-park" -> { date: "2026-10-05", remainder: "olympic park" }
 * - "2026-10-05" -> { date: "2026-10-05", remainder: "" }
 */
export function parseFolderName(rawName) {
  if (!rawName) {
    return {
      raw: '',
      normalized: '',
      date: null,
      remainder: '',
      normalizedRemainder: '',
      hasDate: false,
    };
  }

  const raw = String(rawName).trim();
  const normalized = normalizeText(raw);

  // 1. YYYY-MM-DD 로 시작하는 경우 (구분자: 공백, 하이픈, 언더바)
  const matchStandard = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[\s\-_]+(.*))?$/);
  if (matchStandard) {
    const date = matchStandard[1];
    const remainder = (matchStandard[2] || '').trim();
    return {
      raw,
      normalized,
      date,
      remainder,
      normalizedRemainder: normalizeText(remainder),
      hasDate: true,
    };
  }

  // 2. YYYYMMDD 또는 YYYY_MM_DD 로 시작하는 경우
  const matchAlt = raw.match(/^(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})(?:[\s\-_]+(.*))?$/);
  if (matchAlt) {
    const date = `${matchAlt[1]}-${matchAlt[2]}-${matchAlt[3]}`;
    const remainder = (matchAlt[4] || '').trim();
    return {
      raw,
      normalized,
      date,
      remainder,
      normalizedRemainder: normalizeText(remainder),
      hasDate: true,
    };
  }

  return {
    raw,
    normalized,
    date: null,
    remainder: raw,
    normalizedRemainder: normalized,
    hasDate: false,
  };
}

/**
 * 산책(Walk) 목록과 구글 드라이브 폴더 목록을 규칙에 따라 자동 매칭
 * 
 * @param {Array<{slug: string, date: string, photoFolder?: string, places?: string[], placeNames?: string[]}>} walks
 * @param {Array<{id: string, name: string}>} driveFolders
 * @param {Record<string, {id: string, name: string}>} placesMap
 */
export function matchWalksAndFolders(walks = [], driveFolders = [], placesMap = {}) {
  const matches = [];
  const unmatchedFolders = [];
  const ambiguousWalks = [];
  const warnings = [];

  // 각 드라이브 폴더 파싱
  const parsedFolders = driveFolders.map(folder => {
    const parsed = parseFolderName(folder.name);
    return {
      id: folder.id,
      name: folder.name,
      ...parsed,
      isMatched: false,
      matchedWalkSlug: null,
    };
  });

  // 날짜별 폴더 인덱싱
  const foldersByDate = {};
  for (const f of parsedFolders) {
    if (f.date) {
      if (!foldersByDate[f.date]) foldersByDate[f.date] = [];
      foldersByDate[f.date].push(f);
    }
  }

  // 날짜별 산책 인덱싱
  const walksByDate = {};
  for (const w of walks) {
    if (w.date) {
      if (!walksByDate[w.date]) walksByDate[w.date] = [];
      walksByDate[w.date].push(w);
    }
  }

  // 1단계: 기록에 photoFolder가 명시되어 있는 산책 우선 처리
  for (const walk of walks) {
    if (!walk.photoFolder || !walk.photoFolder.trim()) continue;

    const targetPhotoFolder = normalizeText(walk.photoFolder);
    const found = parsedFolders.find(f => {
      if (f.isMatched) return false;
      return (
        f.id === walk.photoFolder ||
        f.normalized === targetPhotoFolder ||
        f.raw === walk.photoFolder ||
        (f.date === walk.date && f.normalizedRemainder === targetPhotoFolder)
      );
    });

    if (found) {
      found.isMatched = true;
      found.matchedWalkSlug = walk.slug;
      matches.push({
        walkSlug: walk.slug,
        folderId: found.id,
        folderName: found.name,
        outputDir: walk.slug, // 영문 안전 slug 사용
        matchType: 'explicit_photo_folder',
      });
    }
  }

  // 2단계: photoFolder가 없거나 미매칭된 산책 자동 매칭
  for (const walk of walks) {
    if (matches.some(m => m.walkSlug === walk.slug)) continue;

    const walkDate = walk.date;
    if (!walkDate) continue;

    // 해당 날짜의 미매칭 드라이브 폴더 후보 수집
    const dateFolders = (foldersByDate[walkDate] || []).filter(f => !f.isMatched);
    if (dateFolders.length === 0) continue;

    // 산책과 연결된 장소명 및 장소 ID 목록 (정규화)
    const placeNames = (walk.placeNames || []).map(normalizeText).filter(Boolean);
    if (placeNames.length === 0 && Array.isArray(walk.places)) {
      for (const p of walk.places) {
        const pid = typeof p === 'string' ? p : p?.id;
        if (pid && placesMap && placesMap[pid]?.name) {
          placeNames.push(normalizeText(placesMap[pid].name));
        }
      }
    }
    const placeIds = (walk.places || []).map(p => {
      const pid = typeof p === 'string' ? p : p?.id;
      return pid ? normalizeText(pid) : '';
    }).filter(Boolean);

    // 장소명 또는 장소 ID가 폴더명/나머지 부분에 포함되는지 확인
    const placeCandidates = dateFolders.filter(folder => {
      const rem = folder.normalizedRemainder;
      const full = folder.normalized;

      // 1. 나머지 부분에 장소명 또는 장소 ID가 포함되어 있는지
      const matchesPlaceName = placeNames.some(pName => rem.includes(pName) || pName.includes(rem) && rem.length >= 2);
      const matchesPlaceId = placeIds.some(pId => rem.includes(pId) || full.includes(pId));

      return matchesPlaceName || matchesPlaceId;
    });

    // 2-1. 장소명 매칭 후보가 정확히 1개인 경우
    if (placeCandidates.length === 1) {
      const found = placeCandidates[0];
      found.isMatched = true;
      found.matchedWalkSlug = walk.slug;
      matches.push({
        walkSlug: walk.slug,
        folderId: found.id,
        folderName: found.name,
        outputDir: walk.slug,
        matchType: 'date_and_place',
      });
      continue;
    }

    // 2-2. 장소명 매칭 후보가 여러 개인 경우 (모호함 -> 자동 연결 금지 및 경고)
    if (placeCandidates.length > 1) {
      ambiguousWalks.push({
        walkSlug: walk.slug,
        date: walkDate,
        candidates: placeCandidates.map(c => ({ id: c.id, name: c.name })),
      });
      warnings.push(
        `⚠️ [산책: ${walk.slug}] "${walkDate}" 날짜에 일치하는 폴더 후보가 여러 개(${placeCandidates.map(c => `"${c.name}"`).join(', ')}) 발견되어 자동 연결하지 않았습니다. 작성 도구에서 폴더를 지정해 주세요.`
      );
      continue;
    }

    // 2-3. 장소명 일치 후보가 없지만, 그날 산책이 1개뿐이고 그날 날짜 폴더도 1개뿐인 경우
    const walksOnThisDate = walksByDate[walkDate] || [];
    if (walksOnThisDate.length === 1 && dateFolders.length === 1) {
      const found = dateFolders[0];
      found.isMatched = true;
      found.matchedWalkSlug = walk.slug;
      matches.push({
        walkSlug: walk.slug,
        folderId: found.id,
        folderName: found.name,
        outputDir: walk.slug,
        matchType: 'single_date_fallback',
      });
      continue;
    }

    // 2-4. 그날 폴더가 여러 개 있는데 장소명이 일치하지 않아 분간할 수 없는 경우
    if (dateFolders.length > 1) {
      ambiguousWalks.push({
        walkSlug: walk.slug,
        date: walkDate,
        candidates: dateFolders.map(c => ({ id: c.id, name: c.name })),
      });
      warnings.push(
        `⚠️ [산책: ${walk.slug}] "${walkDate}" 날짜에 ${dateFolders.length}개의 폴더(${dateFolders.map(c => `"${c.name}"`).join(', ')})가 있으나 장소명이 일치하지 않아 자동 연결하지 못했습니다.`
      );
    }
  }

  // 매칭되지 않은 남은 폴더 수집
  for (const f of parsedFolders) {
    if (!f.isMatched) {
      unmatchedFolders.push({
        id: f.id,
        name: f.name,
        date: f.date,
        outputDir: `drive-${f.id}`,
      });
    }
  }

  return {
    matches,
    unmatchedFolders,
    ambiguousWalks,
    warnings,
    parsedFolders,
  };
}
