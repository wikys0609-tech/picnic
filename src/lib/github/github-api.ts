/**
 * GitHub REST API 클라이언트 모듈 (브라우저 직접 연동)
 * 
 * - Fine-grained PAT를 통한 GitHub Git Data API 원자적(atomic) 커밋
 * - 단일 트랜잭션으로 여러 파일(새 장소 + 산책 기록)을 단일 커밋으로 푸시
 * - GitHub Actions 자동 배포 트리거
 */

export interface CommitFile {
  path: string;
  content: string;
}

export interface CommitOptions {
  pat: string;
  owner?: string;
  repo?: string;
  branch?: string;
  commitMessage: string;
  files: CommitFile[];
}

export interface VerifyResult {
  valid: boolean;
  username?: string;
  canPush?: boolean;
  errorMessage?: string;
}

const DEFAULT_OWNER = 'wikys0609-tech';
const DEFAULT_REPO = 'picnic';
const DEFAULT_BRANCH = 'main';

/**
 * GitHub 토큰 및 저장소 쓰기 권한 검증
 */
export async function verifyGithubToken(
  pat: string,
  owner = DEFAULT_OWNER,
  repo = DEFAULT_REPO
): Promise<VerifyResult> {
  const cleanPat = pat.trim();
  if (!cleanPat) {
    return { valid: false, errorMessage: '토큰을 입력해 주세요.' };
  }

  try {
    // 1. 사용자 정보 확인
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${cleanPat}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userRes.ok) {
      if (userRes.status === 401) {
        return { valid: false, errorMessage: '유효하지 않은 GitHub 토큰입니다 (401 Unauthorized).' };
      }
      return { valid: false, errorMessage: `GitHub API 오류 (${userRes.status}): ${userRes.statusText}` };
    }

    const userData = await userRes.json();
    const username = userData.login || 'User';

    // 2. 대상 저장소 권한 확인
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${cleanPat}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!repoRes.ok) {
      if (repoRes.status === 404) {
        return {
          valid: false,
          username,
          errorMessage: `저장소(${owner}/${repo})를 찾을 수 없거나 토큰에 접근 권한이 없습니다.`,
        };
      }
      return { valid: false, username, errorMessage: `저장소 확인 실패 (${repoRes.status})` };
    }

    const repoData = await repoRes.json();
    const canPush = repoData.permissions?.push === true;

    if (!canPush) {
      return {
        valid: false,
        username,
        canPush: false,
        errorMessage: `저장소에 대한 쓰기(Push/Contents: write) 권한이 없습니다. Fine-grained PAT 설정을 확인해 주세요.`,
      };
    }

    return { valid: true, username, canPush: true };
  } catch (err: any) {
    return { valid: false, errorMessage: `네트워크 오류: ${err.message || '인터넷 연결을 확인하세요.'}` };
  }
}

/**
 * 복수 파일을 GitHub Git Data API를 사용해 단일 원자적 커밋으로 전송
 */
export async function atomicCommitFiles(
  options: CommitOptions,
  onProgress?: (step: string) => void
): Promise<{ commitSha: string; commitUrl: string }> {
  const {
    pat,
    owner = DEFAULT_OWNER,
    repo = DEFAULT_REPO,
    branch = DEFAULT_BRANCH,
    commitMessage,
    files,
  } = options;

  const cleanPat = pat.trim();
  const headers = {
    Authorization: `Bearer ${cleanPat}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  const notify = (step: string) => {
    if (onProgress) onProgress(step);
  };

  if (!files || files.length === 0) {
    throw new Error('커밋할 파일이 없습니다.');
  }

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        notify(`원격 브랜치 변경 감지: 최신 상태를 반영하여 재시도 중 (${attempt}/${MAX_RETRIES})...`);
        // 잠시 대기 후 재시도
        await new Promise((resolve) => setTimeout(resolve, attempt * 600));
      }

      // 1. 현재 브랜치의 최신 커밋 SHA 조회
      notify(`브랜치(${branch})의 최신 커밋 조회 중...`);
      const refRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
        { headers }
      );

      if (!refRes.ok) {
        const errorBody = await refRes.text();
        throw new Error(`최신 커밋 조회 실패 (${refRes.status}): ${errorBody}`);
      }

      const refData = await refRes.json();
      const latestCommitSha = refData.object.sha;

      // 2. 최신 커밋의 Base Tree SHA 조회
      notify('기존 파일 트리(Base Tree) 확인 중...');
      const commitRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`,
        { headers }
      );

      if (!commitRes.ok) {
        const errorBody = await commitRes.text();
        throw new Error(`커밋 정보 조회 실패 (${commitRes.status}): ${errorBody}`);
      }

      const commitData = await commitRes.json();
      const baseTreeSha = commitData.tree.sha;

      // 3. 새 파일 트리를 생성 (Git Data Trees API)
      notify(`${files.length}개 파일 변경사항을 트리로 패키징 중...`);
      const treePayload = {
        base_tree: baseTreeSha,
        tree: files.map((file) => ({
          path: file.path.replace(/^\//, ''),
          mode: '100644', // 일반 파일
          type: 'blob',
          content: file.content,
        })),
      };

      const createTreeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(treePayload),
        }
      );

      if (!createTreeRes.ok) {
        const errorBody = await createTreeRes.text();
        throw new Error(`파일 트리 생성 실패 (${createTreeRes.status}): ${errorBody}`);
      }

      const newTreeData = await createTreeRes.json();
      const newTreeSha = newTreeData.sha;

      // 4. 새 커밋 객체 생성 (Git Data Commits API)
      notify('원자적 커밋 생성 중...');
      const createCommitPayload = {
        message: commitMessage,
        tree: newTreeSha,
        parents: [latestCommitSha],
      };

      const createCommitRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/commits`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(createCommitPayload),
        }
      );

      if (!createCommitRes.ok) {
        const errorBody = await createCommitRes.text();
        throw new Error(`커밋 생성 실패 (${createCommitRes.status}): ${errorBody}`);
      }

      const newCommitData = await createCommitRes.json();
      const newCommitSha = newCommitData.sha;

      // 5. 브랜치 참조(Ref) 업데이트 (Fast-forward 푸시)
      notify(`브랜치(${branch}) 푸시 및 배포 트리거 중...`);
      const updateRefRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            sha: newCommitSha,
            force: false,
          }),
        }
      );

      if (!updateRefRes.ok) {
        const errorBody = await updateRefRes.text();
        // 422 상태 코드인 경우(동시 커밋 충돌로 fast-forward 불가) 재시도
        if (updateRefRes.status === 422 && attempt < MAX_RETRIES) {
          console.warn(`[GitHub API] 422 Conflict on attempt ${attempt}, retrying with new HEAD...`);
          continue;
        }
        throw new Error(`브랜치 업데이트 실패 (${updateRefRes.status}): ${errorBody}`);
      }

      notify('저장소 커밋 및 푸시 완료!');
      return {
        commitSha: newCommitSha,
        commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
      };
    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_RETRIES && (err.message?.includes('422') || err.message?.includes('fast forward'))) {
        continue;
      }
      break;
    }
  }

  throw new Error(
    `원격 main 브랜치와 충돌이 발생하여 커밋하지 못했습니다 (${lastError?.message || '업데이트 실패'}). 잠시 후 다시 시도해 주세요.`
  );
}
