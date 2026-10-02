import type { MapPlace, CourseStop } from './types';
import { loadKakaoSDK } from './kakao-loader';

export interface MapAdapterOptions {
  center?: { lat: number; lng: number };
  level?: number;
  scrollwheel?: boolean;
}

export class KakaoMapAdapter {
  private map: any = null;
  private markers: any[] = [];
  private overlays: any[] = [];
  private polylines: any[] = [];
  private polygons: any[] = [];
  private activeOverlay: any = null;

  async init(container: HTMLElement, options: MapAdapterOptions = {}): Promise<void> {
    const kakao = await loadKakaoSDK();
    const defaultCenter = options.center || { lat: 37.5443878, lng: 127.0374424 }; // 서울숲 기본 좌표
    const centerLatLng = new kakao.maps.LatLng(defaultCenter.lat, defaultCenter.lng);

    const mapOptions = {
      center: centerLatLng,
      level: options.level ?? 8,
      scrollwheel: options.scrollwheel ?? true,
    };

    this.map = new kakao.maps.Map(container, mapOptions);

    // 줌 컨트롤 추가
    const zoomControl = new kakao.maps.ZoomControl();
    this.map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

    // 지도 클릭 시 열려있는 팝업 닫기
    kakao.maps.event.addListener(this.map, 'click', () => {
      this.closeActiveOverlay();
    });
  }

  getKakaoMap(): any {
    return this.map;
  }

  /**
   * 장소 마커 및 클릭 시 상세 정보 커스텀 오버레이 등록
   */
  addPlaceMarkers(
    places: MapPlace[],
    onMarkerClick?: (place: MapPlace) => void,
    baseUrlPrefix: string = ''
  ): void {
    if (!this.map || typeof window === 'undefined' || !window.kakao) return;
    const kakao = window.kakao;

    const bounds = new kakao.maps.LatLngBounds();
    let hasValidPoints = false;

    places.forEach((place) => {
      if (place.hidden) return; // 사생활 보호 장소는 공개 마커에서 제외
      hasValidPoints = true;

      const position = new kakao.maps.LatLng(place.lat, place.lng);
      bounds.extend(position);

      // 마커 엘리먼트 (커스텀 오버레이로 디자인)
      const markerEl = document.createElement('div');
      markerEl.className = 'group relative flex flex-col items-center cursor-pointer transition-transform duration-200 hover:scale-110 z-10 hover:z-30';
      
      const isPark = place.type === '공원';
      const bgColor = isPark ? 'bg-forest-600' : 'bg-terracotta-500';

      markerEl.innerHTML = `
        <div class="flex items-center gap-1 px-2 py-0.5 rounded-full ${bgColor} text-white text-[11px] font-medium shadow-md border border-white/40 whitespace-nowrap">
          <span>${place.name}</span>
        </div>
        <div class="w-2 h-2 ${bgColor} rotate-45 -mt-1 shadow-xs"></div>
      `;

      const customMarker = new kakao.maps.CustomOverlay({
        position: position,
        content: markerEl,
        yAnchor: 1.1,
      });

      customMarker.setMap(this.map);
      this.markers.push(customMarker);

      // 마커 클릭 시 정보 팝업
      markerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openPlaceOverlay(place, position, baseUrlPrefix);
        if (onMarkerClick) onMarkerClick(place);
      });
    });

    if (hasValidPoints && places.length > 1) {
      this.map.setBounds(bounds);
    } else if (hasValidPoints && places.length === 1) {
      this.map.setCenter(new kakao.maps.LatLng(places[0].lat, places[0].lng));
      this.map.setLevel(4);
    }
  }

  /**
   * 산책 코스 번호 마커 및 연결 선 그리기
   */
  addCourseMarkers(stops: CourseStop[], baseUrlPrefix: string = ''): void {
    if (!this.map || typeof window === 'undefined' || !window.kakao) return;
    const kakao = window.kakao;

    const bounds = new kakao.maps.LatLngBounds();
    const linePath: any[] = [];

    stops.forEach(({ order, place }) => {
      const position = new kakao.maps.LatLng(place.lat, place.lng);
      bounds.extend(position);
      linePath.push(position);

      const markerEl = document.createElement('div');
      markerEl.className = 'group flex flex-col items-center cursor-pointer transition-transform hover:scale-110 z-20';
      markerEl.innerHTML = `
        <div class="w-7 h-7 rounded-full bg-terracotta-500 text-white font-bold text-xs flex items-center justify-center shadow-lg border-2 border-white">
          ${order}
        </div>
        <span class="mt-1 px-1.5 py-0.5 rounded bg-white/95 dark:bg-night-900/95 text-ink-800 dark:text-paper-100 text-[10px] font-semibold shadow-xs border border-paper-200 dark:border-night-700 whitespace-nowrap">
          ${place.name}
        </span>
      `;

      const customMarker = new kakao.maps.CustomOverlay({
        position: position,
        content: markerEl,
        yAnchor: 0.9,
      });

      customMarker.setMap(this.map);
      this.markers.push(customMarker);

      markerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSimplePlaceOverlay(place, position, baseUrlPrefix);
      });
    });

    // 2개 이상의 경유지가 있으면 순서대로 점선 폴리라인 연결
    if (linePath.length >= 2) {
      const polyline = new kakao.maps.Polyline({
        path: linePath,
        strokeWeight: 3,
        strokeColor: '#A3482C',
        strokeOpacity: 0.8,
        strokeStyle: 'shortdash',
      });
      polyline.setMap(this.map);
      this.polylines.push(polyline);
    }

    if (stops.length > 1) {
      this.map.setBounds(bounds);
    } else if (stops.length === 1) {
      this.map.setCenter(linePath[0]);
      this.map.setLevel(4);
    }
  }

  /**
   * 장소 상세 팝업 오버레이 열기
   */
  openPlaceOverlay(place: MapPlace, position: any, baseUrlPrefix: string = ''): void {
    if (!this.map || typeof window === 'undefined' || !window.kakao) return;
    const kakao = window.kakao;

    this.closeActiveOverlay();

    const overlayEl = document.createElement('div');
    overlayEl.className = 'w-72 sm:w-80 rounded-2xl bg-white dark:bg-night-900 text-ink-900 dark:text-paper-100 shadow-xl border border-paper-200 dark:border-night-700 p-4 font-sans text-left z-50 text-xs transition-all animate-in fade-in zoom-in-95';

    const walksList = place.walks && place.walks.length > 0
      ? `
        <div class="mt-3 pt-2.5 border-t border-paper-100 dark:border-night-800">
          <span class="text-[11px] font-medium text-ink-400 dark:text-ink-500">방문 산책 기록 (${place.walks.length}회):</span>
          <div class="mt-1 space-y-1 max-h-24 overflow-y-auto pr-1">
            ${place.walks.map((w) => `
              <a href="${baseUrlPrefix}/walks/${w.id}" class="block py-1 px-2 rounded bg-paper-100 dark:bg-night-800 hover:bg-terracotta-50 dark:hover:bg-terracotta-950/40 text-ink-800 dark:text-paper-200 hover:text-terracotta-600 transition-colors line-clamp-1">
                <span class="font-medium">${w.title}</span>
                <span class="text-[10px] text-ink-400 ml-1">(${w.date})</span>
              </a>
            `).join('')}
          </div>
        </div>
      `
      : '<p class="mt-2 text-[11px] text-ink-400">아직 등록된 산책 기록이 없습니다.</p>';

    const facilitiesBadges = place.facilities && place.facilities.length > 0
      ? `
        <div class="mt-2 flex flex-wrap gap-1">
          ${place.facilities.slice(0, 4).map((f) => `
            <span class="px-1.5 py-0.5 rounded bg-paper-100 dark:bg-night-800 text-ink-600 dark:text-ink-300 text-[10px]">
              ${f}
            </span>
          `).join('')}
        </div>
      `
      : '';

    overlayEl.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div>
          <span class="text-[10px] font-semibold text-forest-700 dark:text-forest-100 bg-forest-50 dark:bg-night-800 px-1.5 py-0.5 rounded">
            ${place.type}
          </span>
          <h4 class="font-serif text-base font-bold text-ink-900 dark:text-paper-100 mt-1">
            ${place.name}
          </h4>
          <span class="text-[11px] text-ink-400">${place.sido} ${place.sigungu}</span>
        </div>
        <button type="button" class="overlay-close-btn p-1 rounded-full text-ink-400 hover:text-ink-900 dark:hover:text-paper-100 hover:bg-paper-100 dark:hover:bg-night-800 transition-colors">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      ${facilitiesBadges}

      ${place.tips ? `<p class="mt-2 text-[11px] text-ink-600 dark:text-ink-400 bg-paper-50 dark:bg-night-800/60 p-2 rounded-lg leading-relaxed">💡 ${place.tips}</p>` : ''}

      ${walksList}

      <div class="mt-3 pt-2 border-t border-paper-100 dark:border-night-800 flex justify-end">
        <a href="${baseUrlPrefix}/places/${place.id}" class="text-[11px] font-semibold text-terracotta-600 dark:text-terracotta-100 hover:underline">
          장소 상세 정보 &rarr;
        </a>
      </div>
    `;

    overlayEl.querySelector('.overlay-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeActiveOverlay();
    });

    const overlay = new kakao.maps.CustomOverlay({
      position: position,
      content: overlayEl,
      yAnchor: 1.25,
      zIndex: 100,
    });

    overlay.setMap(this.map);
    this.activeOverlay = overlay;
  }

  /**
   * 미니맵용 간이 오버레이
   */
  openSimplePlaceOverlay(place: MapPlace, position: any, baseUrlPrefix: string = ''): void {
    if (!this.map || typeof window === 'undefined' || !window.kakao) return;
    const kakao = window.kakao;

    this.closeActiveOverlay();

    const overlayEl = document.createElement('div');
    overlayEl.className = 'w-52 rounded-xl bg-white dark:bg-night-900 text-ink-900 dark:text-paper-100 shadow-lg border border-paper-200 dark:border-night-700 p-3 font-sans text-left z-50 text-xs';
    overlayEl.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <strong class="font-serif text-sm font-bold text-ink-900 dark:text-paper-100">${place.name}</strong>
        <span class="text-[10px] text-ink-400">${place.sigungu}</span>
      </div>
      <a href="${baseUrlPrefix}/places/${place.id}" class="text-[11px] text-terracotta-600 dark:text-terracotta-100 hover:underline inline-block mt-1">
        장소 안내 보기 &rarr;
      </a>
    `;

    const overlay = new kakao.maps.CustomOverlay({
      position: position,
      content: overlayEl,
      yAnchor: 1.3,
      zIndex: 100,
    });

    overlay.setMap(this.map);
    this.activeOverlay = overlay;
  }

  /**
   * 83개 구역 정복 지도 폴리곤 및 탐방 스탬프 렌더링
   */
  addConquestPolygons(
    features: any[],
    conqueredMap: Map<string, any>,
    baseUrlPrefix: string = '',
    onDistrictClick?: (district: any) => void
  ): void {
    if (!this.map || typeof window === 'undefined' || !window.kakao) return;
    const kakao = window.kakao;

    features.forEach((feature) => {
      const props = feature.properties;
      const sigungu = props.sigungu;
      const conqueredData = conqueredMap.get(sigungu);
      const isConquered = !!conqueredData;
      const isRecentlyConquered = conqueredData?.isRecentlyConquered || false;

      // 폴리곤 좌표 배열 파싱 (Polygon 또는 MultiPolygon)
      const geomType = feature.geometry.type;
      const geomCoords = feature.geometry.coordinates;
      const polygonPaths: any[] = [];

      if (geomType === 'Polygon') {
        const rings = geomCoords.map((ring: [number, number][]) =>
          ring.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng))
        );
        polygonPaths.push(rings);
      } else if (geomType === 'MultiPolygon') {
        geomCoords.forEach((poly: [number, number][][]) => {
          const rings = poly.map((ring: [number, number][]) =>
            ring.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng))
          );
          polygonPaths.push(rings);
        });
      }

      // 색상 스타일링 ("숲속 도서관" 팔레트)
      const baseFillColor = isConquered ? '#2E5D3E' : '#FAF6F0';
      const hoverFillColor = isConquered ? '#1E4A2E' : '#E8DCC9';
      const baseStrokeColor = isConquered ? '#1A3B25' : '#D1C7B7';
      const hoverStrokeColor = isConquered ? '#0F2617' : '#9E8E7A';

      polygonPaths.forEach((path) => {
        const polygon = new kakao.maps.Polygon({
          path: path,
          strokeWeight: isConquered ? 2 : 1.2,
          strokeColor: baseStrokeColor,
          strokeOpacity: isConquered ? 0.95 : 0.75,
          fillColor: baseFillColor,
          fillOpacity: isConquered ? 0.45 : 0.28,
        });

        polygon.setMap(this.map);
        this.polygons.push(polygon);

        // 마우스 호버 효과
        kakao.maps.event.addListener(polygon, 'mouseover', () => {
          polygon.setOptions({
            fillColor: hoverFillColor,
            fillOpacity: isConquered ? 0.65 : 0.55,
            strokeColor: hoverStrokeColor,
            strokeWeight: isConquered ? 2.5 : 2,
          });
        });

        kakao.maps.event.addListener(polygon, 'mouseout', () => {
          polygon.setOptions({
            fillColor: baseFillColor,
            fillOpacity: isConquered ? 0.45 : 0.28,
            strokeColor: baseStrokeColor,
            strokeWeight: isConquered ? 2 : 1.2,
          });
        });

        // 클릭 이벤트
        kakao.maps.event.addListener(polygon, 'click', (mouseEvent: any) => {
          const clickPos = mouseEvent?.latLng || (props.center ? new kakao.maps.LatLng(props.center[0], props.center[1]) : this.map.getCenter());
          this.openConquestDistrictOverlay(props, conqueredData, clickPos, baseUrlPrefix);
          if (onDistrictClick) onDistrictClick(props);
        });
      });

      // 정복된 구역: 중심 좌표에 탐방 인장(Passport Stamp) 오버레이 배치
      if (isConquered && props.center) {
        const centerPos = new kakao.maps.LatLng(props.center[0], props.center[1]);
        const shortName = props.sigungu.split(' ').pop() || props.name;

        const stampEl = document.createElement('div');
        stampEl.className = 'conquest-stamp-wrapper relative cursor-pointer group flex flex-col items-center select-none z-20 hover:z-40';
        stampEl.innerHTML = `
          ${isRecentlyConquered ? `
            <div class="absolute -top-3 z-30 pointer-events-none" title="최근 정복한 구역">
              <div class="silk-ribbon w-3 h-5 shadow-xs" style="background: linear-gradient(180deg, #F59E0B 0%, #D97706 60%, #B45309 100%);"></div>
            </div>
          ` : ''}
          <div class="relative w-10 h-10 rounded-full border-2 border-[#1E4A2E] dark:border-[#3D6B4F] bg-[#FAF8F5]/95 dark:bg-[#1C1815]/95 shadow-md flex items-center justify-center p-0.5 transition-all duration-300 group-hover:scale-115 ${isRecentlyConquered ? 'ring-2 ring-amber-400 ring-offset-1' : ''}">
            <div class="w-full h-full rounded-full border border-dashed border-[#2E5D3E]/70 dark:border-[#4E8062]/70 flex flex-col items-center justify-center text-center">
              <span class="text-[8.5px] font-serif font-bold text-[#1E4A2E] dark:text-[#E2EBE5] tracking-tighter truncate max-w-[32px] leading-none">
                ${shortName}
              </span>
              <span class="text-[7px] font-serif font-bold text-amber-700 dark:text-amber-400 leading-none mt-0.5">
                탐방
              </span>
            </div>
          </div>
        `;

        stampEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openConquestDistrictOverlay(props, conqueredData, centerPos, baseUrlPrefix);
          if (onDistrictClick) onDistrictClick(props);
        });

        const stampOverlay = new kakao.maps.CustomOverlay({
          position: centerPos,
          content: stampEl,
          yAnchor: 0.5,
          xAnchor: 0.5,
          zIndex: 25,
        });

        stampOverlay.setMap(this.map);
        this.overlays.push(stampOverlay);
      }
    });
  }

  /**
   * 구역 상세 안내 팝업 (정복/미정복)
   */
  openConquestDistrictOverlay(
    props: any,
    conqueredData: any,
    position: any,
    baseUrlPrefix: string = ''
  ): void {
    if (!this.map || typeof window === 'undefined' || !window.kakao) return;
    const kakao = window.kakao;

    this.closeActiveOverlay();

    const isConquered = !!conqueredData;
    const overlayEl = document.createElement('div');
    overlayEl.className = 'w-72 sm:w-80 rounded-2xl bg-white dark:bg-[#1A1816] text-stone-900 dark:text-stone-100 shadow-xl border border-stone-200 dark:border-stone-800 p-4 font-sans text-left z-50';

    if (isConquered && conqueredData) {
      const placesList = (conqueredData.places || []).map((p: any) => `
        <li class="flex items-center justify-between py-1.5 border-b border-stone-100 dark:border-stone-800/80 last:border-none text-xs">
          <span class="font-serif font-semibold text-stone-800 dark:text-stone-200 truncate max-w-[170px]">
            ${p.data?.name || p.name}
          </span>
          <a
            href="${baseUrlPrefix}/places/${p.id}"
            class="text-[11px] font-serif text-terracotta-600 dark:text-terracotta-300 hover:underline flex items-center gap-0.5 shrink-0"
          >
            앨범 펼쳐보기 &rarr;
          </a>
        </li>
      `).join('');

      overlayEl.innerHTML = `
        <div class="flex items-start justify-between gap-2 mb-3">
          <div>
            <div class="flex items-center gap-1.5 mb-1">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-[#1E4A2E] text-white tracking-wide">
                탐방 완료
              </span>
              ${conqueredData.isRecentlyConquered ? `
                <span class="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-500 text-white">
                  최근 정복
                </span>
              ` : ''}
            </div>
            <h4 class="font-serif text-base font-bold text-stone-900 dark:text-paper-100">
              ${props.sido} ${props.name}
            </h4>
          </div>
          <button type="button" class="overlay-close-btn p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
            &times;
          </button>
        </div>

        <div class="mb-3 text-[11px] text-stone-500 dark:text-stone-400 font-serif flex items-center justify-between">
          <span>수록 산책: <strong>${conqueredData.walkCount || 0}편</strong></span>
          ${conqueredData.latestVisitDate ? `<span>최근: ${conqueredData.latestVisitDate}</span>` : ''}
        </div>

        <div class="pt-2 border-t border-stone-200 dark:border-stone-800">
          <span class="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">탐방한 장소</span>
          <ul class="space-y-0.5">
            ${placesList}
          </ul>
        </div>
      `;
    } else {
      overlayEl.innerHTML = `
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
              미답사 구역
            </span>
            <h4 class="font-serif text-base font-bold text-stone-900 dark:text-paper-100 mt-1">
              ${props.sido} ${props.name}
            </h4>
          </div>
          <button type="button" class="overlay-close-btn p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
            &times;
          </button>
        </div>
        <p class="text-xs text-stone-500 dark:text-stone-400 font-serif leading-relaxed mt-2">
          아직 발걸음이 닿지 않은 고요한 숲길입니다. 이곳을 걷고 산책 기록을 작성하면 서가에 새 책이 꽂히고 탐방 도장이 찍힙니다.
        </p>
      `;
    }

    overlayEl.querySelector('.overlay-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeActiveOverlay();
    });

    const overlay = new kakao.maps.CustomOverlay({
      position: position,
      content: overlayEl,
      yAnchor: 1.25,
      zIndex: 100,
    });

    overlay.setMap(this.map);
    this.activeOverlay = overlay;
  }

  closeActiveOverlay(): void {
    if (this.activeOverlay) {
      this.activeOverlay.setMap(null);
      this.activeOverlay = null;
    }
  }

  /**
   * 지도에 등록된 모든 마커, 오버레이, 폴리곤, 폴리라인 초기화
   */
  clearMapElements(): void {
    this.closeActiveOverlay();
    this.markers.forEach((m) => m.setMap(null));
    this.markers = [];
    this.overlays.forEach((o) => o.setMap(null));
    this.overlays = [];
    this.polylines.forEach((p) => p.setMap(null));
    this.polylines = [];
    this.polygons.forEach((p) => p.setMap(null));
    this.polygons = [];
  }

  /**
   * 지도 중심 좌표 및 줌 레벨 부드러운 이동
   */
  setCenter(lat: number, lng: number, level?: number): void {
    if (!this.map || typeof window === 'undefined' || !window.kakao) return;
    const kakao = window.kakao;
    const centerLatLng = new kakao.maps.LatLng(lat, lng);
    this.map.panTo(centerLatLng);
    if (level !== undefined) {
      this.map.setLevel(level);
    }
  }

  destroy(): void {
    this.clearMapElements();
    this.map = null;
  }
}
