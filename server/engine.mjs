import axios from 'axios';
import { parseStringPromise } from 'xml2js';

/**
 * Tistory URL 또는 아이디에서 블로그 식별자를 추출합니다.
 */
export function extractBlogId(urlOrId) {
    if (!urlOrId) return 'notice';
    // https://keinn51.tistory.com/ -> keinn51
    const match = urlOrId.match(/https?:\/\/([^.]+)\.tistory\.com/);
    if (match) return match[1];
    return urlOrId; // 이미 아이디인 경우
}

/**
 * 전용 엔진: 스킨의 치환자를 실제 데이터로 변환합니다.
 */
export async function hydrate(html, blogId) {
    try {
        const rssUrl = `https://${blogId}.tistory.com/rss`;
        const response = await axios.get(rssUrl);
        const rssData = await parseStringPromise(response.data);
        const channel = rssData.rss.channel[0];
        const items = channel.item || [];

        let output = html;

        const blogUrl = `https://${blogId}.tistory.com`;

        // [기본 정보]
        const mappings = {
            '\\[##_title_##\\]': channel.title[0],
            '\\[##_desc_##\\]': channel.description[0],
            '\\[##_blog_link_##\\]': blogUrl,
            '\\[##_blogger_##\\]': channel.title[0],
            '\\[##_body_id_##\\]': 'tt-body-index',
            '\\[##_page_title_##\\]': channel.title[0],
            '\\[##_image_##\\]': channel.image && channel.image[0] && channel.image[0].url ? channel.image[0].url[0] : `https://avatars.githubusercontent.com/u/0?v=4`,
        };

        // [링크 치환자] — 방명록, 태그, RSS 등
        const linkMappings = {
            '\\[##_guestbook_link_##\\]': `${blogUrl}/guestbook`,
            '\\[##_taglog_link_##\\]': `${blogUrl}/tag`,
            '\\[##_rss_url_##\\]': `${blogUrl}/rss`,
            '\\[##_article_rep_link_##\\]': items.length > 0 ? items[0].link[0] : blogUrl,
            '\\[##_list_conform_##\\]': channel.title[0],
        };

        // [검색 치환자]
        const searchMappings = {
            '\\[##_search_name_##\\]': 'search',
            '\\[##_search_text_##\\]': '',
            '\\[##_search_onclick_submit_##\\]': `window.location.href='${blogUrl}/search/'+document.getElementsByName('search')[0].value`,
        };

        // [블로그 메뉴]
        const menuHtml = `<a href="${blogUrl}">Home</a>`;
        output = output.replace(/\[##_blog_menu_##\]/g, menuHtml);

        // [카테고리 목록] — RSS에서 카테고리를 트리 구조로 생성
        const catMap = new Map();
        items.forEach(item => {
            if (item.category) {
                const full = item.category[0];
                const parts = full.split('/');
                const parent = parts[0].trim();
                const child = parts.length > 1 ? parts.slice(1).join('/').trim() : null;
                if (!catMap.has(parent)) catMap.set(parent, new Set());
                if (child) catMap.get(parent).add(child);
            }
        });
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

        // [사이드바 구조 태그 제거 (내용은 유지)]
        output = output.replace(/<\/?s_sidebar_element>/g, '');
        output = output.replace(/<\/?s_sidebar>/g, '');
        output = output.replace(/<\/?s_search>/g, '');

        // [목록 루프: <s_list_rep>]
        const listRepRegex = /<s_list_rep>([\s\S]*?)<\/s_list_rep>/g;
        output = output.replace(listRepRegex, (match, template) => {
            return items.map(item => {
                let itemHtml = template;
                itemHtml = itemHtml.replace(/\[##_list_rep_link_##\]/g, item.link[0]);
                itemHtml = itemHtml.replace(/\[##_list_rep_title_##\]/g, item.title[0]);
                itemHtml = itemHtml.replace(/\[##_list_rep_regdate_##\]/g, new Date(item.pubDate[0]).toLocaleDateString());
                itemHtml = itemHtml.replace(/\[##_list_rep_summary_##\]/g, item.description[0].replace(/<[^>]*>?/gm, '').substring(0, 150) + '...');
                itemHtml = itemHtml.replace(/\[##_list_rep_category_##\]/g, item.category ? item.category[0] : '전체');

                const thumbRegex = /<s_list_rep_thumbnail>([\s\S]*?)<\/s_list_rep_thumbnail>/g;
                itemHtml = itemHtml.replace(thumbRegex, (m, t) => {
                    return t.replace(/\[##_list_rep_thumbnail_##\]/g, 'https://picsum.photos/seed/' + Math.random() + '/600/400');
                });
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
            output = output.replace(/\[##_article_rep_author_##\]/g, first.author ? first.author[0] : 'Manager');
        }

        // [태그 라벨 (글 하단 태그)] — 목 데이터로 여러 태그 생성
        const mockArticleTags = ['JavaScript', 'Python', '알고리즘', '데이터구조', '웹개발', 'CSS', 'React', 'Node.js'];
        const tagLabelRegex = /<s_tag_label>([\s\S]*?)<\/s_tag_label>/g;
        output = output.replace(tagLabelRegex, (match, template) => {
            // RSS 카테고리 + 추가 목 태그로 3~5개 생성
            const tags = [];
            if (items.length > 0 && items[0].category) {
                items[0].category.forEach(c => {
                    c.split('/').forEach(part => tags.push(part.trim()));
                });
            }
            // 추가 태그 랜덤 선택
            const shuffled = mockArticleTags.sort(() => 0.5 - Math.random());
            for (let i = 0; i < 3 && tags.length < 5; i++) {
                if (!tags.includes(shuffled[i])) tags.push(shuffled[i]);
            }
            if (tags.length === 0) return '';
            const tagHtml = tags.map(t =>
                `<a href="${blogUrl}/tag/${encodeURIComponent(t)}">${t}</a>`
            ).join(' ');
            return template.replace(/\[##_tag_label_rep_##\]/g, tagHtml);
        });

        // [태그 클라우드 (s_tag / s_tag_rep)] — 태그 페이지용
        const mockCloudTags = [
            '자료구조', '알고리즘', '파이썬', 'JavaScript', 'CSS', 'HTML',
            'React', 'Node.js', '데이터베이스', 'SQL', 'Git', '리눅스',
            '네트워크', 'Docker', 'API', '웹개발', '프로그래밍', '코딩테스트',
            '운영체제', '컴퓨터구조', '객체지향', '디자인패턴', 'TypeScript',
            '머신러닝', '딥러닝', '클라우드', 'AWS', '보안', '블록체인', '취미'
        ];
        const tagRepRegex = /<s_tag_rep>([\s\S]*?)<\/s_tag_rep>/g;
        output = output.replace(tagRepRegex, (match, template) => {
            return mockCloudTags.map((tag, idx) => {
                let h = template;
                h = h.replace(/\[##_tag_link_##\]/g, `${blogUrl}/tag/${encodeURIComponent(tag)}`);
                h = h.replace(/\[##_tag_name_##\]/g, tag);
                // cloud1(가장 인기)~cloud5(가장 적음) 랜덤 배정
                const cloudLevel = `cloud${Math.floor(Math.random() * 5) + 1}`;
                h = h.replace(/\[##_tag_class_##\]/g, cloudLevel);
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_tag>/g, '');


        // [방문자 카운터]
        output = output.replace(/\[##_count_today_##\]/g, String(Math.floor(Math.random() * 50) + 5));
        output = output.replace(/\[##_count_yesterday_##\]/g, String(Math.floor(Math.random() * 100) + 10));
        output = output.replace(/\[##_count_total_##\]/g, String(Math.floor(Math.random() * 50000) + 1000));

        // [공지 (s_notice)]
        const noticeRepRegex = /<s_notice_rep>([\s\S]*?)<\/s_notice_rep>/g;
        output = output.replace(noticeRepRegex, (match, template) => {
            const notices = [
                { title: '블로그 리뉴얼 안내', date: '2026.01.15', link: `${blogUrl}/notice/1` },
                { title: '새 스킨 적용 완료', date: '2026.02.01', link: `${blogUrl}/notice/2` },
            ];
            return notices.map(n => {
                let h = template;
                h = h.replace(/\[##_notice_rep_title_##\]/g, n.title);
                h = h.replace(/\[##_notice_rep_date_##\]/g, n.date);
                h = h.replace(/\[##_notice_rep_link_##\]/g, n.link);
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_notice>/g, '');

        // [최근 글 (s_rctps)]
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

        // [최근 댓글 (s_rctrp)]
        const rctrpRepRegex = /<s_rctrp_rep>([\s\S]*?)<\/s_rctrp_rep>/g;
        output = output.replace(rctrpRepRegex, (match, template) => {
            const mockComments = items.slice(0, 3).map(item => ({
                name: 'Visitor',
                desc: item.description[0].replace(/<[^>]*>?/gm, '').substring(0, 50) + '...',
                date: new Date(item.pubDate[0]).toLocaleDateString(),
                link: item.link[0] + '#comment',
            }));
            return mockComments.map(c => {
                let h = template;
                h = h.replace(/\[##_rctrp_rep_name_##\]/g, c.name);
                h = h.replace(/\[##_rctrp_rep_desc_##\]/g, c.desc);
                h = h.replace(/\[##_rctrp_rep_date_##\]/g, c.date);
                h = h.replace(/\[##_rctrp_rep_link_##\]/g, c.link);
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_rctrp>/g, '');

        // [캘린더]
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        let calHtml = `<table><caption>« ${monthNames[month]} ${year} »</caption>`;
        calHtml += '<tr><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th></tr><tr>';
        for (let i = 0; i < firstDay; i++) calHtml += '<td></td>';
        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = d === now.getDate();
            calHtml += `<td${isToday ? ' class="cal-today"' : ''}>${d}</td>`;
            if ((firstDay + d) % 7 === 0 && d < daysInMonth) calHtml += '</tr><tr>';
        }
        calHtml += '</tr></table>';
        output = output.replace(/\[##_calendar_##\]/g, calHtml);

        // [아카이브]
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
        // Phase 1: 댓글 & 방명록
        // ═══════════════════════════════════════════════════════

        // [글 댓글 시스템 (s_rp)]
        const mockComments = [
            {
                id: 'comment1', cls: 'rp_general', name: '방문자A',
                logo: '<img src="https://i.pravatar.cc/32?img=1" alt="avatar" width="32" height="32">',
                date: '2026.02.08 14:30', desc: '좋은 글이네요! 정리가 깔끔합니다.', replies: [
                    {
                        id: 'reply1', cls: 'rp_general', name: '블로그주인',
                        logo: '<img src="https://i.pravatar.cc/32?img=10" alt="avatar" width="32" height="32">',
                        date: '2026.02.08 15:00', desc: '감사합니다! 다음에도 좋은 글로 찾아뵙겠습니다.'
                    }
                ]
            },
            {
                id: 'comment2', cls: 'rp_general', name: '개발자B',
                logo: '<img src="https://i.pravatar.cc/32?img=2" alt="avatar" width="32" height="32">',
                date: '2026.02.07 09:15', desc: '공유합니다! 덕분에 많이 배웠어요.', replies: []
            },
            {
                id: 'comment3', cls: 'rp_general', name: '학생C',
                logo: '<img src="https://i.pravatar.cc/32?img=3" alt="avatar" width="32" height="32">',
                date: '2026.02.06 20:45', desc: '혹시 관련 추천 자료가 있을까요?', replies: [
                    {
                        id: 'reply2', cls: 'rp_general', name: '블로그주인',
                        logo: '<img src="https://i.pravatar.cc/32?img=10" alt="avatar" width="32" height="32">',
                        date: '2026.02.06 21:10', desc: '공식 문서를 추천합니다!'
                    }
                ]
            },
            {
                id: 'comment4', cls: 'rp_general', name: '독자D',
                logo: '<img src="https://i.pravatar.cc/32?img=4" alt="avatar" width="32" height="32">',
                date: '2026.02.05 11:30', desc: '매번 좋은 포스팅 감사합니다 👍', replies: []
            },
        ];

        // s_rp2_rep (대댓글) 먼저 처리
        const rp2RepRegex = /<s_rp2_rep>([\s\S]*?)<\/s_rp2_rep>/g;
        // s_rp_rep (댓글) 처리
        const rpRepRegex = /<s_rp_rep>([\s\S]*?)<\/s_rp_rep>/g;
        output = output.replace(rpRepRegex, (match, template) => {
            return mockComments.map(c => {
                let h = template;
                h = h.replace(/\[##_rp_rep_id_##\]/g, c.id);
                h = h.replace(/\[##_rp_rep_class_##\]/g, c.cls);
                h = h.replace(/\[##_rp_rep_name_##\]/g, c.name);
                h = h.replace(/\[##_rp_rep_logo_##\]/g, c.logo);
                h = h.replace(/\[##_rp_rep_date_##\]/g, c.date);
                h = h.replace(/\[##_rp_rep_desc_##\]/g, c.desc);
                h = h.replace(/\[##_rp_rep_link_##\]/g, `#${c.id}`);
                h = h.replace(/\[##_rp_rep_onclick_delete_##\]/g, `alert('삭제 (목 서버)')`);
                h = h.replace(/\[##_rp_rep_onclick_reply_##\]/g, `alert('답글 (목 서버)')`);
                // 대댓글 처리
                h = h.replace(rp2RepRegex, (m2, t2) => {
                    if (c.replies.length === 0) return '';
                    return c.replies.map(r => {
                        let rh = t2;
                        rh = rh.replace(/\[##_rp_rep_id_##\]/g, r.id);
                        rh = rh.replace(/\[##_rp_rep_class_##\]/g, r.cls);
                        rh = rh.replace(/\[##_rp_rep_name_##\]/g, r.name);
                        rh = rh.replace(/\[##_rp_rep_logo_##\]/g, r.logo);
                        rh = rh.replace(/\[##_rp_rep_date_##\]/g, r.date);
                        rh = rh.replace(/\[##_rp_rep_desc_##\]/g, r.desc);
                        rh = rh.replace(/\[##_rp_rep_link_##\]/g, `#${r.id}`);
                        rh = rh.replace(/\[##_rp_rep_onclick_delete_##\]/g, `alert('삭제 (목 서버)')`);
                        rh = rh.replace(/\[##_rp_rep_onclick_reply_##\]/g, `alert('답글 (목 서버)')`);
                        return rh;
                    }).join('');
                });
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_rp_container>/g, '');
        output = output.replace(/<\/?s_rp2_container>/g, '');
        output = output.replace(/<\/?s_rp>/g, '');
        // 기본 댓글 치환자 (서버 렌더링) — 단순 div로 대체
        output = output.replace(/\[##_comment_group_##\]/g, '<div id="tt-comment-area"></div>');

        // [방명록 시스템 (s_guest)]
        const mockGuests = [
            {
                id: 'guest1', cls: 'guest_general', name: '블로그팬',
                logo: '<img src="https://i.pravatar.cc/32?img=5" alt="avatar" width="32" height="32">',
                date: '2026.02.07', desc: '블로그가 정말 멋지네요! 자주 올게요 😊', replies: [
                    {
                        id: 'greply1', cls: 'guest_general', name: '블로그주인',
                        logo: '<img src="https://i.pravatar.cc/32?img=10" alt="avatar" width="32" height="32">',
                        date: '2026.02.07', desc: '방문해주셔서 감사합니다!'
                    }
                ]
            },
            {
                id: 'guest2', cls: 'guest_general', name: '지나가던개발자',
                logo: '<img src="https://i.pravatar.cc/32?img=6" alt="avatar" width="32" height="32">',
                date: '2026.02.05', desc: '좋은 자료 공유 감사합니다. 북마크했습니다!', replies: []
            },
            {
                id: 'guest3', cls: 'guest_general', name: '학습자',
                logo: '<img src="https://i.pravatar.cc/32?img=7" alt="avatar" width="32" height="32">',
                date: '2026.02.03', desc: '항상 유익한 글 잘 읽고 있습니다. 응원합니다!', replies: []
            },
        ];

        const guestReplyRepRegex = /<s_guest_reply_rep>([\s\S]*?)<\/s_guest_reply_rep>/g;
        const guestRepRegex = /<s_guest_rep>([\s\S]*?)<\/s_guest_rep>/g;
        output = output.replace(guestRepRegex, (match, template) => {
            return mockGuests.map(g => {
                let h = template;
                h = h.replace(/\[##_guest_rep_id_##\]/g, g.id);
                h = h.replace(/\[##_guest_rep_class_##\]/g, g.cls);
                h = h.replace(/\[##_guest_rep_name_##\]/g, g.name);
                h = h.replace(/\[##_guest_rep_logo_##\]/g, g.logo);
                h = h.replace(/\[##_guest_rep_date_##\]/g, g.date);
                h = h.replace(/\[##_guest_rep_desc_##\]/g, g.desc);
                h = h.replace(/\[##_guest_rep_onclick_delete_##\]/g, `alert('삭제 (목 서버)')`);
                h = h.replace(/\[##_guest_rep_onclick_reply_##\]/g, `alert('답글 (목 서버)')`);
                // 방명록 답글 처리
                h = h.replace(guestReplyRepRegex, (m2, t2) => {
                    if (g.replies.length === 0) return '';
                    return g.replies.map(r => {
                        let rh = t2;
                        rh = rh.replace(/\[##_guest_rep_id_##\]/g, r.id);
                        rh = rh.replace(/\[##_guest_rep_class_##\]/g, r.cls);
                        rh = rh.replace(/\[##_guest_rep_name_##\]/g, r.name);
                        rh = rh.replace(/\[##_guest_rep_logo_##\]/g, r.logo);
                        rh = rh.replace(/\[##_guest_rep_date_##\]/g, r.date);
                        rh = rh.replace(/\[##_guest_rep_desc_##\]/g, r.desc);
                        rh = rh.replace(/\[##_guest_rep_onclick_delete_##\]/g, `alert('삭제 (목 서버)')`);
                        rh = rh.replace(/\[##_guest_rep_onclick_reply_##\]/g, `alert('답글 (목 서버)')`);
                        return rh;
                    }).join('');
                });
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_guest_container>/g, '');
        output = output.replace(/<\/?s_guest_reply_container>/g, '');
        output = output.replace(/<\/?s_guest>/g, '');

        // [댓글/방명록 입력 폼]
        const formMappings = {
            '\\[##_rp_input_name_##\\]': 'name',
            '\\[##_rp_input_password_##\\]': 'password',
            '\\[##_rp_input_homepage_##\\]': 'homepage',
            '\\[##_rp_textarea_body_##\\]': 'body',
            '\\[##_rp_input_is_secret_##\\]': 'secret',
            '\\[##_rp_onclick_submit_##\\]': "alert('댓글 등록 (목 서버)')",
            '\\[##_rp_cnt_##\\]': String(mockComments.length),
            '\\[##_guest_input_name_##\\]': 'name',
            '\\[##_guest_input_password_##\\]': 'password',
            '\\[##_guest_input_homepage_##\\]': 'homepage',
            '\\[##_guest_textarea_body_##\\]': 'body',
            '\\[##_guest_onclick_submit_##\\]': "alert('방명록 등록 (목 서버)')",
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
        output = output.replace(/\[##_article_rep_rp_cnt_##\]/g, String(mockComments.length));
        output = output.replace(/\[##_article_rep_rp_link_##\]/g, '#tt-comment-area');

        // ═══════════════════════════════════════════════════════
        // Phase 2: 페이징 & 이전/다음 글 & 관련 글
        // ═══════════════════════════════════════════════════════

        // [페이지 네비게이션 (s_paging)]
        const pagingRepRegex = /<s_paging_rep>([\s\S]*?)<\/s_paging_rep>/g;
        output = output.replace(pagingRepRegex, (match, template) => {
            return [1, 2, 3, 4, 5].map(num => {
                let h = template;
                const isCurrent = num === 1;
                h = h.replace(/\[##_paging_rep_link_##\]/g, isCurrent ? '' : `href="${blogUrl}/page/${num}"`);
                h = h.replace(/\[##_paging_rep_link_num_##\]/g, String(num));
                return h;
            }).join('');
        });
        output = output.replace(/\[##_prev_page_##\]/g, `href="${blogUrl}"`);
        output = output.replace(/\[##_next_page_##\]/g, `href="${blogUrl}/page/2"`);
        output = output.replace(/\[##_no_more_prev_##\]/g, 'no-more-prev');
        output = output.replace(/\[##_no_more_next_##\]/g, '');
        output = output.replace(/<\/?s_paging>/g, '');

        // [이전 글 / 다음 글]
        if (items.length > 1) {
            const prevItem = items[1];
            output = output.replace(/\[##_article_prev_link_##\]/g, prevItem.link[0]);
            output = output.replace(/\[##_article_prev_title_##\]/g, prevItem.title[0]);
            output = output.replace(/\[##_article_prev_date_##\]/g, new Date(prevItem.pubDate[0]).toLocaleDateString());
            output = output.replace(/\[##_article_prev_type_##\]/g, 'thumb_type');
            output = output.replace(/\[##_article_prev_thumbnail_link_##\]/g, `https://picsum.photos/seed/prev/150/100`);
        }
        if (items.length > 2) {
            const nextItem = items[2];
            output = output.replace(/\[##_article_next_link_##\]/g, nextItem.link[0]);
            output = output.replace(/\[##_article_next_title_##\]/g, nextItem.title[0]);
            output = output.replace(/\[##_article_next_date_##\]/g, new Date(nextItem.pubDate[0]).toLocaleDateString());
            output = output.replace(/\[##_article_next_type_##\]/g, 'thumb_type');
            output = output.replace(/\[##_article_next_thumbnail_link_##\]/g, `https://picsum.photos/seed/next/150/100`);
        }
        output = output.replace(/<\/?s_article_prev>/g, '');
        output = output.replace(/<\/?s_article_next>/g, '');
        output = output.replace(/<\/?s_article_prev_thumbnail>/g, '');
        output = output.replace(/<\/?s_article_next_thumbnail>/g, '');

        // [카테고리 관련 글 (s_article_related)]
        const relatedRepRegex = /<s_article_related_rep>([\s\S]*?)<\/s_article_related_rep>/g;
        output = output.replace(relatedRepRegex, (match, template) => {
            const relatedItems = items.slice(1, 6);
            return relatedItems.map((item, idx) => {
                let h = template;
                h = h.replace(/\[##_article_related_rep_link_##\]/g, item.link[0]);
                h = h.replace(/\[##_article_related_rep_title_##\]/g, item.title[0]);
                h = h.replace(/\[##_article_related_rep_date_##\]/g, new Date(item.pubDate[0]).toLocaleDateString());
                h = h.replace(/\[##_article_related_rep_type_##\]/g, 'thumb_type');
                h = h.replace(/\[##_article_related_rep_thumbnail_link_##\]/g, `https://picsum.photos/seed/rel${idx}/150/100`);
                return h;
            }).join('');
        });
        output = output.replace(/<\/?s_article_related>/g, '');
        output = output.replace(/<\/?s_article_related_rep_thumbnail>/g, '');
        output = output.replace(/\[##_article_rep_category_link_##\]/g, items.length > 0 && items[0].category ? `${blogUrl}/category/${encodeURIComponent(items[0].category[0])}` : blogUrl);

        // [나머지 치환자 정제 — 빈 문자열로 대체]
        output = output.replace(/\[##_.*?_##\]/g, '');
        output = output.replace(/<s_.*?>|<\/s_.*?>/g, '');

        return output;
    } catch (err) {
        console.error('Hydrate Error:', err.message);
        return html + `<div style="background:red; color:white; padding:10px;">RSS 로드 실패: ${blogId}</div>`;
    }
}
