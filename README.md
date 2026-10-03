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
  - 서구 아라뱃길 이북 → **검단구**
  - 서구 아라뱃길 이남 → **서해구** (2026-07-01 「인천광역시 서구 명칭 변경에 관한 법률」 시행 반영)
  - 기존 7개 구·군 (미추홀구, 연수구, 남동구, 부평구, 계양구, 강화군, 옹진군)
- **경기도 (47개)**:
  - 8개 대도시의 **24개 일반구**: 수원시(4), 성남시(3), 안양시(2), 안산시(2), 고양시(3), 용인시(3), 부천시(3 - 원미·소사·오정), 화성시(4 - 만세·효행·병점·동탄)
  - 일반구가 없는 **23개 시·군**: 광명, 남양주, 평택, 시흥, 김포, 파주, 의정부, 하남, 광주, 군포, 이천, 양주, 오산, 구리, 안성, 포천, 의왕, 양평, 여주, 동두천, 가평, 과천, 연천

### 2. GeoJSON 원본 출처 및 가공 파이프라인
- **데이터 원본 출처**: 대한민국 통계청 / 행정안전부 2026-07-01 행정구역 개편 공식 기준 행정동 경계 ([`vuski/admdongkor` ver20260701](https://github.com/vuski/admdongkor/tree/master/ver20260701))
  - **공식 파일명**: `HangJeongDong_ver20260701.geojson`
  - **검증 커밋 SHA**: `7360288277dfd12d74e54b959c59bdd66f852e3a` (2026-08-26 반영분)
  - **다운로드 경로**: `https://raw.githubusercontent.com/vuski/admdongkor/7360288277dfd12d74e54b959c59bdd66f852e3a/ver20260701/HangJeongDong_ver20260701.geojson`
  - *(※ 원본 ver20260701 데이터에서도 작약도·세어도가 `인천광역시 영종구 영종동 (adm_cd2: 2815551000)` 피처에 묶여 있는 오류가 남아있음을 실측 확인하여, 아래 좌표 기반 도서 분리 로직으로 자동 정합)*
- **가공 스크립트**: [`scripts/generate-conquest-geojson.mjs`](scripts/generate-conquest-geojson.mjs)
  ```bash
  npm run generate:geo
  ```
  - 통계청 공식 2026-07-01 행정동 GeoJSON을 다운로드 및 로컬 캐싱(`.geo-cache/`)합니다.
  - **대표 좌표 기반 도서 분리 메커니즘 (견고화)**:
    - 다각형 배열 순번(인덱스) 하드코딩을 완전히 배제하고, 각 섬의 대표 좌표를 정의하여 Turf.js의 `booleanPointInPolygon`으로 해당 다각형을 동적 탐색하여 올바른 행정구역으로 분리·편입합니다:
      - **작약도 (물치도)**: 대표 좌표 `[126.588694, 37.497531]` → **제물포구 만석동(산3)**으로 편입
      - **세어도 (본섬)**: 대표 좌표 `[126.5787, 37.5460]` → **서해구 신현원창동**으로 편입
      - **소세어도**: 대표 좌표 `[126.5876, 37.5480]` → **서해구 신현원창동**으로 편입
    - 만약 원본 데이터 변형 등으로 해당 대표 좌표를 포함하는 다각형을 찾지 못할 경우, 스크립트가 즉시 에러 예외를 발생시키며 중단되도록 방어 설계되었습니다.
  - **이중 GeoJSON 빌드 및 용량 최적화**:
    | 구분 | 파일 경로 | 원본 크기 | gzip 크기 | 용도 및 최적화 기법 |
    | :--- | :--- | :--- | :--- | :--- |
    | **판정용 (정밀)** | `public/geo/metropolitan-83.geojson` | 817.3 KB | 303.5 KB | 0.0001°(약 10m) 정밀도. 작성 도구(`/write`)에서 장소 선택 시에만 지연 로딩(lazy loading) |
    | **표시용 (경량)** | `public/geo/metropolitan-83-display.geojson` | 209.9 KB | **56.8 KB** | 0.0007° 단순화 + 좌표 5자리 절삭. 정복 지도(`/conquest`) 화면 렌더링용 (81.3% 전송량 감축) |
  - **HTML 페이로드 최적화**: 정복 지도 페이지의 HTML 인라인 `data-geojson` 직렬화를 제거하고 비동기 `fetch()`로 전환하여 HTML 문서 크기를 기존 ~850KB에서 18.8KB(gzip)로 94% 절감하였으며 브라우저 HTTP 캐싱이 적용됩니다.
- **동적 통계 산출**: 전체 구역 수(83개)와 정복률 계산은 하드코딩되지 않고 GeoJSON의 피처 개수(`geoJson.features.length`)에서 실시간으로 계산됩니다.

### 3. 인천광역시 2026년 개편 4개 구 공식 행정동 목록 (인천시 2026-07-01 기준)
향후 행정경계 검증 및 갱신을 위해 확정된 공식 세부 행정동 목록을 보존합니다:
- **제물포구 (18개 행정동)**:
  - 신포동, 연안동, 신흥동, 도원동, 율목동, 동인천동, 개항동, 만석동, 화수1·화평동, 화수2동, 송현1·2동, 송현3동, 송림1동, 송림2동, 송림3·5동, 송림4동, 송림6동, 금창동
  - *(※ 북성동과 송월동은 2021년 7월 '개항동'으로 통합 완료, 작약도는 만석동 산3 관할)*
- **영종구 (6개 행정동)**:
  - 영종동, 영종1동, 영종2동, 운서1동, 운서2동, 용유동 (무의도·용유도·영종도 본섬 전역 및 도서 법정동 포함)
- **검단구 (8개 행정동)**:
  - 검단동, 불로대곡동, 원당동, 당하동, 오류왕길동, 마전동, 아라1동, 아라2동 (검단신도시 전역 및 아라뱃길 이북 시천동·백석동 포함)
- **서해구 (16개 행정동)**:
  - 청라1동, 청라2동, 청라3동, 가정1동, 가정2동, 가정3동, 석남1동, 석남2동, 석남3동, 가좌1동, 가좌2동, 가좌3동, 가좌4동, 검암경서동, 연희동, 신현원창동 (아라뱃길 이남 전역 및 세어도 포함)

### 4. 독립 대조군 검증 시스템 및 API 보안 (`npm test`)
- **검증 스크립트**: [`scripts/test-boundary.mjs`](scripts/test-boundary.mjs)
- **명령어 구성**:
  ```bash
  # 1. 기본 오프라인 픽스처 검증 (초고속, 네트워크 무관, CI/CD 호환)
  npm test

  # 2. 실시간 카카오 API 오라클 검증 및 픽스처 갱신 (.env 키 필요)
  npm run test:oracle
  ```
- **검증 메커니즘**:
  - `npm test`는 외부 API 호출 없이 [`tests/fixtures/kakao-ground-truth.json`](tests/fixtures/kakao-ground-truth.json) 픽스처를 대조군으로 사용하여 1~2초 만에 오프라인으로 59개 지점을 완벽 검증합니다.
  - `npm run test:oracle`은 카카오 로컬 API(`coord2regioncode`, 행정동 `H`)를 실시간 호출하여 위 공식 행정동 목록에 매핑되는 정답 구를 독립 대조군(Ground Truth)으로 삼아 픽스처를 검증 및 최신 상태로 갱신합니다.
  - "송림4동행정복지센터 (lat: 37.478169, lng: 126.649538)"로 단일 정답 구역(제물포구)을 확정하여 경계 모호성을 완전히 해소했습니다.
  - 기존 21개 경계·예외 지점, 샘플 장소 10곳, 인천 개편 4개 구 경계선 양측 150m 지점 및 도서 지역(작약도, 세어도, 무의도, 실미도 등) **총 59개 지점에 대해 100% 일치(59/59 PASS)**를 입증합니다.
- **API 키 관리 및 보안 원칙**:
  - 카카오 API 키는 저장소 코드에 절대 커밋되지 않으며, `.gitignore`에 등록된 `.env` 파일에만 보관됩니다.
  - GitHub Actions 배포 워크플로(`.github/workflows/deploy.yml`)는 `npm run build`만 실행하므로 외부 실시간 API 테스트 실패로 인한 배포 중단 위험이 원천 차단되어 있습니다.

---

## 📱 스마트폰에서 새 산책 기록 추가하는 방법 (완전 가이드)

PC 없이 스마트폰만으로 구글 드라이브 사진 업로드와 산책 글 작성을 1~2분 안에 마칠 수 있습니다.

```text
[스마트폰 드라이브 앱]          [스마트폰 웹 브라우저]          [GitHub Actions]
 1. 사진 폴더 생성 & 업로드  ──>  2. /write 작성 도구 발행  ──>  3. 1~2분 내 사이트 자동 반영
   (YYYY-MM-DD-장소명)             (카카오 장소 검색 & 일기)        (WebP 변환 & EXIF 제거)
```

### 1단계: 스마트폰 Google Drive 앱에 사진 업로드
1. 스마트폰의 **Google Drive** 앱을 엽니다.
2. 공유된 최상위 사진 폴더(`picnic-photos` 등)로 이동합니다.
3. **[+] 새 폴더 만들기**를 눌러 폴더를 만듭니다. 이름 규칙:
   - **권장 형식**: `YYYY-MM-DD-장소명` (예: `2026-10-05-olympic-park`)
   - 날짜만 써도 자동 인식됩니다: `YYYY-MM-DD` (예: `2026-10-05`)
   - 장소 영문명만 써도 자동 매칭됩니다: `olympic-park`
4. 해당 폴더 안에 오늘 촬영한 사진들을 업로드합니다:
   - 🍏 **아이폰 HEIC 사진 완전 지원**: 별도 JPG 변환 없이 원본 HEIC 그대로 올리셔도 서버에서 고화질 WebP로 자동 변환됩니다.
   - 🖼️ **대표 사진(커버)**: 특정 사진을 대표로 지정하고 싶다면 파일명을 `cover.jpg`(또는 `cover.heic`)로 변경하세요. 파일명을 바꾸지 않아도 첫 번째 사진이 자동으로 책 표지가 됩니다.

### 2단계: 스마트폰 브라우저에서 `/write` 접속하여 글 작성
1. 브라우저에서 `https://wikys0609-tech.github.io/picnic/write` 에 접속합니다.
   - *(최초 1회만)* 우측 상단 열쇠(🔑) 아이콘을 눌러 GitHub Fine-grained PAT 토큰을 등록합니다. (브라우저에 안전하게 보관됨)
2. **기본 정보 입력**:
   - 산책 날짜, 글 제목, 날씨/시간대/동행/기분을 선택합니다.
3. **코스 및 장소 추가**:
   - "장소 검색" 창에서 방문한 공원이나 동네를 검색하거나 **[현재 위치로 추가]**를 터치합니다.
   - 이미 서가에 꽂혀 있는 장소라면 반경 200m 내에서 자동으로 기존 앨범이 추천됩니다.
   - 새로운 장소라면 수도권 83개 정복 구역명(`sigungu`)이 좌표 기반으로 자동 입력됩니다.
4. **사진 폴더명 복사**:
   - 화면에 표시되는 **"사진 폴더명"**(예: `2026-10-05-olympic-park`) 우측의 **[복사]** 버튼을 누르면 1단계에서 드라이브 폴더명을 만들 때 그대로 붙여넣을 수 있습니다.
5. **산책 일기 본문 작성**:
   - 그날의 날씨, 바람의 냄새, 걸으며 나눈 대화와 소회를 자유롭게 적습니다.
6. **[기록 발행하기 (Publish)] 터치**:
   - GitHub API를 통해 원격 저장소에 즉시 원자적(atomic)으로 커밋됩니다.
   - 임시로 작성 중일 때는 **[임시저장(Draft)]**에 체크하고 발행하면 다른 기기에서도 이어 쓸 수 있습니다.

### 3단계: 자동 빌드 및 사진 동기화 (1~2분 소요)
- 커밋이 완료되면 GitHub Actions가 자동으로 시작됩니다.
- 구글 드라이브에서 사진을 가져와 **1600px 고화질 WebP로 변환**하고, **GPS/촬영기기 정보(EXIF)를 완벽히 제거**한 뒤 사이트에 배포합니다.
- 약 1~2분 후 홈 서가에 새 책이 꽂히고 정복 지도에 탐방 도장이 찍힙니다!
- *(참고: 글을 쓰지 않고 드라이브에 사진만 올려둔 경우에도 매일 새벽 3시(KST) 스케줄 빌드가 자동으로 사진을 동기화합니다.)*

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
