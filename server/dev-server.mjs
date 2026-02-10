import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractBlogId, hydrate } from './engine.mjs';
import dotenv from 'dotenv';

// .env 파일 로드 (프로젝트 루트 기준)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const SRC = path.join(ROOT, 'src');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_TARGET = process.env.TARGET_BLOG_URL || 'notice';

// src 폴더의 에셋들 서빙
app.use('/style.css', express.static(path.join(SRC, 'style.css')));
app.use('/script.js', express.static(path.join(SRC, 'script.js')));
app.use('/images', express.static(path.join(SRC, 'images')));

app.get('/', async (req, res) => {
    // 쿼리 파라미터 'target'이 있으면 우선 사용, 없으면 .env의 DEFAULT_TARGET 사용
    const target = req.query.target || DEFAULT_TARGET;
    const blogUrl = extractBlogId(target);
    const mockEnabled = req.query.mock !== 'off';

    try {
        const skinHtml = await fs.readFile(path.join(SRC, 'skin.html'), 'utf-8');
        let processedHtml = mockEnabled
            ? await hydrate(skinHtml, blogUrl, req.query.page || 'index')
            : skinHtml;

        // 로컬 프리뷰: 블로그 URL → localhost URL로 변환 (탭 네비게이션이 로컬에서 동작하도록)
        if (mockEnabled) {
            const localBase = `http://localhost:${PORT}`;
            const targetParam = `?target=${encodeURIComponent(blogUrl)}`;
            const esc = blogUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // RegExp escape
            // href="blogUrl/guestbook" → "localhost:PORT/?target=blogUrl" (프리뷰에서는 같은 페이지)
            processedHtml = processedHtml
                .replace(new RegExp(`href="${esc}/guestbook"`, 'g'), `href="${localBase}/${targetParam}&page=guestbook"`)
                .replace(new RegExp(`href="${esc}/tag"`, 'g'), `href="${localBase}/${targetParam}&page=tag"`)
                .replace(new RegExp(`href="${esc}/rss"`, 'g'), `href="${blogUrl}/rss"`)
                .replace(new RegExp(`href="${esc}"`, 'g'), `href="${localBase}/${targetParam}"`)
                .replace(new RegExp(`href='${esc}'`, 'g'), `href='${localBase}/${targetParam}'`);
        }

        const controlToolbar = `
            <style>
                #dev-toolbar {
                    position: fixed; bottom: 0; left: 0; width: 100%;
                    z-index: 99999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    transition: transform 0.3s ease;
                }
                #dev-toolbar.hidden { transform: translateY(100%); }
                #dev-toolbar-inner {
                    background: rgba(13,17,23,0.95); backdrop-filter: blur(8px);
                    color: #e6edf3; padding: 10px 16px;
                    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
                    border-top: 1px solid #30363d;
                }
                #dev-toolbar-inner strong { color: #58a6ff; font-size: 13px; white-space: nowrap; }
                #dev-toolbar-inner small { color: #8b949e; font-size: 11px; white-space: nowrap; }
                #dev-toolbar-inner form { margin: 0; flex: 1; display: flex; gap: 6px; min-width: 200px; }
                #dev-toolbar-inner input[type="text"] {
                    flex: 1; padding: 5px 10px; border-radius: 6px; border: 1px solid #30363d;
                    background: #0d1117; color: #e6edf3; font-size: 13px; outline: none;
                }
                #dev-toolbar-inner input[type="text"]:focus { border-color: #58a6ff; box-shadow: 0 0 0 2px rgba(88,166,255,0.3); }
                .tb-btn {
                    padding: 5px 14px; cursor: pointer; border: 1px solid #30363d; border-radius: 6px;
                    font-size: 12px; font-weight: 600; white-space: nowrap; transition: all 0.15s;
                }
                .tb-btn-primary { background: #238636; color: #fff; border-color: #238636; }
                .tb-btn-primary:hover { background: #2ea043; }
                .tb-btn-toggle { background: #21262d; color: #e6edf3; }
                .tb-btn-toggle:hover { background: #30363d; }
                .tb-btn-toggle.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
                #dev-toolbar-tab {
                    position: fixed; bottom: 0; right: 20px; z-index: 99998;
                    background: rgba(13,17,23,0.9); color: #8b949e; border: 1px solid #30363d;
                    border-bottom: none; border-radius: 6px 6px 0 0;
                    padding: 4px 12px; cursor: pointer; font-size: 11px; font-weight: 600;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    transition: all 0.15s;
                }
                #dev-toolbar-tab:hover { color: #e6edf3; background: rgba(13,17,23,1); }
                #dev-toolbar.hidden ~ #dev-toolbar-tab { bottom: 0; }
                #dev-toolbar:not(.hidden) ~ #dev-toolbar-tab { bottom: 47px; }
            </style>
            <div id="dev-toolbar" class="">
                <div id="dev-toolbar-inner">
                    <strong>🛠 Preview</strong>
                    <form action="/" method="GET" id="toolbar-form">
                        <input type="text" name="target" value="${target}" placeholder="Blog URL or ID...">
                        <input type="hidden" name="mock" value="${mockEnabled ? 'on' : 'off'}" id="mock-hidden">
                        <button type="submit" class="tb-btn tb-btn-primary">Apply</button>
                    </form>
                    <button class="tb-btn tb-btn-toggle ${mockEnabled ? 'active' : ''}" onclick="toggleMock()" title="Toggle mock data hydration">
                        ${mockEnabled ? '📦 Mock ON' : '📄 Mock OFF'}
                    </button>
                    <small>src/skin.html → ${blogUrl}</small>
                </div>
            </div>
            <button id="dev-toolbar-tab" onclick="toggleToolbar()">▼ DevTools</button>
            <script>
                // Toolbar show/hide
                (function() {
                    var saved = localStorage.getItem('devToolbarHidden');
                    var tb = null, tab = null;
                    function applyState() {
                        tb = document.getElementById('dev-toolbar');
                        tab = document.getElementById('dev-toolbar-tab');
                        if (!tb || !tab) return;
                        if (saved === 'true') {
                            tb.classList.add('hidden');
                            tab.textContent = '▲ DevTools';
                            tab.style.bottom = '0';
                        } else {
                            tb.classList.remove('hidden');
                            tab.textContent = '▼ DevTools';
                        }
                    }
                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', applyState);
                    } else {
                        applyState();
                    }
                })();

                function toggleToolbar() {
                    var tb = document.getElementById('dev-toolbar');
                    var tab = document.getElementById('dev-toolbar-tab');
                    var isHidden = tb.classList.toggle('hidden');
                    localStorage.setItem('devToolbarHidden', isHidden);
                    tab.textContent = isHidden ? '▲ DevTools' : '▼ DevTools';
                    tab.style.bottom = isHidden ? '0' : '';
                }

                function toggleMock() {
                    var url = new URL(window.location);
                    var current = url.searchParams.get('mock');
                    url.searchParams.set('mock', current === 'off' ? 'on' : 'off');
                    window.location.href = url.toString();
                }
            </script>
        `;

        res.send(processedHtml + controlToolbar);
    } catch (err) {
        res.status(500).send('Skin file not found in /src directory.');
    }
});

app.listen(PORT, () => {
    console.log(`
╔═════════════════════════════════════════════════════════════════╗
║  TISTORY SKIN MOCK SERVER (ROOT REFACTORED)                     ║
╟─────────────────────────────────────────────────────────────────╢
║  - Skin Site: http://localhost:${PORT}                           ║
║  - Watching:  /src/skin.html                                    ║
╟─────────────────────────────────────────────────────────────────╢
║  [Environment Settings]                                         ║
║  - Default Target: ${DEFAULT_TARGET} (.env)                      ║
║  - Port:           ${PORT} (.env)                                ║
╟─────────────────────────────────────────────────────────────────╢
║  [Test with Custom Blog]                                        ║
║  URL: http://localhost:${PORT}?target=https://keinn51.tistory.com/ ║
╚═════════════════════════════════════════════════════════════════╝
    `);
});
