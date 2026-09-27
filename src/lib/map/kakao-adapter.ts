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

  closeActiveOverlay(): void {
    if (this.activeOverlay) {
      this.activeOverlay.setMap(null);
      this.activeOverlay = null;
    }
  }

  destroy(): void {
    this.closeActiveOverlay();
    this.markers.forEach((m) => m.setMap(null));
    this.markers = [];
    this.overlays.forEach((o) => o.setMap(null));
    this.overlays = [];
    this.polylines.forEach((p) => p.setMap(null));
    this.polylines = [];
    this.map = null;
  }
}
