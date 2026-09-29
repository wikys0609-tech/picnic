/**
 * 산책(walks) 및 장소(places) Markdown 파일 생성기
 */

export interface PlaceInput {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sido: '서울특별시' | '경기도' | '인천광역시';
  sigungu: string;
  type: '공원' | '동네' | '하천길' | '산' | '기타';
  facilities?: string[];
  tips?: string;
  hidden?: boolean;
  description?: string;
}

export interface WalkInput {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  timeOfDay?: '아침' | '낮' | '저녁' | '밤' | '';
  weather?: string;
  companions?: string;
  mood?: string;
  places: string[]; // place ids
  photoFolder?: string;
  cover?: string;
  captions?: Record<string, string>;
  route?: string;
  tags?: string[];
  draft?: boolean;
  content: string;
}

export function generatePlaceMarkdown(place: PlaceInput): string {
  const lines: string[] = ['---'];
  lines.push(`name: ${place.name}`);
  lines.push(`lat: ${place.lat}`);
  lines.push(`lng: ${place.lng}`);
  lines.push(`sido: ${place.sido}`);
  lines.push(`sigungu: ${place.sigungu}`);
  lines.push(`type: ${place.type}`);

  if (place.facilities && place.facilities.length > 0) {
    lines.push('facilities:');
    for (const f of place.facilities) {
      lines.push(`  - ${f}`);
    }
  } else {
    lines.push('facilities: []');
  }

  if (place.tips && place.tips.trim()) {
    lines.push(`tips: ${JSON.stringify(place.tips.trim())}`);
  }

  lines.push(`hidden: ${place.hidden ? 'true' : 'false'}`);
  lines.push('---');
  lines.push('');
  if (place.description && place.description.trim()) {
    lines.push(place.description.trim());
    lines.push('');
  }

  return lines.join('\n');
}

export function generateWalkMarkdown(walk: WalkInput): string {
  const lines: string[] = ['---'];
  lines.push(`title: ${JSON.stringify(walk.title.trim())}`);
  lines.push(`date: "${walk.date}"`);

  if (walk.timeOfDay) {
    lines.push(`timeOfDay: ${walk.timeOfDay}`);
  }
  if (walk.weather && walk.weather.trim()) {
    lines.push(`weather: ${JSON.stringify(walk.weather.trim())}`);
  }
  if (walk.companions && walk.companions.trim()) {
    lines.push(`companions: ${JSON.stringify(walk.companions.trim())}`);
  }
  if (walk.mood && walk.mood.trim()) {
    lines.push(`mood: ${JSON.stringify(walk.mood.trim())}`);
  }

  lines.push('places:');
  for (const p of walk.places) {
    lines.push(`  - ${p.trim()}`);
  }

  if (walk.photoFolder && walk.photoFolder.trim()) {
    lines.push(`photoFolder: ${walk.photoFolder.trim()}`);
  }
  if (walk.cover && walk.cover.trim()) {
    lines.push(`cover: ${walk.cover.trim()}`);
  }

  if (walk.captions && Object.keys(walk.captions).length > 0) {
    lines.push('captions:');
    for (const [k, v] of Object.entries(walk.captions)) {
      if (v && v.trim()) {
        lines.push(`  ${k}: ${JSON.stringify(v.trim())}`);
      }
    }
  }

  if (walk.route && walk.route.trim()) {
    lines.push(`route: ${walk.route.trim()}`);
  }

  if (walk.tags && walk.tags.length > 0) {
    lines.push('tags:');
    for (const t of walk.tags) {
      if (t && t.trim()) {
        lines.push(`  - ${t.trim()}`);
      }
    }
  } else {
    lines.push('tags: []');
  }

  lines.push(`draft: ${walk.draft ? 'true' : 'false'}`);
  lines.push('---');
  lines.push('');
  lines.push(walk.content ? walk.content.trim() : '');
  lines.push('');

  return lines.join('\n');
}
