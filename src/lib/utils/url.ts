/**
 * GitHub Pages의 base 경로(/picnic)를 안전하게 결합하는 URL 유틸리티
 * 
 * @example
 * baseUrl('/walks') => '/picnic/walks'
 * baseUrl('/photos/cover.webp') => '/picnic/photos/cover.webp'
 * baseUrl('/') => '/picnic/'
 */
export function baseUrl(path: string = '/'): string {
  // import.meta.env.BASE_URL은 astro.config.mjs의 base 값(예: '/picnic/')을 반영합니다.
  const rawBase = import.meta.env.BASE_URL || '/';
  const base = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
  
  if (!path || path === '/') {
    return base ? `${base}/` : '/';
  }
  
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
