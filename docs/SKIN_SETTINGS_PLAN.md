# 🛠️ 티스토리 스킨 설정 기능을 활용한 UI 커스터마이징 개발 계획

## 📚 참고 문헌 요약

### 티스토리 스킨 공식 가이드 기반 조사

| 출처 | 내용 |
|------|------|
| [스킨 정보 파일 (index.xml)](https://tistory.github.io/document-tistory-skin/common/index.xml.html) | 스킨 메타데이터, 설정 기본값, 사용자 정의 변수 정의 구조 |
| [스킨 옵션 (variable)](https://tistory.github.io/document-tistory-skin/common/variable.html) | 변수 타입별 설정 방법, SELECT/BOOL/COLOR/IMAGE/STRING 예시 |

### 핵심 기술: `<variables>` 시스템

티스토리 스킨 설정 기능은 `index.xml` 내 `<variables>` 태그를 통해 정의됩니다. 블로그 관리자가 **스킨 편집 > 스킨 옵션** 화면에서 직접 값을 변경할 수 있으며, `skin.html`에서 치환자(`[##_var_{NAME}_##]`)로 참조됩니다.

```xml
<variables>
  <variablegroup name="그룹이름">
    <variable>
      <name>치환자에서 사용할 이름</name>
      <label>사용자에게 표시할 이름</label>
      <description>설명 (optional)</description>
      <type>타입</type>
      <option>SELECT 타입의 경우 필수 (JSON 배열)</option>
      <default>기본값</default>
    </variable>
  </variablegroup>
</variables>
```

**사용 가능한 타입:**

| 타입 | 설명 | 용도 |
|------|------|------|
| `BOOL` | true/false 체크박스 | 요소 표시/숨김 토글 |
| `SELECT` | 드롭다운 선택 | 여러 옵션 중 하나 선택 |
| `STRING` | 문자열 입력 | 커스텀 텍스트 |
| `COLOR` | 색상 선택기 | 색상 커스터마이징 |
| `IMAGE` | 이미지 URL | 배경/아이콘 이미지 |

**SELECT 타입 option 정의 예시:**
```xml
<option><![CDATA[
  [
    {"name":"light", "label":"밝은색", "value":"light"},
    {"name":"dark", "label":"어두운색", "value":"dark"}
  ]
]]></option>
```

### ⚠️ 중요한 제약사항

티스토리의 변수 시스템은 **순수 문자열 치환 방식**입니다. 서버 사이드 조건 분기(if/else)를 제공하지 않으므로, 변수 값에 따른 조건부 렌더링은 **CSS 또는 JavaScript**를 통해 구현해야 합니다.

- `[##_var_showPosts_##]` → 실제 출력: `"true"` 또는 `"false"` 문자열
- HTML attribute에 값을 삽입하고, JS/CSS로 조건 처리

---

## 📋 현재 스킨 상태 분석

### 현재 `index.xml` 변수 (3개)

| 변수명 | 타입 | 용도 |
|--------|------|------|
| `mainColor` | COLOR | 메인 테마 색상 |
| `headerImage` | IMAGE | 헤더 배경 이미지 |
| `showSidebar` | SELECT | 사이드바 표시 여부 |

### 현재 `skin.html` 상단 서브메뉴 (lines 335-368)

```html
<nav class="under-nav">
    <a class="under-nav-item active" href="[##_blog_link_##]">Overview</a>
    <a class="under-nav-item" href="/category">Posts</a>
    <a class="under-nav-item" href="[##_guestbook_link_##]">Guestbook</a>
    <a class="under-nav-item" href="[##_taglog_link_##]">Tags</a>
</nav>
```

**문제점:** 4개의 탭이 **하드코딩**되어 있어, 블로그 관리자가 표시 여부나 라벨을 변경할 수 없습니다.

---

## 🎯 개발 계획

### Phase 1: 서브메뉴 탭 표시/숨김 설정

#### 1-1. `index.xml`에 변수 추가

```xml
<variablegroup name="상단 탭 메뉴">
  <variable>
    <name>showTabOverview</name>
    <label><![CDATA[ Overview 탭 표시 ]]></label>
    <description><![CDATA[ 상단 메뉴에 Overview 탭을 표시합니다. ]]></description>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
  <variable>
    <name>showTabPosts</name>
    <label><![CDATA[ Posts 탭 표시 ]]></label>
    <description><![CDATA[ 상단 메뉴에 Posts 탭을 표시합니다. ]]></description>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
  <variable>
    <name>showTabGuestbook</name>
    <label><![CDATA[ Guestbook 탭 표시 ]]></label>
    <description><![CDATA[ 상단 메뉴에 Guestbook(방명록) 탭을 표시합니다. ]]></description>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
  <variable>
    <name>showTabTags</name>
    <label><![CDATA[ Tags 탭 표시 ]]></label>
    <description><![CDATA[ 상단 메뉴에 Tags 탭을 표시합니다. ]]></description>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
</variablegroup>
```

#### 1-2. `skin.html` 서브메뉴 수정

`<nav>` 요소에 `data-*` 속성으로 변수 값을 전달하고, JavaScript로 조건부 표시를 처리합니다.

```html
<nav class="under-nav"
     data-show-overview="[##_var_showTabOverview_##]"
     data-show-posts="[##_var_showTabPosts_##]"
     data-show-guestbook="[##_var_showTabGuestbook_##]"
     data-show-tags="[##_var_showTabTags_##]">
    <a class="under-nav-item" data-tab="overview" href="[##_blog_link_##]" title="Overview">
        <!-- SVG 아이콘 -->
        Overview
    </a>
    <a class="under-nav-item" data-tab="posts" href="/category" title="Posts">
        <!-- SVG 아이콘 -->
        Posts
    </a>
    <a class="under-nav-item" data-tab="guestbook" href="[##_guestbook_link_##]" title="Guestbook">
        <!-- SVG 아이콘 -->
        Guestbook
    </a>
    <a class="under-nav-item" data-tab="tags" href="[##_taglog_link_##]" title="Tags">
        <!-- SVG 아이콘 -->
        Tags
    </a>
</nav>
```

#### 1-3. JavaScript 처리 로직

```javascript
/* ═══ Tab Visibility from Skin Settings ═══ */
(function() {
    var nav = document.querySelector('.under-nav');
    if (!nav) return;

    var tabs = {
        overview:  nav.dataset.showOverview,
        posts:     nav.dataset.showPosts,
        guestbook: nav.dataset.showGuestbook,
        tags:      nav.dataset.showTags
    };

    Object.keys(tabs).forEach(function(key) {
        if (tabs[key] === 'false') {
            var tab = nav.querySelector('[data-tab="' + key + '"]');
            if (tab) tab.style.display = 'none';
        }
    });
})();
```

---

### Phase 2: 서브메뉴 탭 라벨 커스터마이징

#### 2-1. `index.xml`에 라벨 변수 추가

```xml
<variablegroup name="탭 라벨 커스터마이징">
  <variable>
    <name>labelOverview</name>
    <label><![CDATA[ Overview 탭 이름 ]]></label>
    <description><![CDATA[ Overview 탭에 표시될 이름을 변경합니다. ]]></description>
    <type>STRING</type>
    <option />
    <default>Overview</default>
  </variable>
  <variable>
    <name>labelPosts</name>
    <label><![CDATA[ Posts 탭 이름 ]]></label>
    <type>STRING</type>
    <option />
    <default>Posts</default>
  </variable>
  <variable>
    <name>labelGuestbook</name>
    <label><![CDATA[ Guestbook 탭 이름 ]]></label>
    <type>STRING</type>
    <option />
    <default>Guestbook</default>
  </variable>
  <variable>
    <name>labelTags</name>
    <label><![CDATA[ Tags 탭 이름 ]]></label>
    <type>STRING</type>
    <option />
    <default>Tags</default>
  </variable>
</variablegroup>
```

#### 2-2. `skin.html` 라벨에 치환자 적용

```html
<a class="under-nav-item" data-tab="overview" href="[##_blog_link_##]">
    <!-- SVG 아이콘 -->
    [##_var_labelOverview_##]
</a>
```

---

### Phase 3: 사이드바 모듈 표시 설정

#### 3-1. `index.xml`에 사이드바 관련 변수 추가

```xml
<variablegroup name="사이드바 설정">
  <variable>
    <name>showNotice</name>
    <label><![CDATA[ Notice 표시 ]]></label>
    <description><![CDATA[ 사이드바에 공지사항 영역을 표시합니다. ]]></description>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
  <variable>
    <name>showCategories</name>
    <label><![CDATA[ Categories 표시 ]]></label>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
  <variable>
    <name>showRecentPosts</name>
    <label><![CDATA[ 최근 글/댓글 표시 ]]></label>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
  <variable>
    <name>showArchive</name>
    <label><![CDATA[ Archive 표시 ]]></label>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
  <variable>
    <name>showCalendar</name>
    <label><![CDATA[ Calendar 표시 ]]></label>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
  <variable>
    <name>showInsights</name>
    <label><![CDATA[ Insights(방문자) 표시 ]]></label>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
</variablegroup>
```

#### 3-2. `skin.html` 사이드바 영역 수정

각 사이드바 모듈에 `data-visible` 속성 추가:

```html
<!-- Notice -->
<s_notice>
    <div class="sidebar-module sidebar-card" data-visible="[##_var_showNotice_##]">
        ...
    </div>
</s_notice>

<!-- Categories (s_sidebar_element 내부) -->
<div class="sidebar-module sidebar-card" data-visible="[##_var_showCategories_##]">
    ...
</div>

<!-- Insights -->
<div class="sidebar-module sidebar-card visitor-stats" data-visible="[##_var_showInsights_##]">
    ...
</div>
```

#### 3-3. CSS 기반 숨김 처리 (깜빡임 방지)

JavaScript만으로 처리하면 페이지 로딩 시 잠깐 보였다가 사라지는 FOUC(Flash of Unstyled Content)가 발생할 수 있습니다. CSS로 먼저 숨기고, JS로 후처리하는 패턴을 사용합니다.

```css
/* data-visible="false"인 요소는 즉시 숨김 */
[data-visible="false"] {
    display: none !important;
}
```

---

### Phase 4: 콘텐츠 레이아웃 설정

#### 4-1. `index.xml` 변수 추가

```xml
<variablegroup name="레이아웃">
  <variable>
    <name>pinnedPostCount</name>
    <label><![CDATA[ Pinned Posts 개수 ]]></label>
    <description><![CDATA[ 상단에 고정 표시할 게시글 수 (0~6) ]]></description>
    <type>SELECT</type>
    <option><![CDATA[
      [
        {"name":"0", "label":"표시 안함", "value":"0"},
        {"name":"2", "label":"2개", "value":"2"},
        {"name":"4", "label":"4개", "value":"4"},
        {"name":"6", "label":"6개 (기본)", "value":"6"}
      ]
    ]]></option>
    <default>6</default>
  </variable>
  <variable>
    <name>postListStyle</name>
    <label><![CDATA[ 글 목록 스타일 ]]></label>
    <description><![CDATA[ 글 목록의 표시 스타일을 선택합니다. ]]></description>
    <type>SELECT</type>
    <option><![CDATA[
      [
        {"name":"card", "label":"카드형", "value":"card"},
        {"name":"list", "label":"리스트형", "value":"list"},
        {"name":"compact", "label":"컴팩트", "value":"compact"}
      ]
    ]]></option>
    <default>card</default>
  </variable>
  <variable>
    <name>showThumbnail</name>
    <label><![CDATA[ 썸네일 표시 ]]></label>
    <description><![CDATA[ 글 목록에서 썸네일을 표시합니다. ]]></description>
    <type>BOOL</type>
    <option />
    <default>true</default>
  </variable>
</variablegroup>
```

#### 4-2. `skin.html` 수정

Pinned Posts 개수를 JavaScript에서 참조:

```html
<div class="pinned-section" data-pinned-count="[##_var_pinnedPostCount_##]">
```

```javascript
// Move posts to pinned grid based on setting
var pinnedCount = parseInt(
    document.querySelector('.pinned-section')?.dataset.pinnedCount || '6'
);
var count = Math.min(cards.length, pinnedCount);
```

글 목록 스타일:

```html
<div class="post-list-section" id="postList" data-style="[##_var_postListStyle_##]">
```

```css
/* 리스트형 */
[data-style="list"] .repo-card { /* ... */ }
/* 컴팩트형 */
[data-style="compact"] .repo-card { /* ... */ }
```

---

## 📊 전체 변수 정리

### 최종 `index.xml` 변수 목록

| 그룹 | 변수명 | 타입 | 기본값 | 설명 |
|------|--------|------|--------|------|
| 디자인 | `mainColor` | COLOR | `#3b82f6` | 메인 테마 색상 |
| 디자인 | `headerImage` | IMAGE | (없음) | 헤더 배경 이미지 |
| 상단 탭 메뉴 | `showTabOverview` | BOOL | `true` | Overview 탭 표시 |
| 상단 탭 메뉴 | `showTabPosts` | BOOL | `true` | Posts 탭 표시 |
| 상단 탭 메뉴 | `showTabGuestbook` | BOOL | `true` | Guestbook 탭 표시 |
| 상단 탭 메뉴 | `showTabTags` | BOOL | `true` | Tags 탭 표시 |
| 탭 라벨 | `labelOverview` | STRING | `Overview` | Overview 탭 텍스트 |
| 탭 라벨 | `labelPosts` | STRING | `Posts` | Posts 탭 텍스트 |
| 탭 라벨 | `labelGuestbook` | STRING | `Guestbook` | Guestbook 탭 텍스트 |
| 탭 라벨 | `labelTags` | STRING | `Tags` | Tags 탭 텍스트 |
| 사이드바 설정 | `showSidebar` | BOOL | `true` | 사이드바 전체 표시 |
| 사이드바 설정 | `showNotice` | BOOL | `true` | 공지사항 표시 |
| 사이드바 설정 | `showCategories` | BOOL | `true` | 카테고리 표시 |
| 사이드바 설정 | `showRecentPosts` | BOOL | `true` | 최근 글/댓글 표시 |
| 사이드바 설정 | `showArchive` | BOOL | `true` | Archive 표시 |
| 사이드바 설정 | `showCalendar` | BOOL | `true` | Calendar 표시 |
| 사이드바 설정 | `showInsights` | BOOL | `true` | 방문자 통계 표시 |
| 레이아웃 | `pinnedPostCount` | SELECT | `6` | Pinned Posts 개수 |
| 레이아웃 | `postListStyle` | SELECT | `card` | 글 목록 스타일 |
| 레이아웃 | `showThumbnail` | BOOL | `true` | 썸네일 표시 |

---

## 🔧 구현 순서

### Step 1: `index.xml` 업데이트
- 기존 `showSidebar`를 SELECT에서 BOOL로 변경
- 새 변수 그룹 및 변수 추가
- 각 변수에 적절한 기본값 설정

### Step 2: `skin.html` 수정
- 서브메뉴 탭에 `data-tab`, `data-show-*` 속성 추가
- 탭 라벨에 STRING 치환자 적용
- 사이드바 모듈에 `data-visible` 속성 추가
- Pinned 섹션에 `data-pinned-count` 속성 추가
- 글 목록에 `data-style` 속성 추가

### Step 3: `style.css`에 CSS 규칙 추가
- `[data-visible="false"]` 숨김 규칙
- `[data-style="list"]` / `[data-style="compact"]` 레이아웃 변형
- 썸네일 숨김 처리

### Step 4: JavaScript 로직 업데이트
- 탭 표시/숨김 처리 함수
- Pinned posts 개수 동적 제어
- FOUC 방지를 위한 초기화 순서 조정

### Step 5: 로컬 개발 서버 (`dev-server.mjs`) 호환
- `index.xml`의 변수 기본값을 파싱하여 로컬 프리뷰에 반영
- `engine.mjs`에서 `[##_var_*_##]` 치환자를 기본값으로 치환하는 로직 추가/확인

---

## 🎨 블로그 관리자 화면 시뮬레이션

스킨 설정이 적용되면, 블로그 관리자는 **스킨 편집 > 옵션** 화면에서 다음과 같이 설정할 수 있습니다:

```
┌──────────────────────────────────────┐
│  스킨 옵션                            │
├──────────────────────────────────────┤
│                                      │
│  ▼ 상단 탭 메뉴                       │
│  ☑ Overview 탭 표시                   │
│  ☑ Posts 탭 표시                      │
│  ☐ Guestbook 탭 표시     ← 숨김 처리  │
│  ☑ Tags 탭 표시                       │
│                                      │
│  ▼ 탭 라벨 커스터마이징                 │
│  Overview 탭 이름: [   소개   ]       │
│  Posts 탭 이름:    [   글 목록  ]      │
│  Tags 탭 이름:     [   태그   ]       │
│                                      │
│  ▼ 사이드바 설정                       │
│  ☑ 사이드바 전체 표시                   │
│  ☑ Notice 표시                        │
│  ☑ Categories 표시                    │
│  ☐ Calendar 표시          ← 숨김 처리  │
│  ☑ Insights(방문자) 표시               │
│                                      │
│  ▼ 레이아웃                           │
│  Pinned Posts 개수: [ 4개 ▾ ]         │
│  글 목록 스타일:   [ 카드형 ▾ ]         │
│  ☑ 썸네일 표시                         │
│                                      │
│  ▼ 디자인                             │
│  메인 테마 색상:   [■ #3b82f6]        │
│  헤더 배경 이미지: [ 업로드 ]            │
│                                      │
└──────────────────────────────────────┘
```

---

## ⚡ 기술적 고려사항

1. **FOUC 방지**: CSS `[data-visible="false"] { display:none !important }` 를 `<head>` 영역에 인라인으로 포함
2. **SEO 영향**: `display:none`은 검색엔진이 무시할 수 있으므로, 핵심 네비게이션은 기본 `true` 유지 권장
3. **접근성**: 숨겨진 탭도 스크린 리더에서 접근 가능하도록 `aria-hidden` 속성 병행 사용 고려
4. **index.xml 변경 주의**: `index.xml` 파일 변경 시 기존 설정값이 초기화될 수 있으므로, 한번에 모든 변수를 정의한 후 배포하는 것이 좋음
5. **로컬 개발 호환**: `dev-server.mjs`에서 `index.xml` 파싱 → 변수 기본값 자동 적용 로직 필요
