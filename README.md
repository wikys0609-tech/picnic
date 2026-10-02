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
1. [Kakao Developers](https://developers.kakao.com/)에 로그인 후 애플리케이션 추가 (예: `소풍`)
2. **앱 설정 > 앱 키**에서 **JavaScript 키** 복사
   - 로컬 `.env` 파일에 `PUBLIC_KAKAO_MAP_KEY=자바스크립트_키` 형식으로 입력
3. **카카오맵 사용 설정 활성화 (2024-12-01 이후 신규 앱 필수)**:
   - 좌측 메뉴 **[제품 설정] > [카카오맵]** 메뉴로 이동하여 **"카카오맵 사용 설정"**을 `ON`(활성화)으로 전환
   - ⚠️ **중요 (2026-07-21 카카오 정책 변경)**: 계정당 첫 번째로 카카오맵을 활성화한 1개 애플리케이션에만 무료 쿼터가 제공됩니다. 따라서 본 사이트용 앱에서 카카오맵을 활성화해 주셔야 합니다.
4. **플랫폼 키 도메인 등록**:
   - 좌측 메뉴 **[앱 설정] > [플랫폼]** > Web 선택
   - 또는 **[앱 설정] > [플랫폼 키] > JavaScript 키 선택 > "JavaScript SDK 도메인"**에 아래 두 도메인을 등록:
     - `http://localhost:4321` (로컬 개발용)
     - `https://wikys0609-tech.github.io` (운영 배포용)

### [ ] 2. GitHub Pages 활성화 및 Repository Variables 등록 (Phase 3 배포 시)
1. GitHub 저장소(`wikys0609-tech/picnic`)의 **Settings > Pages** 진입
   - **Build and deployment > Source**를 **GitHub Actions**로 선택
2. **Settings > Secrets and variables > Actions > Variables** 탭 진입
   - `PUBLIC_KAKAO_MAP_KEY` 이름으로 위에서 발급받은 카카오 JavaScript 키 등록
   - *(클라이언트 공개용 키이며 도메인 제한으로 보호되므로 Secrets가 아닌 Variables로 관리)*

### [ ] 3. GitHub Fine-grained PAT 발급 (Phase 4 모바일 작성도구 시)
- 모바일에서 `/write` 접속 시 1회 입력할 토큰:
  1. GitHub **Settings > Developer Settings > Personal access tokens > Fine-grained tokens**
  2. Repository access: `wikys0609-tech/picnic` 선택
  3. Permissions: **Contents: Read and write** 선택 후 발급

### [ ] 4. 구글 드라이브 사진 파이프라인 설정 (Phase 5 사진 동기화 시)
1. **Google Cloud 프로젝트 생성**:
   - [Google Cloud Console](https://console.cloud.google.com/) 접속 후 새 프로젝트 생성 (예: `picnic-photo-pipeline`)
2. **Google Drive API 활성화**:
   - 좌측 메뉴 **[API 및 서비스] > [라이브러리]**에서 `Google Drive API` 검색 후 **[사용]** 클릭
3. **서비스 계정 생성 및 JSON 키 발급**:
   - 좌측 메뉴 **[사용자 인증 정보] > [+ 사용자 인증 정보 만들기] > [서비스 계정]** 선택
   - 서비스 계정 생성 후 이메일(예: `picnic-bot@...iam.gserviceaccount.com`) 클릭
   - **[키] > [키 추가] > [새 키 만들기] > JSON** 선택 후 다운로드 (서비스 계정 이메일 복사)
4. **구글 드라이브 최상위 폴더 생성 및 공유**:
   - [Google Drive](https://drive.google.com/)에서 최상위 사진 저장소 폴더 생성 (예: `소풍_사진저장소`)
   - 해당 폴더 우클릭 > **[공유]** > 서비스 계정 이메일 입력 후 권한을 **[뷰어]**로 설정하여 공유
   - 📌 **중요**: **산책별 사진 폴더(예: `2026-09-20-seoul-forest` 또는 `2026-09-20`)는 반드시 이 최상위 폴더 안에 만듭니다.**
   - 브라우저 주소창 URL의 `folders/` 뒤 영문/숫자 문자열이 **Root Folder ID**입니다.
5. **GitHub Secrets 등록**:
   - 저장소 **Settings > Secrets and variables > Actions > Secrets** 탭 진입
   - `GDRIVE_ROOT_FOLDER_ID`: 위 4번에서 복사한 루트 폴더 ID 등록
   - `GDRIVE_SERVICE_ACCOUNT_JSON`: 위 3번에서 다운로드받은 JSON 파일의 내용 전체를 복사하여 등록

---

## 🗺️ 수도권 83개 구·시·군 정복 지도 (Conquest Map) 파이프라인

수도권 일대를 누비며 탐방 도장을 수집하는 "숲속 도서관 산책 여권" 기능입니다.

### 1. 행정구역 표준 및 구성 (총 83개 구역)
- **서울특별시 (25개)**: 25개 자치구 전체
- **인천광역시 (11개)**: 2026년 7월 1일 출범 예정인 행정체제 개편안 선제 반영
  - 중구 내륙 + 동구 → **제물포구**
  - 영종도 일대 → **영종구**
  - 서구 아라뱃길 이북 → **검단구**, 이남 → **서구**
  - 기존 7개 구·군 (미추홀구, 연수구, 남동구, 부평구, 계양구, 강화군, 옹진군)
- **경기도 (47개)**:
  - 8개 대도시의 **24개 일반구**: 수원시(4), 성남시(3), 안양시(2), 안산시(2), 고양시(3), 용인시(3), 부천시(3 - 원미·소사·오정), 화성시(4 - 만세·효행·병점·동탄)
  - 일반구가 없는 **23개 시·군**: 광명, 남양주, 평택, 시흥, 김포, 파주, 의정부, 하남, 광주, 군포, 이천, 양주, 오산, 구리, 안성, 포천, 의왕, 양평, 여주, 동두천, 가평, 과천, 연천

### 2. GeoJSON 원본 출처 및 가공 파이프라인
- **데이터 원본 출처**: 대한민국 통계청 / 행정안전부 행정동 경계 오픈소스 ([`raqoon886/Local_HangJeongDong`](https://github.com/raqoon886/Local_HangJeongDong))
- **가공 스크립트**: [`scripts/generate-conquest-geojson.mjs`](scripts/generate-conquest-geojson.mjs)
  ```bash
  npm run generate:geo
  ```
  - 서울, 경기, 인천 행정동 GeoJSON을 다운로드 및 로컬 캐싱(`.geo-cache/`)합니다.
  - 행정동 단위 경계를 Turf.js(`@turf/turf`)를 통해 83개 구역으로 결합(Dissolve/Union)하여 내부 경계선을 제거합니다.
  - 웹 지도 렌더링 성능을 극대화하기 위해 0.0012°(약 100m 정밀도)로 경계를 단순화(Simplify)하여 약 267KB의 경량 GeoJSON을 생성합니다.
- **산출물**: [`public/geo/metropolitan-83.geojson`](public/geo/metropolitan-83.geojson)
- **동적 통계 산출**: 전체 구역 수와 정복률 계산은 하드코딩되지 않고 GeoJSON의 피처 개수(`geoJson.features.length`)에서 실시간으로 계산됩니다.

---

> 🔒 **공개 저장소와 사생활 안내**: 본 저장소는 공개(Public) 저장소이므로, 장소 데이터의 `hidden: true` 설정은 사이트 화면(전체 지도 및 미니맵)에서만 마커가 숨겨지며, GitHub 저장소 소스 파일(마크다운)에는 입력된 좌표가 그대로 남습니다. 필요 시 사적 공간은 대략적인 인근 공공장소 좌표로 등록하시는 것을 권장합니다.

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
