/* Tistory Skin - script.js */
document.addEventListener('DOMContentLoaded', () => {
    console.log('Tistory Skin Loaded');

    // 관리자 드롭다운: 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('adminDropdown');
        if (dropdown && !dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
        }
    });

    // ═══════════════════════════════════════════════════════
    // URL 이중 슬래시 수정 (//category, //tag 등)
    // Tistory 치환자가 trailing slash 포함 URL을 생성할 수 있으므로
    // 클라이언트 측에서 모든 링크의 이중 슬래시를 정리합니다
    // ═══════════════════════════════════════════════════════
    document.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (href && href.includes('://')) {
            // 프로토콜의 :// 는 유지하고, 경로 부분의 // 만 / 로 치환
            const fixed = href.replace(/(https?:\/\/[^/]+)\/{2,}/g, '$1/');
            if (fixed !== href) {
                a.setAttribute('href', fixed);
            }
        }
    });

    // ═══════════════════════════════════════════════════════
    // 커스텀 메뉴 렌더링 (스킨 설정에서 추가한 메뉴)
    // ═══════════════════════════════════════════════════════
    const menuData = document.getElementById('customMenuData');
    const menuSlot = document.getElementById('customMenuSlot');
    if (menuData && menuSlot) {
        const linkSvg = '<svg viewBox="0 0 16 16"><path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-.8 9.45a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25Z"></path></svg>';
        for (let i = 1; i <= 5; i++) {
            const label = (menuData.dataset['m' + i + 'Label'] || '').trim();
            const url = (menuData.dataset['m' + i + 'Url'] || '').trim();
            if (label && url) {
                const a = document.createElement('a');
                a.className = 'under-nav-item';
                a.setAttribute('data-tab', 'custom' + i);
                a.href = url;
                a.title = label;
                // 외부 링크면 새 탭에서 열기
                if (url.startsWith('http') && !url.includes(window.location.hostname)) {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                }
                a.innerHTML = linkSvg + ' ' + label;
                menuSlot.appendChild(a);
            }
        }
    }

    // ═══════════════════════════════════════════════════════
    // 프로필 설정 초기화
    // 빈 값 → 기본값 fallback + 빈 항목 숨김
    // ═══════════════════════════════════════════════════════

    // 프로필 서브 이름: 비어있으면 블로그 제목으로 대체
    const profileUsername = document.querySelector('.profile-username');
    if (profileUsername) {
        const text = profileUsername.textContent.trim();
        if (!text) {
            profileUsername.textContent = profileUsername.dataset.default || '';
        }
    }

    // Follow 버튼: data-visible="false"이면 숨김
    const followBtn = document.getElementById('followBtn');
    if (followBtn && followBtn.dataset.visible === 'false') {
        followBtn.style.display = 'none';
    }

    // 위치: 빈 값이면 숨김
    const locationItem = document.querySelector('[data-field="location"]');
    if (locationItem) {
        const val = (locationItem.dataset.value || '').trim();
        if (!val) {
            locationItem.style.display = 'none';
        }
    }

    // 블로그 링크: 커스텀 텍스트/URL이 비어있으면 기본 블로그 주소로 대체
    const linkItem = document.querySelector('[data-field="link"] a');
    if (linkItem) {
        const customText = (linkItem.dataset.customText || '').trim();
        const defaultText = linkItem.dataset.defaultText || '';
        const defaultHref = linkItem.dataset.defaultHref || '';

        if (!customText) {
            linkItem.textContent = defaultText;
        }
        const href = (linkItem.getAttribute('href') || '').trim();
        if (!href) {
            linkItem.setAttribute('href', defaultHref);
        }
    }

    // SNS 링크: label이 비어있으면 숨김
    document.querySelectorAll('.profile-social').forEach((item) => {
        const label = (item.dataset.label || '').trim();
        if (!label) {
            item.style.display = 'none';
        }
    });

    // ═══════════════════════════════════════════════════════
    // 카테고리 색상 시스템
    // 카테고리 이름을 해시하여 고정 색상을 부여
    // 이름이 바뀌지 않는 한 항상 동일한 색상이 적용됨
    // ═══════════════════════════════════════════════════════

    // 가독성 좋은 GitHub 언어 색상 팔레트 (16색)
    const catColors = [
        '#3572A5', '#e34c26', '#f1e05a', '#563d7c', '#2b7489',
        '#b07219', '#4F5D95', '#00ADD8', '#DA5B0B', '#178600',
        '#89e051', '#438eff', '#A97BFF', '#e44b23', '#f34b7d', '#00B4AB'
    ];

    // 문자열 → 고정 색상 인덱스 (해시 기반, 이름이 같으면 항상 같은 색)
    function hashColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash; // 32bit 정수로 변환
        }
        return catColors[Math.abs(hash) % catColors.length];
    }

    // 카테고리 이름에서 글 수 등 숫자 제거: "이론공부 (64)" → "이론공부"
    function cleanCatName(text) {
        return text.replace(/\(\d+\)/g, '').replace(/\s+/g, ' ').trim();
    }

    const catColorMap = {};
    const categoryList = document.querySelector('.category-list');

    if (categoryList) {
        // Tistory 실제 구조: .tt_category > li(전체글) > .category_list > li(실제 카테고리)
        // 부모 카테고리 찾기 (전체글 제외)
        const parentItems = categoryList.querySelectorAll('.category_list > li, ul.tt_category > li > ul > li');

        parentItems.forEach((li) => {
            const link = li.querySelector(':scope > a');
            if (!link) return;

            const name = cleanCatName(link.textContent);
            if (!name || name === '전체글') return;

            const color = hashColor(name);
            catColorMap[name] = color;

            // 기존 dot 제거 후 새로 추가
            const oldDot = link.querySelector('.cat-dot');
            if (oldDot) oldDot.remove();

            const dot = document.createElement('span');
            dot.className = 'cat-dot';
            dot.style.background = color;
            link.insertBefore(dot, link.firstChild);

            li.classList.add('cat-parent');

            // 글 수 정렬
            const countEl = link.querySelector('.c_cnt');
            if (countEl) countEl.style.marginLeft = 'auto';

            // 서브카테고리: 부모 색상 상속
            const subLinks = li.querySelectorAll('.sub_category_list a, ul a');
            subLinks.forEach((sub) => {
                const subName = cleanCatName(sub.textContent);
                catColorMap[subName] = color;
                catColorMap[name + '/' + subName] = color;
            });
        });

        // "전체글" 항목에도 dot 처리 (회색)
        const allLink = categoryList.querySelector('.tt_category > li > a.link_tit');
        if (allLink) {
            const oldDot = allLink.querySelector('.cat-dot');
            if (oldDot) oldDot.remove();

            const dot = document.createElement('span');
            dot.className = 'cat-dot';
            dot.style.background = 'var(--color-fg-muted, #8b949e)';
            allLink.insertBefore(dot, allLink.firstChild);
        }
    }

    // ═══════════════════════════════════════════════════════
    // 포스트 카드 카테고리 라벨에 색상 dot 적용
    // "카테고리 없음" 처리 포함
    // ═══════════════════════════════════════════════════════

    // 포스트 카드 (.repo-card, .article-card)의 카테고리 라벨
    document.querySelectorAll('.meta-cat, .repo-tag, .pinned-repo-tag').forEach((el) => {
        const text = cleanCatName(el.textContent);

        // 빈 카테고리는 숨김
        if (!text || text === '카테고리 없음') {
            el.style.display = 'none';
            return;
        }

        // "부모/자식" 형태에서 부모 이름으로도 색상 찾기
        const parts = text.split('/');
        const color = catColorMap[text] || catColorMap[parts[0]] || hashColor(parts[0]);

        // dot이 없으면 추가
        let dot = el.querySelector('.cat-dot, .lang-dot');
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'cat-dot';
            dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle;flex-shrink:0;';
            el.insertBefore(dot, el.firstChild);
        }
        dot.style.background = color;
    });

    // 팝포 하단 meta 항목에도 적용
    document.querySelectorAll('.pinned-repo-meta-item, .repo-meta-item').forEach((item) => {
        const dot = item.querySelector('.lang-dot, .cat-dot');
        const text = cleanCatName(item.textContent);
        if (dot && text) {
            const parts = text.split('/');
            const color = catColorMap[text] || catColorMap[parts[0]] || hashColor(parts[0]);
            dot.style.background = color;
        }
    });
});
