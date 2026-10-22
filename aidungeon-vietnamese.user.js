// ==UserScript==
// @name         AI Dungeon Tiếng Việt - VietDungeon Assistant
// @namespace    https://github.com/nhoxboo/aidungeon-vietnamese
// @version      1.0.0
// @description  Chơi AI Dungeon hoàn toàn bằng tiếng Việt: Tự động dịch cốt truyện 2 chiều (Anh -> Việt, Việt -> Anh khi nhập lệnh), hỗ trợ Song ngữ / Thuần Việt, dịch thẻ kịch bản và bảng điều khiển trực quan.
// @author       Beso & Anh Nam
// @match        https://play.aidungeon.com/*
// @match        https://*.aidungeon.com/*
// @icon         https://play.aidungeon.com/favicon.ico
// @updateURL    https://raw.githubusercontent.com/nhoxboo/aidungeon-vietnamese/main/aidungeon-vietnamese.user.js
// @downloadURL  https://raw.githubusercontent.com/nhoxboo/aidungeon-vietnamese/main/aidungeon-vietnamese.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      translate.googleapis.com
// @connect      api.openai.com
// @connect      generativelanguage.googleapis.com
// @connect      api.groq.com
// @connect      api.deepseek.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    console.log('[VietDungeon] Khởi chạy trợ lý Tiếng Việt cho AI Dungeon...');

    // =========================================================================
    // 1. CẤU HÌNH & LƯU TRỮ TRẠNG THÁI (CONFIG & STATE)
    // =========================================================================
    const DEFAULT_CONFIG = {
        autoTranslateStory: true,      // Tự động dịch diễn biến cốt truyện
        displayMode: 'bilingual',      // 'bilingual' (song ngữ), 'vi_only' (chỉ tiếng Việt), 'original' (gốc)
        inputHelperEnabled: true,      // Hỗ trợ dịch ngược khi gõ tiếng Việt vào ô lệnh
        engine: 'google',              // 'google' | 'ai_custom'
        aiProvider: 'gemini',          // 'gemini' | 'openai' | 'groq' | 'deepseek'
        aiApiKey: '',
        aiModel: 'gemini-1.5-flash',
        fontSizeVi: 16,                // Cỡ chữ tiếng Việt
        fontColorVi: '#38bdf8',        // Màu chữ bản dịch tiếng Việt (#38bdf8: Sky Blue)
        hudPosition: { top: 120, right: 24 }
    };

    let cfg = { ...DEFAULT_CONFIG };
    try {
        const saved = (typeof GM_getValue === 'function') ? GM_getValue('vietdungeon_cfg') : localStorage.getItem('vietdungeon_cfg');
        if (saved) {
            const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
            cfg = { ...DEFAULT_CONFIG, ...parsed };
        }
    } catch (e) {
        console.warn('[VietDungeon] Không thể tải config cũ, dùng mặc định:', e);
    }

    function saveConfig() {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue('vietdungeon_cfg', cfg);
            } else {
                localStorage.setItem('vietdungeon_cfg', JSON.stringify(cfg));
            }
        } catch (e) {
            console.error('[VietDungeon] Lưu config thất bại:', e);
        }
    }

    // Cache dịch thuật bộ nhớ tạm tránh gọi API trùng lặp
    const translationCache = new Map();

    // =========================================================================
    // 2. BỘ ENGINE DỊCH THUẬT (TRANSLATION ENGINES)
    // =========================================================================

    // Dịch qua Google Translate miễn phí (Cực nhanh, ổn định)
    function translateGoogle(text, sl = 'auto', tl = 'vi') {
        return new Promise((resolve, reject) => {
            if (!text || !text.trim()) return resolve('');
            const cleanText = text.trim();
            const cacheKey = `${sl}_${tl}_${cleanText}`;
            if (translationCache.has(cacheKey)) {
                return resolve(translationCache.get(cacheKey));
            }

            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(cleanText)}`;

            const executeRequest = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : null;

            if (executeRequest) {
                executeRequest({
                    method: 'GET',
                    url: url,
                    onload: function (resp) {
                        try {
                            const data = JSON.parse(resp.responseText);
                            const translated = data[0].map(item => item[0]).filter(Boolean).join('');
                            translationCache.set(cacheKey, translated);
                            resolve(translated);
                        } catch (err) {
                            reject(err);
                        }
                    },
                    onerror: function (err) {
                        reject(err);
                    }
                });
            } else {
                fetch(url)
                    .then(res => res.json())
                    .then(data => {
                        const translated = data[0].map(item => item[0]).filter(Boolean).join('');
                        translationCache.set(cacheKey, translated);
                        resolve(translated);
                    })
                    .catch(reject);
            }
        });
    }

    // Dịch qua AI LLM tùy chọn (Gemini / OpenAI / Groq / DeepSeek) cho văn phong văn học kiếm hiệp / RPG
    async function translateAI(text, direction = 'en_to_vi') {
        if (!cfg.aiApiKey) {
            return translateGoogle(text, direction === 'en_to_vi' ? 'en' : 'vi', direction === 'en_to_vi' ? 'vi' : 'en');
        }

        const systemPrompt = direction === 'en_to_vi'
            ? 'Bạn là một dịch giả tiểu thuyết phiêu lưu giả tưởng và RPG xuất sắc. Hãy dịch đoạn văn sau từ tiếng Anh sang tiếng Việt một cách tự nhiên, hấp dẫn, đúng ngữ cảnh văn học nhập vai kỳ ảo. Chỉ trả về kết quả dịch, không kèm lời giải thích.'
            : 'You are an expert interactive fiction and RPG writer. Translate the following Vietnamese player action/speech/story input into natural, immersive English tailored for AI Dungeon text generation. Keep it punchy and clear. Return ONLY the translation.';

        try {
            if (cfg.aiProvider === 'gemini') {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.aiModel || 'gemini-1.5-flash'}:generateContent?key=${cfg.aiApiKey}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            role: 'user',
                            parts: [{ text: `${systemPrompt}\n\nNội dung cần dịch:\n${text}` }]
                        }]
                    })
                });
                const data = await res.json();
                const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                return result || translateGoogle(text, 'en', 'vi');
            } else {
                // OpenAI / DeepSeek / Groq compatible
                let endpoint = 'https://api.openai.com/v1/chat/completions';
                if (cfg.aiProvider === 'groq') endpoint = 'https://api.groq.com/openai/v1/chat/completions';
                if (cfg.aiProvider === 'deepseek') endpoint = 'https://api.deepseek.com/chat/completions';

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${cfg.aiApiKey}`
                    },
                    body: JSON.stringify({
                        model: cfg.aiModel || (cfg.aiProvider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'),
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: text }
                        ],
                        temperature: 0.3
                    })
                });
                const data = await res.json();
                return data?.choices?.[0]?.message?.content?.trim() || translateGoogle(text, 'en', 'vi');
            }
        } catch (e) {
            console.warn('[VietDungeon] Lỗi dịch AI, fallback sang Google Translate:', e);
            return translateGoogle(text, direction === 'en_to_vi' ? 'en' : 'vi', direction === 'en_to_vi' ? 'vi' : 'en');
        }
    }

    // Hàm gọi dịch thống nhất theo cấu hình
    function translate(text, direction = 'en_to_vi') {
        if (cfg.engine === 'ai_custom' && cfg.aiApiKey) {
            return translateAI(text, direction);
        }
        return translateGoogle(text, direction === 'en_to_vi' ? 'en' : 'vi', direction === 'en_to_vi' ? 'vi' : 'en');
    }

    // =========================================================================
    // 3. XỬ LÝ DỊCH CỐT TRUYỆN GAMEPLAY (STORY DOM SCANNER & TRANSLATOR)
    // =========================================================================

    // Kiểm tra xem chuỗi có nhiều hơn 3 từ và có chữ cái tiếng Anh không
    function isValidStoryText(text) {
        if (!text || text.trim().length < 8) return false;
        const trimmed = text.trim();
        // Bỏ qua các nhãn UI hệ thống ngắn
        if (/^(You|Undo|Redo|Retry|Erase|Take a turn|Action input|Continue)$/i.test(trimmed)) return false;
        // Kiểm tra có ký tự chữ cái
        return /[a-zA-Z]{3,}/.test(trimmed);
    }

    async function processStoryParagraph(el) {
        // Tránh can thiệp vào chính bản dịch hoặc các thành phần của script
        if (el.closest('.vietdungeon-ignore') || el.classList.contains('vietdungeon-translated')) return;

        // Tránh can thiệp nếu element đã được gắn bản dịch
        if (el.dataset.vdStatus === 'translated' || el.dataset.vdStatus === 'translating') return;

        // Kiểm tra nội dung text thuần của element
        // Lấy text trực tiếp
        const originalText = el.textContent?.trim();
        if (!isValidStoryText(originalText)) return;

        // Đánh dấu đang xử lý
        el.dataset.vdStatus = 'translating';

        try {
            const translatedText = await translate(originalText, 'en_to_vi');
            if (!translatedText || translatedText.trim() === originalText) {
                el.dataset.vdStatus = 'skipped';
                return;
            }

            el.dataset.vdStatus = 'translated';
            el.dataset.vdOriginal = originalText;

            // Tạo container hiển thị bản dịch tiếng Việt
            let viBox = el.nextElementSibling;
            if (!viBox || !viBox.classList.contains('vietdungeon-vi-box')) {
                viBox = document.createElement('div');
                viBox.className = 'vietdungeon-vi-box vietdungeon-ignore';
                el.parentNode.insertBefore(viBox, el.nextSibling);
            }

            viBox.innerHTML = `
                <div class="vd-vi-content">
                    <span class="vd-vi-badge">🇻🇳 VI</span>
                    <span class="vd-vi-text">${escapeHtml(translatedText)}</span>
                </div>
            `;

            updateDisplayModeForElement(el, viBox);
        } catch (err) {
            console.error('[VietDungeon] Lỗi dịch đoạn story:', err);
            el.dataset.vdStatus = 'error';
        }
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function updateDisplayModeForElement(origEl, viBox) {
        if (!viBox) return;
        if (cfg.displayMode === 'original') {
            viBox.style.display = 'none';
            origEl.style.display = '';
            origEl.style.opacity = '1';
        } else if (cfg.displayMode === 'vi_only') {
            viBox.style.display = 'block';
            origEl.style.display = 'none';
        } else {
            // Bilingual
            viBox.style.display = 'block';
            origEl.style.display = '';
            origEl.style.opacity = '0.7';
            origEl.style.fontSize = '0.92em';
        }
    }

    function refreshAllDisplayModes() {
        const translatedEls = document.querySelectorAll('[data-vd-status="translated"]');
        translatedEls.forEach(origEl => {
            const viBox = origEl.nextElementSibling;
            if (viBox && viBox.classList.contains('vietdungeon-vi-box')) {
                updateDisplayModeForElement(origEl, viBox);
            }
        });
    }

    // Quét toàn bộ các đoạn văn bản trong vùng Story
    function scanAndTranslateStory() {
        if (!cfg.autoTranslateStory) return;

        // Vùng chứa cốt truyện của AI Dungeon
        const storyRegion = document.querySelector('#gameplay-story-scrollview') ||
            document.querySelector('[aria-label="Story"]') ||
            document.querySelector('div[role="region"]') ||
            document.body;

        if (!storyRegion) return;

        // Tìm tất cả các thẻ p hoặc các div chứa text thuần của câu chuyện
        const candidates = storyRegion.querySelectorAll('p, div[style*="font"], span[style*="font"], [class*="text-"]');
        candidates.forEach(el => {
            // Chỉ xử lý các leaf element hoặc element có text trực tiếp không lồng quá nhiều thẻ con
            if (el.children.length === 0 || (el.children.length === 1 && el.children[0].tagName === 'SPAN')) {
                processStoryParagraph(el);
            }
        });
    }

    // =========================================================================
    // 4. BỘ HỖ TRỢ NHẬP LIỆU TIẾNG VIỆT (VIETNAMESE INPUT HELPER)
    // =========================================================================

    // Native setter để ép React re-render nhận giá trị mới trong input/textarea
    function setNativeValue(element, value) {
        const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
        const prototype = Object.getPrototypeOf(element);
        const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
            valueSetter.call(element, value);
        } else {
            element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    let inputHelperAttached = false;
    let debounceTranslateTimer = null;

    function attachInputHelper() {
        if (!cfg.inputHelperEnabled) return;

        const textarea = document.querySelector('#game-text-input') ||
            document.querySelector('textarea[placeholder*="happens"]') ||
            document.querySelector('[aria-label="Action input"]');

        if (!textarea) return;
        if (textarea.dataset.vdHelperAttached === 'true') return;

        textarea.dataset.vdHelperAttached = 'true';
        inputHelperAttached = true;

        // Tạo thanh hỗ trợ Tiếng Việt gắn ngay trên hoặc dưới ô textarea
        const container = textarea.closest('form') || textarea.parentElement;
        if (!container) return;

        let helperBar = document.getElementById('vietdungeon-input-bar');
        if (!helperBar) {
            helperBar = document.createElement('div');
            helperBar.id = 'vietdungeon-input-bar';
            helperBar.className = 'vietdungeon-ignore';
            helperBar.innerHTML = `
                <div class="vd-input-wrap">
                    <div class="vd-input-header">
                        <span class="vd-input-tag">⚡ VIETDUNGEON INPUT</span>
                        <span id="vd-input-mode-label" class="vd-mode-badge">Tự động dịch Việt ➔ Anh</span>
                        <div class="vd-action-shortcuts">
                            <button type="button" class="vd-btn-tag" data-prefix="Do: ">Hành động (Do)</button>
                            <button type="button" class="vd-btn-tag" data-prefix="Say: ">Nói (Say)</button>
                            <button type="button" class="vd-btn-tag" data-prefix="Story: ">Kể tiếp (Story)</button>
                        </div>
                    </div>
                    <div class="vd-preview-area" id="vd-preview-box" style="display: none;">
                        <span class="vd-preview-label">Dịch sẵn sang tiếng Anh:</span>
                        <div class="vd-preview-text" id="vd-preview-en">...</div>
                        <button type="button" id="vd-btn-apply-en" class="vd-btn-apply">Nạp vào game</button>
                    </div>
                </div>
            `;
            container.parentNode.insertBefore(helperBar, container);

            // Gắn event cho các nút Do/Say/Story nhanh
            helperBar.querySelectorAll('.vd-btn-tag').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const prefix = btn.dataset.prefix;
                    if (prefix && textarea) {
                        textarea.focus();
                        if (!textarea.value.startsWith(prefix)) {
                            setNativeValue(textarea, prefix + textarea.value.replace(/^(Do|Say|Story):\s*/i, ''));
                        }
                    }
                });
            });

            const applyBtn = helperBar.querySelector('#vd-btn-apply-en');
            if (applyBtn) {
                applyBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const enText = document.getElementById('vd-preview-en')?.textContent;
                    if (enText && enText !== '...' && textarea) {
                        setNativeValue(textarea, enText);
                        document.getElementById('vd-preview-box').style.display = 'none';
                        textarea.focus();
                    }
                });
            }
        }

        // Lắng nghe khi người chơi gõ vào textarea
        textarea.addEventListener('input', () => {
            const val = textarea.value.trim();
            const previewBox = document.getElementById('vd-preview-box');
            const previewText = document.getElementById('vd-preview-en');

            if (!val || !/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(val)) {
                if (previewBox) previewBox.style.display = 'none';
                return;
            }

            // Có chứa tiếng Việt -> Live preview dịch sang tiếng Anh
            clearTimeout(debounceTranslateTimer);
            debounceTranslateTimer = setTimeout(async () => {
                try {
                    const en = await translate(val, 'vi_to_en');
                    if (previewBox && previewText) {
                        previewText.textContent = en;
                        previewBox.style.display = 'flex';
                    }
                } catch (e) {
                    console.error('[VietDungeon] Lỗi preview dịch:', e);
                }
            }, 450);
        });

        // Bắt sự kiện nhấn Enter trong textarea: nếu có tiếng Việt, tự động dịch sang Anh rồi mới Submit
        textarea.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const val = textarea.value.trim();
                // Nếu nội dung có dấu tiếng Việt
                if (val && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(val)) {
                    e.preventDefault();
                    e.stopPropagation();

                    const previewBox = document.getElementById('vd-preview-box');
                    const previewText = document.getElementById('vd-preview-en');
                    if (previewText) previewText.textContent = 'Đang dịch sang tiếng Anh...';
                    if (previewBox) previewBox.style.display = 'flex';

                    try {
                        const en = await translate(val, 'vi_to_en');
                        setNativeValue(textarea, en);
                        if (previewBox) previewBox.style.display = 'none';

                        // Kích hoạt nút submit của game
                        setTimeout(() => {
                            const submitBtn = document.querySelector('button[aria-label="Submit action"]') ||
                                document.querySelector('button[type="submit"]') ||
                                textarea.form?.querySelector('button');
                            if (submitBtn) {
                                submitBtn.click();
                            } else {
                                // Gửi phím Enter giả lập sau khi đã thay text tiếng Anh
                                textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                            }
                        }, 50);
                    } catch (err) {
                        console.error('[VietDungeon] Lỗi dịch khi submit:', err);
                        // Fallback gửi nguyên văn nếu lỗi mạng
                        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                    }
                }
            }
        }, true);
    }

    // =========================================================================
    // 5. GIAO DIỆN BẢNG ĐIỀU KHIỂN HUD (WHITE-BLUE MODERN UI)
    // =========================================================================
    function createHUD() {
        if (document.getElementById('vietdungeon-hud-root')) return;

        const hudRoot = document.createElement('div');
        hudRoot.id = 'vietdungeon-hud-root';
        hudRoot.className = 'vietdungeon-ignore';

        hudRoot.innerHTML = `
            <!-- Nút biểu tượng mở nhanh -->
            <button id="vd-toggle-btn" title="AI Dungeon Tiếng Việt">
                <span class="vd-icon">🇻🇳</span>
                <span class="vd-badge">VN</span>
            </button>

            <!-- Khung Modal Cài Đặt & Trạng Thái -->
            <div id="vd-panel" class="vd-panel-hidden">
                <div class="vd-panel-header">
                    <div class="vd-header-title">
                        <span class="vd-title-icon">⚔️</span>
                        <div>
                            <h4>AI Dungeon Tiếng Việt</h4>
                            <span class="vd-version">v1.0.0 • by Beso & Anh Nam</span>
                        </div>
                    </div>
                    <button id="vd-panel-close" class="vd-close-btn">&times;</button>
                </div>

                <div class="vd-panel-body">
                    <!-- Nhóm 1: Chế độ hiển thị cốt truyện -->
                    <div class="vd-setting-group">
                        <label class="vd-group-label">Chế độ hiển thị cốt truyện</label>
                        <div class="vd-radio-grid">
                            <label class="vd-radio-card ${cfg.displayMode === 'bilingual' ? 'active' : ''}">
                                <input type="radio" name="vd-display" value="bilingual" ${cfg.displayMode === 'bilingual' ? 'checked' : ''}>
                                <div class="vd-card-title">📖 Song ngữ</div>
                                <div class="vd-card-desc">Hiện cả tiếng Anh gốc mờ + Tiếng Việt rõ ràng</div>
                            </label>
                            <label class="vd-radio-card ${cfg.displayMode === 'vi_only' ? 'active' : ''}">
                                <input type="radio" name="vd-display" value="vi_only" ${cfg.displayMode === 'vi_only' ? 'checked' : ''}>
                                <div class="vd-card-title">🇻🇳 Thuần Việt</div>
                                <div class="vd-card-desc">Ẩn tiếng Anh, trải nghiệm như đọc truyện Việt</div>
                            </label>
                            <label class="vd-radio-card ${cfg.displayMode === 'original' ? 'active' : ''}">
                                <input type="radio" name="vd-display" value="original" ${cfg.displayMode === 'original' ? 'checked' : ''}>
                                <div class="vd-card-title">🇺🇸 Gốc (EN)</div>
                                <div class="vd-card-desc">Giữ nguyên văn bản gốc của game</div>
                            </label>
                        </div>
                    </div>

                    <!-- Nhóm 2: Tự động hóa & Nhập liệu -->
                    <div class="vd-setting-group">
                        <label class="vd-group-label">Tính năng thông minh</label>
                        <div class="vd-switch-row">
                            <div class="vd-switch-info">
                                <span class="vd-switch-title">Tự động dịch cốt truyện AI</span>
                                <span class="vd-switch-desc">Dịch tức thì khi AI viết tiếp diễn biến mới</span>
                            </div>
                            <label class="vd-switch">
                                <input type="checkbox" id="vd-toggle-auto" ${cfg.autoTranslateStory ? 'checked' : ''}>
                                <span class="vd-slider"></span>
                            </label>
                        </div>

                        <div class="vd-switch-row">
                            <div class="vd-switch-info">
                                <span class="vd-switch-title">Dịch & Gửi Action tiếng Việt</span>
                                <span class="vd-switch-desc">Gõ tiếng Việt ở ô lệnh, tự chuyển sang tiếng Anh RPG khi Enter</span>
                            </div>
                            <label class="vd-switch">
                                <input type="checkbox" id="vd-toggle-input" ${cfg.inputHelperEnabled ? 'checked' : ''}>
                                <span class="vd-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Nhóm 3: Engine dịch thuật -->
                    <div class="vd-setting-group">
                        <label class="vd-group-label">Máy chủ dịch (Translation Engine)</label>
                        <select id="vd-engine-select" class="vd-select">
                            <option value="google" ${cfg.engine === 'google' ? 'selected' : ''}>⚡ Google Translate (Miễn phí, Không cần Key, Tốc độ cao)</option>
                            <option value="ai_custom" ${cfg.engine === 'ai_custom' ? 'selected' : ''}>🤖 AI LLM Translation (Văn phong kiếm hiệp / RPG mượt mà)</option>
                        </select>

                        <!-- Box cấu hình AI khi chọn AI Custom -->
                        <div id="vd-ai-config-box" style="display: ${cfg.engine === 'ai_custom' ? 'block' : 'none'}; margin-top: 10px;">
                            <div class="vd-field">
                                <label>Nhà cung cấp AI:</label>
                                <select id="vd-ai-provider" class="vd-select">
                                    <option value="gemini" ${cfg.aiProvider === 'gemini' ? 'selected' : ''}>Google Gemini (Khuyên dùng - Nhanh & Mượt)</option>
                                    <option value="groq" ${cfg.aiProvider === 'groq' ? 'selected' : ''}>Groq (Llama-3.3)</option>
                                    <option value="deepseek" ${cfg.aiProvider === 'deepseek' ? 'selected' : ''}>DeepSeek Chat</option>
                                    <option value="openai" ${cfg.aiProvider === 'openai' ? 'selected' : ''}>OpenAI (GPT-4o-mini)</option>
                                </select>
                            </div>
                            <div class="vd-field">
                                <label>API Key:</label>
                                <input type="password" id="vd-ai-key" class="vd-input" placeholder="Dán API Key vào đây..." value="${cfg.aiApiKey || ''}">
                            </div>
                        </div>
                    </div>

                    <!-- Nút thao tác nhanh -->
                    <div class="vd-actions-row">
                        <button type="button" id="vd-btn-retranslate" class="vd-btn-primary">🔄 Dịch lại toàn bộ màn hình</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(hudRoot);
        injectStyles();
        setupHUDEvents();
    }

    function setupHUDEvents() {
        const toggleBtn = document.getElementById('vd-toggle-btn');
        const panel = document.getElementById('vd-panel');
        const closeBtn = document.getElementById('vd-panel-close');

        if (toggleBtn && panel) {
            toggleBtn.addEventListener('click', () => {
                panel.classList.toggle('vd-panel-hidden');
            });
        }

        if (closeBtn && panel) {
            closeBtn.addEventListener('click', () => {
                panel.classList.add('vd-panel-hidden');
            });
        }

        // Chuyển đổi chế độ hiển thị
        const radioCards = document.querySelectorAll('.vd-radio-card');
        radioCards.forEach(card => {
            card.addEventListener('click', () => {
                const radio = card.querySelector('input[type="radio"]');
                if (radio) {
                    radioCards.forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    cfg.displayMode = radio.value;
                    saveConfig();
                    refreshAllDisplayModes();
                }
            });
        });

        // Toggle Auto Translate
        const autoToggle = document.getElementById('vd-toggle-auto');
        if (autoToggle) {
            autoToggle.addEventListener('change', () => {
                cfg.autoTranslateStory = autoToggle.checked;
                saveConfig();
                if (cfg.autoTranslateStory) scanAndTranslateStory();
            });
        }

        // Toggle Input Helper
        const inputToggle = document.getElementById('vd-toggle-input');
        if (inputToggle) {
            inputToggle.addEventListener('change', () => {
                cfg.inputHelperEnabled = inputToggle.checked;
                saveConfig();
                const helperBar = document.getElementById('vietdungeon-input-bar');
                if (helperBar) helperBar.style.display = cfg.inputHelperEnabled ? 'block' : 'none';
            });
        }

        // Engine select
        const engineSelect = document.getElementById('vd-engine-select');
        const aiBox = document.getElementById('vd-ai-config-box');
        if (engineSelect && aiBox) {
            engineSelect.addEventListener('change', () => {
                cfg.engine = engineSelect.value;
                aiBox.style.display = cfg.engine === 'ai_custom' ? 'block' : 'none';
                saveConfig();
            });
        }

        const aiProvider = document.getElementById('vd-ai-provider');
        if (aiProvider) {
            aiProvider.addEventListener('change', () => {
                cfg.aiProvider = aiProvider.value;
                saveConfig();
            });
        }

        const aiKeyInput = document.getElementById('vd-ai-key');
        if (aiKeyInput) {
            aiKeyInput.addEventListener('change', () => {
                cfg.aiApiKey = aiKeyInput.value.trim();
                saveConfig();
            });
        }

        // Nút dịch lại toàn bộ
        const retransBtn = document.getElementById('vd-btn-retranslate');
        if (retransBtn) {
            retransBtn.addEventListener('click', () => {
                translationCache.clear();
                document.querySelectorAll('[data-vd-status]').forEach(el => {
                    delete el.dataset.vdStatus;
                    delete el.dataset.vdOriginal;
                });
                document.querySelectorAll('.vietdungeon-vi-box').forEach(b => b.remove());
                scanAndTranslateStory();
            });
        }
    }

    // =========================================================================
    // 6. CSS STYLES (THEME WHITE-BLUE SÁNG & HIỆN ĐẠI)
    // =========================================================================
    function injectStyles() {
        const css = `
            /* Floating Action Button */
            #vd-toggle-btn {
                position: fixed;
                bottom: 24px;
                right: 24px;
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
                color: #ffffff;
                border: 2px solid #38bdf8;
                box-shadow: 0 4px 15px rgba(2, 132, 199, 0.4), 0 0 10px rgba(56, 189, 248, 0.3);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 999999;
                transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
            }
            #vd-toggle-btn:hover {
                transform: scale(1.08);
                box-shadow: 0 6px 20px rgba(2, 132, 199, 0.6), 0 0 15px rgba(56, 189, 248, 0.5);
            }
            #vd-toggle-btn .vd-icon {
                font-size: 22px;
            }
            #vd-toggle-btn .vd-badge {
                position: absolute;
                bottom: -2px;
                right: -2px;
                background: #f43f5e;
                color: #fff;
                font-size: 10px;
                font-weight: 800;
                padding: 1px 4px;
                border-radius: 6px;
                border: 1px solid #fff;
            }

            /* Panel Popup */
            #vd-panel {
                position: fixed;
                bottom: 84px;
                right: 24px;
                width: 380px;
                max-width: calc(100vw - 32px);
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18), 0 0 0 1px #e2e8f0;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                overflow: hidden;
                transition: opacity 0.2s, transform 0.2s;
            }
            #vd-panel.vd-panel-hidden {
                opacity: 0;
                pointer-events: none;
                transform: translateY(12px) scale(0.96);
            }
            .vd-panel-header {
                background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                color: #ffffff;
                padding: 14px 18px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 2px solid #0284c7;
            }
            .vd-header-title {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .vd-title-icon {
                font-size: 24px;
            }
            .vd-header-title h4 {
                margin: 0;
                font-size: 15px;
                font-weight: 700;
                color: #f8fafc;
                letter-spacing: 0.3px;
            }
            .vd-version {
                font-size: 11px;
                color: #94a3b8;
            }
            .vd-close-btn {
                background: transparent;
                border: none;
                color: #cbd5e1;
                font-size: 22px;
                cursor: pointer;
                line-height: 1;
                padding: 0;
            }
            .vd-close-btn:hover {
                color: #ffffff;
            }

            .vd-panel-body {
                padding: 16px;
                max-height: 480px;
                overflow-y: auto;
                background: #f8fafc;
            }
            .vd-setting-group {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 12px;
                margin-bottom: 12px;
            }
            .vd-group-label {
                display: block;
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: #0284c7;
                margin-bottom: 10px;
            }

            /* Radio Cards */
            .vd-radio-grid {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .vd-radio-card {
                display: block;
                border: 1.5px solid #cbd5e1;
                border-radius: 8px;
                padding: 8px 12px;
                cursor: pointer;
                background: #ffffff;
                transition: all 0.15s;
            }
            .vd-radio-card input {
                display: none;
            }
            .vd-radio-card:hover {
                border-color: #38bdf8;
                background: #f0f9ff;
            }
            .vd-radio-card.active {
                border-color: #0284c7;
                background: #e0f2fe;
            }
            .vd-card-title {
                font-size: 13px;
                font-weight: 700;
                color: #0f172a;
            }
            .vd-card-desc {
                font-size: 11px;
                color: #64748b;
                margin-top: 2px;
            }

            /* Switch row */
            .vd-switch-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 0;
            }
            .vd-switch-row:not(:last-child) {
                border-bottom: 1px dashed #e2e8f0;
                margin-bottom: 6px;
            }
            .vd-switch-info {
                display: flex;
                flex-direction: column;
                padding-right: 12px;
            }
            .vd-switch-title {
                font-size: 13px;
                font-weight: 600;
                color: #1e293b;
            }
            .vd-switch-desc {
                font-size: 11px;
                color: #64748b;
            }
            .vd-switch {
                position: relative;
                display: inline-block;
                width: 40px;
                height: 22px;
                flex-shrink: 0;
            }
            .vd-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .vd-slider {
                position: absolute;
                cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: #cbd5e1;
                transition: .2s;
                border-radius: 22px;
            }
            .vd-slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .2s;
                border-radius: 50%;
            }
            .vd-switch input:checked + .vd-slider {
                background-color: #0284c7;
            }
            .vd-switch input:checked + .vd-slider:before {
                transform: translateX(18px);
            }

            .vd-select, .vd-input {
                width: 100%;
                box-sizing: border-box;
                padding: 7px 10px;
                border-radius: 8px;
                border: 1px solid #cbd5e1;
                font-size: 12px;
                color: #0f172a;
                background: #ffffff;
                outline: none;
            }
            .vd-select:focus, .vd-input:focus {
                border-color: #0284c7;
                box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
            }
            .vd-field {
                margin-top: 8px;
            }
            .vd-field label {
                display: block;
                font-size: 11px;
                font-weight: 600;
                color: #475569;
                margin-bottom: 4px;
            }

            .vd-actions-row {
                margin-top: 10px;
            }
            .vd-btn-primary {
                width: 100%;
                background: #0284c7;
                color: #ffffff;
                border: none;
                padding: 10px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 13px;
                cursor: pointer;
                transition: background 0.15s;
            }
            .vd-btn-primary:hover {
                background: #0369a1;
            }

            /* VI Box in Story */
            .vietdungeon-vi-box {
                margin: 4px 0 10px 0;
                padding: 8px 12px;
                background: rgba(14, 165, 233, 0.08);
                border-left: 3px solid #0284c7;
                border-radius: 0 8px 8px 0;
                transition: all 0.2s;
            }
            .vd-vi-content {
                display: flex;
                align-items: flex-start;
                gap: 8px;
            }
            .vd-vi-badge {
                font-size: 10px;
                font-weight: 800;
                background: #0284c7;
                color: #ffffff;
                padding: 1px 5px;
                border-radius: 4px;
                margin-top: 3px;
                flex-shrink: 0;
            }
            .vd-vi-text {
                font-size: 15.5px;
                line-height: 1.55;
                color: #bae6fd;
                font-family: system-ui, -apple-system, sans-serif;
            }

            /* Input Helper Bar */
            #vietdungeon-input-bar {
                margin-bottom: 8px;
                background: #0f172a;
                border: 1px solid #1e293b;
                border-radius: 10px;
                padding: 8px 12px;
                color: #e2e8f0;
            }
            .vd-input-wrap {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .vd-input-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 8px;
            }
            .vd-input-tag {
                font-size: 11px;
                font-weight: 800;
                color: #38bdf8;
                letter-spacing: 0.5px;
            }
            .vd-mode-badge {
                font-size: 11px;
                color: #94a3b8;
            }
            .vd-action-shortcuts {
                display: flex;
                gap: 6px;
            }
            .vd-btn-tag {
                background: #1e293b;
                color: #38bdf8;
                border: 1px solid #334155;
                border-radius: 6px;
                padding: 3px 8px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s;
            }
            .vd-btn-tag:hover {
                background: #0284c7;
                color: #ffffff;
                border-color: #0284c7;
            }

            .vd-preview-area {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 10px;
                background: #1e293b;
                border-radius: 6px;
                border-left: 2px solid #38bdf8;
            }
            .vd-preview-label {
                font-size: 11px;
                color: #94a3b8;
                flex-shrink: 0;
            }
            .vd-preview-text {
                font-size: 12.5px;
                color: #38bdf8;
                font-style: italic;
                flex-grow: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .vd-btn-apply {
                background: #0284c7;
                color: #fff;
                border: none;
                border-radius: 4px;
                padding: 3px 8px;
                font-size: 11px;
                cursor: pointer;
            }
        `;

        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
        } else {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    // =========================================================================
    // 7. KHỞI CHẠY & VÒNG LẶP THEO DÕI DOM (MUTATION OBSERVER)
    // =========================================================================
    function init() {
        createHUD();
        attachInputHelper();
        scanAndTranslateStory();

        // Sử dụng MutationObserver để phát hiện nội dung cốt truyện mới được AI render
        const observer = new MutationObserver((mutations) => {
            let hasNewNodes = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    hasNewNodes = true;
                    break;
                }
            }

            if (hasNewNodes) {
                attachInputHelper();
                scanAndTranslateStory();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Định kỳ kiểm tra thêm để đảm bảo không sót khi AI stream text
        setInterval(() => {
            attachInputHelper();
            scanAndTranslateStory();
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
