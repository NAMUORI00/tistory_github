# 🤖 AI Agent Technical Specification: Tistory Skin (Refactored)

이 문서는 스킨 소스와 개발 서버가 분리된 고도화된 프로젝트 구조를 설명합니다.

---

## 🏗️ 1. 프로젝트 구조 (Refactored)

```text
.
├── src/               # 스킨 소스 코드 (티스토리에 업로드할 대상)
│   ├── skin.html      # 핵심 템플릿
│   ├── style.css      # 스타일
│   ├── index.xml      # 설정 메타데이터
│   ├── script.js      # 자바스크립트
│   ├── preview*.jpg   # 미리보기 이미지
│   └── images/        # 스킨 에셋
├── server/            # 로컬 개발 및 목데이터 서버
│   ├── dev-server.mjs # 메인 서버 (Express)
│   └── engine.mjs     # 치환자 하이드레이션 및 URL 파싱 엔진
├── package.json       # 의존성 관리
└── AGENTS.md          # 기술 가이드
```

---

## 🧪 2. 실시간 목데이터 미리보기 (Real-time Mocking)

단순한 아이디 입력뿐만 아니라, **실제 티스토리 블로그의 전체 URL**을 입력하여 데이터를 즉시 가져올 수 있습니다.

### 2.1 URL 기반 자동 크롤링 (RSS)
서버는 다음 형식의 URL을 자동으로 인식하여 데이터를 추출합니다:
- `https://keinn51.tistory.com/` -> `keinn51` 아이디 추출 -> RSS 페칭

### 2.2 사용 방법
```bash
npm install
npm run dev
```

### 2.3 환경 설정 (.env)
프로젝트 루트의 `.env` 파일에서 기본 설정을 변경할 수 있습니다:
- `TARGET_BLOG_URL`: 기본 블로그 주소 (아이디 또는 전체 URL)
- `PORT`: 개발 서버 포트 (기본값: 3000)

### 2.4 브라우저 미리보기 제어
서버 실행 후 브라우저 하단에 **Preview Control Toolbar**가 나타납니다. 여기서 다른 블로그 주소를 입력하고 `Apply`를 누르면 즉시 해당 데이터가 적용된 스킨을 확인할 수 있습니다.

---

## 🏷️ 3. 개발 규칙 (For AI)

1.  **소스 수정**: 모든 디자인 및 기능 수정은 반드시 `src/` 폴더 내의 파일들을 대상으로 진행하세요.
2.  **치환자 누락 금지**: `[##_tistory_head_##]`가 `<head>` 섹션에 있는지 항상 확인하세요.
3.  **경로 참조**: 스킨 내 이미지 참조는 `./images/...`가 아닌 `images/...` 형식을 유지해야 서버와 티스토리 양쪽에서 정상 작동합니다.
4.  **엔진 수정**: 치환자 로직을 개선하려면 `server/engine.mjs`를 수정하세요.
