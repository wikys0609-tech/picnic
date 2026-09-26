# 소풍 (Picnic) — 수도권 산책 기록 사이트

서울·경기·인천 일대의 공원과 동네를 걸으며 남긴 감상과 사진, 지도를 기록하는 개인용 아카이브 웹사이트입니다. GitHub Pages를 통해 정적 사이트로 배포됩니다.

- **사이트 URL**: [https://wikys0609-tech.github.io/picnic/](https://wikys0609-tech.github.io/picnic/)
- **주요 테마**:
  - 📖 **일기·감상형 (메인)**: 산문집 감성의 편안한 읽기 환경, 사진 갤러리 및 코스 안내
  - 🗺️ **수집·정복형 (서브 1)**: 수도권 83개 구·시·군(인천 2026 개편 및 부천·화성 일반구 반영) 정복 지도
  - 🌿 **탐구·가이드형 (서브 2)**: 시설·특징 정보와 계절별 산책 팁 아카이브

---

## 🛠️ 기술 스택

- **프레임워크**: Astro v5 (Content Collections, Zod 스키마 검증)
- **언어**: TypeScript
- **스타일링**: Tailwind CSS + `@tailwindcss/typography`, Pretendard 웹폰트 (라이트/다크 모드 지원)
- **지도**: 카카오맵 JavaScript API
- **사진 파이프라인**: Google Drive API + `sharp` (EXIF/GPS 메타데이터 완전 제거, WebP 최적화)
- **작성 도구**: `/write` 모바일 웹 (GitHub Fine-grained PAT 직접 커밋, 카카오 장소 검색/역지오코딩)
- **배포**: GitHub Actions → GitHub Pages

---

## 🚀 로컬 실행 방법

### 1. 패키지 설치
```bash
npm install
```

### 2. 환경변수 설정
`.env.example` 파일을 복사하여 `.env` 파일을 생성합니다.
```bash
cp .env.example .env
```
`.env` 파일에 카카오맵 JavaScript 키를 입력합니다 (로컬 개발 시 지도 렌더링에 사용):
```env
PUBLIC_KAKAO_MAP_KEY=카카오_자바스크립트_앱_키
```

### 3. 개발 서버 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:4321/picnic/` 접속

### 4. 타입 검사 및 빌드 테스트
```bash
npm run check
npm run build
```

---

## 📋 외부 서비스 설정 체크리스트 (사용자 직접 설정)

### [ ] 1. 카카오 개발자 콘솔 (Kakao Developers) 설정 (Phase 2 필요)
1. [Kakao Developers](https://developers.kakao.com/)에 로그인 후 애플리케이션 추가
2. **앱 설정 > 앱 키**에서 **JavaScript 키** 복사
   - 로컬 `.env`의 `PUBLIC_KAKAO_MAP_KEY`로 설정
3. **앱 설정 > 플랫폼 > Web 플랫폼 등록**:
   - `http://localhost:4321` (로컬 개발용)
   - `https://wikys0609-tech.github.io` (GitHub Pages 운영용)

### [ ] 2. GitHub Pages 활성화 (Phase 3 배포 시)
1. GitHub 저장소(`wikys0609-tech/picnic`)의 **Settings > Pages** 진입
2. **Build and deployment > Source**를 **GitHub Actions**로 선택

### [ ] 3. GitHub Fine-grained PAT 발급 (Phase 4 모바일 작성도구 시)
- 모바일에서 `/write` 접속 시 1회 입력할 토큰:
  1. GitHub **Settings > Developer Settings > Personal access tokens > Fine-grained tokens**
  2. Repository access: `wikys0609-tech/picnic` 선택
  3. Permissions: **Contents: Read and write** 선택 후 발급

---

## 📂 프로젝트 구조

```text
picnic/
├── public/
│   ├── favicon.svg                 # 사이트 파비콘
│   ├── geo/                        # 시군구 경계 GeoJSON (Phase 6)
│   └── photos/                     # (gitignore) 구글 드라이브 동기화 사진 (Phase 5)
├── src/
│   ├── content/
│   │   ├── config.ts               # Content Collections Zod 스키마
│   │   ├── places/                 # 장소 데이터 (.md)
│   │   └── walks/                  # 산책 기록 데이터 (.md)
│   ├── components/
│   │   ├── layout/                 # Header, Footer
│   │   ├── ui/                     # Badge, ThemeToggle
│   │   └── walk/                   # WalkCard, WalkCover, PhotoGallery
│   ├── layouts/
│   │   └── BaseLayout.astro        # 공통 레이아웃 (반응형, 테마, SEO)
│   ├── lib/
│   │   └── utils/                  # url.ts (baseUrl), date.ts
│   ├── pages/
│   │   ├── index.astro             # 홈 (최근 산책 피드, 요약 대시보드)
│   │   ├── archive.astro           # 아카이브 (연/월별 타임라인, 태그 필터)
│   │   ├── map.astro               # 전체 장소 지도
│   │   ├── conquest.astro          # 수도권 83개 구역 정복 지도
│   │   ├── places/[id].astro       # 장소 상세
│   │   ├── walks/[slug].astro      # 산책 상세 (에세이 읽기, 갤러리)
│   │   └── 404.astro
│   └── styles/
│       └── global.css              # Pretendard, 웜톤 팔레트, Prose 커스텀
├── astro.config.mjs
├── tailwind.config.mjs
└── package.json
```
