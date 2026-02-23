# 📦 레포지토리 관리 계획 — 스킨 / 프리뷰 서버 분리

> 작성일: 2026-02-23  
> 현재 상태: `NAMUORI00/tistory_github` 단일 레포, `master` 브랜치 1개

---

## 📋 현재 구조 (AS-IS)

```
tistory_github/                  ← 단일 레포
├── src/                         ← 티스토리 스킨 (업로드 대상)
│   ├── skin.html
│   ├── style.css
│   ├── script.js
│   ├── index.xml
│   ├── images/
│   └── preview*.jpg/gif
├── server/                      ← 로컬 프리뷰 서버 (개발 도구)
│   ├── dev-server.mjs
│   └── engine.mjs
├── package.json                 ← 서버 의존성 포함
├── .env
├── AGENTS.md
└── README.md
```

**문제점:**
- 스킨과 서버가 같은 브랜치에서 관리되어 배포/릴리스 단위 분리가 어렵다
- 스킨만 별도로 버전 관리하거나, 서버를 다른 스킨에 재사용하기 어렵다
- 협업 시 PR 범위가 혼재된다

---

## 🎯 목표 구조 (TO-BE)

```
tistory_github/                  ← 모노레포 (오케스트레이터)
├── skin/                        ← 서브모듈: 스킨 전용
├── server/                      ← 서브모듈: 프리뷰 서버 전용
├── .gitmodules                  ← 서브모듈 설정
├── .env                         ← 환경 설정
├── package.json                 ← 루트 스크립트
├── AGENTS.md
└── README.md
```

---

## ⚖️ 두 가지 방안 비교

### 방안 A: 별도 레포지토리 + 서브모듈 (✅ 권장)

| 레포 | 내용 | URL |
|:---|:---|:---|
| `tistory_github` | 모노레포 루트 (서브모듈 조합) | 기존 레포 유지 |
| `tistory-skin-hanban` | 스킨 파일만 (`skin.html`, `style.css`, ...) | 신규 생성 |
| `tistory-preview-server` | 프리뷰 서버 (`dev-server.mjs`, `engine.mjs`) | 신규 생성 |

```
[ tistory_github ]  ← main 브랜치
    ├── skin/       ← submodule → tistory-skin-hanban (main)
    ├── server/     ← submodule → tistory-preview-server (main)
    └── ...
```

**장점:**
- ✅ **Git 표준 패턴** — 서브모듈의 정석적 사용법
- ✅ **독립 릴리스** — 스킨과 서버 각각 독립적으로 태그/버전 관리 가능
- ✅ **재사용성** — 서버를 다른 스킨 프로젝트에서도 서브모듈로 가져올 수 있음
- ✅ **CI/CD 분리** — 레포별로 독립적인 워크플로우 구성 가능
- ✅ **깔끔한 이력** — 스킨 변경과 서버 변경의 커밋 히스토리가 완전 분리

**단점:**
- ⚠️ GitHub 레포를 2개 추가로 만들어야 함
- ⚠️ 서브모듈 업데이트 시 부모 레포에서도 커밋 필요

---

### 방안 B: 같은 레포, 브랜치 분리 + 셀프 서브모듈

| 브랜치 | 내용 | 역할 |
|:---|:---|:---|
| `main` | 모노레포 루트 | 서브모듈 조합 |
| `skin` | 스킨 파일만 | 서브모듈 소스 |
| `dev-server` | 서버 파일만 | 서브모듈 소스 |

```
[ tistory_github ]
    main 브랜치:
        ├── skin/       ← submodule → 같은 레포, -b skin
        ├── server/     ← submodule → 같은 레포, -b dev-server
        └── ...

    skin 브랜치:
        ├── skin.html
        ├── style.css
        └── ...

    dev-server 브랜치:
        ├── dev-server.mjs
        ├── engine.mjs
        └── package.json
```

```bash
# 셀프 서브모듈 추가 방식
git submodule add -b skin   https://github.com/NAMUORI00/tistory_github.git skin
git submodule add -b dev-server https://github.com/NAMUORI00/tistory_github.git server
```

**장점:**
- ✅ 레포 하나로 모든 것 관리
- ✅ 개인 프로젝트에서 URL 관리가 간단

**단점:**
- ⚠️ **비표준 패턴** — 자기 자신을 서브모듈로 참조하는 것은 혼란을 줄 수 있음
- ⚠️ **재귀 클론 주의** — `git clone --recursive` 시 무한 루프는 아니지만 복잡해짐
- ⚠️ **PR/이슈 혼재** — 하나의 레포에서 스킨/서버 이슈가 섞임
- ⚠️ **CI/CD 복잡** — 브랜치별 완전히 다른 워크플로우가 필요
- ⚠️ **히스토리 단절** — 브랜치 간 공통 히스토리가 없어 머지 불가

---

## 🏆 권장: 방안 A (별도 레포지토리)

개인 프로젝트라도 방안 A를 권장합니다. 이유:

1. **프리뷰 서버의 재사용 가치가 높음** — 다른 티스토리 스킨을 만들 때 서버를 그대로 재사용 가능
2. **스킨 레포를 직접 zip 배포** 가능 — 스킨 레포만 클론하면 바로 티스토리 업로드 가능
3. **Git 워크플로우가 자연스러움** — 서브모듈 업데이트, 태깅이 표준 방식으로 동작

---

## 🛠️ 마이그레이션 단계 (방안 A 기준)

### Phase 1: 스킨 레포 생성

```bash
# 1. GitHub에서 새 레포 생성: NAMUORI00/tistory-skin-hanban
# 2. 로컬에서 스킨 파일 분리
mkdir ~/projects/tistory-skin-hanban
cd ~/projects/tistory-skin-hanban
git init

# 3. 기존 src/ 내용을 루트에 복사 (src 폴더 없이 flat 구조)
cp -r ~/projects/tistory_github/src/* .
cp -r ~/projects/tistory_github/src/images .

# 4. 스킨 전용 .gitignore
cat > .gitignore << 'EOF'
.DS_Store
Thumbs.db
Desktop.ini
*.swp
.vscode/
.idea/
EOF

# 5. 스킨 전용 README.md 작성
# 6. 커밋 & 푸시
git add .
git commit -m "init: 티스토리 스킨 초기 이관"
git remote add origin https://github.com/NAMUORI00/tistory-skin-hanban.git
git push -u origin main
```

**스킨 레포 결과 구조:**
```
tistory-skin-hanban/
├── skin.html
├── style.css
├── script.js
├── index.xml
├── images/
├── preview*.jpg/gif
├── .gitignore
└── README.md
```

---

### Phase 2: 프리뷰 서버 레포 생성

```bash
# 1. GitHub에서 새 레포 생성: NAMUORI00/tistory-preview-server
# 2. 로컬에서 서버 파일 분리
mkdir ~/projects/tistory-preview-server
cd ~/projects/tistory-preview-server
git init

# 3. 서버 파일 복사
cp ~/projects/tistory_github/server/* .

# 4. 서버 전용 package.json 생성
cat > package.json << 'EOF'
{
  "name": "tistory-preview-server",
  "version": "1.0.0",
  "description": "Tistory Skin Local Preview Server",
  "main": "dev-server.mjs",
  "type": "module",
  "scripts": {
    "dev": "node dev-server.mjs"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "dotenv": "^17.2.4",
    "express": "^4.18.2",
    "xml2js": "^0.6.2"
  }
}
EOF

# 5. 서버 전용 .gitignore
cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
.DS_Store
Thumbs.db
*.swp
.vscode/
.idea/
EOF

# 6. 커밋 & 푸시
git add .
git commit -m "init: 티스토리 프리뷰 서버 초기 이관"
git remote add origin https://github.com/NAMUORI00/tistory-preview-server.git
git push -u origin main
```

**서버 레포 결과 구조:**
```
tistory-preview-server/
├── dev-server.mjs
├── engine.mjs
├── package.json
├── .gitignore
└── README.md
```

---

### Phase 3: 메인 레포를 모노레포로 재구성

```bash
cd ~/projects/tistory_github

# 1. 기존 src/, server/ 삭제
git rm -r src/
git rm -r server/
git rm package-lock.json

# 2. 서브모듈 추가
git submodule add https://github.com/NAMUORI00/tistory-skin-hanban.git skin
git submodule add https://github.com/NAMUORI00/tistory-preview-server.git server

# 3. 루트 package.json 업데이트
cat > package.json << 'EOF'
{
  "name": "tistory-workspace",
  "version": "1.0.0",
  "private": true,
  "description": "Tistory Skin Development Workspace (Monorepo)",
  "type": "module",
  "scripts": {
    "dev": "node server/dev-server.mjs",
    "update:skin": "git submodule update --remote skin",
    "update:server": "git submodule update --remote server",
    "update:all": "git submodule update --remote --merge"
  }
}
EOF

# 4. 커밋
git add .
git commit -m "refactor: 모노레포 구조로 전환 (서브모듈)"
git push
```

**모노레포 결과 구조:**
```
tistory_github/                  ← main 브랜치
├── skin/                        ← submodule → tistory-skin-hanban
│   ├── skin.html
│   ├── style.css
│   ├── script.js
│   ├── index.xml
│   └── images/
├── server/                      ← submodule → tistory-preview-server
│   ├── dev-server.mjs
│   └── engine.mjs
├── .gitmodules                  ← 자동 생성
├── .env
├── package.json
├── AGENTS.md
└── README.md
```

---

### Phase 4: 서버 경로 수정

서브모듈 전환 후 기존 `src/` 참조를 `skin/`으로 변경해야 합니다.

**`server/dev-server.mjs` 수정 포인트:**
```javascript
// Before: src/ 경로 참조
app.use('/images', express.static('src/images'));
const skinHtml = fs.readFileSync('src/skin.html', 'utf-8');
const skinCss  = fs.readFileSync('src/style.css', 'utf-8');

// After: skin/ 경로 참조
app.use('/images', express.static('skin/images'));
const skinHtml = fs.readFileSync('skin/skin.html', 'utf-8');
const skinCss  = fs.readFileSync('skin/style.css', 'utf-8');
```

> ⚠️ **중요**: 이 수정은 서버가 모노레포 루트에서 실행된다는 전제입니다.
> 서버 레포 단독 사용 시에는 환경변수로 스킨 경로를 설정할 수 있도록 해야 합니다.

**`server/dev-server.mjs`에 추가할 환경변수:**
```javascript
const SKIN_DIR = process.env.SKIN_DIR || '../skin';
```

**`.env` 업데이트:**
```env
TARGET_BLOG_URL=https://thesauro.tistory.com/
SKIN_DIR=skin
```

---

## 📐 .gitmodules 예시

```ini
[submodule "skin"]
    path = skin
    url = https://github.com/NAMUORI00/tistory-skin-hanban.git
    branch = main

[submodule "server"]
    path = server
    url = https://github.com/NAMUORI00/tistory-preview-server.git
    branch = main
```

---

## 🔄 일상 워크플로우

### 스킨 수정 시
```bash
cd skin/
# 편집 작업
git add . && git commit -m "feat: 사이드바 디자인 변경"
git push

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
git add . && git commit -m "fix: RSS 파싱 오류 수정"
git push

# 부모 레포에서 서브모듈 참조 업데이트
cd ..
git add server
git commit -m "chore: server 서브모듈 업데이트"
git push
```

### 처음 클론할 때
```bash
git clone --recursive https://github.com/NAMUORI00/tistory_github.git
# 또는
git clone https://github.com/NAMUORI00/tistory_github.git
cd tistory_github
git submodule init
git submodule update
```

---

## 🔮 향후 확장 가능성

```
tistory_github/
├── skins/
│   ├── hanban/        ← submodule: tistory-skin-hanban
│   ├── minimal/       ← submodule: 미래의 다른 스킨
│   └── magazine/      ← submodule: 미래의 다른 스킨
├── server/            ← submodule: 공용 프리뷰 서버
└── package.json       ← 스킨 선택 스크립트
```

프리뷰 서버를 독립 레포로 분리해두면, 새로운 스킨을 만들 때마다
서버를 복사하지 않고 서브모듈로 가져오기만 하면 됩니다.

---

## ✅ 체크리스트

- [ ] GitHub에 `tistory-skin-hanban` 레포 생성
- [ ] GitHub에 `tistory-preview-server` 레포 생성
- [ ] 스킨 파일 이관 및 푸시
- [ ] 서버 파일 이관 및 푸시
- [ ] 메인 레포에서 기존 파일 제거
- [ ] 서브모듈 추가
- [ ] `dev-server.mjs` 경로 수정 (`src/` → 환경변수 기반)
- [ ] `AGENTS.md` 업데이트 (새 구조 반영)
- [ ] `README.md` 업데이트
- [ ] `npm run dev` 정상 동작 확인
