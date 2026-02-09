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
        config: null,   // T.config object
    };

    try {
        const res = await axios.get(blogUrl, { timeout: 10000 });
        const html = res.data;

        // ── 방문자 수 파싱 ──
        // 여러 스킨 구조를 지원하는 다중 패턴 매칭
        // 패턴 1: visitor 영역 블럭에서 숫자 순서대로 추출 (구 스킨)
        const visitorBlock = html.match(/<div[^>]*class="[^"]*visitor[^"]*"[\s\S]{0,3000}?<\/div>\s*<\/div>\s*<\/div>/);
        if (visitorBlock) {
            const nums = [...visitorBlock[0].matchAll(/>\s*([\d,]+)\s*</g)].map(m => m[1]);
            if (nums.length >= 3) {
                data.visitor.today = nums[0];
                data.visitor.yesterday = nums[1];
                data.visitor.total = nums[2];
            } else if (nums.length >= 1) {
                data.visitor.total = nums[nums.length - 1];
            }
        }
        // 패턴 2: 개별 class로 직접 매칭 (다양한 스킨)
        const visitorPatterns = [
            [/class="[^"]*(?:count_todaycount|today-count|visitor.*?today)[^"]*"[^>]*>([\d,]+)/i, 'today'],
            [/class="[^"]*(?:count_yesterdaycount|yesterday-count|visitor.*?yesterday)[^"]*"[^>]*>([\d,]+)/i, 'yesterday'],
            [/class="[^"]*(?:count_totalcount|total-count|visitor.*?total)[^"]*"[^>]*>([\d,]+)/i, 'total'],
        ];
        for (const [pattern, key] of visitorPatterns) {
            const m = html.match(pattern);
            if (m) data.visitor[key] = m[1];
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

    } catch (err) {
        console.warn(`Blog scrape warning (${blogUrl}):`, err.message);
    }

    return data;
}

/**
 * 전용 엔진: 스킨의 치환자를 실제 블로그 데이터로 변환합니다.
 * 데이터 소스: RSS + 블로그 HTML 직접 파싱 (병합)
 */
export async function hydrate(html, blogUrl) {
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

        const blogTitle = channel.title[0];
        const blogDesc = channel.description[0];
        const blogImage = channel.image && channel.image[0] && channel.image[0].url
            ? channel.image[0].url[0]
            : `${blogUrl}/favicon.ico`;

        // ═══════════════════════════════════════════════════════
        // 기본 정보 (RSS + 스크래핑 병합)
        // ═══════════════════════════════════════════════════════

        const mappings = {
            '\\[##_title_##\\]': blogTitle,
            '\\[##_desc_##\\]': blogDesc,
            '\\[##_blog_link_##\\]': blogUrl,
            '\\[##_blogger_##\\]': scraped.config?.BLOG?.nickName || blogTitle,
            '\\[##_body_id_##\\]': 'tt-body-index',
            '\\[##_page_title_##\\]': blogTitle,
            '\\[##_image_##\\]': blogImage,
        };

        const linkMappings = {
            '\\[##_guestbook_link_##\\]': `${blogUrl}/guestbook`,
            '\\[##_taglog_link_##\\]': `${blogUrl}/tag`,
            '\\[##_rss_url_##\\]': `${blogUrl}/rss`,
            '\\[##_article_rep_link_##\\]': items.length > 0 ? items[0].link[0] : blogUrl,
            '\\[##_list_conform_##\\]': blogTitle,
        };

        const searchMappings = {
            '\\[##_search_name_##\\]': 'search',
            '\\[##_search_text_##\\]': '',
            '\\[##_search_onclick_submit_##\\]': `window.location.href='${blogUrl}/search/'+document.getElementsByName('search')[0].value`,
        };

        // 블로그 메뉴 (RSS 카테고리 기반)
        const menuLinks = [`<a href="${blogUrl}">Home</a>`];
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
        for (const [parent] of catMap) {
            menuLinks.push(`<a href="${blogUrl}/category/${encodeURIComponent(parent)}">${parent}</a>`);
        }
        output = output.replace(/\[##_blog_menu_##\]/g, menuLinks.join(' '));

        // 카테고리 트리
        let categoryHtml = '';
        for (const [parent, children] of catMap) {
            const parentUrl = `${blogUrl}/category/${encodeURIComponent(parent)}`;
            if (children.size > 0) {
                let subHtml = '';
                for (const child of children) {
                    subHtml += `<li><a href="${blogUrl}/category/${encodeURIComponent(parent + '/' + child)}">${child}</a></li>`;
                }
                categoryHtml += `<li><a href="${parentUrl}">${parent}</a><ul>${subHtml}</ul></li>`;
            } else {
                categoryHtml += `<li><a href="${parentUrl}">${parent}</a></li>`;
            }
        }
        output = output.replace(/\[##_category_list_##\]/g, `<ul>${categoryHtml}</ul>`);

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

        // [목록 루프: s_list_rep]
        const listRepRegex = /<s_list_rep>([\s\S]*?)<\/s_list_rep>/g;
        output = output.replace(listRepRegex, (match, template) => {
            return items.map(item => {
                let itemHtml = template;
                itemHtml = itemHtml.replace(/\[##_list_rep_link_##\]/g, item.link[0]);
                itemHtml = itemHtml.replace(/\[##_list_rep_title_##\]/g, item.title[0]);
                itemHtml = itemHtml.replace(/\[##_list_rep_regdate_##\]/g, new Date(item.pubDate[0]).toLocaleDateString());
                itemHtml = itemHtml.replace(/\[##_list_rep_summary_##\]/g, item.description[0].replace(/<[^>]*>?/gm, '').substring(0, 150) + '...');
                itemHtml = itemHtml.replace(/\[##_list_rep_category_##\]/g, item.category ? item.category[0] : '전체');

                const thumbUrl = extractFirstImage(item);
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
        if (items.length > 0) {
            const first = items[0];
            output = output.replace(/\[##_article_rep_title_##\]/g, first.title[0]);
            output = output.replace(/\[##_article_rep_desc_##\]/g, first.description[0]);
            output = output.replace(/\[##_article_rep_category_##\]/g, first.category ? first.category[0] : '전체');
            output = output.replace(/\[##_article_rep_date_##\]/g, new Date(first.pubDate[0]).toLocaleDateString());
            output = output.replace(/\[##_article_rep_author_##\]/g, first.author ? first.author[0] : (scraped.config?.BLOG?.nickName || blogTitle));
        }

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
        // 댓글 & 방명록 — RSS/스크래핑 모두 개별 글의 댓글 제공 불가
        // 구조만 유지하고 목록은 비움
        // ═══════════════════════════════════════════════════════

        output = output.replace(/<s_rp_rep>[\s\S]*?<\/s_rp_rep>/g, '');
        output = output.replace(/<s_rp2_rep>[\s\S]*?<\/s_rp2_rep>/g, '');
        output = output.replace(/<\/?s_rp_container>/g, '');
        output = output.replace(/<\/?s_rp2_container>/g, '');
        output = output.replace(/<\/?s_rp>/g, '');
        output = output.replace(/\[##_comment_group_##\]/g, '<div id="tt-comment-area"></div>');

        output = output.replace(/<s_guest_rep>[\s\S]*?<\/s_guest_rep>/g, '');
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
        output = output.replace(/\[##_article_rep_category_link_##\]/g,
            items.length > 0 && items[0].category
                ? `${blogUrl}/category/${encodeURIComponent(items[0].category[0])}`
                : blogUrl);

        // ═══════════════════════════════════════════════════════
        // 최종 정리 — 미처리 치환자 제거
        // ═══════════════════════════════════════════════════════
        output = output.replace(/\[##_.*?_##\]/g, '');
        output = output.replace(/<s_.*?>|<\/s_.*?>/g, '');

        return output;
    } catch (err) {
        console.error('Hydrate Error:', err.message);
        return html + `<div style="background:red; color:white; padding:10px;">RSS 로드 실패: ${blogId}</div>`;
    }
}
