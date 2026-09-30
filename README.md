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
