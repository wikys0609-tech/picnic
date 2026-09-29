#!/usr/bin/env node

/**
 * 대화형 산책 기록 생성기 (CLI 도구)
 * 실행: npm run new
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output });

const PLACES_DIR = path.resolve(process.cwd(), 'src/content/places');
const WALKS_DIR = path.resolve(process.cwd(), 'src/content/walks');

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-가-힣]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  console.log('\n==========================================');
  console.log('🌿 소풍(Picnic) — 새로운 산책 기록 생성기');
  console.log('==========================================\n');

  try {
    // 1. 기존 장소 목록 조회
    const existingPlaceFiles = fs.existsSync(PLACES_DIR)
      ? fs.readdirSync(PLACES_DIR).filter(f => f.endsWith('.md'))
      : [];
    const placeIds = existingPlaceFiles.map(f => f.replace('.md', ''));

    console.log(`📌 현재 등록된 장소 (${placeIds.length}개):`);
    console.log(`   ${placeIds.join(', ')}\n`);

    // 2. 산책 기본 정보 입력
    const title = await rl.question('1. 산책 제목 (예: 초가을 바람과 메타세쿼이아 그늘, 서울숲): ');
    if (!title.trim()) {
      console.error('❌ 제목은 필수입니다.');
      process.exit(1);
    }

    const today = getTodayString();
    const dateInput = await rl.question(`2. 산책 일자 (YYYY-MM-DD, 기본값: ${today}): `);
    const date = dateInput.trim() || today;

    const timeOfDay = await rl.question('3. 시간대 (아침 / 낮 / 저녁 / 밤, 엔터=생략): ');
    const weather = await rl.question('4. 날씨 (예: 맑고 선선함, 엔터=생략): ');
    const companions = await rl.question('5. 동행 (예: 혼자 / 반려견과 함께, 엔터=생략): ');
    const mood = await rl.question('6. 기분 또는 한 줄 인상 (예: 🌿 평온, 엔터=생략): ');

    // 3. 방문 장소 입력
    let selectedPlaces = [];
    const placesInput = await rl.question('7. 방문한 장소 ID (쉼표로 구분, 예: seoul-forest, dream-forest): ');
    if (placesInput.trim()) {
      selectedPlaces = placesInput.split(',').map(s => s.trim()).filter(Boolean);
    }

    if (selectedPlaces.length === 0) {
      console.log('⚠️ 장소가 지정되지 않아 기본값으로 seoul-forest를 사용합니다.');
      selectedPlaces = ['seoul-forest'];
    }

    // 4. 태그
    const tagsInput = await rl.question('8. 태그 (쉼표로 구분, 예: 가을, 숲길, 사색): ');
    const tags = tagsInput
      ? tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    // 5. 파일 슬러그 결정
    const defaultSlug = `${date}-${slugify(title).slice(0, 30)}`;
    const slugInput = await rl.question(`9. 파일명 슬러그 (기본값: ${defaultSlug}): `);
    const finalSlug = slugInput.trim() || defaultSlug;

    // 6. 감상 내용
    console.log('\n10. 산책 에세이/감상 본문 입력:');
    console.log('    (입력을 마치려면 빈 줄에서 END 를 입력하거나, 작성 완료 후 생성된 .md 파일에서 편집할 수 있습니다.)');
    
    let contentLines = [];
    while (true) {
      const line = await rl.question('> ');
      if (line.trim() === 'END') break;
      contentLines.push(line);
      // 단일 줄 입력 후 빠른 작성을 지원하기 위해 빈 줄 1번 시 탈출 옵션
      if (contentLines.length === 1 && line.trim() === '') {
        contentLines = ['산책의 고요한 순간을 여기에 기록합니다.'];
        break;
      }
    }

    const content = contentLines.join('\n');

    // 7. Markdown 생성
    const frontmatter = [
      '---',
      `title: ${JSON.stringify(title.trim())}`,
      `date: "${date}"`,
    ];
    if (timeOfDay.trim()) frontmatter.push(`timeOfDay: ${timeOfDay.trim()}`);
    if (weather.trim()) frontmatter.push(`weather: ${JSON.stringify(weather.trim())}`);
    if (companions.trim()) frontmatter.push(`companions: ${JSON.stringify(companions.trim())}`);
    if (mood.trim()) frontmatter.push(`mood: ${JSON.stringify(mood.trim())}`);
    
    frontmatter.push('places:');
    for (const p of selectedPlaces) {
      frontmatter.push(`  - ${p}`);
    }

    frontmatter.push(`photoFolder: ${finalSlug}`);
    frontmatter.push('cover: cover.webp');

    if (tags.length > 0) {
      frontmatter.push('tags:');
      for (const t of tags) {
        frontmatter.push(`  - ${t}`);
      }
    } else {
      frontmatter.push('tags: []');
    }

    frontmatter.push('draft: false');
    frontmatter.push('---');
    frontmatter.push('');
    frontmatter.push(content || '산책의 기억을 기록합니다.');
    frontmatter.push('');

    const targetFilePath = path.join(WALKS_DIR, `${finalSlug}.md`);
    fs.writeFileSync(targetFilePath, frontmatter.join('\n'), 'utf8');

    console.log('\n==========================================');
    console.log(`✅ 새로운 산책 기록이 생성되었습니다!`);
    console.log(`📄 파일 위치: ${targetFilePath}`);
    console.log('==========================================\n');
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error('오류 발생:', err);
  process.exit(1);
});
