/**
 * 날짜 포맷 유틸리티
 */
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function formatDateKorean(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayName = DAY_NAMES[date.getDay()];

  return `${year}년 ${month}월 ${day}일 (${dayName})`;
}

export function formatShortDate(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}.${month}.${day}`;
}

export function getYearMonth(dateInput: string | Date): { year: number; month: number } {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}
