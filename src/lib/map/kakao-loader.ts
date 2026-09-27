/**
 * 카카오맵 JavaScript API 비동기 안전 로더
 * 
 * - autoload=false 파라미터 적용
 * - kakao.maps.load() 콜백 기반 안전한 초기화
 * - 중복 script 태그 주입 방지 및 싱글톤 Promise 캐싱
 */

declare global {
  interface Window {
    kakao: any;
  }
}

let loadPromise: Promise<any> | null = null;

export function loadKakaoSDK(apiKey?: string): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Kakao Map SDK cannot be loaded on the server.'));
  }

  // 이미 카카오 객체가 로드되어 있고 maps가 준비된 경우
  if (window.kakao && window.kakao.maps && window.kakao.maps.Map) {
    return Promise.resolve(window.kakao);
  }

  if (loadPromise) {
    return loadPromise;
  }

  const key = apiKey || import.meta.env.PUBLIC_KAKAO_MAP_KEY;
  if (!key || key.trim() === '' || key === 'your_kakao_js_app_key_here') {
    return Promise.reject(
      new Error('PUBLIC_KAKAO_MAP_KEY 환경변수가 설정되지 않았습니다. .env 파일에 카카오 JavaScript 키를 등록해 주세요.')
    );
  }

  loadPromise = new Promise((resolve, reject) => {
    // 이미 존재하는 스크립트 태그가 있는지 확인
    const existingScript = document.getElementById('kakao-map-sdk');
    if (existingScript) {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => resolve(window.kakao));
      } else {
        existingScript.addEventListener('load', () => {
          window.kakao.maps.load(() => resolve(window.kakao));
        });
        existingScript.addEventListener('error', () => {
          reject(new Error('카카오맵 SDK 스크립트 로드에 실패했습니다. 카카오 개발자 콘솔의 도메인 설정을 확인해 주세요.'));
        });
      }
      return;
    }

    const cleanKey = key.trim().replace(/^["']|["']$/g, '');

    const script = document.createElement('script');
    script.id = 'kakao-map-sdk';
    script.type = 'text/javascript';
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(cleanKey)}&autoload=false&libraries=services,clusterer`;
    script.async = true;

    script.onload = () => {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => {
          resolve(window.kakao);
        });
      } else {
        reject(new Error('카카오맵 객체를 초기화할 수 없습니다.'));
      }
    };

    script.onerror = () => {
      reject(new Error('카카오맵 SDK 네트워크 요청이 실패했습니다. 인터넷 연결 또는 도메인 허용 목록을 확인해 주세요.'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
