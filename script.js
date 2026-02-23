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
    // 카테고리 색상 도트 자동 적용
    // 로컬 프리뷰와 실제 Tistory 양쪽에서 동작
    // ═══════════════════════════════════════════════════════
    const catColors = [
        '#3572A5', '#e34c26', '#f1e05a', '#563d7c', '#2b7489',
        '#b07219', '#4F5D95', '#00ADD8', '#DA5B0B', '#178600',
        '#89e051', '#438eff', '#A97BFF', '#e44b23', '#f34b7d', '#00B4AB'
    ];

    const categoryList = document.querySelector('.category-list');
    if (categoryList) {
        // 최상위 카테고리 li 요소들 찾기
        const topItems = categoryList.querySelectorAll(':scope > ul > li');
        let colorIdx = 0;
        topItems.forEach((li) => {
            const link = li.querySelector(':scope > a');
            if (!link) return;

            // 이미 cat-dot이 있으면 스킵 (로컬 엔진이 이미 추가한 경우)
            if (link.querySelector('.cat-dot')) return;

            const color = catColors[colorIdx % catColors.length];
            colorIdx++;

            // 색상 도트 추가
            const dot = document.createElement('span');
            dot.className = 'cat-dot';
            dot.style.background = color;
            link.insertBefore(dot, link.firstChild);

            // 하위 카테고리에 같은 색상의 도트 비표시 (서브는 들여쓰기만)
            li.classList.add('cat-parent');

            // 글 수 배지 스타일 적용
            const countEl = link.querySelector('.c_cnt');
            if (countEl) {
                countEl.style.marginLeft = 'auto';
            }
        });
    }

    // ═══════════════════════════════════════════════════════
    // 포스트 목록 카테고리 태그에 색상 적용
    // .meta-cat, .repo-tag 등의 카테고리 라벨에 색상 적용
    // ═══════════════════════════════════════════════════════
    const catColorMap = {};
    if (categoryList) {
        let idx = 0;
        const topItems = categoryList.querySelectorAll(':scope > ul > li');
        topItems.forEach((li) => {
            const link = li.querySelector(':scope > a');
            if (!link) return;
            const name = link.textContent.replace(/\d+/g, '').trim();
            catColorMap[name] = catColors[idx % catColors.length];
            idx++;

            // 서브카테고리도 매핑
            const subLinks = li.querySelectorAll('ul a');
            subLinks.forEach((sub) => {
                const subName = sub.textContent.replace(/\d+/g, '').trim();
                catColorMap[subName] = catColorMap[name];
                // "부모/자식" 형태도 매핑
                catColorMap[name + '/' + subName] = catColorMap[name];
            });
        });
    }

    // 포스트 카드의 카테고리 라벨에 색상 dot 추가
    document.querySelectorAll('.pinned-repo-meta-item, .repo-meta-item').forEach((item) => {
        const dot = item.querySelector('.lang-dot, .cat-dot');
        const text = item.textContent.trim();
        if (dot && catColorMap[text]) {
            dot.style.background = catColorMap[text];
        }
    });
});
