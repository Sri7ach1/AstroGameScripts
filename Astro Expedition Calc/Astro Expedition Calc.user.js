// ==UserScript==
// @author       LoneW0lf
// @name         Astro Expedition Calc
// @namespace    astrogame-tools
// @version      1.0
// @description  Guarda y suma el histórico (7 días) de resultados de expediciones en Astrogame, aunque borres los mensajes
// @match        https://play.astrogame.org/uni25/game/messages*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const MESSCAT_EXPEDITIONS = 15;
    const STORAGE_KEY = 'astro_expedition_history_v1';
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    const SUFFIXES = [
        '', 'K', 'M', 'Mr', 'T', 'KaT', 'KeT', 'Ss', 'St', 'O', 'N', 'D', 'U',
        'DoS', 'TrD', 'KaD', 'KeD', 'SxD', 'SpD', 'OD', 'ND', 'V', 'UV', 'DV',
        'TV', 'QV', 'QQV', 'SxV', 'SpV', 'OV', 'NV', 'C', 'UC', 'DC', 'TC',
        'QC', 'QqC', 'SxC', 'SpC', 'OC', 'NC'
    ];

    function formatFull(n) {
        return Math.round(n).toLocaleString('es-ES');
    }

    function formatShort(n) {
        if (n === 0) return '0';
        const sign = n < 0 ? '-' : '';
        const abs = Math.abs(n);
        const exp = Math.min(Math.floor(Math.log10(abs) / 3), SUFFIXES.length - 1);
        if (exp <= 0) return sign + formatFull(abs);
        const value = abs / Math.pow(1000, exp);
        const decimals = value < 10 ? 1 : 0;
        return sign + value.toFixed(decimals).replace('.', ',') + ' ' + SUFFIXES[exp];
    }

    const MONTHS = { Ene: 0, Feb: 1, Mar: 2, Abr: 3, May: 4, Jun: 5, Jul: 6, Ago: 7, Sep: 8, Oct: 9, Nov: 10, Dic: 11 };

    function getServerNowFromDom() {
        const el = document.querySelector('.servertimeTop');
        if (!el) return null;
        const m = el.textContent.match(/(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (!m) return null;
        const [, dd, mm, yy, hh, min, ss] = m;
        const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
        const date = new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
        return isNaN(date.getTime()) ? null : date.getTime();
    }

    function getServerNow() {
        const fromDom = getServerNowFromDom();
        if (fromDom !== null) return fromDom;
        const st = window.serverTime;
        if (st instanceof Date && !isNaN(st.getTime())) {
            return st.getTime();
        }
        return Date.now();
    }

    function parseGameDate(str) {
        const m = String(str).match(/(\d{1,2})\.\s*(\p{L}+)\s+(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})/u);
        if (!m) return getServerNow();
        const [, day, monAbbr, year, hh, mm, ss] = m;
        const month = MONTHS[monAbbr] ?? 0;
        return new Date(Number(year), month, Number(day), Number(hh), Number(mm), Number(ss)).getTime();
    }

    const NUM = '([\\d.]+)';

    const PATTERNS = [
        {
            name: 'recursos',
            regex: new RegExp(`Han tra[ií]do Metal ${NUM}, Cristal ${NUM}, Deut[ée]rio ${NUM} y Materia Oscura ${NUM}`, 'i'),
            extract: (m) => ({
                metal: toNumber(m[1]),
                cristal: toNumber(m[2]),
                deuterio: toNumber(m[3]),
                materiaOscura: toNumber(m[4]),
            }),
        },
        {
            name: 'expedicion_vacia',
            regex: /volvemos con las manos vac[ií]as/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_retraso_navegador',
            regex: /c[aá]lculo err[oó]neo del Navegador/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_choque_nave',
            regex: /choc[oó] con una nave extra[ñn]a/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_combate_botin',
            regex: new RegExp(`Beneficios\\s*Metal:\\s*${NUM}\\s*Cristal:\\s*${NUM}\\s*Deut[ée]rio:\\s*${NUM}`, 'i'),
            extract: (m) => ({
                metal: toNumber(m[1]),
                cristal: toNumber(m[2]),
                deuterio: toNumber(m[3]),
                materiaOscura: 0,
            }),
        },
        {
            name: 'expedicion_fenomeno_espectral',
            regex: /fen[oó]meno extra[ñn]o espectral/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_nada_interesante',
            regex: /Aparte de algunas criaturas extra[ñn]as/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_amistad_vacio',
            regex: /hizo amistad con el vac[ií]o del universo/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_fiebre_selva',
            regex: /cumplea[ñn]os de los Capitanes/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_flota_perdida_reaccion',
            regex: /reacci[oó]n en cadena que explot[oó]/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_asteroide_materia_oscura',
            regex: /descubri[oó] un asteroide que tiene un n[uú]cleo/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_viento_gigante_roja',
            regex: /viento estelar de una gigante roja/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_anomalias_clase5',
            regex: /anomal[ií]as de color rojo en la clase 5/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_hipernave_destrozada',
            regex: /descubri[oó] una antigua hiper nave de carga desierta/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_naves_encontradas',
            regex: /restos de una expedici[oó]n anterior[\s\S]*/i,
            extract: (m) => extractShipsFound(m[0]),
        },
        {
            name: 'expedicion_materia_oscura_captada',
            regex: /ha logrado captar un poco de materia oscura/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_escasez_deuterio',
            regex: /escasez de deuterio/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_convoy_naves_civiles',
            regex: /convoy de naves civiles/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_salto_erroneo_retraso',
            regex: /el retorno llevar[aá] m[aá]s tiempo/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_virus_informatico',
            regex: /virus inform[aá]tico extra[ñn]o/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_salto_fallido_perdida',
            regex: /no pudo dar el salto hacia el espacio normal/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_supernova',
            regex: /bellas im[aá]genes de una supernova/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_alien_materia_oscura',
            regex: /alien a bordo de una peque[ñn]a nave/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_contaminacion_radioactiva',
            regex: /contaminaci[oó]n radioactiva/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_navegacion_salto_luna',
            regex: /termin[oó] el salto justo en una luna/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_planetoide_materias_primas',
            regex: /planetoide remoto de f[aá]cil acceso/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_asteroides_recursos',
            regex: /peque[ñn]o grupo de asteroides/i,
            extract: () => emptyTotals(),
        },
        {
            name: 'expedicion_estrella_muerte_naves',
            regex: /vieja estrella de la muerte[\s\S]*/i,
            extract: (m) => extractShipsFound(m[0]),
        },
        {
            name: 'expedicion_cementerio_naves',
            regex: /cementerio gigante de naves espaciales[\s\S]*/i,
            extract: (m) => extractShipsFound(m[0]),
        },
        {
            name: 'expedicion_nave_alienigena_contenedor',
            regex: /restos de una nave alien[ií]gena/i,
            extract: () => emptyTotals(),
        },
    ];

    function toNumber(raw) {
        const value = parseInt(String(raw).replace(/\./g, ''), 10);
        return isNaN(value) ? 0 : value;
    }

    function extractShipsFound(text) {
        const ships = {};
        const shipLineRegex = /([A-Za-zÁÉÍÓÚÑÜáéíóúñü][A-Za-zÁÉÍÓÚÑÜáéíóúñü\s]+?):\s*([\d.]+)/g;
        let sm;
        while ((sm = shipLineRegex.exec(text)) !== null) {
            const name = sm[1].trim();
            const qty = toNumber(sm[2]);
            if (qty > 0) ships[name] = (ships[name] || 0) + qty;
        }
        const totals = emptyTotals();
        totals.shipsGained = ships;
        return totals;
    }

    function emptyTotals() {
        return { metal: 0, cristal: 0, deuterio: 0, materiaOscura: 0 };
    }

    function parseMessageText(text) {
        const plain = text
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ');
        for (const pattern of PATTERNS) {
            const match = plain.match(pattern.regex);
            if (match) {
                return { recognized: true, deltas: pattern.extract(match) };
            }
        }
        return { recognized: false, rawText: plain.trim() };
    }

    function loadStore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { messages: {}, lastUpdated: 0 };
            const parsed = JSON.parse(raw);
            return { messages: parsed.messages || {}, lastUpdated: parsed.lastUpdated || 0 };
        } catch (e) {
            console.error('[AstroExpeditionCal] Error leyendo localStorage, se reinicia el histórico:', e);
            return { messages: {}, lastUpdated: 0 };
        }
    }

    function saveStore(store) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }

    function pruneStore(store) {
        const cutoff = getServerNow() - WEEK_MS;
        Object.keys(store.messages).forEach((id) => {
            if (store.messages[id].timestamp < cutoff) {
                delete store.messages[id];
            }
        });
    }

    async function fetchExpeditionPage(page) {
        const res = await fetch(
            `https://play.astrogame.org/uni25/game/messages/view?messcat=${MESSCAT_EXPEDITIONS}&site=${page}&ajax=1`,
            {
                credentials: 'include',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                },
            }
        );
        if (!res.ok) {
            throw new Error(`Respuesta HTTP ${res.status} al pedir la página ${page}`);
        }
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('json')) {
            throw new Error('El servidor no devolvió JSON (posible sesión caducada o endpoint cambiado)');
        }
        return res.json();
    }

    async function fetchAllExpeditionMessages() {
        const first = await fetchExpeditionPage(1);
        const messages = [...first.messages];
        const maxPage = first.maxPage || 1;

        if (maxPage > 1) {
            const rest = await Promise.all(
                Array.from({ length: maxPage - 1 }, (_, i) => fetchExpeditionPage(i + 2))
            );
            rest.forEach((r) => messages.push(...r.messages));
        }

        return messages;
    }

    function reparseUnrecognized(store) {
        Object.values(store.messages).forEach((entry) => {
            if (entry.recognized || !entry.rawText) return;
            const normalized = entry.rawText.replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
            for (const pattern of PATTERNS) {
                const match = normalized.match(pattern.regex);
                if (match) {
                    entry.recognized = true;
                    entry.deltas = pattern.extract(match);
                    entry.rawText = null;
                    break;
                }
            }
        });
    }

    async function updateHistory() {
        const store = loadStore();
        const messages = await fetchAllExpeditionMessages();

        messages.forEach((msg) => {
            if (store.messages[msg.id]) return;
            const parsed = parseMessageText(msg.text);
            store.messages[msg.id] = {
                timestamp: parseGameDate(msg.time),
                time: msg.time,
                recognized: parsed.recognized,
                deltas: parsed.recognized ? parsed.deltas : null,
                rawText: parsed.recognized ? null : parsed.rawText,
            };
        });

        reparseUnrecognized(store);
        store.lastUpdated = getServerNow();
        pruneStore(store);
        saveStore(store);
        return store;
    }

    function summarizeStore(store) {
        const nowServer = getServerNow();
        const weekCutoff = nowServer - WEEK_MS;
        const nowServerDate = new Date(nowServer);
        const todayCutoff = new Date(
            nowServerDate.getFullYear(),
            nowServerDate.getMonth(),
            nowServerDate.getDate()
        ).getTime();

        const totalsToday = emptyTotals();
        totalsToday.shipsGained = {};
        const totalsWeek = emptyTotals();
        totalsWeek.shipsGained = {};
        let countWeek = 0;
        let countToday = 0;
        let recognizedWeek = 0;
        let recognizedToday = 0;
        const unrecognized = [];

        function mergeShips(target, source) {
            Object.keys(source || {}).forEach((name) => {
                target[name] = (target[name] || 0) + source[name];
            });
        }

        Object.entries(store.messages).forEach(([id, entry]) => {
            if (entry.timestamp < weekCutoff) return;
            countWeek++;
            const isToday = entry.timestamp >= todayCutoff;
            if (isToday) countToday++;

            if (entry.recognized) {
                recognizedWeek++;
                if (isToday) recognizedToday++;
                Object.keys(entry.deltas).forEach((key) => {
                    if (key === 'shipsGained') {
                        mergeShips(totalsWeek.shipsGained, entry.deltas.shipsGained);
                        if (isToday) mergeShips(totalsToday.shipsGained, entry.deltas.shipsGained);
                        return;
                    }
                    totalsWeek[key] += entry.deltas[key];
                    if (isToday) totalsToday[key] += entry.deltas[key];
                });
            } else {
                unrecognized.push({ id, time: entry.time, text: entry.rawText });
            }
        });

        return {
            totalsToday, totalsWeek,
            countToday, countWeek,
            recognizedToday, recognizedWeek,
            unrecognized,
        };
    }

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'expeditionCalcPanel';
        panel.style.cssText = 'margin:12px 0;padding:10px;border-radius:8px;background:var(--secondary-700,#1f2937);color:var(--text-primary,#e2e8f0);';
        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                <strong>Resultado de expediciones (hoy / últimos 7 días)</strong>
                <button id="expeditionCalcBtn" class="button sm warning" type="button">Actualizar</button>
            </div>
            <div id="expeditionCalcResult" style="font-size:13px;">Cargando histórico guardado...</div>
        `;
        return panel;
    }

    function renderResult(container, summary, store) {
        const rows = [
            ['Metal', 'metal'],
            ['Cristal', 'cristal'],
            ['Deutério', 'deuterio'],
            ['Materia Oscura', 'materiaOscura'],
        ].map(([label, key]) => {
            const todayVal = summary.totalsToday[key];
            const weekVal = summary.totalsWeek[key];
            const todayCell = `<span class="tooltip-parent">${formatShort(todayVal)}<span class="tooltip topCenter">${formatFull(todayVal)}</span></span>`;
            const weekCell = `<span class="tooltip-parent">${formatShort(weekVal)}<span class="tooltip topCenter">${formatFull(weekVal)}</span></span>`;
            return `
                <tr>
                    <td style="padding:4px 10px;">${label}</td>
                    <td style="padding:4px 10px;">${todayCell}</td>
                    <td style="padding:4px 10px;">${weekCell}</td>
                </tr>
            `;
        }).join('');

        let warning = '';
        if (summary.unrecognized.length > 0) {
            warning = `
                <div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:var(--warning-700,#78350f);color:#fff;font-size:12px;">
                    ${summary.unrecognized.length} mensaje(s) no reconocido(s) dentro de los últimos 7 días (no incluido en la suma).
                    Revisa la consola del navegador para ver el texto y poder ampliar el script.
                </div>
            `;
            console.warn('[AstroExpeditionCal] Mensajes no reconocidos:', summary.unrecognized);
        }

        const shipNames = Array.from(new Set([
            ...Object.keys(summary.totalsToday.shipsGained || {}),
            ...Object.keys(summary.totalsWeek.shipsGained || {}),
        ]));
        let shipsTable = '';
        if (shipNames.length > 0) {
            const shipRows = shipNames.map((name) => `
                <tr>
                    <td style="padding:4px 10px;">${name}</td>
                    <td style="padding:4px 10px;">${summary.totalsToday.shipsGained[name] || 0}</td>
                    <td style="padding:4px 10px;">${summary.totalsWeek.shipsGained[name] || 0}</td>
                </tr>
            `).join('');
            shipsTable = `
                <table class="resourcesTable" style="width:100%;margin-top:10px;">
                    <tbody>
                        <tr class="tableHeader">
                            <td style="padding:4px 10px;">Naves encontradas</td>
                            <td style="padding:4px 10px;">Hoy</td>
                            <td style="padding:4px 10px;">Últimos 7 días</td>
                        </tr>
                        ${shipRows}
                    </tbody>
                </table>
            `;
        }

        const lastUpdatedStr = store.lastUpdated
            ? new Date(store.lastUpdated).toLocaleString('es-ES')
            : '—';

        container.innerHTML = `
            <table class="resourcesTable" style="width:100%;">
                <tbody>
                    <tr class="tableHeader">
                        <td style="padding:4px 10px;">&nbsp;</td>
                        <td style="padding:4px 10px;">Hoy (${summary.countToday})</td>
                        <td style="padding:4px 10px;">Últimos 7 días (${summary.countWeek})</td>
                    </tr>
                    ${rows}
                </tbody>
            </table>
            ${shipsTable}
            ${warning}
            <div style="margin-top:6px;font-size:11px;opacity:0.7;">Última actualización: ${lastUpdatedStr}</div>
        `;
    }

    async function refresh(panel) {
        const btn = panel.querySelector('#expeditionCalcBtn');
        const resultBox = panel.querySelector('#expeditionCalcResult');

        btn.disabled = true;
        btn.textContent = 'Cargando...';

        try {
            const store = await updateHistory();
            const summary = summarizeStore(store);
            renderResult(resultBox, summary, store);
        } catch (err) {
            resultBox.textContent = 'Error al actualizar: ' + err.message;
            console.error('[AstroExpeditionCal]', err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Actualizar';
        }
    }

    function renderFromCacheOnly(panel) {
        const store = loadStore();
        reparseUnrecognized(store);
        pruneStore(store);
        saveStore(store);
        const summary = summarizeStore(store);
        renderResult(panel.querySelector('#expeditionCalcResult'), summary, store);
    }

    function init() {
        if (document.getElementById('expeditionCalcPanel')) return;

        const header = document.querySelector('.pageMessagesDefault .pageHeader');
        if (!header) return;

        const panel = buildPanel();
        header.insertAdjacentElement('afterend', panel);

        renderFromCacheOnly(panel);

        panel.querySelector('#expeditionCalcBtn').addEventListener('click', () => refresh(panel));

        const expeditionTab = document.querySelector('button.messageCategory[data-id="15"]');
        if (expeditionTab) {
            expeditionTab.addEventListener('click', () => refresh(panel));
        }
    }

    init();
})();
