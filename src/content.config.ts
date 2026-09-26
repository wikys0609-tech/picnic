import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 장소 컬렉션 (가이드형 데이터) - Astro 5 Content Layer
const placesCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/places' }),
  schema: z.object({
    name: z.string({
      required_error: '장소명(name)은 필수입니다.',
    }),
    lat: z.number({
      required_error: '위도(lat)는 필수입니다.',
    }),
    lng: z.number({
      required_error: '경도(lng)는 필수입니다.',
    }),
    sido: z.enum(['서울특별시', '경기도', '인천광역시'], {
      required_error: '시·도(sido)는 서울특별시, 경기도, 인천광역시 중 하나여야 합니다.',
    }),
    sigungu: z.string({
      required_error: '시·군·구(sigungu)는 필수입니다.',
    }),
    type: z.enum(['공원', '동네', '하천길', '산', '기타'], {
      required_error: '장소 유형(type)은 공원, 동네, 하천길, 산, 기타 중 하나여야 합니다.',
    }),
    facilities: z.array(z.string()).default([]),
    tips: z.string().optional(),
    hidden: z.boolean().default(false),
  }),
});

// 산책 기록 컬렉션 (일기형 데이터 - 사이트의 중심) - Astro 5 Content Layer
const walksCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/walks' }),
  schema: z.object({
    title: z.string({
      required_error: '제목(title)은 필수입니다.',
    }),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜(date)는 YYYY-MM-DD 형식이어야 합니다.'),
    timeOfDay: z.enum(['아침', '낮', '저녁', '밤']).optional(),
    weather: z.string().optional(),
    companions: z.string().optional(),
    mood: z.string().optional(),
    places: z.array(reference('places')).min(1, '최소 1개 이상의 장소를 방문 목록에 포함해야 합니다.'),
    photoFolder: z.string().optional(),
    cover: z.string().optional(),
    captions: z.record(z.string()).optional(),
    route: z.string().optional(), // GPX 파일 경로 (걸은 경로, 선택)
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  places: placesCollection,
  walks: walksCollection,
};
