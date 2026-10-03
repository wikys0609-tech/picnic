#!/usr/bin/env node

/**
 * 로컬 커밋 전 비밀 값(Secret) 사전 차단 검사 스크립트 (Pre-commit hook)
 * 
 * - git diff --cached를 검사하여 민감 파일(.env, 서비스 계정 JSON, 개인 키)이나
 *   비밀 API 키(Google Service Account, GitHub Token, Kakao REST Key 등)가
 *   커밋되는 것을 사전에 강제 차단합니다.
 * - README.md, docs/를 포함한 모든 문서 파일도 비밀 값 검사 대상에 포함됩니다.
 * - 공개 클라이언트 키인 PUBLIC_KAKAO_MAP_KEY(a7ec74f23964ef752a90e8bef05c19ec)와
 *   카카오 응답 픽스처(tests/fixtures/)만 오탐 방지용 예외로 허용됩니다.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

// 공개 JavaScript 키 (클라이언트 브라우저 노출 및 도메인 제한 적용 키)
const PUBLIC_KAKAO_JS_KEY = 'a7ec74f23964ef752a90e8bef05c19ec';

// 1. 커밋 절대 금지 파일명 / 확장자 패턴 (파일명 기준)
const BLOCKED_FILE_PATTERNS = [
  /^\.env(?:\.local|\.production|\.development)?$/i, // .env 파일 (단, .env.example 제외)
  /service[-_]?account.*\.json$/i,                  // 구글 서비스 계정 키 파일
  /\.(?:pem|key|p12|pfx)$/i,                         // 인증서 및 비공개 키 파일
  /^\.photo-cache\.json$/i                           // 로컬 사진 동기화 내부 캐시
];

// 파일명 차단 검사에서 제외할 파일 (템플릿용)
const FILE_BLOCK_EXEMPTIONS = [
  '.env.example'
];

// diff 내용 검사에서 완전히 제외할 경로 (카카오 행정동 응답 픽스처 전용)
const DIFF_EXEMPT_PATHS = [
  'tests/fixtures/'
];

// 2. 검출할 시크릿 정규식 패턴 (README.md 및 docs/를 포함한 전 파일 대상)
const SECRET_RULES = [
  {
    name: 'Google Service Account Private Key',
    regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/
  },
  {
    name: 'Google Service Account JSON Credential',
    regex: /"type":\s*"service_account"/
  },
  {
    name: 'Google Service Account Client Email',
    regex: /"client_email":\s*"[^"]+@(?:[^"]+\.)?gserviceaccount\.com"/
  },
  {
    name: 'GitHub Personal Access Token (Classic / PAT)',
    regex: /(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}|gho_[a-zA-Z0-9]{36})/
  },
  {
    name: 'AWS Access Key ID',
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/
  },
  {
    name: 'Kakao REST API Key Hardcoded Assignment',
    regex: /KAKAO_REST_API_KEY\s*[:=]\s*['"]?([a-f0-9]{32})['"]?/i,
    validator: (match) => {
      // 32자리 16진수 실제 키인 경우에만 차단 (placeholder는 허용)
      const key = match[1] || '';
      return key.length === 32;
    }
  },
  {
    name: 'KakaoAK Authorization Header with Secret Key',
    regex: /KakaoAK\s+['"]?([a-f0-9]{32})['"]?/i,
    validator: (match) => {
      // 공개 JavaScript 키는 허용, 그 외의 32자리 비밀 키는 차단
      const key = match[1] || '';
      return key.toLowerCase() !== PUBLIC_KAKAO_JS_KEY.toLowerCase();
    }
  }
];

function isDiffExempt(filepath) {
  const norm = filepath.replace(/\\/g, '/');
  return DIFF_EXEMPT_PATHS.some(allowed => norm === allowed || norm.startsWith(allowed));
}

function isFileBlockExempt(filepath) {
  const norm = filepath.replace(/\\/g, '/');
  return FILE_BLOCK_EXEMPTIONS.some(allowed => norm === allowed || norm.endsWith(allowed));
}

function checkStagedFiles() {
  let stagedFilesOutput = '';
  try {
    stagedFilesOutput = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
  } catch {
    return; // Git 저장소가 아니거나 커밋 중이 아닌 경우 건너뜀
  }

  if (!stagedFilesOutput) {
    return; // 커밋할 변경사항 없음
  }

  const stagedFiles = stagedFilesOutput.split(/\r?\n/).filter(Boolean);
  const violations = [];

  // [검사 1] 파일명 기반 민감 파일 커밋 차단
  for (const file of stagedFiles) {
    if (isFileBlockExempt(file)) continue;

    const basename = path.basename(file);
    for (const pattern of BLOCKED_FILE_PATTERNS) {
      if (pattern.test(basename)) {
        violations.push({
          type: '파일 차단',
          file,
          reason: `민감 파일이 스테이징되었습니다 (${pattern})`
        });
      }
    }
  }

  // [검사 2] git diff 내용 기반 비밀 값 정규식 매칭 (README.md, docs/ 포함 전수 검사)
  for (const file of stagedFiles) {
    if (isDiffExempt(file)) continue;

    let fileDiff = '';
    try {
      fileDiff = execSync(`git diff --cached -U0 -- "${file}"`, { encoding: 'utf8' });
    } catch {
      continue;
    }

    const lines = fileDiff.split(/\r?\n/);
    let lineNum = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const m = line.match(/\+([0-9]+)/);
        if (m) lineNum = parseInt(m[1], 10) - 1;
        continue;
      }

      if (!line.startsWith('+') || line.startsWith('+++')) {
        continue;
      }

      lineNum++;
      const addedContent = line.slice(1);

      for (const rule of SECRET_RULES) {
        const m = addedContent.match(rule.regex);
        if (m) {
          if (rule.validator && !rule.validator(m, addedContent)) {
            continue; // 허용된 공개 키 또는 플레이스홀더
          }

          violations.push({
            type: '비밀 값 검출',
            file: `${file}:${lineNum}`,
            rule: rule.name,
            snippet: addedContent.trim().slice(0, 80)
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('\n🚨 [보안 차단] 커밋 대상에 비밀 값(Secret) 또는 민감 파일이 포함되어 있습니다!');
    console.error('========================================================================');
    for (const v of violations) {
      if (v.type === '파일 차단') {
        console.error(`❌ [파일 차단] ${v.file}`);
        console.error(`   사유: ${v.reason}`);
      } else {
        console.error(`❌ [${v.rule}] ${v.file}`);
        console.error(`   내용: ${v.snippet}`);
      }
    }
    console.error('========================================================================');
    console.error('💡 조치 방법:');
    console.error('  1. 민감 파일(.env 등)을 .gitignore에 등록하고 `git reset HEAD <파일>`로 스테이징을 해제하세요.');
    console.error('  2. 소스 코드나 문서에 하드코딩된 API 키/토큰을 제거하세요.\n');
    process.exit(1);
  }
}

checkStagedFiles();
