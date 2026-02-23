import axios from 'axios';
import { parseStringPromise } from 'xml2js';

/**
 * Tistory URL 또는 아이디에서 블로그 베이스 URL을 추출합니다.
 * - https://keinn51.tistory.com/  → https://keinn51.tistory.com
 * - https://seoarenakr.com/       → https://seoarenakr.com
 * - keinn51                       → https://keinn51.tistory.com
 * 반환값: trailing slash 없는 베이스 URL
 */
export function extractBlogId(urlOrId) {
    if (!urlOrId || urlOrId === 'notice') return 'https://notice.tistory.com';
    // 이미 URL인 경우 → trailing slash 제거 후 반환
    if (/^https?:\/\//i.test(urlOrId)) {
        return urlOrId.replace(/\/+$/, '');
    }
    // 단순 아이디인 경우 → tistory.com 형태로 변환
    return `https://${urlOrId}.tistory.com`;
}

/**
 * RSS item의 description(HTML)에서 첫 번째 img src를 추출합니다.
 */
function extractFirstImage(item) {
    if (!item || !item.description || !item.description[0]) return '';
    const imgMatch = item.description[0].match(/<img[^>]+src=["']([^"']+)["']/i);
    return imgMatch ? imgMatch[1] : '';
}

/**
 * RSS 전체에서 카테고리를 수집하고, 빈도에 따라 cloud1~cloud5를 배정합니다.
 * 스크래핑에서 태그를 못 가져왔을 때 fallback으로 사용합니다.
 */
function collectCategories(items) {
    const catCount = new Map();
    items.forEach(item => {
        if (item.category) {
            item.category.forEach(c => {
                c.split('/').forEach(part => {
                    const name = part.trim();
                    if (name) catCount.set(name, (catCount.get(name) || 0) + 1);
                });
            });
        }
    });
    if (catCount.size === 0) return [];

    const maxCount = Math.max(...catCount.values());
    return Array.from(catCount.entries()).map(([name, count]) => {
        const ratio = count / maxCount;
        let level;
        if (ratio > 0.8) level = 'cloud1';
        else if (ratio > 0.6) level = 'cloud2';
        else if (ratio > 0.4) level = 'cloud3';
        else if (ratio > 0.2) level = 'cloud4';
        else level = 'cloud5';
        return { name, count, cloudClass: level };
    });
}

/**
 * 실제 블로그 HTML을 파싱하여 RSS에 없는 데이터를 수집합니다.
 * - 방문자 수 (today, yesterday, total)
 * - 실제 태그 목록 (cloud 레벨 포함)
 * - 공지사항 제목/링크
 * - 최근 댓글 (작성자, 내용, 날짜, 링크)
 * - T.config (블로그 설정 정보)
 */
async function scrapeBlogData(blogUrl) {
    const data = {
        visitor: { today: '0', yesterday: '0', total: '0' },
        tags: [],       // { name, link, cloudClass }
        notices: [],    // { title, link }
        recentComments: [], // { name, desc, date, link }
        categories: [],  // { name, link, count, children: [{ name, link, count }] }
        config: null,   // T.config object
        blogApi: null,  // /m/api/blog/info JSON response
        tistoryHead: '', // Tistory가 주입하는 <head> 콘텐츠 (공통 CSS/JS/OG 메타 등)
        blogMenu: '',    // 실제 블로그의 상단 메뉴 HTML
    };

    // ── /m/api/blog/info JSON API (가장 안정적인 구조화된 데이터) ──
    try {
        const apiRes = await axios.get(`${blogUrl}/m/api/blog/info`, { timeout: 5000 });
        if (apiRes.data && apiRes.data.data) {
            data.blogApi = apiRes.data.data;
            // API에서 공지사항 추출
            if (data.blogApi.notice && data.blogApi.notice.title) {
                data.notices.push({
                    title: data.blogApi.notice.title,
                    link: `${blogUrl}${data.blogApi.notice.link || '/notice'}`,
                });
            }
        }
    } catch (apiErr) {
        // API 실패시 무시 — HTML 스크래핑으로 fallback
    }

    try {
        const res = await axios.get(blogUrl, { timeout: 10000 });
        const html = res.data;

        // ── Tistory 공통 <head> 콘텐츠 추출 ──
        // 실제 블로그 페이지의 <head>에서 Tistory 플랫폼이 주입하는
        // 공통 리소스(jQuery, 공통 CSS/JS, OG 메타, 플러그인 등)를 추출합니다.
        // 스킨 자체의 style.css/script.js는 제외 (로컬에서 별도 서빙)
        const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
        if (headMatch) {
            const headContent = headMatch[1];
            const headLines = [];

            // window.T.config + window.TistoryBlog + window.appInfo 스크립트 블록
            const tConfigBlock = headContent.match(/<script[^>]*>[\s\S]*?window\.T\.config\s*=[\s\S]*?<\/script>/i);
            if (tConfigBlock) headLines.push(tConfigBlock[0]);

            // jQuery (t1.daumcdn.net)
            const jqueryMatch = headContent.match(/<script[^>]*src="[^"]*jquery[^"]*"[^>]*>[\s\S]*?<\/script>/i);
            if (jqueryMatch) headLines.push(jqueryMatch[0]);

            // tjQuery 설정 (noConflict)
            const tjQueryBlock = headContent.match(/<script[^>]*>[\s\S]*?tjQuery[\s\S]*?<\/script>/i);
            if (tjQueryBlock && !tjQueryBlock[0].includes('window.T.config')) {
                headLines.push(tjQueryBlock[0]);
            }

            // Tistory 공통 CSS 파일들 (content.css, index.css, tistory.css 등)
            const cssLinks = [...headContent.matchAll(/<link[^>]*href="([^"]*(?:daumcdn|tistory)[^"]*\.css(?:\?[^"]*)?)"[^>]*\/?>/gi)];
            for (const m of cssLinks) {
                // 스킨 자체 style.css는 제외 (로컬에서 별도 서빙 중)
                if (m[1].includes('/skin/style.css')) continue;
                headLines.push(m[0]);
            }

            // Tistory 공통 JS 파일들 (base.js, common.js, tiara 등)
            const jsScripts = [...headContent.matchAll(/<script[^>]*src="([^"]*(?:daumcdn|tistory_admin|kakao)[^"]*\.js(?:\?[^"]*)?)"[^>]*>[\s\S]*?<\/script>/gi)];
            for (const m of jsScripts) {
                // 스킨 자체 script.js와 스킨별 vendor/app.js는 제외
                if (m[1].includes('/skin/images/') || m[1].includes('/skin/script')) continue;
                if (m[1].includes('jquery')) continue; // 이미 위에서 추가
                headLines.push(m[0]);
            }

            // Tistory 모듈 JS (index.js, index-legacy.js 등)
            const moduleScripts = [...headContent.matchAll(/<script[^>]*(?:type="module"|nomodule)[^>]*src="([^"]*(?:daumcdn|tistory)[^"]*\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi)];
            for (const m of moduleScripts) {
                headLines.push(m[0]);
            }

            // OG 메타 태그
            const ogMetas = [...headContent.matchAll(/<meta\s+(?:property|name)="(?:og|twitter):[^"]*"[^>]*\/?>/gi)];
            for (const m of ogMetas) {
                headLines.push(m[0]);
            }

            // Tistory 플러그인 CSS/JS (BusinessLicenseInfo, TistoryProfileLayer 등)
            const pluginBlocks = [...headContent.matchAll(/<!-- (\w+) - START -->[\s\S]*?<!-- \1 - END -->/gi)];
            for (const m of pluginBlocks) {
                headLines.push(m[0]);
            }

            // Favicon
            const faviconLinks = [...headContent.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*\/?>/gi)];
            for (const m of faviconLinks) {
                headLines.push(m[0]);
            }

            // Google AdSense 메타
            const adsenseMeta = [...headContent.matchAll(/<meta[^>]*name="google-adsense[^"]*"[^>]*\/?>/gi)];
            for (const m of adsenseMeta) {
                headLines.push(m[0]);
            }

            // Structured Data (JSON-LD)
            const structuredData = headContent.match(/<!-- BEGIN STRUCTURED_DATA -->[\s\S]*?<!-- END STRUCTURED_DATA -->/i);
            if (structuredData) headLines.push(structuredData[0]);

            // another_category 스타일 (글 하단 "같은 카테고리의 다른 글" 스타일)
            const anotherCatStyle = headContent.match(/<style[^>]*>[\s\S]*?\.another_category[\s\S]*?<\/style>/i);
            if (anotherCatStyle) headLines.push(anotherCatStyle[0]);

            // canonical 링크
            const canonicalLink = headContent.match(/<link[^>]*rel="canonical"[^>]*\/?>/i);
            if (canonicalLink) headLines.push(canonicalLink[0]);

            data.tistoryHead = headLines.join('\n');
        }

        // ── 블로그 메뉴 스크래핑 ──
        // 실제 블로그의 nav-links 영역에서 메뉴 링크를 추출
        const navMatch = html.match(/<nav[^>]*class="[^"]*nav-links[^"]*"[^>]*>([\s\S]*?)<\/nav>/i);
        if (navMatch) {
            // nav-links 내에서 <a> 태그만 추출 (관리자 드롭다운, 테마 토글 등 제외)
            const menuALinks = [...navMatch[1].matchAll(/<a\s[^>]*href="[^"]*"[^>]*>[^<]*<\/a>/gi)];
            if (menuALinks.length > 0) {
                data.blogMenu = menuALinks.map(m => m[0]).join(' ');
            }
        }

        // ── 방문자 수 파싱 ──
        // 다양한 티스토리 스킨 구조를 지원하는 다중 패턴 매칭

        // 패턴 A: hELLO 스킨 — <div class="today"><div class="cnt">N</div></div>
        const helloCounterBlock = html.match(/<div[^>]*id="counter"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/i);
        if (helloCounterBlock) {
            const block = helloCounterBlock[0];
            const totalM = block.match(/<div[^>]*class="[^"]*total[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*cnt[^"]*"[^>]*>([\d,]+)/i);
            const todayM = block.match(/<div[^>]*class="[^"]*today[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*cnt[^"]*"[^>]*>([\d,]+)/i);
            const yesterdayM = block.match(/<div[^>]*class="[^"]*yesterday[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*cnt[^"]*"[^>]*>([\d,]+)/i);
            if (totalM) data.visitor.total = totalM[1];
            if (todayM) data.visitor.today = todayM[1];
            if (yesterdayM) data.visitor.yesterday = yesterdayM[1];
        }

        // 패턴 B: 구형 스킨 — <span class="ff-h today visitor-date">N</span>
        if (data.visitor.total === '0') {
            const visitorBlock = html.match(/<div[^>]*class="[^"]*visitor[^"]*"[\s\S]{0,3000}?<\/div>\s*<\/div>\s*<\/div>/);
            if (visitorBlock) {
                const block = visitorBlock[0];
                const todayM = block.match(/class="[^"]*today[^"]*"[^>]*>([\d,]+)/i);
                const yesterdayM = block.match(/class="[^"]*yesterday[^"]*"[^>]*>([\d,]+)/i);
                const totalM = block.match(/class="[^"]*total[^"]*"[^>]*>([\d,]+)/i);
                if (todayM) data.visitor.today = todayM[1];
                if (yesterdayM) data.visitor.yesterday = yesterdayM[1];
                if (totalM) data.visitor.total = totalM[1];
            }
        }

        // 패턴 C: 개별 class 직접 매칭 (fallback)
        if (data.visitor.total === '0') {
            const patterns = [
                [/class="[^"]*(?:count[-_]?today|today[-_]?count)[^"]*"[^>]*>([\d,]+)/i, 'today'],
                [/class="[^"]*(?:count[-_]?yesterday|yesterday[-_]?count)[^"]*"[^>]*>([\d,]+)/i, 'yesterday'],
                [/class="[^"]*(?:count[-_]?total|total[-_]?count)[^"]*"[^>]*>([\d,]+)/i, 'total'],
            ];
            for (const [pattern, key] of patterns) {
                const m = html.match(pattern);
                if (m) data.visitor[key] = m[1];
            }
        }

        // 패턴 D: window.T 또는 T.config에서 방문자수 추출
        if (data.visitor.total === '0') {
            const tConfigMatch = html.match(/window\.T\s*=\s*(\{[\s\S]*?\});/);
            if (tConfigMatch) {
                try {
                    const todayM = tConfigMatch[1].match(/"today"\s*:\s*(\d+)/);
                    const yesterdayM = tConfigMatch[1].match(/"yesterday"\s*:\s*(\d+)/);
                    const totalM = tConfigMatch[1].match(/"total"\s*:\s*(\d+)/);
                    if (todayM) data.visitor.today = todayM[1];
                    if (yesterdayM) data.visitor.yesterday = yesterdayM[1];
                    if (totalM) data.visitor.total = totalM[1];
                } catch (e) { /* silent */ }
            }
        }

        // 패턴 E: 텍스트 기반 — <p>Today : 168</p> (jojoldu 스킨 등)
        if (data.visitor.total === '0') {
            const todayTextM = html.match(/>Today\s*[:：]\s*([\d,]+)/i);
            const yesterdayTextM = html.match(/>Yesterday\s*[:：]\s*([\d,]+)/i);
            const totalClassM = html.match(/<p[^>]*class="[^"]*total[^"]*"[^>]*>([\d,]+)/i);
            if (todayTextM) data.visitor.today = todayTextM[1];
            if (yesterdayTextM) data.visitor.yesterday = yesterdayTextM[1];
            if (totalClassM) data.visitor.total = totalClassM[1];
        }

        // 패턴 F: 최종 fallback — 한글 텍스트 기반 (오늘/어제/전체)
        if (data.visitor.total === '0') {
            const todayKrM = html.match(/>오늘\s*[:：]?\s*<[^>]*>([\d,]+)/i);
            const yesterdayKrM = html.match(/>어제\s*[:：]?\s*<[^>]*>([\d,]+)/i);
            const totalKrM = html.match(/>전체\s*[:：]?\s*<[^>]*>([\d,]+)/i);
            if (todayKrM) data.visitor.today = todayKrM[1];
            if (yesterdayKrM) data.visitor.yesterday = yesterdayKrM[1];
            if (totalKrM) data.visitor.total = totalKrM[1];
        }

        // ── 태그 파싱 ──
        // 속성 순서와 무관하게 href에 /tag/가 포함된 <a> 태그 매칭
        const tagMatches = [...html.matchAll(/<a\s[^>]*?href="[^"]*\/tag\/([^"]+)"[^>]*>([^<]+)<\/a>/g)];
        const seenTags = new Set();
        for (const m of tagMatches) {
            const name = decodeURIComponent(m[1]).replace(/\+/g, ' ');
            if (seenTags.has(name)) continue;
            seenTags.add(name);
            // cloud 레벨은 class 속성에서 추출 (있으면)
            const fullTag = m[0];
            const cloudMatch = fullTag.match(/class="[^"]*cloud(\d)[^"]*"/);
            data.tags.push({
                name,
                link: `${blogUrl}/tag/${m[1]}`,
                cloudClass: cloudMatch ? `cloud${cloudMatch[1]}` : 'cloud3',
            });
        }

        // ── 공지사항 파싱 ──
        const noticeMatches = [...html.matchAll(/<a\s[^>]*?href="([^"]*\/notice\/\d+)"[^>]*>([^<]+)<\/a>/g)];
        const seenNotices = new Set();
        for (const m of noticeMatches) {
            const title = m[2].trim();
            if (seenNotices.has(title)) continue;
            seenNotices.add(title);
            const link = m[1].startsWith('/') ? `${blogUrl}${m[1]}` : m[1];
            data.notices.push({ title, link });
        }

        // ── 최근 댓글 파싱 ──
        // 속성 순서 무관: href에 #comment가 있는 <a> 태그
        const commentMatches = [...html.matchAll(/<a\s[^>]*?href="([^"]*#comment\d+)"[^>]*>([^<]+)<\/a>/g)];
        const seenCommentLinks = new Set();
        for (const m of commentMatches) {
            const rawLink = m[1];
            if (seenCommentLinks.has(rawLink)) continue;
            seenCommentLinks.add(rawLink);
            const link = rawLink.startsWith('/') ? `${blogUrl}${rawLink}` : rawLink;
            data.recentComments.push({
                name: '',
                desc: m[2].trim(),
                date: '',
                link,
            });
        }
        // 작성자·날짜 파싱: 여러 스킨 패턴 지원
        // 패턴1: "작성자·날짜" (hELLO 스킨 등)
        const authorDateP1 = [...html.matchAll(/([^\s·<>]{2,})·([\d.]+)/g)];
        // 패턴2: <span class="name">이름</span>
        const authorP2 = [...html.matchAll(/<(?:span|a)[^>]*class="[^"]*(?:name|nickname|writer|author)[^"]*"[^>]*>([^<]+)<\/(?:span|a)>/g)];
        const dateP2 = [...html.matchAll(/<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/g)];

        // hELLO 스킨 등에서는 댓글 블록 안의 author·date를 추출
        let authorDateIdx = 0;
        for (let i = 0; i < data.recentComments.length; i++) {
            // 패턴2 우선
            if (i < authorP2.length) {
                data.recentComments[i].name = authorP2[i][1].trim();
            }
            if (i < dateP2.length) {
                data.recentComments[i].date = dateP2[i][1].trim();
            }
        }

        // ── T.config 파싱 ──
        const configMatch = html.match(/window\.T\.config\s*=\s*(\{[^;]+\})/);
        if (configMatch) {
            try {
                data.config = JSON.parse(configMatch[1]);
            } catch (e) {
                // JSON 파싱 실패 시 무시
            }
        }

        // ── 카테고리 파싱 (실제 블로그 HTML에서 전체 계층구조 추출) ──
        // 패턴 A: 구형 스킨 — link_item / link_sub_item class 기반
        // 전체 HTML에서 link_item(상위)과 link_sub_item(하위)을 순서대로 추출
        const allCatLinks = [...html.matchAll(/<a[^>]*href="([^"]*\/category\/[^"]*)"[^>]*class="[^"]*(link_item|link_sub_item)[^"]*"[^>]*>\s*([^<]+?)\s*(?:<span[^>]*class="[^"]*c_cnt[^"]*"[^>]*>\((\d+)\)<\/span>)?\s*<\/a>/gi)];
        if (allCatLinks.length > 0) {
            let currentParent = null;
            const seenParents = new Set();
            for (const m of allCatLinks) {
                const href = m[1].startsWith('/') ? `${blogUrl}${m[1]}` : m[1];
                const type = m[2].toLowerCase();
                const name = m[3].trim();
                const count = m[4] ? parseInt(m[4]) : 0;
                if (type === 'link_item') {
                    // 중복 감지 — HTML에 같은 카테고리 목록이 여러 번 있을 수 있음 (PC/모바일 등)
                    if (seenParents.has(name)) break;  // 두 번째 반복 시작 → 중단
                    seenParents.add(name);
                    currentParent = { name, link: href, count, children: [] };
                    data.categories.push(currentParent);
                } else if (type === 'link_sub_item' && currentParent) {
                    currentParent.children.push({ name, link: href, count });
                }
            }
        }

        // 패턴 B: hELLO 스킨 — <a href="/category/Name"> 형태 (class 없음)
        if (data.categories.length === 0) {
            const helloLinks = [...html.matchAll(/<a[^>]*href="(\/category\/([^"]+))"[^>]*>([^<]+)<\/a>/g)];
            const seenCats = new Set();
            for (const m of helloLinks) {
                const href = m[1];
                const encodedPath = m[2];
                const name = m[3].trim();
                if (seenCats.has(href)) continue;
                seenCats.add(href);
                const parts = decodeURIComponent(encodedPath).split('/');
                if (parts.length === 1) {
                    // 상위 카테고리
                    const existing = data.categories.find(c => c.name === name);
                    if (!existing) {
                        data.categories.push({
                            name,
                            link: `${blogUrl}${href}`,
                            count: 0,
                            children: [],
                        });
                    }
                } else {
                    // 서브카테고리
                    const parentName = parts[0];
                    let parent = data.categories.find(c => c.name === parentName);
                    if (!parent) {
                        parent = { name: parentName, link: `${blogUrl}/category/${encodeURIComponent(parentName)}`, count: 0, children: [] };
                        data.categories.push(parent);
                    }
                    const childName = parts.slice(1).join('/');
                    if (!parent.children.find(c => c.name === childName)) {
                        parent.children.push({
                            name: childName,
                            link: `${blogUrl}${href}`,
                            count: 0,
                        });
                    }
                }
            }
        }

    } catch (err) {
        console.warn(`Blog scrape warning (${blogUrl}):`, err.message);
    }

    return data;
}

/**
 * 전용 엔진: 스킨의 치환자를 실제 블로그 데이터로 변환합니다.
 * 데이터 소스: RSS + 블로그 HTML 직접 파싱 (병합)
 * @param {string} html - skin.html 원본
 * @param {string} blogUrl - 블로그 URL
 * @param {string} pageType - 페이지 타입: 'index' | 'guestbook' | 'tag' | 'post' | 'category'
 *   Tistory는 페이지 타입에 따라 <s_guest>, <s_tag> 등의 블록을 선택적으로 렌더링합니다.
 * @param {string} [entryId] - 글 상세 보기 시 글 ID (예: '57' 또는 'entry-slug')
 */
export async function hydrate(html, blogUrl, pageType = 'index', entryId = null) {
    try {
        // blogUrl은 이미 전체 URL (extractBlogId가 반환한 형태)
        // RSS와 블로그 HTML을 동시에 가져옴
        const [rssResponse, scraped] = await Promise.all([
            axios.get(`${blogUrl}/rss`),
            scrapeBlogData(blogUrl),
        ]);

        const rssData = await parseStringPromise(rssResponse.data);
        const channel = rssData.rss.channel[0];
        const items = channel.item || [];

        let output = html;

        // ═══════════════════════════════════════════════════════
        // Tistory 페이지 타입별 조건부 블록 처리
        // Tistory는 해당 페이지에서만 블록을 렌더링, 나머지는 제거
        // ═══════════════════════════════════════════════════════
        const bodyIdMap = {
            'index': 'tt-body-index',
            'post': 'tt-body-page',
            'guestbook': 'tt-body-guestbook',
            'tag': 'tt-body-tag',
            'category': 'tt-body-category',
            'search': 'tt-body-search',
        };

        if (pageType !== 'index' && pageType !== 'post' && pageType !== 'category') {
            // guestbook/tag 페이지에서는 글 목록/본문/댓글 숨김
            output = output.replace(/<s_list>[\s\S]*?<\/s_list>/g, '');
            output = output.replace(/<s_article_rep>[\s\S]*?<\/s_article_rep>/g, '');
            output = output.replace(/<s_rp>[\s\S]*?<\/s_rp>/g, '');
            output = output.replace(/<s_article_protected>[\s\S]*?<\/s_article_protected>/g, '');
        }
        if (pageType !== 'guestbook') {
            // 방명록 페이지가 아니면 방명록 블록 제거
            output = output.replace(/<s_guest>[\s\S]*?<\/s_guest>/g, '');
        }
        if (pageType !== 'tag') {
            // 태그 페이지가 아니면 태그 클라우드 블록 제거
            output = output.replace(/<s_tag>[\s\S]*?<\/s_tag>/g, '');
        }

        const api = scraped.blogApi; // /m/api/blog/info 데이터
        const rssBlogTitle = channel.title[0];
        const rssBlogDesc = channel.description[0];
        const rssBlogImage = channel.image && channel.image[0] && channel.image[0].url
            ? channel.image[0].url[0]
            : `${blogUrl}/favicon.ico`;

        // ═══════════════════════════════════════════════════════
        // 기본 정보: API(최우선) → T.config → RSS(fallback)
        // ═══════════════════════════════════════════════════════

        const blogTitle = api?.blogTitle || rssBlogTitle;
        const blogDesc = api?.blogDescription || rssBlogDesc;
        const blogImage = api?.blogLogoURL || rssBlogImage;
        const bloggerName = api?.blogName || scraped.config?.BLOG?.nickName || blogTitle;

        // ═══════════════════════════════════════════════════════
        // [##_tistory_head_##] — 실제 Tistory 공통 리소스 주입
        // jQuery, 공통 CSS/JS, OG 메타, 플러그인 등
        // ═══════════════════════════════════════════════════════
        if (scraped.tistoryHead) {
            output = output.replace(/\[##_tistory_head_##\]/g, scraped.tistoryHead);
        } else {
            // fallback: 최소한의 Tistory 공통 리소스 직접 주입
            const blogId = blogUrl.replace(/https?:\/\/([^.]+)\..*/, '$1');
            const tConfig = JSON.stringify({
                TOP_SSL_URL: 'https://www.tistory.com',
                PREVIEW: true,
                ROLE: 'guest',
                PREV_PAGE: '',
                NEXT_PAGE: '',
                BLOG: { name: blogId, title: blogTitle, isDormancy: false, nickName: bloggerName },
                IS_LOGIN: false,
                HAS_BLOG: false,
            });
            const tBlog = JSON.stringify({
                basePath: '',
                url: blogUrl,
                tistoryUrl: blogUrl,
                manageUrl: blogUrl + '/manage',
            });
            const fallbackHead = [
                '<script>if(!window.T){window.T={}}',
                'window.T.config=' + tConfig + ';',
                'window.TistoryBlog=' + tBlog + ';',
                '</script>',
                '<script src="//t1.daumcdn.net/tistory_admin/lib/jquery/jquery-3.5.1.min.js"></script>',
                '<link rel="stylesheet" href="https://tistory1.daumcdn.net/tistory_admin/userblog/userblog-cc5df8d167f071ef0aa6b0df09772f80c0161cd0/static/style/content.css"/>',
                '<link rel="stylesheet" href="https://tistory1.daumcdn.net/tistory_admin/userblog/userblog-cc5df8d167f071ef0aa6b0df09772f80c0161cd0/static/style/tistory.css"/>',
            ].join('\n');
            output = output.replace(/\[##_tistory_head_##\]/g, fallbackHead);
        }

        const mappings = {
            '\\[##_title_##\\]': blogTitle,
            '\\[##_desc_##\\]': blogDesc,
            '\\[##_blog_link_##\\]': blogUrl,
            '\\[##_blogger_##\\]': bloggerName,
            '\\[##_body_id_##\\]': bodyIdMap[pageType] || 'tt-body-index',
            '\\[##_page_title_##\\]': blogTitle,
            '\\[##_image_##\\]': blogImage,
            '\\[##_blog_image_##\\]': `<img src="${blogImage}" alt="${blogTitle}">`,
            '\\[##_revenue_list_upper_##\\]': '',
            '\\[##_revenue_list_lower_##\\]': '',
        };

        const linkMappings = {
            '\\[##_guestbook_link_##\\]': `${blogUrl}/guestbook`,
            '\\[##_taglog_link_##\\]': `${blogUrl}/tag`,
            '\\[##_rss_url_##\\]': `${blogUrl}/rss`,
            '\\[##_article_rep_link_##\\]': items.length > 0 ? items[0].link[0] : blogUrl,
            '\\[##_list_conform_##\\]': blogTitle,
            '\\[##_list_count_##\\]': String(items.length),
            '\\[##_list_description_##\\]': blogDesc,
            '\\[##_list_style_##\\]': 'list',
        };

        const searchMappings = {
            '\\[##_search_name_##\\]': 'search',
            '\\[##_search_text_##\\]': '',
            '\\[##_search_onclick_submit_##\\]': `window.location.href='${blogUrl}/search/'+document.getElementsByName('search')[0].value`,
        };

        // 블로그 메뉴 — 실제 블로그에서 스크래핑한 메뉴 우선 사용
        const catMap = new Map();
        items.forEach(item => {
            if (item.category) {
                const full = item.category[0];
                const parts = full.split('/');
                const parent = parts[0].trim();
                if (!catMap.has(parent)) catMap.set(parent, new Set());
                if (parts.length > 1) catMap.get(parent).add(parts.slice(1).join('/').trim());
            }
        });
        if (scraped.blogMenu) {
            // 실제 블로그에서 스크래핑한 메뉴 사용 (Live와 동일)
            output = output.replace(/\[##_blog_menu_##\]/g, scraped.blogMenu);
        } else {
            // Fallback: RSS 카테고리 기반 메뉴 생성
            const menuLinks = [`<a href="${blogUrl}">Home</a>`];
            for (const [parent] of catMap) {
                menuLinks.push(`<a href="${blogUrl}/category/${encodeURIComponent(parent)}">${parent}</a>`);
            }
            output = output.replace(/\[##_blog_menu_##\]/g, menuLinks.join(' '));
        }

        // 카테고리 트리 (컬러 도트 + 글 수 + 서브카테고리 트리)
        // ── 스크래핑 카테고리와 RSS 카테고리 병합 ──
        // 스크래핑된 카테고리가 있으면 이를 기본으로 사용하고 RSS 글 수로 보강
        // 없으면 RSS 기반 catMap을 사용

        // GitHub 스타일 언어 컬러 팔레트 (16색)
        const catColors = [
            '#3572A5', '#e34c26', '#f1e05a', '#563d7c', '#2b7489',
            '#b07219', '#4F5D95', '#00ADD8', '#DA5B0B', '#178600',
            '#89e051', '#438eff', '#A97BFF', '#e44b23', '#f34b7d', '#00B4AB'
        ];

        // RSS에서 각 카테고리별 실제 글 수 카운트
        const rssCatCount = new Map();
        items.forEach(item => {
            if (item.category) {
                const full = item.category[0].trim();
                rssCatCount.set(full, (rssCatCount.get(full) || 0) + 1);
                const parent = full.split('/')[0].trim();
                if (parent !== full) {
                    rssCatCount.set(parent, (rssCatCount.get(parent) || 0) + 1);
                }
            }
        });

        let colorIdx = 0;
        let categoryHtml = '';

        if (scraped.categories.length > 0) {
            // ── 스크래핑 기반 (전체 카테고리 포함, 0개 글도 표시) ──
            for (const cat of scraped.categories) {
                const color = catColors[colorIdx % catColors.length];
                colorIdx++;
                // RSS 글 수 or 스크래핑 글 수
                const count = rssCatCount.get(cat.name) || cat.count;
                const countBadge = `<span class="c_cnt">${count}</span>`;

                if (cat.children && cat.children.length > 0) {
                    let subHtml = '';
                    for (const child of cat.children) {
                        const childFullKey = `${cat.name}/${child.name}`;
                        const childCount = rssCatCount.get(childFullKey) || child.count;
                        const childBadge = `<span class="c_cnt">${childCount}</span>`;
                        const childLink = child.link || `${blogUrl}/category/${encodeURIComponent(childFullKey)}`;
                        subHtml += `<li><a href="${childLink}">${child.name}${childBadge}</a></li>`;
                    }
                    // RSS에만 있는 서브카테고리 추가
                    for (const [key] of rssCatCount) {
                        if (key.startsWith(cat.name + '/')) {
                            const childName = key.substring(cat.name.length + 1);
                            if (!cat.children.find(c => c.name === childName)) {
                                const childCount = rssCatCount.get(key) || 0;
                                subHtml += `<li><a href="${blogUrl}/category/${encodeURIComponent(key)}">${childName}<span class="c_cnt">${childCount}</span></a></li>`;
                            }
                        }
                    }
                    categoryHtml += `<li class="cat-parent"><a href="${cat.link}"><span class="cat-dot" style="background:${color}"></span>${cat.name}${countBadge}</a><ul>${subHtml}</ul></li>`;
                } else {
                    categoryHtml += `<li><a href="${cat.link}"><span class="cat-dot" style="background:${color}"></span>${cat.name}${countBadge}</a></li>`;
                }
            }
            // RSS에만 있고 스크래핑에 없는 상위 카테고리 추가
            for (const [parent] of catMap) {
                if (!scraped.categories.find(c => c.name === parent)) {
                    const color = catColors[colorIdx % catColors.length];
                    colorIdx++;
                    const count = rssCatCount.get(parent) || 0;
                    const children = catMap.get(parent);
                    if (children && children.size > 0) {
                        let subHtml = '';
                        for (const child of children) {
                            const ck = `${parent}/${child}`;
                            const cc = rssCatCount.get(ck) || 0;
                            subHtml += `<li><a href="${blogUrl}/category/${encodeURIComponent(ck)}">${child}<span class="c_cnt">${cc}</span></a></li>`;
                        }
                        categoryHtml += `<li class="cat-parent"><a href="${blogUrl}/category/${encodeURIComponent(parent)}"><span class="cat-dot" style="background:${color}"></span>${parent}<span class="c_cnt">${count}</span></a><ul>${subHtml}</ul></li>`;
                    } else {
                        categoryHtml += `<li><a href="${blogUrl}/category/${encodeURIComponent(parent)}"><span class="cat-dot" style="background:${color}"></span>${parent}<span class="c_cnt">${count}</span></a></li>`;
                    }
                }
            }
        } else {
            // ── RSS 기반 (fallback) ──
            for (const [parent, children] of catMap) {
                const color = catColors[colorIdx % catColors.length];
                colorIdx++;
                const parentCount = rssCatCount.get(parent) || 0;
                const countBadge = `<span class="c_cnt">${parentCount}</span>`;
                if (children.size > 0) {
                    let subHtml = '';
                    for (const child of children) {
                        const childFullKey = `${parent}/${child}`;
                        const childCount = rssCatCount.get(childFullKey) || 0;
                        const childBadge = `<span class="c_cnt">${childCount}</span>`;
                        subHtml += `<li><a href="${blogUrl}/category/${encodeURIComponent(parent + '/' + child)}">${child}${childBadge}</a></li>`;
                    }
                    categoryHtml += `<li class="cat-parent"><a href="${blogUrl}/category/${encodeURIComponent(parent)}"><span class="cat-dot" style="background:${color}"></span>${parent}${countBadge}</a><ul>${subHtml}</ul></li>`;
                } else {
                    categoryHtml += `<li><a href="${blogUrl}/category/${encodeURIComponent(parent)}"><span class="cat-dot" style="background:${color}"></span>${parent}${countBadge}</a></li>`;
                }
            }
        }
        output = output.replace(/\[##_category_list_##\]/g, `<ul>${categoryHtml}</ul>`);

        // ── 카테고리→색상 매핑 생성 (포스트 목록/본문에서 동일 색상 사용) ──
        const categoryColorMap = new Map();
        let mapColorIdx = 0;
        const allCats = scraped.categories.length > 0 ? scraped.categories : [];
        // 스크래핑 기반 카테고리
        for (const cat of allCats) {
            const color = catColors[mapColorIdx % catColors.length];
            mapColorIdx++;
            categoryColorMap.set(cat.name, color);
            if (cat.children) {
                for (const child of cat.children) {
                    categoryColorMap.set(`${cat.name}/${child.name}`, color);
                    categoryColorMap.set(child.name, color);
                }
            }
        }
        // RSS 기반 카테고리 (스크래핑에 없는 것)
        for (const [parent] of catMap) {
            if (!categoryColorMap.has(parent)) {
                const color = catColors[mapColorIdx % catColors.length];
                mapColorIdx++;
                categoryColorMap.set(parent, color);
                const children = catMap.get(parent);
                if (children) {
                    for (const child of children) {
                        categoryColorMap.set(`${parent}/${child}`, color);
                        categoryColorMap.set(child, color);
                    }
                }
            }
        }

        // 모든 매핑 적용
        for (const [tag, val] of Object.entries({ ...mappings, ...linkMappings, ...searchMappings })) {
            output = output.replace(new RegExp(tag, 'g'), val);
        }

        // 사이드바 구조 태그 제거
        output = output.replace(/<\/?s_sidebar_element>/g, '');
        output = output.replace(/<\/?s_sidebar>/g, '');
        output = output.replace(/<\/?s_search>/g, '');

        // ═══════════════════════════════════════════════════════
        // 콘텐츠 영역 (RSS 데이터)
        // ═══════════════════════════════════════════════════════

        // [리스트 그룹: s_list - 대표이미지]
        const listImageRegex = /<s_list_image>([\s\S]*?)<\/s_list_image>/g;
        if (blogImage) {
            output = output.replace(listImageRegex, (m, t) => {
                return t.replace(/\[##_list_image_##\]/g, blogImage);
            });
        } else {
            output = output.replace(listImageRegex, '');
        }
        output = output.replace(/<\/?s_list>(?!_)/g, '');
        output = output.replace(/<\/?s_list_empty>/g, '');

        // [목록 루프: s_list_rep]
        const listRepRegex = /<s_list_rep>([\s\S]*?)<\/s_list_rep>/g;
        output = output.replace(listRepRegex, (match, template) => {
            return items.map(item => {
                let itemHtml = template;
                const pubDate = new Date(item.pubDate[0]);
                const title = item.title[0];
                const catName = item.category ? item.category[0] : '전체';
                const authorName = item.author ? item.author[0] : bloggerName;

                itemHtml = itemHtml.replace(/\[##_list_rep_link_##\]/g, item.link[0]);
                itemHtml = itemHtml.replace(/\[##_list_rep_title_##\]/g, title);
                itemHtml = itemHtml.replace(/\[##_list_rep_title_text_##\]/g, title);
                itemHtml = itemHtml.replace(/\[##_list_rep_regdate_##\]/g, `${pubDate.getFullYear()}.${String(pubDate.getMonth() + 1).padStart(2, '0')}.${String(pubDate.getDate()).padStart(2, '0')}`);
                itemHtml = itemHtml.replace(/\[##_list_rep_date_year_##\]/g, String(pubDate.getFullYear()));
                itemHtml = itemHtml.replace(/\[##_list_rep_date_month_##\]/g, String(pubDate.getMonth() + 1).padStart(2, '0'));
                itemHtml = itemHtml.replace(/\[##_list_rep_date_day_##\]/g, String(pubDate.getDate()).padStart(2, '0'));
                itemHtml = itemHtml.replace(/\[##_list_rep_date_hour_##\]/g, String(pubDate.getHours()).padStart(2, '0'));
                itemHtml = itemHtml.replace(/\[##_list_rep_date_minute_##\]/g, String(pubDate.getMinutes()).padStart(2, '0'));
                itemHtml = itemHtml.replace(/\[##_list_rep_date_second_##\]/g, String(pubDate.getSeconds()).padStart(2, '0'));
                itemHtml = itemHtml.replace(/\[##_list_rep_summary_##\]/g, item.description[0].replace(/<[^>]*>?/gm, '').substring(0, 150) + '...');
                itemHtml = itemHtml.replace(/\[##_list_rep_category_##\]/g, catName);
                itemHtml = itemHtml.replace(/\[##_list_rep_category_link_##\]/g, `${blogUrl}/category/${encodeURIComponent(catName)}`);
                // [list_rep_category_color_##]는 skin.html에서 제거됨 (Tistory 미지원 커스텀 태그)
                itemHtml = itemHtml.replace(/\[##_list_rep_rp_cnt_##\]/g, '0');
                itemHtml = itemHtml.replace(/\[##_list_rep_author_##\]/g, authorName);

                const thumbUrl = extractFirstImage(item);
                itemHtml = itemHtml.replace(/\[##_list_rep_thumbnail_url_##\]/g, thumbUrl || '');
                const thumbRegex = /<s_list_rep_thumbnail>([\s\S]*?)<\/s_list_rep_thumbnail>/g;
                if (thumbUrl) {
                    itemHtml = itemHtml.replace(thumbRegex, (m, t) => {
                        return t.replace(/\[##_list_rep_thumbnail_##\]/g, thumbUrl);
                    });
                } else {
                    itemHtml = itemHtml.replace(thumbRegex, '');
                }
                return itemHtml;
            }).join('');
        });

        // [본문 처리: s_article_rep]
        // entryId가 있으면 해당 글, 없으면 첫 번째 글
        let targetItem = items[0];
        if (entryId && items.length > 0) {
            const found = items.find(it => {
                const link = it.link ? it.link[0] : '';
                // /57 형태 또는 /entry/slug 형태 매칭
                return link.endsWith('/' + entryId) || link.includes('/entry/' + decodeURIComponent(entryId));
            });
            if (found) targetItem = found;
        }
        if (targetItem) {
            const first = targetItem;
            const firstDate = new Date(first.pubDate[0]);
            const firstCat = first.category ? first.category[0] : '전체';
            const firstAuthor = first.author ? first.author[0] : bloggerName;
            const firstThumb = extractFirstImage(first);

            output = output.replace(/\[##_article_rep_title_##\]/g, first.title[0]);
            output = output.replace(/\[##_article_rep_desc_##\]/g, first.description[0]);
            output = output.replace(/\[##_article_rep_category_##\]/g, firstCat);
            output = output.replace(/\[##_article_rep_category_link_##\]/g, `${blogUrl}/category/${encodeURIComponent(firstCat)}`);
            // [article_rep_category_color_##]는 skin.html에서 제거됨 (Tistory 미지원 커스텀 태그)
            output = output.replace(/\[##_article_rep_date_##\]/g, `${firstDate.getFullYear()}. ${firstDate.getMonth() + 1}. ${firstDate.getDate()}. ${String(firstDate.getHours()).padStart(2, '0')}:${String(firstDate.getMinutes()).padStart(2, '0')}`);
            output = output.replace(/\[##_article_rep_simple_date_##\]/g, `${firstDate.getFullYear()}. ${firstDate.getMonth() + 1}. ${firstDate.getDate()}.`);
            output = output.replace(/\[##_article_rep_date_year_##\]/g, String(firstDate.getFullYear()));
            output = output.replace(/\[##_article_rep_date_month_##\]/g, String(firstDate.getMonth() + 1).padStart(2, '0'));
            output = output.replace(/\[##_article_rep_date_day_##\]/g, String(firstDate.getDate()).padStart(2, '0'));
            output = output.replace(/\[##_article_rep_date_hour_##\]/g, String(firstDate.getHours()).padStart(2, '0'));
            output = output.replace(/\[##_article_rep_date_minute_##\]/g, String(firstDate.getMinutes()).padStart(2, '0'));
            output = output.replace(/\[##_article_rep_date_second_##\]/g, String(firstDate.getSeconds()).padStart(2, '0'));
            output = output.replace(/\[##_article_rep_author_##\]/g, firstAuthor);
            output = output.replace(/\[##_article_rep_thumbnail_url_##\]/g, firstThumb || '');
            output = output.replace(/\[##_article_rep_thumbnail_raw_url_##\]/g, firstThumb || '');

            // s_article_rep_thumbnail 그룹
            const artThumbRegex = /<s_article_rep_thumbnail>([\s\S]*?)<\/s_article_rep_thumbnail>/g;
            if (firstThumb) {
                output = output.replace(artThumbRegex, (m, t) => t);
            } else {
                output = output.replace(artThumbRegex, '');
            }
        }
        output = output.replace(/<\/?s_article_rep>(?!_)/g, '');

        // [글 관리 기능: s_ad_div] — 프리뷰 모드에서 구조 유지
        const adDivRegex = /<s_ad_div>([\s\S]*?)<\/s_ad_div>/g;
        output = output.replace(adDivRegex, (match, template) => {
            let h = template;
            const editLink = items.length > 0 ? `${blogUrl}/manage/newpost/${items[0].link[0].split('/').pop()}` : '#';
            h = h.replace(/\[##_s_ad_m_link_##\]/g, editLink);
            h = h.replace(/\[##_s_ad_m_onclick_##\]/g, `window.open('${editLink}')`);
            h = h.replace(/\[##_s_ad_s1_label_##\]/g, '공개');
            h = h.replace(/\[##_s_ad_s2_onclick_##\]/g, "alert('프리뷰 모드')");
            h = h.replace(/\[##_s_ad_s2_label_##\]/g, '비공개');
            h = h.replace(/\[##_s_ad_t_onclick_##\]/g, "alert('프리뷰 모드')");
            h = h.replace(/\[##_s_ad_d_onclick_##\]/g, "alert('프리뷰 모드')");
            return h;
        });

        // [태그 라벨 (글 하단 태그)] — RSS 카테고리 사용
        const tagLabelRegex = /<s_tag_label>([\s\S]*?)<\/s_tag_label>/g;
        output = output.replace(tagLabelRegex, (match, template) => {
            if (items.length > 0 && items[0].category) {
                const tags = [];
                items[0].category.forEach(c => {
                    c.split('/').forEach(part => {
                        const name = part.trim();
                        if (name && !tags.includes(name)) tags.push(name);
                    });
                });
                if (tags.length === 0) return '';
                const tagHtml = tags.map(t =>
                    `<a href="${blogUrl}/tag/${encodeURIComponent(t)}">${t}</a>`
                ).join(' ');
                return template.replace(/\[##_tag_label_rep_##\]/g, tagHtml);
            }
            return '';
        });

        // [태그 클라우드 (s_tag / s_tag_rep)] — 스크래핑 데이터 우선, 없으면 RSS 카테고리
        const tagRepRegex = /<s_tag_rep>([\s\S]*?)<\/s_tag_rep>/g;
        output = output.replace(tagRepRegex, (match, template) => {
            const tagSource = scraped.tags.length > 0
                ? scraped.tags
                : collectCategories(items);

            if (tagSource.length === 0) return '';
            return tagSource.map(tag => {
                let h = template;
                h = h.replace(/\[##_tag_link_##\]/g, tag.link || `${blogUrl}/tag/${encodeURIComponent(tag.name)}`);
                h = h.replace(/\[##_tag_name_##\]/g, tag.name);
                h = h.replace(/\[##_tag_class_##\]/g, tag.cloudClass);
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_tag>/g, '');

        // [방문자 카운터] — 스크래핑 데이터 (실제 블로그 방문자 수)
        output = output.replace(/\[##_count_today_##\]/g, scraped.visitor.today);
        output = output.replace(/\[##_count_yesterday_##\]/g, scraped.visitor.yesterday);
        output = output.replace(/\[##_count_total_##\]/g, scraped.visitor.total);

        // [공지 (s_notice)] — 스크래핑 데이터
        const noticeRepRegex = /<s_notice_rep>([\s\S]*?)<\/s_notice_rep>/g;
        output = output.replace(noticeRepRegex, (match, template) => {
            if (scraped.notices.length === 0) return '';
            return scraped.notices.map(n => {
                let h = template;
                h = h.replace(/\[##_notice_rep_title_##\]/g, n.title);
                h = h.replace(/\[##_notice_rep_link_##\]/g, n.link);
                h = h.replace(/\[##_notice_rep_date_##\]/g, '');
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_notice>/g, '');

        // [최근 글 (s_rctps)] — RSS 기반
        const rctpsRepRegex = /<s_rctps_rep>([\s\S]*?)<\/s_rctps_rep>/g;
        output = output.replace(rctpsRepRegex, (match, template) => {
            return items.slice(0, 5).map(item => {
                let h = template;
                h = h.replace(/\[##_rctps_rep_link_##\]/g, item.link[0]);
                h = h.replace(/\[##_rctps_rep_title_##\]/g, item.title[0]);
                h = h.replace(/\[##_rctps_rep_date_##\]/g, new Date(item.pubDate[0]).toLocaleDateString());
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_rctps>/g, '');

        // [최근 댓글 (s_rctrp)] — 스크래핑 데이터
        const rctrpRepRegex = /<s_rctrp_rep>([\s\S]*?)<\/s_rctrp_rep>/g;
        output = output.replace(rctrpRepRegex, (match, template) => {
            if (scraped.recentComments.length === 0) return '';
            return scraped.recentComments.slice(0, 5).map(c => {
                let h = template;
                h = h.replace(/\[##_rctrp_rep_name_##\]/g, c.name || '방문자');
                h = h.replace(/\[##_rctrp_rep_desc_##\]/g, c.desc);
                h = h.replace(/\[##_rctrp_rep_date_##\]/g, c.date);
                h = h.replace(/\[##_rctrp_rep_link_##\]/g, c.link);
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_rctrp>/g, '');

        // [캘린더] — RSS 글 날짜 표시
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        const postDates = new Set();
        items.forEach(item => {
            const d = new Date(item.pubDate[0]);
            if (d.getFullYear() === year && d.getMonth() === month) {
                postDates.add(d.getDate());
            }
        });

        let calHtml = `<table><caption>« ${monthNames[month]} ${year} »</caption>`;
        calHtml += '<tr><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th></tr><tr>';
        for (let i = 0; i < firstDay; i++) calHtml += '<td></td>';
        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = d === now.getDate();
            const hasPost = postDates.has(d);
            let cls = '';
            if (isToday && hasPost) cls = ' class="cal-today cal-has-post"';
            else if (isToday) cls = ' class="cal-today"';
            else if (hasPost) cls = ' class="cal-has-post"';

            if (hasPost) {
                calHtml += `<td${cls}><a href="${blogUrl}">${d}</a></td>`;
            } else {
                calHtml += `<td${cls}>${d}</td>`;
            }
            if ((firstDay + d) % 7 === 0 && d < daysInMonth) calHtml += '</tr><tr>';
        }
        calHtml += '</tr></table>';
        output = output.replace(/\[##_calendar_##\]/g, calHtml);

        // [아카이브] — RSS 기반
        const archiveMonths = new Set();
        items.forEach(item => {
            const d = new Date(item.pubDate[0]);
            archiveMonths.add(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
        });
        const archiveHtml = Array.from(archiveMonths).sort().reverse().map(m =>
            `<li><a href="${blogUrl}/archive/${m.replace('/', '')}">${m}</a></li>`
        ).join('');
        output = output.replace(/\[##_archive_##\]/g, archiveHtml);

        // ═══════════════════════════════════════════════════════
        // 댓글 & 방명록
        // ═══════════════════════════════════════════════════════

        // [댓글 리스트] — 스크래핑 최근 댓글을 활용해 구조 채움
        const rpRepRegex = /<s_rp_rep>([\s\S]*?)<\/s_rp_rep>/g;
        output = output.replace(rpRepRegex, (match, template) => {
            if (scraped.recentComments.length === 0) return '';
            return scraped.recentComments.slice(0, 5).map((c, idx) => {
                let h = template;
                h = h.replace(/\[##_rp_rep_id_##\]/g, String(idx + 1));
                h = h.replace(/\[##_rp_rep_name_##\]/g, c.name || '방문자');
                h = h.replace(/\[##_rp_rep_desc_##\]/g, c.desc);
                h = h.replace(/\[##_rp_rep_date_##\]/g, c.date);
                h = h.replace(/\[##_rp_rep_link_##\]/g, c.link);
                h = h.replace(/\[##_rp_rep_logo_##\]/g, '');
                h = h.replace(/\[##_rp_rep_class_##\]/g, '');
                h = h.replace(/\[##_rp_rep_onclick_delete_##\]/g, "alert('프리뷰 모드')");
                h = h.replace(/\[##_rp_rep_onclick_reply_##\]/g, "alert('프리뷰 모드')");
                // 대댓글 영역 제거
                h = h.replace(/<s_rp2_container>[\s\S]*?<\/s_rp2_container>/g, '');
                return h;
            }).join('');
        });
        output = output.replace(/<s_rp2_rep>[\s\S]*?<\/s_rp2_rep>/g, '');
        output = output.replace(/<\/?s_rp_container>/g, '');
        output = output.replace(/<\/?s_rp2_container>/g, '');
        output = output.replace(/<\/?s_rp>/g, '');
        output = output.replace(/\[##_comment_group_##\]/g, '<div id="tt-comment-area"></div>');

        // [방명록 리스트] — 스크래핑 최근 댓글을 방명록으로 재활용
        const guestRepRegex = /<s_guest_rep>([\s\S]*?)<\/s_guest_rep>/g;
        output = output.replace(guestRepRegex, (match, template) => {
            if (scraped.recentComments.length === 0) return '';
            return scraped.recentComments.slice(0, 5).map((c, idx) => {
                let h = template;
                h = h.replace(/\[##_guest_rep_id_##\]/g, String(idx + 1));
                h = h.replace(/\[##_guest_rep_name_##\]/g, c.name || '방문자');
                h = h.replace(/\[##_guest_rep_desc_##\]/g, c.desc);
                h = h.replace(/\[##_guest_rep_date_##\]/g, c.date);
                h = h.replace(/\[##_guest_rep_logo_##\]/g, '');
                h = h.replace(/\[##_guest_rep_class_##\]/g, '');
                h = h.replace(/\[##_guest_rep_onclick_delete_##\]/g, "alert('프리뷰 모드')");
                h = h.replace(/\[##_guest_rep_onclick_reply_##\]/g, "alert('프리뷰 모드')");
                h = h.replace(/<s_guest_reply_container>[\s\S]*?<\/s_guest_reply_container>/g, '');
                return h;
            }).join('');
        });
        output = output.replace(/<s_guest_reply_rep>[\s\S]*?<\/s_guest_reply_rep>/g, '');
        output = output.replace(/<\/?s_guest_container>/g, '');
        output = output.replace(/<\/?s_guest_reply_container>/g, '');
        output = output.replace(/<\/?s_guest>/g, '');

        // [댓글/방명록 입력 폼] — UI 구조 유지
        const formMappings = {
            '\\[##_rp_input_name_##\\]': 'name',
            '\\[##_rp_input_password_##\\]': 'password',
            '\\[##_rp_input_homepage_##\\]': 'homepage',
            '\\[##_rp_textarea_body_##\\]': 'body',
            '\\[##_rp_input_comment_##\\]': 'comment',
            '\\[##_rp_input_is_secret_##\\]': 'secret',
            '\\[##_rp_onclick_submit_##\\]': "alert('프리뷰 모드에서는 댓글을 등록할 수 없습니다.')",
            '\\[##_rp_cnt_##\\]': '0',
            '\\[##_guest_input_name_##\\]': 'name',
            '\\[##_guest_input_password_##\\]': 'password',
            '\\[##_guest_input_homepage_##\\]': 'homepage',
            '\\[##_guest_textarea_body_##\\]': 'body',
            '\\[##_guest_onclick_submit_##\\]': "alert('프리뷰 모드에서는 방명록을 등록할 수 없습니다.')",
            '\\[##_guest_name_##\\]': '',
            '\\[##_guest_password_##\\]': '',
            '\\[##_guest_homepage_##\\]': '',
        };
        for (const [tag, val] of Object.entries(formMappings)) {
            output = output.replace(new RegExp(tag, 'g'), val);
        }
        output = output.replace(/<\/?s_rp_input_form>/g, '');
        output = output.replace(/<\/?s_guest_input_form>/g, '');
        output = output.replace(/<\/?s_guest_member>/g, '');
        output = output.replace(/<\/?s_guest_form>/g, '');
        output = output.replace(/<\/?s_rp_member>/g, '');
        output = output.replace(/<\/?s_rp_form>/g, '');
        output = output.replace(/<\/?s_rp_count>/g, '');
        output = output.replace(/\[##_article_rep_rp_cnt_##\]/g, '0');
        output = output.replace(/\[##_article_rep_rp_link_##\]/g, '#tt-comment-area');

        // ═══════════════════════════════════════════════════════
        // 페이징 & 이전/다음 글 & 관련 글 (RSS + T.config)
        // ═══════════════════════════════════════════════════════

        const totalPages = Math.max(1, Math.ceil(items.length / 10));
        const pagingRepRegex = /<s_paging_rep>([\s\S]*?)<\/s_paging_rep>/g;
        output = output.replace(pagingRepRegex, (match, template) => {
            return Array.from({ length: totalPages }, (_, i) => i + 1).map(num => {
                let h = template;
                h = h.replace(/\[##_paging_rep_link_##\]/g, num === 1 ? '' : `href="${blogUrl}/page/${num}"`);
                h = h.replace(/\[##_paging_rep_link_num_##\]/g, String(num));
                return h;
            }).join('');
        });

        // T.config에서 실제 prev/next page 사용
        const prevPage = scraped.config?.PREV_PAGE || '';
        const nextPage = scraped.config?.NEXT_PAGE || '';
        output = output.replace(/\[##_prev_page_##\]/g, prevPage ? `href="${prevPage}"` : '');
        output = output.replace(/\[##_next_page_##\]/g, nextPage ? `href="${nextPage}"` : '');
        output = output.replace(/\[##_no_more_prev_##\]/g, prevPage ? '' : 'no-more-prev');
        output = output.replace(/\[##_no_more_next_##\]/g, nextPage ? '' : 'no-more-next');
        output = output.replace(/<\/?s_paging>/g, '');

        // [이전 글 / 다음 글] — RSS items 기반
        if (items.length > 1) {
            const prevItem = items[1];
            const prevThumb = extractFirstImage(prevItem);
            output = output.replace(/\[##_article_prev_link_##\]/g, prevItem.link[0]);
            output = output.replace(/\[##_article_prev_title_##\]/g, prevItem.title[0]);
            output = output.replace(/\[##_article_prev_date_##\]/g, new Date(prevItem.pubDate[0]).toLocaleDateString());
            output = output.replace(/\[##_article_prev_type_##\]/g, prevThumb ? 'thumb_type' : 'text_type');
            output = output.replace(/\[##_article_prev_thumbnail_link_##\]/g, prevThumb);
            if (!prevThumb) {
                output = output.replace(/<s_article_prev_thumbnail>[\s\S]*?<\/s_article_prev_thumbnail>/g, '');
            }
        } else {
            output = output.replace(/<s_article_prev>[\s\S]*?<\/s_article_prev>/g, '');
        }
        if (items.length > 2) {
            const nextItem = items[2];
            const nextThumb = extractFirstImage(nextItem);
            output = output.replace(/\[##_article_next_link_##\]/g, nextItem.link[0]);
            output = output.replace(/\[##_article_next_title_##\]/g, nextItem.title[0]);
            output = output.replace(/\[##_article_next_date_##\]/g, new Date(nextItem.pubDate[0]).toLocaleDateString());
            output = output.replace(/\[##_article_next_type_##\]/g, nextThumb ? 'thumb_type' : 'text_type');
            output = output.replace(/\[##_article_next_thumbnail_link_##\]/g, nextThumb);
            if (!nextThumb) {
                output = output.replace(/<s_article_next_thumbnail>[\s\S]*?<\/s_article_next_thumbnail>/g, '');
            }
        } else {
            output = output.replace(/<s_article_next>[\s\S]*?<\/s_article_next>/g, '');
        }
        output = output.replace(/<\/?s_article_prev>/g, '');
        output = output.replace(/<\/?s_article_next>/g, '');
        output = output.replace(/<\/?s_article_prev_thumbnail>/g, '');
        output = output.replace(/<\/?s_article_next_thumbnail>/g, '');

        // [카테고리 관련 글]
        const relatedRepRegex = /<s_article_related_rep>([\s\S]*?)<\/s_article_related_rep>/g;
        output = output.replace(relatedRepRegex, (match, template) => {
            const firstCat = items.length > 0 && items[0].category ? items[0].category[0] : null;
            let relatedItems;
            if (firstCat) {
                relatedItems = items.filter((item, idx) => idx > 0 && item.category && item.category[0] === firstCat).slice(0, 5);
            }
            if (!relatedItems || relatedItems.length === 0) {
                relatedItems = items.slice(1, 6);
            }
            return relatedItems.map(item => {
                let h = template;
                const thumb = extractFirstImage(item);
                h = h.replace(/\[##_article_related_rep_link_##\]/g, item.link[0]);
                h = h.replace(/\[##_article_related_rep_title_##\]/g, item.title[0]);
                h = h.replace(/\[##_article_related_rep_date_##\]/g, new Date(item.pubDate[0]).toLocaleDateString());
                h = h.replace(/\[##_article_related_rep_type_##\]/g, thumb ? 'thumb_type' : 'text_type');
                h = h.replace(/\[##_article_related_rep_thumbnail_link_##\]/g, thumb);
                if (!thumb) {
                    h = h.replace(/<s_article_related_rep_thumbnail>[\s\S]*?<\/s_article_related_rep_thumbnail>/g, '');
                }
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_article_related>/g, '');
        output = output.replace(/<\/?s_article_related_rep_thumbnail>/g, '');
        // ═══════════════════════════════════════════════════════
        // 보호글 / 페이지 — 구조 유지
        // ═══════════════════════════════════════════════════════
        output = output.replace(/<\/?s_article_protected>/g, '');
        output = output.replace(/\[##_article_password_##\]/g, 'password');
        output = output.replace(/\[##_article_protected_onclick_submit_##\]/g, "alert('프리뷰 모드')");

        // ═══════════════════════════════════════════════════════
        // 최종 정리 — 미처리 치환자 제거
        // ═══════════════════════════════════════════════════════
        output = output.replace(/\[##_.*?_##\]/g, '');
        output = output.replace(/<s_.*?>|<\/s_.*?>/g, '');

        return output;
    } catch (err) {
        console.error('Hydrate Error:', err.message);
        return html + `<div style="background:red; color:white; padding:10px;">RSS 로드 실패: ${blogUrl}</div>`;
    }
}
