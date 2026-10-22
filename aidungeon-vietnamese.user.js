// ==UserScript==
// @name         AI Dungeon Tiếng Việt - VietDungeon Assistant
// @namespace    https://github.com/nhoxboo/aidungeon-vietnamese
// @version      1.1.0
// @description  Chơi AI Dungeon hoàn toàn bằng tiếng Việt: Tự động dịch cốt truyện 2 chiều, hộp thoại, lựa chọn kịch bản, hỗ trợ Song ngữ / Thuần Việt, nhập lệnh tiếng Việt tự động chuyển sang tiếng Anh RPG.
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

    console.log('[VietDungeon v1.1.0] Khởi chạy Trợ lý Tiếng Việt cho AI Dungeon...');

    const DEFAULT_CONFIG = {
        autoTranslateStory: true,
        translateChoices: true,
        displayMode: 'bilingual',
        inputHelperEnabled: true,
        engine: 'google',
        aiProvider: 'gemini',
        aiApiKey: '',
        aiModel: 'gemini-1.5-flash',
        fontSizeVi: 16,
        fontColorVi: '#7dd3fc'
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

    const translationCache = new Map();

    function translateGoogle(text, sl = 'auto', tl = 'vi') {
        return new Promise((resolve, reject) => {
            if (!text || !text.trim()) return resolve('');
            const cleanText = text.trim();
            const cacheKey = sl + '_' + tl + '_' + cleanText;
            if (translationCache.has(cacheKey)) {
                return resolve(translationCache.get(cacheKey));
            }

            const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + sl + '&tl=' + tl + '&dt=t&q=' + encodeURIComponent(cleanText);

            const reqFn = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : null;

            if (reqFn) {
                reqFn({
                    method: 'GET',
                    url: url,
                    timeout: 8000,
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
                    ontimeout: function () {
                        fetch(url)
                            .then(r => r.json())
                            .then(data => {
                                const translated = data[0].map(item => item[0]).filter(Boolean).join('');
                                translationCache.set(cacheKey, translated);
                                resolve(translated);
                            })
                            .catch(reject);
                    },
                    onerror: function () {
                        fetch(url)
                            .then(r => r.json())
                            .then(data => {
                                const translated = data[0].map(item => item[0]).filter(Boolean).join('');
                                translationCache.set(cacheKey, translated);
                                resolve(translated);
                            })
                            .catch(reject);
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

    async function translateAI(text, direction = 'en_to_vi') {
        if (!cfg.aiApiKey) {
            return translateGoogle(text, direction === 'en_to_vi' ? 'en' : 'vi', direction === 'en_to_vi' ? 'vi' : 'en');
        }

        const systemPrompt = direction === 'en_to_vi'
            ? 'Bạn là dịch giả tiểu thuyết phiêu lưu nhập vai (RPG / Fantasy). Hãy dịch đoạn văn sau sang tiếng Việt tự nhiên, hấp dẫn, đúng ngữ cảnh văn học kỳ ảo. Chỉ trả về kết quả dịch, không kèm lời giải thích.'
            : 'You are an expert RPG game writer. Translate this Vietnamese action/speech into natural, punchy English for AI Dungeon text generation. Return ONLY the translation.';

        try {
            if (cfg.aiProvider === 'gemini') {
                const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + (cfg.aiModel || 'gemini-1.5-flash') + ':generateContent?key=' + cfg.aiApiKey;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            role: 'user',
                            parts: [{ text: systemPrompt + '\n\n' + text }]
                        }]
                    })
                });
                const data = await res.json();
                const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                return result || translateGoogle(text, 'en', 'vi');
            } else {
                let endpoint = 'https://api.openai.com/v1/chat/completions';
                if (cfg.aiProvider === 'groq') endpoint = 'https://api.groq.com/openai/v1/chat/completions';
                if (cfg.aiProvider === 'deepseek') endpoint = 'https://api.deepseek.com/chat/completions';

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + cfg.aiApiKey
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

    function translate(text, direction = 'en_to_vi') {
        if (cfg.engine === 'ai_custom' && cfg.aiApiKey) {
            return translateAI(text, direction);
        }
        return translateGoogle(text, direction === 'en_to_vi' ? 'en' : 'vi', direction === 'en_to_vi' ? 'vi' : 'en');
    }

    function extractOriginalText(el) {
        let text = '';
        for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (!node.classList.contains('vietdungeon-ignore') && !node.classList.contains('vd-vi-subtext')) {
                    text += extractOriginalText(node);
                }
            }
        }
        return text.trim();
    }

    async function processStoryTarget(targetEl) {
        if (!targetEl || targetEl.classList.contains('vietdungeon-ignore')) return;

        const rawText = extractOriginalText(targetEl);
        if (!rawText || rawText.length < 8) return;

        if (/^(You|Undo|Redo|Retry|Erase|Take a turn|Continue|Start)$/i.test(rawText)) return;

        if (targetEl.dataset.vdTranslatedText === rawText && targetEl.querySelector('.vd-vi-subtext')) {
            return;
        }

        targetEl.dataset.vdStatus = 'translating';

        try {
            const vi = await translate(rawText, 'en_to_vi');
            if (!vi || vi.trim() === rawText) {
                targetEl.dataset.vdStatus = 'skipped';
                return;
            }

            targetEl.dataset.vdStatus = 'translated';
            targetEl.dataset.vdTranslatedText = rawText;

            let viBox = targetEl.querySelector('.vd-vi-subtext');
            if (!viBox) {
                viBox = document.createElement('span');
                viBox.className = 'vd-vi-subtext vietdungeon-ignore';
                targetEl.appendChild(viBox);
            }

            viBox.innerHTML = `
                <span class="vd-vi-header">
                    <span class="vd-vi-flag">🇻🇳 VI</span>
                    <span class="vd-vi-btn-toggle" title="Đổi chế độ">Chuyển</span>
                </span>
                <span class="vd-vi-body">${escapeHtml(vi)}</span>
            `;

            const toggleBtn = viBox.querySelector('.vd-vi-btn-toggle');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    viBox.classList.toggle('vd-only-active');
                });
            }

            applyDisplayMode(targetEl, viBox);
        } catch (err) {
            console.error('[VietDungeon] Lỗi dịch:', err);
            targetEl.dataset.vdStatus = 'error';
        }
    }

    function applyDisplayMode(targetEl, viBox) {
        if (!viBox) return;

        if (cfg.displayMode === 'original') {
            viBox.style.display = 'none';
            targetEl.style.color = '';
        } else if (cfg.displayMode === 'vi_only') {
            viBox.style.display = 'block';
            viBox.classList.add('vd-pure-vi');
        } else {
            viBox.style.display = 'block';
            viBox.classList.remove('vd-pure-vi');
        }
    }

    function refreshAllStoryDisplay() {
        document.querySelectorAll('.gameplay-story-edit-dim-target, [data-vd-story-node="true"]').forEach(el => {
            const viBox = el.querySelector('.vd-vi-subtext');
            if (viBox) applyDisplayMode(el, viBox);
        });
    }

    function scanAndTranslateStory() {
        if (!cfg.autoTranslateStory) return;

        // Quét selector chính xác nhất của AI Dungeon
        const directTargets = document.querySelectorAll('.gameplay-story-edit-dim-target');
        directTargets.forEach(el => {
            el.dataset.vdStoryNode = 'true';
            processStoryTarget(el);
        });

        // Quét container phòng hờ
        const storyContainer = document.querySelector('.fs-aid-story-content') || document.querySelector('#gameplay-story-scrollview');
        if (storyContainer) {
            const spans = storyContainer.querySelectorAll('span.font_gameplay, span.is_Text');
            spans.forEach(s => {
                if (!s.querySelector('.gameplay-story-edit-dim-target') && !s.closest('.gameplay-story-edit-dim-target')) {
                    if (extractOriginalText(s).length > 25) {
                        s.dataset.vdStoryNode = 'true';
                        processStoryTarget(s);
                    }
                }
            });
        }

        if (cfg.translateChoices) {
            scanAndTranslateChoices();
        }
    }

    async function scanAndTranslateChoices() {
        const choiceButtons = document.querySelectorAll('button:not(.vietdungeon-ignore), [role="button"]:not(.vietdungeon-ignore)');
        choiceButtons.forEach(async btn => {
            if (btn.dataset.vdChoiceTranslated === 'true' || btn.closest('#vietdungeon-hud-root') || btn.closest('#vietdungeon-input-bar')) return;

            const txt = btn.innerText?.trim();
            if (!txt || txt.length < 3 || txt.length > 50) return;
            if (/^(play|more|share|bookmark|undo|redo|settings|menu|sign|search)$/i.test(txt)) return;

            const matchChoice = txt.match(/^(\d+)?\s*([a-zA-Z\s]{3,})$/);
            if (matchChoice) {
                btn.dataset.vdChoiceTranslated = 'true';
                try {
                    const wordToTranslate = matchChoice[2].trim();
                    const viWord = await translate(wordToTranslate, 'en_to_vi');
                    if (viWord && viWord.toLowerCase() !== wordToTranslate.toLowerCase()) {
                        const viBadge = document.createElement('span');
                        viBadge.className = 'vd-choice-vi-badge vietdungeon-ignore';
                        viBadge.textContent = ' (' + viWord + ')';
                        btn.appendChild(viBadge);
                    }
                } catch (e) { }
            }
        });

        const headings = document.querySelectorAll('h1, h2, [role="heading"]');
        headings.forEach(async h => {
            if (h.dataset.vdHeadingTranslated === 'true' || h.closest('.vietdungeon-ignore')) return;
            const text = h.innerText?.trim();
            if (text && text.length > 5 && text.length < 80 && /[a-zA-Z]/.test(text)) {
                h.dataset.vdHeadingTranslated = 'true';
                try {
                    const vi = await translate(text, 'en_to_vi');
                    if (vi && vi !== text) {
                        const sub = document.createElement('div');
                        sub.className = 'vd-heading-vi vietdungeon-ignore';
                        sub.textContent = '🇻🇳 ' + vi;
                        h.appendChild(sub);
                    }
                } catch (e) { }
            }
        });
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

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

    let debounceTranslateTimer = null;

    function attachInputHelper() {
        if (!cfg.inputHelperEnabled) return;

        const textarea = document.querySelector('#game-text-input') ||
            document.querySelector('textarea[placeholder*="happens"]') ||
            document.querySelector('[aria-label="Action input"]');

        if (!textarea) return;
        if (textarea.dataset.vdHelperAttached === 'true') return;

        textarea.dataset.vdHelperAttached = 'true';

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
                        <span class="vd-input-tag">⚡ GÕ TIẾNG VIỆT</span>
                        <span class="vd-mode-badge">Tự động dịch sang tiếng Anh RPG khi Enter</span>
                        <div class="vd-action-shortcuts">
                            <button type="button" class="vd-btn-tag" data-prefix="Do: ">Hành động (Do)</button>
                            <button type="button" class="vd-btn-tag" data-prefix="Say: ">Nói (Say)</button>
                            <button type="button" class="vd-btn-tag" data-prefix="Story: ">Kể tiếp (Story)</button>
                        </div>
                    </div>
                    <div class="vd-preview-area" id="vd-preview-box" style="display: none;">
                        <span class="vd-preview-label">Bản dịch xem trước:</span>
                        <div class="vd-preview-text" id="vd-preview-en">...</div>
                        <button type="button" id="vd-btn-apply-en" class="vd-btn-apply">Nạp vào</button>
                    </div>
                </div>
            `;
            container.parentNode.insertBefore(helperBar, container);

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

        textarea.addEventListener('input', () => {
            const val = textarea.value.trim();
            const previewBox = document.getElementById('vd-preview-box');
            const previewText = document.getElementById('vd-preview-en');

            if (!val || !/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(val)) {
                if (previewBox) previewBox.style.display = 'none';
                return;
            }

            clearTimeout(debounceTranslateTimer);
            debounceTranslateTimer = setTimeout(async () => {
                try {
                    const en = await translate(val, 'vi_to_en');
                    if (previewBox && previewText) {
                        previewText.textContent = en;
                        previewBox.style.display = 'flex';
                    }
                } catch (e) { }
            }, 400);
        });

        textarea.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                const val = textarea.value.trim();
                if (val && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(val)) {
                    e.preventDefault();
                    e.stopPropagation();

                    const previewBox = document.getElementById('vd-preview-box');
                    const previewText = document.getElementById('vd-preview-en');
                    if (previewText) previewText.textContent = 'Đang dịch sang tiếng Anh RPG...';
                    if (previewBox) previewBox.style.display = 'flex';

                    try {
                        const en = await translate(val, 'vi_to_en');
                        setNativeValue(textarea, en);
                        if (previewBox) previewBox.style.display = 'none';

                        setTimeout(() => {
                            const submitBtn = document.querySelector('button[aria-label="Submit action"]') ||
                                document.querySelector('button[type="submit"]') ||
                                textarea.form?.querySelector('button');
                            if (submitBtn) {
                                submitBtn.click();
                            } else {
                                textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                            }
                        }, 50);
                    } catch (err) {
                        console.error('[VietDungeon] Lỗi dịch khi submit:', err);
                        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                    }
                }
            }
        }, true);
    }

    function createHUD() {
        if (document.getElementById('vietdungeon-hud-root')) return;

        const hudRoot = document.createElement('div');
        hudRoot.id = 'vietdungeon-hud-root';
        hudRoot.className = 'vietdungeon-ignore';

        hudRoot.innerHTML = `
            <button id="vd-toggle-btn" title="AI Dungeon Tiếng Việt">
                <span class="vd-icon">🇻🇳</span>
                <span class="vd-badge">VN</span>
            </button>

            <div id="vd-panel" class="vd-panel-hidden">
                <div class="vd-panel-header">
                    <div class="vd-header-title">
                        <span class="vd-title-icon">⚔️</span>
                        <div>
                            <h4>AI Dungeon Tiếng Việt</h4>
                            <span class="vd-version">v1.1.0 • by Beso & Anh Nam</span>
                        </div>
                    </div>
                    <button id="vd-panel-close" class="vd-close-btn">&times;</button>
                </div>

                <div class="vd-panel-body">
                    <div style="margin-bottom: 12px;">
                        <button type="button" id="vd-btn-force-translate" class="vd-btn-primary">
                            ⚡ DỊCH NGAY MÀN HÌNH NÀY
                        </button>
                    </div>

                    <div class="vd-setting-group">
                        <label class="vd-group-label">Chế độ hiển thị cốt truyện</label>
                        <div class="vd-radio-grid">
                            <label class="vd-radio-card ${cfg.displayMode === 'bilingual' ? 'active' : ''}">
                                <input type="radio" name="vd-display" value="bilingual" ${cfg.displayMode === 'bilingual' ? 'checked' : ''}>
                                <div class="vd-card-title">📖 Song ngữ (Mặc định)</div>
                                <div class="vd-card-desc">Hiện cả tiếng Anh gốc mờ + Tiếng Việt dạ quang rõ ràng</div>
                            </label>
                            <label class="vd-radio-card ${cfg.displayMode === 'vi_only' ? 'active' : ''}">
                                <input type="radio" name="vd-display" value="vi_only" ${cfg.displayMode === 'vi_only' ? 'checked' : ''}>
                                <div class="vd-card-title">🇻🇳 Thuần Việt</div>
                                <div class="vd-card-desc">Tập trung đọc bản dịch tiếng Việt mượt mà</div>
                            </label>
                            <label class="vd-radio-card ${cfg.displayMode === 'original' ? 'active' : ''}">
                                <input type="radio" name="vd-display" value="original" ${cfg.displayMode === 'original' ? 'checked' : ''}>
                                <div class="vd-card-title">🇺🇸 Gốc (EN)</div>
                                <div class="vd-card-desc">Tạm ẩn bản dịch, giữ nguyên văn bản game</div>
                            </label>
                        </div>
                    </div>

                    <div class="vd-setting-group">
                        <label class="vd-group-label">Tùy chọn tự động</label>
                        <div class="vd-switch-row">
                            <div class="vd-switch-info">
                                <span class="vd-switch-title">Tự động dịch cốt truyện</span>
                                <span class="vd-switch-desc">Dịch tức thì khi AI viết diễn biến mới</span>
                            </div>
                            <label class="vd-switch">
                                <input type="checkbox" id="vd-toggle-auto" ${cfg.autoTranslateStory ? 'checked' : ''}>
                                <span class="vd-slider"></span>
                            </label>
                        </div>

                        <div class="vd-switch-row">
                            <div class="vd-switch-info">
                                <span class="vd-switch-title">Dịch cả nút lựa chọn / Prompt</span>
                                <span class="vd-switch-desc">Hiển thị tiếng Việt trên các nút chọn nhân vật/kịch bản</span>
                            </div>
                            <label class="vd-switch">
                                <input type="checkbox" id="vd-toggle-choices" ${cfg.translateChoices ? 'checked' : ''}>
                                <span class="vd-slider"></span>
                            </label>
                        </div>

                        <div class="vd-switch-row">
                            <div class="vd-switch-info">
                                <span class="vd-switch-title">Thanh gõ lệnh Tiếng Việt</span>
                                <span class="vd-switch-desc">Tự động dịch VI ➔ EN RPG khi gửi</span>
                            </div>
                            <label class="vd-switch">
                                <input type="checkbox" id="vd-toggle-input" ${cfg.inputHelperEnabled ? 'checked' : ''}>
                                <span class="vd-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="vd-setting-group">
                        <label class="vd-group-label">Máy chủ dịch</label>
                        <select id="vd-engine-select" class="vd-select">
                            <option value="google" ${cfg.engine === 'google' ? 'selected' : ''}>⚡ Google Translate (Miễn phí, cực nhanh, không cần Key)</option>
                            <option value="ai_custom" ${cfg.engine === 'ai_custom' ? 'selected' : ''}>🤖 AI LLM (Gemini, Groq, DeepSeek, OpenAI)</option>
                        </select>

                        <div id="vd-ai-config-box" style="display: ${cfg.engine === 'ai_custom' ? 'block' : 'none'}; margin-top: 10px;">
                            <div class="vd-field">
                                <label>Nhà cung cấp:</label>
                                <select id="vd-ai-provider" class="vd-select">
                                    <option value="gemini" ${cfg.aiProvider === 'gemini' ? 'selected' : ''}>Google Gemini (1.5 Flash - Khuyên dùng)</option>
                                    <option value="groq" ${cfg.aiProvider === 'groq' ? 'selected' : ''}>Groq (Llama-3.3 70B)</option>
                                    <option value="deepseek" ${cfg.aiProvider === 'deepseek' ? 'selected' : ''}>DeepSeek Chat</option>
                                    <option value="openai" ${cfg.aiProvider === 'openai' ? 'selected' : ''}>OpenAI (GPT-4o mini)</option>
                                </select>
                            </div>
                            <div class="vd-field">
                                <label>API Key:</label>
                                <input type="password" id="vd-ai-key" class="vd-input" placeholder="Dán API Key..." value="${cfg.aiApiKey || ''}">
                            </div>
                        </div>
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

        const radioCards = document.querySelectorAll('.vd-radio-card');
        radioCards.forEach(card => {
            card.addEventListener('click', () => {
                const radio = card.querySelector('input[type="radio"]');
                if (radio) {
                    radioCards.forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    cfg.displayMode = radio.value;
                    saveConfig();
                    refreshAllStoryDisplay();
                }
            });
        });

        const autoToggle = document.getElementById('vd-toggle-auto');
        if (autoToggle) {
            autoToggle.addEventListener('change', () => {
                cfg.autoTranslateStory = autoToggle.checked;
                saveConfig();
                if (cfg.autoTranslateStory) scanAndTranslateStory();
            });
        }

        const choicesToggle = document.getElementById('vd-toggle-choices');
        if (choicesToggle) {
            choicesToggle.addEventListener('change', () => {
                cfg.translateChoices = choicesToggle.checked;
                saveConfig();
                if (cfg.translateChoices) scanAndTranslateChoices();
            });
        }

        const inputToggle = document.getElementById('vd-toggle-input');
        if (inputToggle) {
            inputToggle.addEventListener('change', () => {
                cfg.inputHelperEnabled = inputToggle.checked;
                saveConfig();
                const helperBar = document.getElementById('vietdungeon-input-bar');
                if (helperBar) helperBar.style.display = cfg.inputHelperEnabled ? 'block' : 'none';
            });
        }

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

        const forceBtn = document.getElementById('vd-btn-force-translate');
        if (forceBtn) {
            forceBtn.addEventListener('click', () => {
                forceBtn.textContent = '⏳ Đang quét & dịch...';
                scanAndTranslateStory();
                setTimeout(() => {
                    forceBtn.textContent = '✅ ĐÃ DỊCH XONG!';
                    setTimeout(() => {
                        forceBtn.textContent = '⚡ DỊCH NGAY MÀN HÌNH NÀY';
                    }, 1500);
                }, 600);
            });
        }
    }

    function injectStyles() {
        const css = `
            .vd-vi-subtext {
                display: block !important;
                margin-top: 6px !important;
                margin-bottom: 12px !important;
                padding: 8px 14px !important;
                background: rgba(2, 132, 199, 0.12) !important;
                border-left: 3.5px solid #38bdf8 !important;
                border-radius: 6px !important;
                color: #bae6fd !important;
                font-size: 0.96em !important;
                line-height: 1.65 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif !important;
                transition: all 0.2s ease !important;
                user-select: text !important;
            }
            .vd-vi-subtext:hover {
                background: rgba(2, 132, 199, 0.18) !important;
                border-left-color: #0284c7 !important;
            }
            .vd-vi-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                margin-bottom: 4px !important;
            }
            .vd-vi-flag {
                font-size: 10px !important;
                font-weight: 800 !important;
                background: #0284c7 !important;
                color: #ffffff !important;
                padding: 1px 6px !important;
                border-radius: 4px !important;
                letter-spacing: 0.5px !important;
            }
            .vd-vi-btn-toggle {
                font-size: 10px !important;
                color: #94a3b8 !important;
                cursor: pointer !important;
                padding: 1px 4px !important;
            }
            .vd-vi-btn-toggle:hover {
                color: #ffffff !important;
            }
            .vd-vi-body {
                display: block !important;
                color: #e0f2fe !important;
                font-weight: 400 !important;
            }

            .vd-vi-subtext.vd-pure-vi {
                background: transparent !important;
                border-left: none !important;
                padding-left: 0 !important;
                padding-right: 0 !important;
                color: #f8fafc !important;
                font-size: 1.02em !important;
            }

            .vd-choice-vi-badge {
                font-size: 0.88em !important;
                color: #38bdf8 !important;
                font-weight: 600 !important;
                margin-left: 4px !important;
            }
            .vd-heading-vi {
                font-size: 0.72em !important;
                color: #38bdf8 !important;
                margin-top: 4px !important;
                font-weight: 600 !important;
            }

            #vd-toggle-btn {
                position: fixed;
                bottom: 24px;
                right: 24px;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
                color: #ffffff;
                border: 2px solid #38bdf8;
                box-shadow: 0 4px 16px rgba(2, 132, 199, 0.45);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 999999;
                transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            #vd-toggle-btn:hover {
                transform: scale(1.1);
            }
            #vd-toggle-btn .vd-icon { font-size: 22px; }
            #vd-toggle-btn .vd-badge {
                position: absolute;
                bottom: -2px;
                right: -2px;
                background: #ef4444;
                color: #fff;
                font-size: 9px;
                font-weight: 800;
                padding: 1px 4px;
                border-radius: 6px;
                border: 1px solid #fff;
            }

            #vd-panel {
                position: fixed;
                bottom: 82px;
                right: 24px;
                width: 380px;
                max-width: calc(100vw - 32px);
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 12px 35px rgba(15, 23, 42, 0.25), 0 0 0 1px #e2e8f0;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
            .vd-header-title { display: flex; align-items: center; gap: 10px; }
            .vd-title-icon { font-size: 22px; }
            .vd-header-title h4 { margin: 0; font-size: 15px; font-weight: 700; color: #f8fafc; }
            .vd-version { font-size: 11px; color: #94a3b8; }
            .vd-close-btn { background: transparent; border: none; color: #cbd5e1; font-size: 22px; cursor: pointer; }
            .vd-close-btn:hover { color: #fff; }

            .vd-panel-body { padding: 14px; max-height: 480px; overflow-y: auto; background: #f8fafc; }
            .vd-setting-group {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 12px;
                margin-bottom: 12px;
            }
            .vd-group-label {
                display: block;
                font-size: 11.5px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: #0284c7;
                margin-bottom: 8px;
            }
            .vd-radio-grid { display: flex; flex-direction: column; gap: 8px; }
            .vd-radio-card {
                display: block;
                border: 1.5px solid #cbd5e1;
                border-radius: 8px;
                padding: 8px 12px;
                cursor: pointer;
                background: #ffffff;
                transition: all 0.15s;
            }
            .vd-radio-card input { display: none; }
            .vd-radio-card:hover { border-color: #38bdf8; background: #f0f9ff; }
            .vd-radio-card.active { border-color: #0284c7; background: #e0f2fe; }
            .vd-card-title { font-size: 13px; font-weight: 700; color: #0f172a; }
            .vd-card-desc { font-size: 11px; color: #64748b; margin-top: 2px; }

            .vd-switch-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 0;
            }
            .vd-switch-row:not(:last-child) { border-bottom: 1px dashed #e2e8f0; margin-bottom: 6px; }
            .vd-switch-info { display: flex; flex-direction: column; padding-right: 10px; }
            .vd-switch-title { font-size: 12.5px; font-weight: 600; color: #1e293b; }
            .vd-switch-desc { font-size: 11px; color: #64748b; }
            .vd-switch {
                position: relative;
                display: inline-block;
                width: 38px;
                height: 20px;
                flex-shrink: 0;
            }
            .vd-switch input { opacity: 0; width: 0; height: 0; }
            .vd-slider {
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                background-color: #cbd5e1; transition: .2s; border-radius: 20px;
            }
            .vd-slider:before {
                position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px;
                background-color: white; transition: .2s; border-radius: 50%;
            }
            .vd-switch input:checked + .vd-slider { background-color: #0284c7; }
            .vd-switch input:checked + .vd-slider:before { transform: translateX(18px); }

            .vd-select, .vd-input {
                width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px;
                border: 1px solid #cbd5e1; font-size: 12px; color: #0f172a; background: #ffffff;
            }
            .vd-field { margin-top: 8px; }
            .vd-field label { display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 3px; }

            .vd-btn-primary {
                width: 100%; background: #0284c7; color: #ffffff; border: none; padding: 10px;
                border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer;
                box-shadow: 0 4px 10px rgba(2, 132, 199, 0.3);
                transition: background 0.15s;
            }
            .vd-btn-primary:hover { background: #0369a1; }

            #vietdungeon-input-bar {
                margin-bottom: 8px; background: #0f172a; border: 1px solid #1e293b;
                border-radius: 10px; padding: 8px 12px; color: #e2e8f0;
            }
            .vd-input-wrap { display: flex; flex-direction: column; gap: 6px; }
            .vd-input-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
            .vd-input-tag { font-size: 11px; font-weight: 800; color: #38bdf8; }
            .vd-mode-badge { font-size: 11px; color: #94a3b8; }
            .vd-action-shortcuts { display: flex; gap: 6px; }
            .vd-btn-tag {
                background: #1e293b; color: #38bdf8; border: 1px solid #334155; border-radius: 6px;
                padding: 3px 8px; font-size: 11px; font-weight: 600; cursor: pointer;
            }
            .vd-btn-tag:hover { background: #0284c7; color: #fff; border-color: #0284c7; }

            .vd-preview-area {
                display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #1e293b;
                border-radius: 6px; border-left: 2px solid #38bdf8;
            }
            .vd-preview-label { font-size: 11px; color: #94a3b8; flex-shrink: 0; }
            .vd-preview-text {
                font-size: 12.5px; color: #38bdf8; font-style: italic; flex-grow: 1;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .vd-btn-apply { background: #0284c7; color: #fff; border: none; border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
        `;

        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
        } else {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    function init() {
        createHUD();
        attachInputHelper();
        scanAndTranslateStory();

        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (!node.classList.contains('vietdungeon-ignore')) {
                                shouldScan = true;
                                break;
                            }
                        }
                    }
                }
                if (shouldScan) break;
            }

            if (shouldScan) {
                attachInputHelper();
                scanAndTranslateStory();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setInterval(() => {
            attachInputHelper();
            scanAndTranslateStory();
        }, 1200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();