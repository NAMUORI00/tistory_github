# 🤖 AI Agent Technical Specification: Tistory Skin

이 문서는 모노레포 구조와 서브모듈 기반 스킨/서버 분리를 설명합니다.

---

## 🏗️ 1. 프로젝트 구조 (모노레포)

```text
.
├── skin/              # ⚠️ 서브모듈 (skin 브랜치) — 티스토리 업로드 전용
│   ├── skin.html      # 스킨 HTML 템플릿 (티스토리 치환자 사용)
│   ├── style.css      # 스킨 스타일시트
│   ├── script.js      # 스킨 자바스크립트
│   ├── index.xml      # 스킨 설정 메타데이터
│   ├── preview*.jpg   # 스킨 미리보기 이미지
│   └── images/        # 스킨 에셋 이미지
├── server/            # 서브모듈 (dev-server 브랜치) — 로컬 프리뷰 서버
│   ├── dev-server.mjs # Express 개발 서버
│   └── engine.mjs     # 치환자 하이드레이션 엔진
├── .gitmodules        # 서브모듈 설정
├── .env               # 환경 설정 (기본 블로그 URL, 포트)
├── package.json       # 모노레포 루트 스크립트
└── AGENTS.md          # 기술 가이드
```

### 브랜치 구조
| 브랜치 | 역할 | 서브모듈 경로 |
|:---|:---|:---|
| `main` | 모노레포 루트 (오케스트레이터) | — |
| `skin` | 스킨 파일 전용 (orphan) | `skin/` |
| `dev-server` | 프리뷰 서버 전용 (orphan) | `server/` |

---

## ⚠️ 2. `skin/` 디렉토리 규칙 (핵심)

### 2.1 목적
`skin/` 폴더는 **티스토리에 직접 업로드하는 스킨 파일만** 포함합니다.
이 폴더의 내용물은 티스토리 관리 페이지의 `꾸미기 > 스킨 편집 > 스킨 등록`을 통해
그대로 업로드되는 파일들입니다.

> ⚠️ `skin/`은 git 서브모듈입니다. 수정 시 서브모듈 내에서 커밋 → push하고,
> 부모 레포에서도 서브모듈 참조를 업데이트해야 합니다.

### 2.2 허용되는 파일
| 파일 | 필수 | 설명 |
|:---|:---:|:---|
| `skin.html` | ✅ | 스킨 HTML 템플릿. 티스토리 표준 치환자(`[##_..._##]`)와 그룹 태그(`<s_...>`)만 사용 |
| `style.css` | ✅ | 스킨 CSS. 티스토리 변수 치환자(`[##_var_..._##]`) 사용 가능 |
| `script.js` | ❌ | 스킨 JS. 브라우저 런타임 전용 코드만 포함 |
| `index.xml` | ✅ | 스킨 메타데이터. 스킨 이름, 버전, 스킨 변수(옵션) 정의 |
| `preview*.jpg/gif` | ❌ | 스킨 미리보기 이미지 (256/560/1600px) |
| `images/*` | ❌ | 스킨에서 참조하는 이미지 에셋 |

### 2.3 금지 사항
- ❌ **Node.js / npm 모듈 코드** 포함 금지 (require, import 등)
- ❌ **개발 서버 전용 코드** 혼입 금지 (Express, axios 등)
- ❌ **빌드 결과물이 아닌 소스** 파일 금지 (.ts, .scss, .jsx 등)
- ❌ **환경 변수 참조** 금지 (process.env 등)
- ❌ 티스토리 표준에 정의되지 않은 **커스텀 치환자** 사용 금지

### 2.4 치환자 규칙
`skin.html`과 `style.css`에서 사용하는 모든 치환자는 
[티스토리 공식 스킨 가이드](https://tistory.github.io/document-tistory-skin/)에 
정의된 표준 치환자여야 합니다.

**값 치환자** 예시:
```
[##_title_##]          블로그 제목
[##_desc_##]           블로그 설명
[##_body_id_##]        페이지별 body id
[##_tistory_head_##]   Tistory 공통 리소스 주입 위치
[##_article_rep_desc_##]  글 본문
```

**그룹 치환자** 예시:
```html
<s_t3>...</s_t3>                    Tistory 공통 JS 블록
<s_list><s_list_rep>...</s_list_rep></s_list>  글 목록 반복
<s_article_rep>...</s_article_rep>  글 상세 블록
<s_rp>...</s_rp>                    댓글 블록
<s_guest>...</s_guest>              방명록 블록
<s_tag>...</s_tag>                  태그 클라우드 블록
```

### 2.5 경로 참조
스킨 내 이미지/에셋 참조 시 `./images/파일명`이 아닌 `images/파일명` 형식을 사용합니다.
이 형식이 로컬 개발 서버와 실제 티스토리 양쪽에서 모두 정상 동작합니다.

---

## 🧪 3. 로컬 개발 서버 (`server/`)

### 3.1 역할
`server/` 폴더는 `skin/`의 스킨을 로컬에서 미리보기 위한 **개발 도구**입니다.
실제 티스토리 서버의 SSR(서버 사이드 렌더링)을 모방하여
치환자를 실제 블로그 데이터로 채운 결과를 브라우저에서 확인할 수 있습니다.

> ⚠️ `server/`는 git 서브모듈입니다. 수정 후 서브모듈 커밋 → push,
> 부모 레포 서브모듈 참조 업데이트가 필요합니다.

### 3.2 데이터 소스
```
실제 블로그 → /m/api/blog/info   블로그 메타 (제목, 설명, 로고)
           → /rss               글 목록 (최대 50개)
           → HTML 스크래핑        방문자 수, 태그, 카테고리, 최근 댓글
           → <head> 스크래핑      Tistory 공통 CSS/JS (jQuery, content.css 등)
```

### 3.3 기본 타겟 블로그
`.env` 파일의 `TARGET_BLOG_URL`에 기본 블로그를 설정합니다:
```env
TARGET_BLOG_URL=https://thesauro.tistory.com/
SKIN_DIR=skin
```

### 3.4 사용 방법
```bash
npm run setup        # 서브모듈 초기화 + 의존성 설치
npm run dev          # 개발 서버 시작
# 브라우저에서 http://localhost:3000 접속
```

하단 **Preview Control Toolbar**에서 다른 블로그 URL을 입력하고
`Apply`를 누르면 즉시 해당 블로그 데이터로 프리뷰를 전환할 수 있습니다.

---

## 🔄 4. 서브모듈 워크플로우

### 스킨 수정 시
```bash
cd skin/
# 편집 작업
git add . && git commit -m "feat: 변경 내용"
git push origin skin

# 부모 레포에서 서브모듈 참조 업데이트
cd ..
git add skin
git commit -m "chore: skin 서브모듈 업데이트"
git push
```

### 서버 수정 시
```bash
cd server/
# 편집 작업
git add . && git commit -m "fix: 변경 내용"
git push origin dev-server

# 부모 레포에서 서브모듈 참조 업데이트
cd ..
git add server
git commit -m "chore: server 서브모듈 업데이트"
git push
```

### 편리한 명령어
```bash
npm run update:skin    # 최신 skin 브랜치 가져오기
npm run update:server  # 최신 dev-server 브랜치 가져오기
npm run update:all     # 모두 업데이트
```

---

## 🏷️ 5. 개발 규칙 (For AI)

1. **스킨 수정**: 디자인 및 기능 수정은 반드시 `skin/` 폴더 내 파일만 대상으로 합니다.
2. **표준 준수**: `skin/`에는 티스토리 스킨 표준 규격 파일만 포함합니다. 개발 도구, 빌드 스크립트, Node.js 코드 등을 절대 넣지 않습니다.
3. **치환자 보존**: `[##_tistory_head_##]`가 `<head>` 섹션에 있는지, `<s_t3>`가 `<body>` 내에 있는지 항상 확인합니다.
4. **엔진 수정**: 치환자 처리 로직을 개선하려면 `server/engine.mjs`를 수정합니다.
5. **분리 원칙**: `skin/`(업로드 대상)와 `server/`(개발 도구)를 절대 혼합하지 않습니다.
6. **서브모듈 인지**: `skin/`과 `server/`는 서브모듈입니다. 수정 후 서브모듈 내/외부 모두 커밋이 필요합니다.
