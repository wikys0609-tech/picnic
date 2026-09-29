#!/usr/bin/env node

/**
 * CSV 일괄 가져오기 스크립트
 * 실행: npm run import -- <파일경로.csv>
 */

import fs from 'node:fs';
import path from 'node:path';

const PLACES_DIR = path.resolve(process.cwd(), 'src/content/places');
const WALKS_DIR = path.resolve(process.cwd(), 'src/content/walks');

// 간단한 CSV 행 파서 (따옴표 및 쉼표 처리)
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = splitCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx] ? values[idx].trim() : '';
    });
    rows.push(row);
  }

  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function createSampleCSV(samplePath) {
  const sampleContent = `slug,title,date,timeOfDay,weather,companions,mood,places,tags,draft,content
2026-10-01-namsan-autumn,가을 남산 둘레길 산책,2026-10-01,낮,선선한 바람,혼자,🍂 상쾌함,seoul-forest,"가을, 남산, 둘레길",false,남산 자락을 따라 단풍이 들기 시작한 길을 걸었습니다.
2026-10-02-olympic-park,올림픽공원 나홀로나무,2026-10-02,저녁,노을 맑음,친구와 함께,✨ 여유로움,dream-forest,"노을, 들꽃마루",false,너른 잔디밭 너머로 해가 저물어가는 풍경이 아름다웠습니다.
`;
  fs.writeFileSync(samplePath, sampleContent, 'utf8');
}

function main() {
  const args = process.argv.slice(2);
  const targetFile = args[0];

  if (!targetFile) {
    const samplePath = path.resolve(process.cwd(), 'sample-walks.csv');
    if (!fs.existsSync(samplePath)) {
      createSampleCSV(samplePath);
      console.log(`📌 샘플 CSV 파일이 생성되었습니다: ${samplePath}`);
    }
    console.log('\n사용법:');
    console.log('  npm run import -- <CSV_파일경로>');
    console.log('  예: npm run import -- sample-walks.csv\n');
    return;
  }

  const resolvedPath = path.resolve(process.cwd(), targetFile);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${resolvedPath}`);
    process.exit(1);
  }

  const csvText = fs.readFileSync(resolvedPath, 'utf8');
  const records = parseCSV(csvText);

  console.log(`\n총 ${records.length}건의 레코드를 분석합니다...\n`);

  let count = 0;
  for (const row of records) {
    // 1. 산책 기록 (slug 또는 title, date가 있는 경우)
    if (row.title && row.date) {
      const slug = row.slug || `${row.date}-${encodeURIComponent(row.title).slice(0, 20)}`;
      const places = row.places
        ? row.places.split(';').map(p => p.trim()).filter(Boolean)
        : ['seoul-forest'];
      const tags = row.tags
        ? row.tags.split(';').map(t => t.trim()).filter(Boolean)
        : [];

      const lines = [
        '---',
        `title: ${JSON.stringify(row.title)}`,
        `date: "${row.date}"`,
      ];

      if (row.timeOfDay) lines.push(`timeOfDay: ${row.timeOfDay}`);
      if (row.weather) lines.push(`weather: ${JSON.stringify(row.weather)}`);
      if (row.companions) lines.push(`companions: ${JSON.stringify(row.companions)}`);
      if (row.mood) lines.push(`mood: ${JSON.stringify(row.mood)}`);

      lines.push('places:');
      for (const p of places) {
        lines.push(`  - ${p}`);
      }

      lines.push(`photoFolder: ${slug}`);
      lines.push('cover: cover.webp');

      if (tags.length > 0) {
        lines.push('tags:');
        for (const t of tags) {
          lines.push(`  - ${t}`);
        }
      } else {
        lines.push('tags: []');
      }

      lines.push(`draft: ${row.draft === 'true' ? 'true' : 'false'}`);
      lines.push('---');
      lines.push('');
      lines.push(row.content || '산책의 기억을 기록합니다.');
      lines.push('');

      const dest = path.join(WALKS_DIR, `${slug}.md`);
      fs.writeFileSync(dest, lines.join('\n'), 'utf8');
      console.log(`  ✓ 산책 생성: ${slug}.md`);
      count++;
    } else if (row.id && row.name && row.lat && row.lng) {
      // 2. 장소 데이터 가져오기
      const placeLines = [
        '---',
        `name: ${row.name}`,
        `lat: ${parseFloat(row.lat)}`,
        `lng: ${parseFloat(row.lng)}`,
        `sido: ${row.sido || '서울특별시'}`,
        `sigungu: ${row.sigungu || '종로구'}`,
        `type: ${row.type || '공원'}`,
        'facilities: []',
        `hidden: false`,
        '---',
        '',
        row.description || '',
        ''
      ];
      const placeDest = path.join(PLACES_DIR, `${row.id}.md`);
      fs.writeFileSync(placeDest, placeLines.join('\n'), 'utf8');
      console.log(`  ✓ 장소 생성: ${row.id}.md`);
      count++;
    }
  }

  console.log(`\n🎉 총 ${count}건의 파일이 성공적으로 생성되었습니다!\n`);
}

main();
