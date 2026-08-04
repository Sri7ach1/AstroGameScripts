// ==UserScript==
// @author       LoneW0lf
// @name         AstroGame Suite
// @namespace    astrogame-tools
// @version      0.37
// @description  Suite unificada de herramientas para Astrogame (expediciones, ROI, producción, flotas en vuelo, estadísticas de alianza)
// @source       https://raw.githubusercontent.com/Sri7ach1/AstroGameScripts/main/AstroGame%20Suite/AstroGame%20Suite.user.js
// @updateURL    https://raw.githubusercontent.com/Sri7ach1/AstroGameScripts/main/AstroGame%20Suite/AstroGame%20Suite.user.js
// @downloadURL  https://raw.githubusercontent.com/Sri7ach1/AstroGameScripts/main/AstroGame%20Suite/AstroGame%20Suite.user.js
// @match        https://play.astrogame.org/uni25/game/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ---------------------------------------------------------------------
    // Hora "del servidor"
    // ---------------------------------------------------------------------

    function getServerNowFromDom() {
        const el = document.querySelector('.servertimeTop');
        if (!el) return null;
        const m = el.textContent.trim().match(/(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{2}):(\d{2}):(\d{2})/);
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
        if (st instanceof Date && !isNaN(st.getTime())) return st.getTime();
        return Date.now();
    }

    // ---------------------------------------------------------------------
    // Storage seguro
    // ---------------------------------------------------------------------

    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.error('[AstroGame Suite] Error guardando en localStorage', key, e);
        }
    }

    // ---------------------------------------------------------------------
    // Formato de números
    // ---------------------------------------------------------------------

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

    function toNumber(raw) {
        const value = parseInt(String(raw).replace(/\./g, ''), 10);
        return isNaN(value) ? 0 : value;
    }

    // ---------------------------------------------------------------------
    // Escapado de HTML (para texto que viene del juego y puede estar
    // controlado por otro jugador: nombres de planeta, alianza, naves...)
    // ---------------------------------------------------------------------

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ---------------------------------------------------------------------
    // Parseo de flotas en vuelo (compartido entre el panel de la página de
    // flotas y el widget global de la barra de recursos)
    // ---------------------------------------------------------------------

    function parseShortValue(text) {
        if (!text) return 0;
        const clean = text.replace(/\u00A0/g, ' ').trim();
        const m = clean.match(/^(-?[\d.,]+)\s*([A-Za-zÀ-ÿ]*)$/);
        if (!m) return 0;
        const numPart = m[1].replace(/\./g, '').replace(',', '.');
        const num = parseFloat(numPart);
        if (isNaN(num)) return 0;
        const exp = m[2] ? SUFFIXES.indexOf(m[2]) : 0;
        const factor = exp > 0 ? Math.pow(1000, exp) : 1;
        return num * factor;
    }

    function parseFleetResources(tooltipEl) {
        const resources = { metal: 0, cristal: 0, deuterio: 0 };
        if (!tooltipEl) return resources;
        let inResources = false;
        Array.from(tooltipEl.children).forEach((child) => {
            if (child.classList.contains('tooltipCategory')) {
                inResources = child.textContent.trim() === 'Recursos';
                return;
            }
            if (!inResources || !child.classList.contains('tooltipItem')) return;
            const label = child.querySelector('.label')?.textContent.trim() || '';
            const value = parseShortValue(child.querySelector('.value')?.textContent);
            if (label === 'Metal') resources.metal += value;
            else if (label === 'Cristal') resources.cristal += value;
            else if (label.startsWith('Deut')) resources.deuterio += value;
        });
        return resources;
    }

    function readFleetCoords(cell) {
        if (!cell) return '';
        const name = cell.querySelector('.planetName')?.textContent.trim() || '';
        const coordsText = cell.querySelector('a')?.childNodes[0]?.textContent.trim() || '';
        return coordsText ? `${name} ${coordsText}` : name;
    }

    function readFleetsFromDoc(doc) {
        const rows = doc.querySelectorAll('table.fleetsTable tbody tr.fleetRows.own');
        // Una misión con vuelta aparece como dos filas con el mismo data-group
        // (tramo de ida y tramo de vuelta ya programado) y el mismo cargamento
        // en ambas, porque es la misma mercancía. Solo el tramo con el ETA más
        // próximo está realmente en curso ahora mismo; el otro es un tramo
        // futuro todavía no iniciado. Sin deduplicar, se contaba el mismo
        // cargamento dos veces.
        const byGroup = new Map();
        rows.forEach((row) => {
            const timeCell = row.querySelector('td.fleets2');
            const endTime = Number(timeCell?.getAttribute('data-fleet-end-time')) * 1000;
            const missionLabel = row.querySelector('td.mission .tooltip')?.textContent.trim()
                || row.querySelector('td.mission img')?.getAttribute('alt') || 'Misión';
            const direction = row.getAttribute('aria-details') === 'returning' ? 'Volviendo' : 'De ida';
            const source = readFleetCoords(row.querySelector('td.source'));
            const destination = readFleetCoords(row.querySelector('td.destination'));
            const resources = parseFleetResources(row.querySelector('.activeFleetTooltipContent'));
            const group = row.getAttribute('data-group') || row.id;

            const fleet = { id: row.id, group, endTime, missionLabel, direction, source, destination, resources };
            const existing = byGroup.get(group);
            if (!existing || fleet.endTime < existing.endTime) {
                byGroup.set(group, fleet);
            }
        });
        return Array.from(byGroup.values());
    }

    function sumFleetResources(fleets) {
        return fleets.reduce((acc, f) => {
            acc.metal += f.resources.metal;
            acc.cristal += f.resources.cristal;
            acc.deuterio += f.resources.deuterio;
            return acc;
        }, { metal: 0, cristal: 0, deuterio: 0 });
    }

    // ---------------------------------------------------------------------
    // UI compartida (panel + tablas al estilo nativo del juego)
    // ---------------------------------------------------------------------

    function createPanel({ id, title, primaryLabel, primaryId, secondaryLabel, secondaryId }) {
        const panel = document.createElement('div');
        if (id) panel.id = id;
        panel.style.cssText = 'margin:12px 0;padding:10px;border-radius:8px;background:var(--secondary-700,#1f2937);color:var(--text-primary,#e2e8f0);font-family:inherit;';

        const secondaryBtnHtml = secondaryLabel
            ? `<button id="${secondaryId}" class="button sm text" type="button">${secondaryLabel}</button>`
            : '';

        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                <strong>${title}</strong>
                <div style="display:flex;gap:6px;">
                    ${secondaryBtnHtml}
                    <button id="${primaryId}" class="button sm warning" type="button">${primaryLabel}</button>
                </div>
            </div>
            <div class="panelBody" style="font-size:13px;"></div>
        `;

        return {
            panel,
            primaryBtn: panel.querySelector(`#${primaryId}`),
            secondaryBtn: secondaryId ? panel.querySelector(`#${secondaryId}`) : null,
            body: panel.querySelector('.panelBody'),
        };
    }

    function insertPanelAfter(anchorEl, panel) {
        anchorEl.insertAdjacentElement('afterend', panel);
    }

    function buildResourceTable(headerCells, rows) {
        // Escapa siempre: aunque hoy no hay llamadas internas a esta función,
        // se expone vía ctx a cualquier módulo, y un módulo futuro podría
        // pasarle texto controlado por otro jugador (nombre de planeta, etc.).
        const headerHtml = headerCells.map((c) => `<td style="padding:4px 10px;">${escapeHtml(c)}</td>`).join('');
        const rowsHtml = rows.map((row) => {
            const cellsHtml = row.map((cell) => {
                if (cell && typeof cell === 'object' && 'short' in cell) {
                    return `<td class="tooltip-parent" style="padding:4px 10px;">${escapeHtml(cell.short)}<span class="tooltip topCenter">${escapeHtml(cell.full)}</span></td>`;
                }
                return `<td style="padding:4px 10px;">${escapeHtml(cell)}</td>`;
            }).join('');
            return `<tr>${cellsHtml}</tr>`;
        }).join('');

        return `
            <table class="resourcesTable" style="width:100%;">
                <tbody>
                    <tr class="tableHeader">${headerHtml}</tr>
                    ${rowsHtml}
                </tbody>
            </table>
        `;
    }

    // ---------------------------------------------------------------------
    // Barra lateral: registrar/quitar botones de navegación
    // ---------------------------------------------------------------------

    function addNavButton({ id, label, onClick }) {
        const chatLink = document.querySelector('.sidebarNavList a.chatNavItem');
        if (!chatLink) return null;

        const existing = document.getElementById(id);
        if (existing) return existing;

        const link = document.createElement('a');
        link.id = id;
        link.className = 'navItem';
        link.href = '#';
        link.innerHTML = `<span>${label}</span>`;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            onClick();
        });
        chatLink.insertAdjacentElement('afterend', link);
        return link;
    }

    function removeNavButton(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // ---------------------------------------------------------------------
    // Registro de módulos
    // ---------------------------------------------------------------------

    const MODULES = [
        {
            id: 'expeditionCalc',
            label: 'Expedition Calc',
            matches: (path) => path.startsWith('/uni25/game/messages'),
            init: initExpeditionCalc,
        },
        {
            id: 'expeditionReminder',
            label: 'Expedition Reminder',
            matches: () => true,
            init: initExpeditionReminder,
        },
        {
            id: 'resourceDashboard',
            label: 'Dashboard de recursos',
            matches: (path) =>
                path.startsWith('/uni25/game/feedstock') ||
                path.startsWith('/uni25/game/buildings') ||
                path.startsWith('/uni25/game/research'),
            init: initResourceDashboard,
            settingsInit: registerResourceDashboardSettings,
        },
        {
            id: 'cerealStats',
            label: 'Cereal Stats',
            matches: (path) => path.startsWith('/uni25/game/alliance/memberList'),
            init: initCerealStats,
        },
        {
            id: 'highlighter',
            label: 'Resaltado',
            matches: (path) =>
                path.startsWith('/uni25/game/alliance/memberList') ||
                path.startsWith('/uni25/game/messages') ||
                path.startsWith('/uni25/game/galaxy'),
            init: initHighlighter,
            settingsInit: registerHighlighterSettings,
        },
        {
            id: 'usability',
            label: 'Skin & usabilidad',
            matches: () => true,
            init: initUsability,
            settingsInit: registerUsabilitySettings,
        },
        {
            id: 'flyResources',
            label: 'Fly Resources',
            matches: (path) => path.startsWith('/uni25/game/fleetTable'),
            init: initFlyResources,
        },
        {
            id: 'flyResourcesWidget',
            label: 'Fly Resources (widget global)',
            matches: () => true,
            init: initFlyResourcesWidget,
        },
    ];

    // ---------------------------------------------------------------------
    // Módulo: Expedition Calc
    // ---------------------------------------------------------------------

    function initExpeditionCalc(ctx) {
        const MESSCAT_EXPEDITIONS = 15;
        const STORAGE_KEY = 'astro_expedition_history_v1';
        const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        const MONTHS = { Ene: 0, Feb: 1, Mar: 2, Abr: 3, May: 4, Jun: 5, Jul: 6, Ago: 7, Sep: 8, Oct: 9, Nov: 10, Dic: 11 };

        function parseGameDate(str) {
            const m = String(str).match(/(\d{1,2})\.\s*(\p{L}+)\s+(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})/u);
            if (!m) return ctx.getServerNow();
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
                    metal: ctx.toNumber(m[1]),
                    cristal: ctx.toNumber(m[2]),
                    deuterio: ctx.toNumber(m[3]),
                    materiaOscura: ctx.toNumber(m[4]),
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
                    metal: ctx.toNumber(m[1]),
                    cristal: ctx.toNumber(m[2]),
                    deuterio: ctx.toNumber(m[3]),
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
                name: 'expedicion_regreso_anticipado_sin_novedades',
                regex: /nada interesante que informar/i,
                extract: () => emptyTotals(),
            },
            {
                name: 'expedicion_amistad_vacio',
                regex: /hizo amistad con el vac[ií]o del universo/i,
                extract: () => emptyTotals(),
            },
            {
                name: 'expedicion_yacimientos_minerales_luna',
                regex: /grandes yacimientos minerales/i,
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
                name: 'expedicion_restos_naves_antiguos_reciclaje',
                regex: /restos de naves muy antiguos/i,
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
                name: 'expedicion_base_pirata_naves',
                regex: /base abandonada de piratas[\s\S]*/i,
                extract: (m) => extractShipsFound(m[0]),
            },
            {
                name: 'expedicion_materia_oscura_captada',
                regex: /ha logrado captar un poco de materia oscura/i,
                extract: () => emptyTotals(),
            },
            {
                name: 'expedicion_nave_fantasma_materia_oscura',
                regex: /nave fantasma que transportaba/i,
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
                name: 'expedicion_tormenta_particulas_retraso',
                regex: /tormentas de part[ií]culas amplificadas/i,
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
            {
                name: 'expedicion_planos_agujero_negro',
                regex: /apertura de[\s\S]*?agujero negro/i,
                extract: () => emptyTotals(),
            },
            {
                name: 'expedicion_naves_naufragadas',
                regex: /naves naufragadas[\s\S]*/i,
                extract: (m) => extractShipsFound(m[0]),
            },
            {
                name: 'expedicion_agujero_gusano_atajo',
                regex: /agujeros? de gusano inestables/i,
                extract: () => emptyTotals(),
            },
        ];

        function extractShipsFound(text) {
            const ships = {};
            const shipLineRegex = /([A-Za-zÁÉÍÓÚÑÜáéíóúñü][A-Za-zÁÉÍÓÚÑÜáéíóúñü\s]+?):\s*([\d.]+)/g;
            let sm;
            while ((sm = shipLineRegex.exec(text)) !== null) {
                const name = sm[1].trim();
                const qty = ctx.toNumber(sm[2]);
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
                    return { recognized: true, deltas: pattern.extract(match), patternName: pattern.name };
                }
            }
            return { recognized: false, rawText: plain.trim() };
        }

        function loadStore() {
            return ctx.readJSON(STORAGE_KEY, { messages: {}, lastUpdated: 0 });
        }

        function saveStore(store) {
            ctx.writeJSON(STORAGE_KEY, store);
        }

        function pruneStore(store) {
            const cutoff = ctx.getServerNow() - WEEK_MS;
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

            for (const msg of messages) {
                if (store.messages[msg.id]) continue;
                const parsed = parseMessageText(msg.text);
                const entry = {
                    timestamp: parseGameDate(msg.time),
                    time: msg.time,
                    recognized: parsed.recognized,
                    deltas: parsed.recognized ? parsed.deltas : null,
                    rawText: parsed.recognized ? null : parsed.rawText,
                };
                store.messages[msg.id] = entry;
            }

            reparseUnrecognized(store);
            store.lastUpdated = ctx.getServerNow();
            pruneStore(store);
            saveStore(store);
            return store;
        }

        function summarizeStore(store) {
            const nowServer = ctx.getServerNow();
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
                            mergeShips(totalsWeek[key], entry.deltas[key]);
                            if (isToday) mergeShips(totalsToday[key], entry.deltas[key]);
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

        function renderResult(container, summary, store) {
            const rows = [
                ['Metal', 'metal'],
                ['Cristal', 'cristal'],
                ['Deutério', 'deuterio'],
                ['Materia Oscura', 'materiaOscura'],
            ].map(([label, key]) => {
                const todayVal = summary.totalsToday[key];
                const weekVal = summary.totalsWeek[key];
                const todayCell = `<span class="tooltip-parent">${ctx.formatShort(todayVal)}<span class="tooltip topCenter">${ctx.formatFull(todayVal)}</span></span>`;
                const weekCell = `<span class="tooltip-parent">${ctx.formatShort(weekVal)}<span class="tooltip topCenter">${ctx.formatFull(weekVal)}</span></span>`;
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
                console.warn('[AstroGame Suite] [expeditionCalc] Mensajes no reconocidos:', summary.unrecognized);
            }

            const shipNames = Array.from(new Set([
                ...Object.keys(summary.totalsToday.shipsGained || {}),
                ...Object.keys(summary.totalsWeek.shipsGained || {}),
            ]));
            let shipsTable = '';
            if (shipNames.length > 0) {
                const shipRows = shipNames.map((name) => `
                    <tr>
                        <td style="padding:4px 10px;">${ctx.escapeHtml(name)}</td>
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

        async function refresh(primaryBtn, body) {
            primaryBtn.disabled = true;
            primaryBtn.textContent = 'Cargando...';

            try {
                const store = await updateHistory();
                const summary = summarizeStore(store);
                renderResult(body, summary, store);
            } catch (err) {
                body.textContent = 'Error al actualizar: ' + err.message;
                console.error('[AstroGame Suite] [expeditionCalc]', err);
            } finally {
                primaryBtn.disabled = false;
                primaryBtn.textContent = 'Actualizar';
            }
        }

        function renderFromCacheOnly(body) {
            const store = loadStore();
            reparseUnrecognized(store);
            pruneStore(store);
            saveStore(store);
            const summary = summarizeStore(store);
            renderResult(body, summary, store);
        }

        if (document.getElementById('expeditionCalcPanel')) return;

        const header = document.querySelector('.pageMessagesDefault .pageHeader');
        if (!header) return;

        const { panel, primaryBtn, body } = ctx.createPanel({
            id: 'expeditionCalcPanel',
            title: 'Resultado de expediciones (hoy / últimos 7 días)',
            primaryLabel: 'Actualizar',
            primaryId: 'expeditionCalcBtn',
        });
        ctx.insertPanelAfter(header, panel);
        body.textContent = 'Cargando histórico guardado...';

        renderFromCacheOnly(body);

        primaryBtn.addEventListener('click', () => refresh(primaryBtn, body));

        const expeditionTab = document.querySelector('button.messageCategory[data-id="15"]');
        if (expeditionTab) {
            expeditionTab.addEventListener('click', () => refresh(primaryBtn, body));
        }
    }

    // ---------------------------------------------------------------------
    // Módulo: Expedition Reminder
    // ---------------------------------------------------------------------

    function initExpeditionReminder(ctx) {
        const MISSION_EXPEDITION = '15';
        const REMINDER_ID = 'astroExpeditionReminder';
        const HIDDEN_KEY = 'astroExpeditionReminderHidden';
        const NAV_BTN_ID = 'astroExpeditionReminderNavBtn';

        function isHidden() {
            return localStorage.getItem(HIDDEN_KEY) === '1';
        }

        function setHidden(value) {
            if (value) {
                localStorage.setItem(HIDDEN_KEY, '1');
            } else {
                localStorage.removeItem(HIDDEN_KEY);
            }
        }

        function getOwnExpeditionsInFlight() {
            let acts;
            try {
                acts = activeFleetActs;
            } catch (e) {
                return null;
            }
            if (!Array.isArray(acts)) return null;
            return acts.filter((a) => a.mission === MISSION_EXPEDITION && a.is_own === true);
        }

        function hideReminder() {
            const banner = document.getElementById(REMINDER_ID);
            if (banner) banner.remove();
            setHidden(true);
        }

        function renderBanner({ bgColor, icon, title, message, showLink, closeHidesPermanently }) {
            if (document.getElementById(REMINDER_ID)) return;

            const banner = document.createElement('div');
            banner.id = REMINDER_ID;
            banner.style.cssText = `
                position:fixed; top:70px; left:16px; z-index:99999;
                background:${bgColor}; color:#fff; padding:10px 14px; border-radius:8px;
                box-shadow:0 4px 12px rgba(0,0,0,.4); font-size:13px; max-width:260px;
                display:flex; align-items:flex-start; gap:8px; font-family:inherit;
            `;
            banner.innerHTML = `
                <span style="font-size:20px;line-height:1;">${icon}</span>
                <div style="flex:1;">
                    <strong>${title}</strong><br>
                    ${message}
                    ${showLink ? `
                    <div style="margin-top:6px;">
                        <a href="https://play.astrogame.org/uni25/game/fleetTable"
                           style="color:#fed7aa;text-decoration:underline;">Ir a la Base de la Flota</a>
                    </div>` : ''}
                </div>
                <button id="astroExpeditionReminderClose" type="button"
                        style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;line-height:1;padding:0;">
                    &times;
                </button>
            `;
            document.body.appendChild(banner);

            banner.querySelector('#astroExpeditionReminderClose').addEventListener('click', () => {
                banner.remove();
                if (closeHidesPermanently) setHidden(true);
            });
        }

        function showNoExpeditionsReminder() {
            setHidden(false);
            renderBanner({
                bgColor: '#7c2d12',
                icon: '🚀',
                title: 'Sin expediciones en el aire',
                message: 'No tienes ninguna expedición volando ahora mismo.',
                showLink: true,
                closeHidesPermanently: true,
            });
        }

        function showActiveExpeditionsNotice() {
            renderBanner({
                bgColor: '#4590b5',
                icon: '🛰️',
                title: 'Ya hay expediciones activas',
                message: 'Tienes expediciones volando ahora mismo.',
                showLink: false,
                closeHidesPermanently: false,
            });
        }

        function toggleReminder() {
            if (document.getElementById(REMINDER_ID)) {
                hideReminder();
                return;
            }

            const ownExpeditions = getOwnExpeditionsInFlight();
            if (ownExpeditions && ownExpeditions.length > 0) {
                showActiveExpeditionsNotice();
            } else {
                showNoExpeditionsReminder();
            }
        }

        ctx.addNavButton({ id: NAV_BTN_ID, label: 'Expedition Reminder', onClick: toggleReminder });

        const ownExpeditions = getOwnExpeditionsInFlight();
        if (ownExpeditions === null) return;
        if (ownExpeditions.length === 0 && !isHidden()) {
            showNoExpeditionsReminder();
        }
    }

    // ---------------------------------------------------------------------
    // Módulo: Dashboard de recursos (fusiona Resource Calc + ROI)
    // ---------------------------------------------------------------------

    function registerResourceDashboardSettings(ctx) {
        ctx.registerSettingsSection('resourceDashboard', (container, settings) => {
            container.innerHTML = `
                <div style="margin-bottom:6px;">Astro ROI (minas e investigaciones de producción)</div>
                <label style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="roiShowAllDefault" ${settings.roiShowAllDefault ? 'checked' : ''} />
                    <span>Mostrar mejoras no comprables por defecto</span>
                </label>
            `;
            container.querySelector('#roiShowAllDefault').addEventListener('change', (e) => {
                ctx.setModuleSettings('resourceDashboard', { roiShowAllDefault: e.target.checked });
            });
        });
    }

    function initResourceDashboard(ctx) {
        if (window.location.pathname.startsWith('/uni25/game/feedstock')) {
            initResourceCalc(ctx);
        } else {
            initRoi(ctx);
        }
    }

    function initRoi(ctx) {
        const RESOURCE_LABELS = { '901': 'Metal', '902': 'Cristal', '903': 'Deutério' };
        const VALUE_WEIGHTS = { '901': 1, '902': 2, '903': 4 };

        function extractObjectLiteral(text, marker) {
            const idx = text.indexOf(marker);
            if (idx === -1) return null;
            let i = idx + marker.length;
            while (i < text.length && text[i] !== '{') i++;
            if (text[i] !== '{') return null;
            const start = i;
            let depth = 0;
            let inString = false;
            let quoteChar = '';
            for (; i < text.length; i++) {
                const ch = text[i];
                if (inString) {
                    if (ch === '\\') { i++; continue; }
                    if (ch === quoteChar) inString = false;
                    continue;
                }
                if (ch === '"' || ch === "'") { inString = true; quoteChar = ch; continue; }
                if (ch === '{') depth++;
                else if (ch === '}') {
                    depth--;
                    if (depth === 0) { i++; break; }
                }
            }
            const literal = text.slice(start, i);
            try {
                return JSON.parse(literal);
            } catch (e) {
                console.error('[AstroGame Suite] [roi] No se pudo parsear', marker, e);
                return null;
            }
        }

        function findInInlineScripts(marker) {
            const scripts = document.querySelectorAll('script:not([src])');
            for (const script of scripts) {
                const text = script.textContent;
                if (text && text.includes(marker)) {
                    const parsed = extractObjectLiteral(text, marker);
                    if (parsed) return parsed;
                }
            }
            return null;
        }

        function getResourceProductionFromDom() {
            const table = {};
            document.querySelectorAll('.resourceCardTooltip[data-id]').forEach((el) => {
                const id = el.getAttribute('data-id');
                const raw = el.getAttribute('data-production');
                if (!raw) return;
                const value = ctx.toNumber(raw);
                if (!isNaN(value)) table[id] = { production: value };
            });
            return table;
        }

        function getPageData() {
            return {
                buildingData: findInInlineScripts('let buildingData = '),
                researchData: findInInlineScripts('let researchData = '),
                resourceTable: getResourceProductionFromDom(),
            };
        }

        function weightedValue(costResources) {
            if (!costResources) return 0;
            return ['901', '902', '903'].reduce((sum, key) => sum + (Number(costResources[key]) || 0) * VALUE_WEIGHTS[key], 0);
        }

        function mineProductionRatio(currentLevel, targetLevel) {
            return (targetLevel / currentLevel) * Math.pow(1.1, targetLevel - currentLevel);
        }

        function computeMineROI(buildingData, resourceTable, buildingId, resKey, label, showAll) {
            const b = buildingData[buildingId];
            if (!b || (!showAll && !b.buyable)) return null;
            const currentLevel = Number(b.level);
            if (!currentLevel) return null;
            const targetLevel = currentLevel + 1;
            const currentProduction = resourceTable[resKey]?.production;
            if (!currentProduction) return null;

            const ratio = mineProductionRatio(currentLevel, targetLevel);
            const extraPerDay = currentProduction * (ratio - 1) * 24;
            const extraValuePerDay = extraPerDay * VALUE_WEIGHTS[resKey];
            if (extraValuePerDay <= 0) return null;

            const costValue = weightedValue(b.costResources);
            return {
                label, currentLevel, targetLevel, costResources: b.costResources,
                extraPerDay, resKey, days: costValue / extraValuePerDay, buyable: !!b.buyable,
            };
        }

        function computeTechROI(researchData, resourceTable, techId, resKey, label, showAll) {
            const r = researchData[techId];
            if (!r || (!showAll && !r.buyable)) return null;
            const currentLevel = Number(r.level);
            if (!currentLevel && currentLevel !== 0) return null;
            const targetLevel = currentLevel + 1;
            const currentProduction = resourceTable[resKey]?.production;
            if (!currentProduction) return null;

            const currentFactor = 1 + 0.10 * currentLevel;
            const targetFactor = 1 + 0.10 * targetLevel;
            const baseProduction = currentProduction / currentFactor;
            const extraPerDay = baseProduction * (targetFactor - currentFactor) * 24;
            const extraValuePerDay = extraPerDay * VALUE_WEIGHTS[resKey];
            if (extraValuePerDay <= 0) return null;

            const costValue = weightedValue(r.costResources);
            return {
                label, currentLevel, targetLevel, costResources: r.costResources,
                extraPerDay, resKey, days: costValue / extraValuePerDay, buyable: !!r.buyable,
            };
        }

        function renderRow(entry) {
            const costParts = ['901', '902', '903']
                .filter((k) => entry.costResources[k])
                .map((k) => `${RESOURCE_LABELS[k]} ${ctx.formatShort(entry.costResources[k])}`)
                .join(' + ');
            const rowStyle = entry.buyable ? '' : 'style="opacity:0.6;"';
            const notBuyableTag = entry.buyable ? '' : ' <em>(no disponible aún)</em>';
            return `
                <tr ${rowStyle}>
                    <td style="padding:4px 10px;">${entry.label}${notBuyableTag}</td>
                    <td style="padding:4px 10px;">${entry.currentLevel} → ${entry.targetLevel}</td>
                    <td style="padding:4px 10px;">${costParts}</td>
                    <td style="padding:4px 10px;">+${ctx.formatShort(entry.extraPerDay)} ${RESOURCE_LABELS[entry.resKey]}/día</td>
                    <td style="padding:4px 10px;font-weight:bold;">${entry.days.toFixed(1)} días</td>
                </tr>
            `;
        }

        function renderResult(container, entries) {
            if (entries.length === 0) {
                container.innerHTML = '<div>No hay mejoras disponibles para calcular ahora mismo (revisa que las minas/investigaciones no estén al máximo o en cola sin datos de costo).</div>';
                return;
            }
            entries.sort((a, b) => a.days - b.days);
            const rows = entries.map(renderRow).join('');
            container.innerHTML = `
                <table class="resourcesTable" style="width:100%;">
                    <tbody>
                        <tr class="tableHeader">
                            <td style="padding:4px 10px;">Mejora</td>
                            <td style="padding:4px 10px;">Nivel</td>
                            <td style="padding:4px 10px;">Costo</td>
                            <td style="padding:4px 10px;">Producción extra</td>
                            <td style="padding:4px 10px;">ROI</td>
                        </tr>
                        ${rows}
                    </tbody>
                </table>
            `;
        }

        function refresh(primaryBtn, body, showAllCheckbox) {
            primaryBtn.disabled = true;
            primaryBtn.textContent = 'Cargando...';
            const showAll = showAllCheckbox.checked;

            try {
                const { buildingData, researchData, resourceTable } = getPageData();
                if (!Object.keys(resourceTable).length) throw new Error('No se pudo leer la producción actual de recursos (tooltips) de la página');

                const entries = [];
                if (buildingData) {
                    entries.push(computeMineROI(buildingData, resourceTable, '1', '901', 'Mina de Metal', showAll));
                    entries.push(computeMineROI(buildingData, resourceTable, '2', '902', 'Mina de Cristal', showAll));
                    entries.push(computeMineROI(buildingData, resourceTable, '3', '903', 'Sintetizador de Deuterio', showAll));
                }
                if (researchData) {
                    entries.push(computeTechROI(researchData, resourceTable, '131', '901', 'Máxima producción de metal', showAll));
                    entries.push(computeTechROI(researchData, resourceTable, '132', '902', 'Máxima producción de cristal', showAll));
                    entries.push(computeTechROI(researchData, resourceTable, '133', '903', 'Máxima producción de deuterio', showAll));
                }

                renderResult(body, entries.filter(Boolean));
            } catch (err) {
                body.textContent = 'Error al calcular: ' + err.message;
                console.error('[AstroGame Suite] [roi]', err);
            } finally {
                primaryBtn.disabled = false;
                primaryBtn.textContent = 'Actualizar';
            }
        }

        if (document.getElementById('astroRoiPanel')) return;

        const header = document.querySelector('.pageHeader');
        if (!header) return;

        const { panel, primaryBtn, body } = ctx.createPanel({
            id: 'astroRoiPanel',
            title: 'Astro ROI — Días para recuperar la inversión',
            primaryLabel: 'Actualizar',
            primaryId: 'astroRoiBtn',
        });

        const roiShowAllDefault = ctx.getModuleSettings('resourceDashboard').roiShowAllDefault === true;
        const showAllLabel = document.createElement('label');
        showAllLabel.style.cssText = 'font-weight:normal;font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;';
        showAllLabel.innerHTML = `<input type="checkbox" id="astroRoiShowAll" ${roiShowAllDefault ? 'checked' : ''}> Mostrar no comprables`;
        primaryBtn.parentElement.insertBefore(showAllLabel, primaryBtn);
        const showAllCheckbox = showAllLabel.querySelector('#astroRoiShowAll');

        ctx.insertPanelAfter(header, panel);
        body.textContent = 'Cargando...';

        refresh(primaryBtn, body, showAllCheckbox);
        primaryBtn.addEventListener('click', () => refresh(primaryBtn, body, showAllCheckbox));
        showAllCheckbox.addEventListener('change', () => refresh(primaryBtn, body, showAllCheckbox));
    }

    // ---------------------------------------------------------------------
    // Módulo: Fly Resources
    // ---------------------------------------------------------------------

    function initFlyResources(ctx) {
        function formatDuration(ms) {
            const totalSeconds = Math.max(0, Math.floor(ms / 1000));
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(h)}:${pad(m)}:${pad(s)}`;
        }

        function renderRow(fleet, now) {
            // missionLabel/source/destination leen texto del DOM del juego
            // (nombre de misión, nombre de planeta origen/destino) y el
            // destino puede pertenecer a otro jugador, así que se escapan
            // antes de insertarlos vía innerHTML.
            return `
                <tr>
                    <td style="padding:4px 10px;">${formatDuration(fleet.endTime - now)}</td>
                    <td style="padding:4px 10px;">${ctx.escapeHtml(fleet.missionLabel)} (${fleet.direction})</td>
                    <td style="padding:4px 10px;">${ctx.escapeHtml(fleet.source)}</td>
                    <td style="padding:4px 10px;">${ctx.escapeHtml(fleet.destination)}</td>
                    <td style="padding:4px 10px;">${ctx.formatShort(fleet.resources.metal)}</td>
                    <td style="padding:4px 10px;">${ctx.formatShort(fleet.resources.cristal)}</td>
                    <td style="padding:4px 10px;">${ctx.formatShort(fleet.resources.deuterio)}</td>
                </tr>
            `;
        }

        function renderResult(container, fleets) {
            if (fleets.length === 0) {
                container.innerHTML = '<div>No hay flotas propias en vuelo ahora mismo.</div>';
                return;
            }
            const now = ctx.getServerNow();
            fleets.sort((a, b) => a.endTime - b.endTime);
            const totals = sumFleetResources(fleets);

            const rows = fleets.map((f) => renderRow(f, now)).join('');
            container.innerHTML = `
                <table class="resourcesTable" style="width:100%;">
                    <tbody>
                        <tr class="tableHeader">
                            <td style="padding:4px 10px;">Llegada</td>
                            <td style="padding:4px 10px;">Misión</td>
                            <td style="padding:4px 10px;">Origen</td>
                            <td style="padding:4px 10px;">Destino</td>
                            <td style="padding:4px 10px;">Metal</td>
                            <td style="padding:4px 10px;">Cristal</td>
                            <td style="padding:4px 10px;">Deutério</td>
                        </tr>
                        ${rows}
                        <tr style="font-weight:bold;border-top:1px solid rgba(255,255,255,.15);">
                            <td style="padding:4px 10px;" colspan="4">Total (${fleets.length} flotas)</td>
                            <td style="padding:4px 10px;">${ctx.formatShort(totals.metal)}</td>
                            <td style="padding:4px 10px;">${ctx.formatShort(totals.cristal)}</td>
                            <td style="padding:4px 10px;">${ctx.formatShort(totals.deuterio)}</td>
                        </tr>
                    </tbody>
                </table>
            `;
        }

        function refresh(primaryBtn, body) {
            primaryBtn.disabled = true;
            primaryBtn.textContent = 'Cargando...';
            try {
                renderResult(body, readFleetsFromDoc(document));
            } catch (err) {
                body.textContent = 'Error al calcular: ' + err.message;
                console.error('[AstroGame Suite] [flyResources]', err);
            } finally {
                primaryBtn.disabled = false;
                primaryBtn.textContent = 'Actualizar';
            }
        }

        if (document.getElementById('astroFlyResourcesPanel')) return;

        const table = document.querySelector('table.fleetsTable');
        if (!table || !table.parentElement) return;

        const { panel, primaryBtn, body } = ctx.createPanel({
            id: 'astroFlyResourcesPanel',
            title: 'Fly Resources — Recursos en vuelo',
            primaryLabel: 'Actualizar',
            primaryId: 'astroFlyResourcesBtn',
        });
        table.parentElement.insertBefore(panel, table);
        body.textContent = 'Cargando...';

        refresh(primaryBtn, body);
        primaryBtn.addEventListener('click', () => refresh(primaryBtn, body));
    }

    // ---------------------------------------------------------------------
    // Módulo: Fly Resources — widget global (menú lateral, cualquier página)
    // ---------------------------------------------------------------------

    function initFlyResourcesWidget(ctx) {
        const CACHE_KEY = 'astro_fly_resources_widget_cache_v1';
        const CACHE_TTL_MS = 60 * 1000;
        const CARD_ID = 'astroFlyResourcesCard';
        const CLOCK_ID = 'astroFlyResourcesClock';

        let countdownIntervalId = null;

        function formatDuration(ms) {
            const totalSeconds = Math.max(0, Math.floor(ms / 1000));
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(h)}:${pad(m)}:${pad(s)}`;
        }

        function startCountdown(maxEndTime) {
            if (countdownIntervalId) clearInterval(countdownIntervalId);
            if (!maxEndTime) return;

            function tick() {
                const el = document.getElementById(CLOCK_ID);
                if (!el) { clearInterval(countdownIntervalId); return; }
                el.textContent = `Última entrega: ${formatDuration(maxEndTime - ctx.getServerNow())}`;
            }

            tick();
            countdownIntervalId = setInterval(tick, 1000);
        }

        function renderCard(totals, count, maxEndTime, stale, errored) {
            let card = document.getElementById(CARD_ID);
            if (!card) {
                const list = document.querySelector('.sidebarNavList');
                if (!list) return;
                card = document.createElement('div');
                card.id = CARD_ID;
                list.insertBefore(card, list.firstChild);
            }
            card.style.cssText = `
                margin:6px 10px 10px;padding:8px 12px;border-radius:8px;
                background:var(--secondary-700,#1f2937);color:var(--text-primary,#e2e8f0);
                font-family:inherit;opacity:${stale ? '0.6' : '1'};
            `;
            card.innerHTML = `
                <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px;">
                    <span>🚀</span><span>En vuelo${count ? ` (${count})` : ''}</span>
                </div>
                <div style="font-size:11px;opacity:0.8;margin-top:4px;line-height:1.6;">
                    <div>Metal: ${ctx.formatShort(totals.metal)}</div>
                    <div>Cristal: ${ctx.formatShort(totals.cristal)}</div>
                    <div>Deutério: ${ctx.formatShort(totals.deuterio)}</div>
                    ${maxEndTime ? `<div id="${CLOCK_ID}" style="margin-top:2px;font-weight:600;"></div>` : ''}
                    ${errored ? '<div style="margin-top:4px;color:var(--warning-400,#fbbf24);">⚠ No se pudo actualizar</div>' : ''}
                </div>
            `;
            startCountdown(maxEndTime);
        }

        async function loadFleets() {
            if (window.location.pathname.startsWith('/uni25/game/fleetTable')) {
                return readFleetsFromDoc(document);
            }
            const res = await fetch('https://play.astrogame.org/uni25/game/fleetTable', { credentials: 'include' });
            if (!res.ok) {
                throw new Error(`Respuesta HTTP ${res.status} al pedir la Base de la Flota`);
            }
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            return readFleetsFromDoc(doc);
        }

        async function refresh() {
            try {
                const fleets = await loadFleets();
                const totals = sumFleetResources(fleets);
                // Solo cuentan los tramos "De ida" que además llevan carga: un
                // ataque también es "De ida" pero no entrega recursos, y un
                // tramo "Volviendo" ya entregó su carga y solo regresa vacío/de
                // vuelta al origen. Ninguno de los dos es una "entrega" real.
                const hasCargo = (f) => f.resources.metal > 0 || f.resources.cristal > 0 || f.resources.deuterio > 0;
                const deliveryFleets = fleets.filter((f) => f.direction !== 'Volviendo' && hasCargo(f));
                const maxEndTime = deliveryFleets.length ? Math.max(...deliveryFleets.map((f) => f.endTime)) : null;
                ctx.writeJSON(CACHE_KEY, { timestamp: ctx.getServerNow(), totals, count: fleets.length, maxEndTime });
                renderCard(totals, fleets.length, maxEndTime, false);
            } catch (err) {
                console.error('[AstroGame Suite] [flyResourcesWidget]', err);
                // Degradar con gracia: seguir mostrando el último dato conocido
                // (si lo hay) en vez de dejar la tarjeta congelada sin avisar.
                const cached = ctx.readJSON(CACHE_KEY, null);
                if (cached) {
                    renderCard(cached.totals, cached.count, cached.maxEndTime, true, true);
                } else {
                    renderCard({ metal: 0, cristal: 0, deuterio: 0 }, 0, null, true, true);
                }
            }
        }

        if (document.getElementById(CARD_ID)) return;
        if (!document.querySelector('.sidebarNavList')) return;

        const cached = ctx.readJSON(CACHE_KEY, null);
        if (cached && ctx.getServerNow() - cached.timestamp < CACHE_TTL_MS) {
            renderCard(cached.totals, cached.count, cached.maxEndTime, false);
            return;
        }
        if (cached) {
            renderCard(cached.totals, cached.count, cached.maxEndTime, true);
        } else {
            renderCard({ metal: 0, cristal: 0, deuterio: 0 }, 0, null, true);
        }
        refresh();
    }

    // ---------------------------------------------------------------------
    // Módulo: Resource Calc
    // ---------------------------------------------------------------------

    function initResourceCalc(ctx) {
        function getAccountPlanets() {
            const items = document.querySelectorAll('.planetList form button.planetItem[data-id]');
            return Array.from(items).map((btn) => ({
                id: btn.getAttribute('data-id'),
                name: btn.querySelector('.planetName')?.textContent.trim() || btn.getAttribute('data-id'),
            }));
        }

        const PERIODS = [
            { label: 'Producción en una hora', key: 'hour' },
            { label: 'Por dia:', key: 'day' },
            { label: 'Por Semana:', key: 'week' },
            { label: 'Producción en un mes:', key: 'month' },
        ];

        const METRICS = ['metal', 'cristal', 'deuterio'];

        function parseCell(td) {
            const tooltip = td.querySelector('.tooltip.topCenter');
            if (!tooltip) return 0;
            const raw = tooltip.textContent.trim().replace(/\./g, '').replace(/-/g, '');
            const value = parseInt(raw, 10);
            return isNaN(value) ? 0 : value;
        }

        async function fetchPlanetProduction(planetId) {
            const res = await fetch(`https://play.astrogame.org/uni25/game/feedstock?cp=${planetId}`, {
                credentials: 'include'
            });
            if (!res.ok) {
                throw new Error(`Respuesta HTTP ${res.status} al pedir producción del planeta ${planetId}`);
            }
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const rows = doc.querySelectorAll('.resourcesTable tbody tr.tableRow.production');

            const result = {};
            PERIODS.forEach((period) => {
                result[period.key] = { metal: 0, cristal: 0, deuterio: 0 };
            });

            rows.forEach((row) => {
                const label = row.querySelector('td')?.textContent.trim();
                const period = PERIODS.find((p) => label && label.startsWith(p.label.split(' ')[0]) && label === p.label);
                if (!period) return;
                const cells = row.querySelectorAll('td');
                METRICS.forEach((metric, i) => {
                    result[period.key][metric] = parseCell(cells[i + 1]);
                });
            });

            return result;
        }

        function sumProduction(all) {
            const totals = {};
            PERIODS.forEach((period) => {
                totals[period.key] = { metal: 0, cristal: 0, deuterio: 0 };
            });
            all.forEach((planetData) => {
                PERIODS.forEach((period) => {
                    METRICS.forEach((metric) => {
                        totals[period.key][metric] += planetData[period.key][metric];
                    });
                });
            });
            return totals;
        }

        function renderResult(container, totals) {
            const rows = PERIODS.map((period) => {
                const t = totals[period.key];
                const cells = METRICS.map((metric) => {
                    const full = ctx.formatFull(t[metric]);
                    const short = ctx.formatShort(t[metric]);
                    return `<td class="tooltip-parent" style="padding:4px 10px;">${short}<span class="tooltip topCenter">${full}</span></td>`;
                }).join('');
                return `<tr><td style="padding:4px 10px;">${period.label}</td>${cells}</tr>`;
            }).join('');

            container.innerHTML = `
                <table class="resourcesTable" style="width:100%;">
                    <tbody>
                        <tr class="tableHeader">
                            <td style="padding:4px 10px;">&nbsp;</td>
                            <td style="padding:4px 10px;">Metal</td>
                            <td style="padding:4px 10px;">Cristal</td>
                            <td style="padding:4px 10px;">Deutério</td>
                        </tr>
                        ${rows}
                    </tbody>
                </table>
            `;
        }

        const header = document.querySelector('.pageResourcesDefault .header');
        if (!header) return;

        const planets = getAccountPlanets();
        if (planets.length === 0) return;

        const { panel, primaryBtn, body } = ctx.createPanel({
            id: 'accountProdPanel',
            title: `Producción total de la cuenta (${planets.length} planetas)`,
            primaryLabel: 'Calcular',
            primaryId: 'accountProdBtn',
        });
        ctx.insertPanelAfter(header, panel);

        primaryBtn.addEventListener('click', async () => {
            primaryBtn.disabled = true;
            primaryBtn.textContent = 'Cargando...';
            body.textContent = '';

            try {
                const all = await Promise.all(planets.map((p) => fetchPlanetProduction(p.id)));
                const totals = sumProduction(all);
                renderResult(body, totals);
            } catch (err) {
                body.textContent = 'Error al calcular: ' + err.message;
                console.error('[AstroGame Suite] [resourceCalc]', err);
            } finally {
                primaryBtn.disabled = false;
                primaryBtn.textContent = 'Calcular';
            }
        });
    }

    // ---------------------------------------------------------------------
    // Módulo: Cereal Stats
    // ---------------------------------------------------------------------

    // Este script está inspirado en CerealOgameStats (C) 2016 Elías Grande
    // Cásedas, con el mantenimiento posterior de Ouraios | MIT License
    // https://github.com/ouraios/ogame-scripts/raw/master/cereal-ogame-stats/cereal-ogame-stats.user.js
    // Reimplementado desde cero para Astrogame (recursos, tabla de miembros,
    // endpoints y estructura HTML distintos al OGame original), con salida en
    // Markdown/ANSI para Discord en vez de BBCode para foros.

    function initCerealStats(ctx) {
        const STORAGE_KEY = 'astro_alliance_checkpoint_v1';
        const DISCORD_CHUNK_LIMIT = 1900;

        function parseMemberList() {
            const rows = document.querySelectorAll('#memberList tbody tr');
            const members = {};

            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 7) return;

                const nameLink = cells[1].querySelector('a');
                if (!nameLink) return;
                const onclickAttr = nameLink.getAttribute('onclick') || '';
                const idMatch = onclickAttr.match(/Playercard\((\d+),\s*'([^']*)'\)/);
                if (!idMatch) return;

                const memberId = idMatch[1];
                const name = idMatch[2];
                const position = cells[2].textContent.trim();
                const pointsRaw = cells[3].getAttribute('data-points');
                const points = pointsRaw ? parseFloat(pointsRaw) : 0;
                const coordsLink = cells[4].querySelector('a');
                const coords = coordsLink ? coordsLink.textContent.trim() : cells[4].textContent.trim();

                members[memberId] = { name, position, points, coords };
            });

            return members;
        }

        function loadCheckpoint() {
            const checkpoint = ctx.readJSON(STORAGE_KEY, null);
            if (!checkpoint || typeof checkpoint.timestamp !== 'number' || !checkpoint.members) return null;
            return checkpoint;
        }

        function saveCheckpoint(members) {
            const checkpoint = { timestamp: ctx.getServerNow(), members };
            ctx.writeJSON(STORAGE_KEY, checkpoint);
            return checkpoint;
        }

        function computeEvolution(checkpoint, current) {
            const rows = [];
            const joined = [];
            const left = [];

            const prevMembers = checkpoint ? checkpoint.members : {};

            Object.keys(current).forEach((id) => {
                const now = current[id];
                const before = prevMembers[id];
                if (!before) {
                    joined.push(now.name);
                    rows.push({
                        id,
                        name: now.name,
                        position: now.position,
                        pointsNow: Math.floor(now.points),
                        delta: null,
                    });
                } else {
                    const delta = Math.round(now.points - before.points) || 0;
                    rows.push({
                        id,
                        name: now.name,
                        position: now.position,
                        pointsNow: Math.floor(now.points),
                        delta,
                    });
                }
            });

            Object.keys(prevMembers).forEach((id) => {
                if (!current[id]) left.push(prevMembers[id].name);
            });

            rows.sort((a, b) => {
                if (a.delta === null && b.delta === null) return b.pointsNow - a.pointsNow;
                if (a.delta === null) return 1;
                if (b.delta === null) return -1;
                return b.delta - a.delta;
            });

            return { rows, joined, left };
        }

        function padRight(str, len) {
            str = String(str);
            if (str.length >= len) {
                return str.slice(0, Math.max(len - 1, 1)) + ' ';
            }
            return str + ' '.repeat(len - str.length);
        }

        function buildMarkdownChunks(evolution, checkpoint) {
            const nowStr = new Date(ctx.getServerNow()).toLocaleString('es-ES');
            const header = checkpoint
                ? `**Evolución de la alianza** (desde \`${new Date(checkpoint.timestamp).toLocaleString('es-ES')}\` hasta \`${nowStr}\`)`
                : `**Sin punto de control todavía** — \`${nowStr}\` (pulsa "Nuevo punto de control" para empezar a comparar)`;

            const NAME_W = 16, POS_W = 15, PTS_W = 11;
            const tableHeader =
                padRight('Miembro', NAME_W) + padRight('Posición', POS_W) +
                padRight('Puntos', PTS_W) + 'Δ';

            const ANSI_RESET = '[0m';
            const ANSI_GREEN = '[0;32m';
            const ANSI_RED = '[0;31m';
            const ANSI_YELLOW = '[0;33m';

            const tableLines = evolution.rows.map((r) => {
                const pointsStr = r.pointsNow.toLocaleString('es-ES');
                let deltaStr;
                if (r.delta === null) {
                    deltaStr = `${ANSI_YELLOW}nuevo${ANSI_RESET}`;
                } else if (r.delta > 0) {
                    deltaStr = `${ANSI_GREEN}+${r.delta.toLocaleString('es-ES')}${ANSI_RESET}`;
                } else if (r.delta < 0) {
                    deltaStr = `${ANSI_RED}${r.delta.toLocaleString('es-ES')}${ANSI_RESET}`;
                } else {
                    deltaStr = '0';
                }
                return padRight(r.name, NAME_W) + padRight(r.position, POS_W) +
                    padRight(pointsStr, PTS_W) + deltaStr;
            });

            let extra = '';
            const numericRows = evolution.rows.filter((r) => r.delta !== null);
            if (numericRows.length > 0) {
                const top = numericRows[0];
                const bottom = numericRows[numericRows.length - 1];
                if (top.delta > 0) {
                    extra += `\n🏆 Mayor subida: **${top.name}** (+${top.delta.toLocaleString('es-ES')})`;
                }
                if (bottom.delta < 0) {
                    extra += `\n📉 Mayor bajada: **${bottom.name}** (${bottom.delta.toLocaleString('es-ES')})`;
                }
            }
            if (evolution.joined.length > 0) {
                extra += `\n🆕 Nuevos: ${evolution.joined.join(', ')}`;
            }
            if (evolution.left.length > 0) {
                extra += `\n❌ Han abandonado: ${evolution.left.join(', ')}`;
            }

            const blocks = [];
            let currentLines = [tableHeader];
            let currentLen = header.length + tableHeader.length + 10;

            tableLines.forEach((line) => {
                if (currentLen + line.length + 1 > DISCORD_CHUNK_LIMIT) {
                    blocks.push(currentLines);
                    currentLines = [tableHeader];
                    currentLen = tableHeader.length + 10;
                }
                currentLines.push(line);
                currentLen += line.length + 1;
            });
            blocks.push(currentLines);

            const total = blocks.length;
            return blocks.map((lines, i) => {
                const partLabel = total > 1 ? ` (parte ${i + 1}/${total})` : '';
                const headLine = i === 0 ? header + partLabel : `**Evolución de la alianza**${partLabel}`;
                const footer = i === total - 1 ? extra : '';
                return `${headLine}\n\`\`\`ansi\n${lines.join('\n')}\n\`\`\`${footer}`;
            });
        }

        function injectDeltaColumn(deltaById) {
            const headerRow = document.querySelector('#memberList thead tr');
            if (!headerRow) return;

            document.querySelectorAll('#memberList .astro-delta-col').forEach((el) => el.remove());

            const th = document.createElement('th');
            th.textContent = 'Δ Puntos';
            th.className = 'astro-delta-col';
            headerRow.appendChild(th);

            document.querySelectorAll('#memberList tbody tr').forEach((row) => {
                const nameLink = row.querySelector('a[onclick*="Playercard"]');
                const td = document.createElement('td');
                td.className = 'astro-delta-col';

                const idMatch = nameLink && (nameLink.getAttribute('onclick') || '').match(/Playercard\((\d+),/);
                const delta = idMatch ? deltaById[idMatch[1]] : undefined;

                if (delta === undefined || delta === null) {
                    td.textContent = '—';
                    td.style.opacity = '0.6';
                } else if (delta > 0) {
                    td.textContent = `+${delta.toLocaleString('es-ES')}`;
                    td.style.color = 'var(--success-400, #4ade80)';
                    td.style.fontWeight = '600';
                } else if (delta < 0) {
                    td.textContent = delta.toLocaleString('es-ES');
                    td.style.color = 'var(--danger-500, #f87171)';
                    td.style.fontWeight = '600';
                } else {
                    td.textContent = '0';
                    td.style.opacity = '0.7';
                }
                row.appendChild(td);
            });
        }

        function clearDeltaColumn() {
            document.querySelectorAll('#memberList .astro-delta-col').forEach((el) => el.remove());
        }

        function renderStatus(statusBox) {
            const checkpoint = loadCheckpoint();
            statusBox.textContent = checkpoint
                ? `Punto de control actual: ${new Date(checkpoint.timestamp).toLocaleString('es-ES')}`
                : 'Sin punto de control todavía.';
        }

        function renderChunks(container, chunks) {
            container.innerHTML = '';
            chunks.forEach((text, i) => {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'margin-bottom:10px;';

                const textarea = document.createElement('textarea');
                textarea.readOnly = true;
                textarea.value = text;
                textarea.style.cssText = 'width:100%;box-sizing:border-box;font-family:monospace;font-size:12px;padding:6px;border-radius:6px;background:#0b1220;color:#e2e8f0;border:1px solid #334155;resize:vertical;overflow-y:auto;';

                const copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.className = 'button sm text';
                copyBtn.style.marginTop = '4px';
                copyBtn.textContent = chunks.length > 1 ? `Copiar parte ${i + 1}/${chunks.length}` : 'Copiar';
                copyBtn.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(text);
                        copyBtn.textContent = '¡Copiado!';
                        setTimeout(() => {
                            copyBtn.textContent = chunks.length > 1 ? `Copiar parte ${i + 1}/${chunks.length}` : 'Copiar';
                        }, 1500);
                    } catch (e) {
                        textarea.select();
                        document.execCommand('copy');
                    }
                });

                wrapper.appendChild(textarea);
                wrapper.appendChild(document.createElement('br'));
                wrapper.appendChild(copyBtn);
                container.appendChild(wrapper);

                const MAX_HEIGHT = 480;
                textarea.style.height = Math.min(textarea.scrollHeight + 4, MAX_HEIGHT) + 'px';
            });
        }

        function generateReport(resultBox) {
            try {
                const currentMembers = parseMemberList();
                if (Object.keys(currentMembers).length === 0) {
                    resultBox.textContent = 'No se ha podido leer la tabla de miembros (¿ha cambiado la página?).';
                    return;
                }

                const checkpoint = loadCheckpoint();
                const evolution = computeEvolution(checkpoint, currentMembers);

                const chunks = buildMarkdownChunks(evolution, checkpoint);
                renderChunks(resultBox, chunks);

                const deltaById = {};
                evolution.rows.forEach((r) => { deltaById[r.id] = r.delta; });
                injectDeltaColumn(deltaById);
            } catch (err) {
                resultBox.textContent = 'Error al generar el informe: ' + err.message;
                console.error('[AstroGame Suite] [cerealStats]', err);
            }
        }

        function resetCheckpoint(statusBox, resultBox) {
            const currentMembers = parseMemberList();
            if (Object.keys(currentMembers).length === 0) {
                resultBox.textContent = 'No se ha podido leer la tabla de miembros (¿ha cambiado la página?).';
                return;
            }
            saveCheckpoint(currentMembers);
            clearDeltaColumn();
            renderStatus(statusBox);
            resultBox.innerHTML =
                '<div style="opacity:0.8;">Nuevo punto de control guardado. Pulsa "Generar informe" cuando quieras ver la evolución desde ahora.</div>';
        }

        const page = document.querySelector('.pageAllianceMemberList');
        if (!page) return;

        const { panel, primaryBtn, secondaryBtn, body } = ctx.createPanel({
            id: 'allianceStatsPanel',
            title: 'Evolución de la alianza (Markdown para Discord)',
            primaryLabel: 'Generar informe',
            primaryId: 'allianceStatsBtn',
            secondaryLabel: 'Nuevo punto de control',
            secondaryId: 'allianceStatsResetBtn',
        });
        ctx.insertPanelAfter(page, panel);

        body.innerHTML = `
            <div class="allianceStatsStatus" style="font-size:12px;opacity:0.7;margin-bottom:8px;"></div>
            <div class="allianceStatsResult" style="font-size:13px;"></div>
        `;
        const statusBox = body.querySelector('.allianceStatsStatus');
        const resultBox = body.querySelector('.allianceStatsResult');

        renderStatus(statusBox);

        primaryBtn.addEventListener('click', () => generateReport(resultBox));
        secondaryBtn.addEventListener('click', () => resetCheckpoint(statusBox, resultBox));
    }

    // ---------------------------------------------------------------------
    // Módulo: Resaltado (jugador/alianza)
    // ---------------------------------------------------------------------

    function registerHighlighterSettings(ctx) {
        ctx.registerSettingsSection('highlighter', (container, settings) => {
            const rules = settings.rules ? settings.rules.map((r) => ({ ...r })) : [];

            function persist() {
                ctx.setModuleSettings('highlighter', { rules });
            }

            function render() {
                const rowsHtml = rules.map((rule, i) => `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <input type="text" class="astroHighlightPattern" data-index="${i}"
                               value="${ctx.escapeHtml(rule.pattern || '')}"
                               placeholder="Nombre de jugador o alianza"
                               style="flex:1;" />
                        <input type="color" class="astroHighlightColor" data-index="${i}" value="${rule.color || '#facc15'}" />
                        <button type="button" class="button sm text astroHighlightRemove" data-index="${i}">&times;</button>
                    </div>
                `).join('');

                container.innerHTML = `
                    <div style="margin-bottom:6px;">Resalta en color los nombres de jugador o alianza que contengan el texto indicado (páginas: lista de miembros de alianza y mensajes).</div>
                    <div id="astroHighlightRules">${rowsHtml}</div>
                    <button type="button" id="astroHighlightAdd" class="button sm secondary">+ Añadir regla</button>
                `;

                container.querySelectorAll('.astroHighlightPattern').forEach((input) => {
                    input.addEventListener('change', (e) => {
                        rules[Number(e.target.dataset.index)].pattern = e.target.value;
                        persist();
                    });
                });
                container.querySelectorAll('.astroHighlightColor').forEach((input) => {
                    input.addEventListener('input', (e) => {
                        rules[Number(e.target.dataset.index)].color = e.target.value;
                        persist();
                    });
                });
                container.querySelectorAll('.astroHighlightRemove').forEach((btn) => {
                    btn.addEventListener('click', (e) => {
                        rules.splice(Number(e.target.dataset.index), 1);
                        persist();
                        render();
                    });
                });
                container.querySelector('#astroHighlightAdd').addEventListener('click', () => {
                    rules.push({ pattern: '', color: '#facc15' });
                    persist();
                    render();
                });
            }

            render();
        });
    }

    function initHighlighter(ctx) {
        const settings = ctx.getModuleSettings('highlighter');
        const rules = (settings.rules || []).filter((r) => r.pattern && r.pattern.trim());
        if (rules.length === 0) return;

        function matchColor(text) {
            const lower = text.toLowerCase();
            const rule = rules.find((r) => lower.includes(r.pattern.toLowerCase()));
            return rule ? rule.color : null;
        }

        function paint(el, color) {
            el.style.color = color;
            el.style.fontWeight = 'bold';
        }

        const path = window.location.pathname;

        if (path.startsWith('/uni25/game/alliance/memberList')) {
            document.querySelectorAll('#memberList tbody tr').forEach((row) => {
                const nameLink = row.querySelector('a[onclick*="Playercard"]');
                if (!nameLink) return;
                const color = matchColor(nameLink.textContent.trim());
                if (color) paint(nameLink, color);
            });
        }

        if (path.startsWith('/uni25/game/messages')) {
            document.querySelectorAll('.plainMessage .plainMessageTitle').forEach((titleEl) => {
                const color = matchColor(titleEl.textContent.trim());
                if (color) paint(titleEl, color);
            });
        }

        if (path.startsWith('/uni25/game/galaxy')) {
            function applyGalaxy() {
                document.querySelectorAll('.galaxy-username').forEach((el) => {
                    const color = matchColor(el.textContent.trim());
                    if (color) paint(el, color);
                });
                document.querySelectorAll('.galaxy-alliance').forEach((el) => {
                    const color = matchColor(el.textContent.trim());
                    if (color) paint(el, color);
                });
            }

            applyGalaxy();

            const tbody = document.getElementById('ajaxGalaxyBodyTableTBody');
            if (tbody) {
                let pending = false;
                const observer = new MutationObserver(() => {
                    if (pending) return;
                    pending = true;
                    setTimeout(() => {
                        pending = false;
                        applyGalaxy();
                    }, 50);
                });
                observer.observe(tbody, { childList: true, subtree: true });
            }
        }
    }

    // ---------------------------------------------------------------------
    // Módulo: Skin & usabilidad
    // ---------------------------------------------------------------------

    const NAV_SHORTCUTS = {
        g: '/uni25/game/galaxy',
        m: '/uni25/game/messages',
        r: '/uni25/game/buildings?side=resources',
        i: '/uni25/game/research',
        f: '/uni25/game/fleetTable',
        a: '/uni25/game/alliance/memberList',
        d: '/uni25/game/shipyard?mode=defense',
        o: '/uni25/game/officier?tab=officierTab',
    };

    function registerUsabilitySettings(ctx) {
        ctx.registerSettingsSection('usability', (container, settings) => {
            const shortcutList = Object.entries(NAV_SHORTCUTS)
                .map(([key, path]) => `<strong>${key.toUpperCase()}</strong> → ${path}`)
                .join('<br>');
            container.innerHTML = `
                <label style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="usabilityShortcutsEnabled" ${settings.shortcutsEnabled !== false ? 'checked' : ''} />
                    <span>Activar atajos de teclado de navegación</span>
                </label>
                <div style="margin-top:6px;font-size:12px;opacity:0.7;line-height:1.6;">${shortcutList}</div>
                <div style="margin-top:4px;font-size:11px;opacity:0.6;">Se desactivan automáticamente mientras escribes en un campo de texto.</div>
                <label style="display:flex;align-items:center;gap:8px;margin-top:12px;">
                    <input type="checkbox" id="usabilityChatEnabled" ${settings.chatEnabled !== false ? 'checked' : ''} />
                    <span>Activar chat flotante</span>
                </label>
            `;
            container.querySelector('#usabilityShortcutsEnabled').addEventListener('change', (e) => {
                ctx.setModuleSettings('usability', { shortcutsEnabled: e.target.checked });
            });
            container.querySelector('#usabilityChatEnabled').addEventListener('change', (e) => {
                ctx.setModuleSettings('usability', { chatEnabled: e.target.checked });
            });
        });
    }

    function initKeyboardShortcuts(ctx) {
        const settings = ctx.getModuleSettings('usability');
        if (settings.shortcutsEnabled === false) return;

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;

            const path = NAV_SHORTCUTS[e.key.toLowerCase()];
            if (!path) return;
            window.location.href = `https://play.astrogame.org${path}`;
        });
    }

    function initGalaxyCopyCoords() {
        if (!window.location.pathname.startsWith('/uni25/game/galaxy')) return;

        function addCopyButtons() {
            document.querySelectorAll('.tdTooltipHeader .coords:not([data-copy-added])').forEach((coordsEl) => {
                coordsEl.setAttribute('data-copy-added', '1');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = '📋';
                btn.title = 'Copiar coordenadas';
                btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;margin-left:4px;padding:0;';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigator.clipboard.writeText(coordsEl.textContent.trim()).then(() => {
                        const original = btn.textContent;
                        btn.textContent = '✅';
                        setTimeout(() => { btn.textContent = original; }, 1000);
                    });
                });
                coordsEl.insertAdjacentElement('afterend', btn);
            });
        }

        addCopyButtons();

        const tbody = document.getElementById('ajaxGalaxyBodyTableTBody');
        if (tbody) {
            let pending = false;
            const observer = new MutationObserver(() => {
                if (pending) return;
                pending = true;
                setTimeout(() => {
                    pending = false;
                    addCopyButtons();
                }, 50);
            });
            observer.observe(tbody, { childList: true, subtree: true });
        }
    }

    function initBackToTop() {
        const BTN_ID = 'astroBackToTop';
        if (document.getElementById(BTN_ID)) return;

        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.type = 'button';
        btn.textContent = '↑';
        btn.title = 'Volver arriba';
        btn.style.cssText = `
            position:fixed; bottom:16px; left:16px; z-index:99998;
            background:var(--secondary-700,#1f2937); color:var(--text-primary,#e2e8f0);
            width:36px; height:36px; border:none; border-radius:8px; font-size:16px; cursor:pointer;
            box-shadow:0 4px 12px rgba(0,0,0,.4); display:none;
        `;
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        document.body.appendChild(btn);

        window.addEventListener('scroll', () => {
            btn.style.display = window.scrollY > 300 ? 'block' : 'none';
        });
    }

    function initUsability(ctx) {
        initKeyboardShortcuts(ctx);
        initGalaxyCopyCoords();
        initBackToTop();
        const settings = ctx.getModuleSettings('usability');
        if (settings.chatEnabled !== false) initChatFooter(ctx);
    }

    // ---------------------------------------------------------------------
    // Módulo: Chat flotante (footer con iframe a universeChat)
    // ---------------------------------------------------------------------

    function initChatFooter(ctx) {
        const FOOTER_ID = 'astroChatFooter';
        if (document.getElementById(FOOTER_ID)) return;

        const chatLink = document.querySelector('.sidebarNavList a.chatNavItem');
        if (chatLink) chatLink.style.display = 'none';
        if (window.location.pathname.startsWith('/uni25/game/universeChat')) return;

        const STATE_KEY = 'astro_chat_footer_open_v1';
        const CHANNEL_KEY = 'astro_chat_footer_channel_v1';
        const isOpen = ctx.readJSON(STATE_KEY, true);
        const BAR_HEIGHT = 36;

        const SIZE_KEY = 'astro_chat_footer_size_v1';
        const MIN_WIDTH = 280, MIN_HEIGHT = 260, MAX_WIDTH = 720;
        const TOP_RESERVED = 140;
        const maxHeightNow = window.innerHeight - BAR_HEIGHT - TOP_RESERVED;
        const maxWidthNow = Math.min(window.innerWidth - 32, MAX_WIDTH);
        const savedSize = ctx.readJSON(SIZE_KEY, null);
        const initialWidthCss = savedSize && savedSize.width
            ? `${Math.min(savedSize.width, maxWidthNow)}px`
            : 'min(400px,92vw)';
        const initialHeight = savedSize && savedSize.height
            ? `${Math.min(savedSize.height, maxHeightNow)}px`
            : 'min(560px,70vh)';

        const footer = document.createElement('div');
        footer.id = FOOTER_ID;
        footer.style.cssText = `
            position:fixed; bottom:0; right:16px; z-index:99997;
            width:${initialWidthCss};
            background:var(--secondary-800,#111827); border:1px solid rgba(255,255,255,.1); border-top-width:1px;
            border-radius:0 0 10px 10px; box-sizing:border-box;
            font-family:inherit; box-shadow:0 4px 12px rgba(0,0,0,.4);
        `;
        footer.innerHTML = `
            <div id="astroChatFooterHeader" style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;cursor:pointer;user-select:none;gap:12px;height:${BAR_HEIGHT}px;box-sizing:border-box;">
                <strong style="font-size:13px;color:var(--text-primary,#e2e8f0);flex-shrink:0;">💬 Chat</strong>
                <div id="astroChatFooterChannels" style="display:flex;gap:6px;flex:1;overflow:hidden;"></div>
                <button type="button" id="astroChatFooterToggle" style="background:none;border:none;color:var(--text-primary,#e2e8f0);cursor:pointer;font-size:14px;flex-shrink:0;">${isOpen ? '▾' : '▴'}</button>
            </div>
        `;
        document.body.appendChild(footer);

        const panel = document.createElement('div');
        panel.id = 'astroChatFooterPanel';
        panel.style.cssText = `
            position:fixed; bottom:${BAR_HEIGHT}px; right:16px; z-index:99998;
            width:${initialWidthCss}; height:${initialHeight};
            background:var(--secondary-800,#111827); border:1px solid rgba(255,255,255,.1); border-bottom:none;
            border-radius:10px 10px 0 0; box-shadow:0 -4px 20px rgba(0,0,0,.5); overflow:hidden;
            ${isOpen ? '' : 'display:none;'}
        `;
        panel.innerHTML = `
            <div id="astroChatFooterResize" title="Arrastra para redimensionar" style="
                position:absolute; top:0; left:0; width:16px; height:16px; z-index:1;
                cursor:nwse-resize; background:linear-gradient(135deg,transparent 50%,rgba(255,255,255,.25) 50%);
            "></div>
            <iframe id="astroChatFooterFrame" src="https://play.astrogame.org/uni25/game/universeChat" scrolling="no" style="width:100%;height:100%;border:none;display:block;overflow:hidden;"></iframe>
        `;
        document.body.appendChild(panel);

        const toggleBtn = footer.querySelector('#astroChatFooterToggle');
        const headerEl = footer.querySelector('#astroChatFooterHeader');
        const channelsEl = footer.querySelector('#astroChatFooterChannels');
        const iframe = panel.querySelector('#astroChatFooterFrame');
        const resizeHandle = panel.querySelector('#astroChatFooterResize');

        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = panel.getBoundingClientRect().width;
            const startHeight = panel.getBoundingClientRect().height;
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:999996;cursor:nwse-resize;';
            document.body.appendChild(overlay);

            function onMove(moveEvent) {
                const maxWidth = Math.min(window.innerWidth - 32, MAX_WIDTH);
                const newWidth = Math.min(Math.max(startWidth + (startX - moveEvent.clientX), MIN_WIDTH), maxWidth);
                const newHeight = Math.min(Math.max(startHeight + (startY - moveEvent.clientY), MIN_HEIGHT), window.innerHeight - BAR_HEIGHT - TOP_RESERVED);
                panel.style.width = newWidth + 'px';
                panel.style.height = newHeight + 'px';
                footer.style.width = newWidth + 'px';
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                overlay.remove();
                const rect = panel.getBoundingClientRect();
                ctx.writeJSON(SIZE_KEY, { width: Math.round(rect.width), height: Math.round(rect.height) });
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        function setOpen(open) {
            panel.style.display = open ? 'block' : 'none';
            toggleBtn.textContent = open ? '▾' : '▴';
            ctx.writeJSON(STATE_KEY, open);
        }

        headerEl.addEventListener('click', () => setOpen(panel.style.display === 'none'));

        function buildChannelSwitcher(doc) {
            const tabs = doc.querySelectorAll('.chatChannelTab');
            channelsEl.innerHTML = '';
            tabs.forEach((tab) => {
                const label = tab.querySelector('.chatChannelTab__label')?.textContent.trim() || tab.dataset.channel;
                const isActive = tab.classList.contains('is-active');
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = label;
                btn.style.cssText = `
                    background:${isActive ? 'var(--secondary-600,#374151)' : 'none'};
                    border:none; color:var(--text-primary,#e2e8f0); cursor:pointer;
                    font-size:12px; padding:3px 10px; border-radius:6px;
                    font-weight:${isActive ? '600' : '400'}; opacity:${isActive ? '1' : '0.7'};
                `;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    tab.click();
                    ctx.writeJSON(CHANNEL_KEY, tab.dataset.channel);
                    setTimeout(() => buildChannelSwitcher(doc), 50);
                });
                channelsEl.appendChild(btn);
            });
        }

        iframe.addEventListener('load', () => {
            try {
                const doc = iframe.contentDocument;
                if (!doc) return;
                const style = doc.createElement('style');
                style.textContent = `
                    #generalHeader, .resourcesWrapper, .resourcesWrapperMobile,
                    .aside_sidebar, .aside_planets, .mainPageTop, #consent-banner,
                    #mobileBottomMenu, .pageHeader { display:none !important; }
                    html, body#universeChat {
                        min-width:0 !important; width:100% !important;
                        height:100% !important; margin:0 !important; padding:0 !important;
                        overflow:hidden !important; background:var(--secondary-800,#111827) !important;
                    }
                    content.scrollbar-hidden {
                        display:flex !important; width:100% !important; height:100% !important; overflow:hidden !important;
                        padding-top:0 !important; padding-bottom:0 !important;
                    }
                    .main_section, .mainPageTopWrapper, .page.pageUniverseChat {
                        min-width:0 !important; width:100% !important; margin:0 !important; padding:0 !important;
                        height:100% !important; box-sizing:border-box !important;
                    }
                    .main_section { display:flex !important; flex-direction:column !important; }
                    .page.pageUniverseChat, .pageContent, .chatShell, .chatMainPanel {
                        min-width:0 !important; width:100% !important; max-width:none !important;
                        margin:0 !important; padding:0 !important;
                        height:100% !important; box-sizing:border-box !important;
                    }
                    .pageContent { flex:1 !important; min-height:0 !important; }
                    .chatShell, .chatMainPanel { display:flex !important; flex-direction:column !important; }
                    .chatStream { flex:1 !important; min-height:0 !important; overflow-y:auto !important; margin:0 !important; padding:4px 8px !important; }
                    #universeChatMessages { height:100% !important; margin:0 !important; padding:0 !important; }
                    .chatComposer {
                        flex-shrink:0 !important; margin:0 !important; padding:6px 8px !important;
                    }
                    .chatComposer #universeChatInput { margin:0 !important; }
                    .chatComposer__footer { margin:4px 0 0 0 !important; }
                `;
                doc.head.appendChild(style);

                const savedChannel = ctx.readJSON(CHANNEL_KEY, null);
                if (savedChannel) {
                    const targetTab = doc.querySelector(`.chatChannelTab[data-channel="${savedChannel}"]`);
                    if (targetTab && !targetTab.classList.contains('is-active')) {
                        targetTab.click();
                    }
                }

                buildChannelSwitcher(doc);
            } catch (e) {
                console.error('[AstroGame Suite] [chatFooter] No se pudo compactar el iframe del chat (¿restricción de origen?)', e);
            }
        });
    }

    // ---------------------------------------------------------------------
    // Settings: una clave en localStorage con { enabled, ...propio } por módulo
    // ---------------------------------------------------------------------

    const SETTINGS_KEY = 'astro_suite_settings_v1';
    const SETTINGS_SCHEMA_VERSION = 1;

    function defaultSettings() {
        const modules = {};
        MODULES.forEach((mod) => {
            modules[mod.id] = { enabled: true };
        });
        return { version: SETTINGS_SCHEMA_VERSION, modules };
    }

    function migrateSettings(stored) {
        if (!stored || typeof stored !== 'object' || stored.version !== SETTINGS_SCHEMA_VERSION) {
            return defaultSettings();
        }
        return stored;
    }

    function getSettings() {
        const settings = migrateSettings(readJSON(SETTINGS_KEY, null));
        MODULES.forEach((mod) => {
            if (!settings.modules[mod.id]) settings.modules[mod.id] = { enabled: true };
        });
        return settings;
    }

    function setSettings(partial) {
        const next = { ...getSettings(), ...partial };
        writeJSON(SETTINGS_KEY, next);
        return next;
    }

    function getModuleSettings(id) {
        return getSettings().modules[id] || { enabled: true };
    }

    function setModuleSettings(id, partial) {
        const settings = getSettings();
        settings.modules[id] = { ...(settings.modules[id] || { enabled: true }), ...partial };
        writeJSON(SETTINGS_KEY, settings);
        return settings.modules[id];
    }

    // ---------------------------------------------------------------------
    // Panel de settings
    // ---------------------------------------------------------------------

    const settingsSections = {};

    function registerSettingsSection(id, renderFn) {
        settingsSections[id] = renderFn;
    }

    const SUITE_NAV_BTN_ID = 'astroSuiteNavBtn';
    const SUITE_SETTINGS_PANEL_ID = 'astroSuiteSettingsPanel';
    const SETTINGS_PAGE_PARAM = 'astroSuite';
    const SETTINGS_PAGE_VALUE = 'settings';

    function isSettingsPageUrl() {
        return new URLSearchParams(window.location.search).get(SETTINGS_PAGE_PARAM) === SETTINGS_PAGE_VALUE;
    }

    function openSettingsPage() {
        const url = new URL(window.location.href);
        url.searchParams.set(SETTINGS_PAGE_PARAM, SETTINGS_PAGE_VALUE);
        window.location.href = url.toString();
    }

    function closeSettingsPage() {
        const url = new URL(window.location.href);
        url.searchParams.delete(SETTINGS_PAGE_PARAM);
        window.location.href = url.toString();
    }

    function showSettingsPanel() {
        if (document.getElementById(SUITE_SETTINGS_PANEL_ID)) return;

        const settings = getSettings();

        const overlay = document.createElement('div');
        overlay.id = SUITE_SETTINGS_PANEL_ID;
        overlay.style.cssText = `
            position:fixed; inset:0; z-index:999999; overflow:auto;
            background:var(--secondary-800,#111827); color:var(--text-primary,#e2e8f0);
            padding:32px 16px; font-size:14px; font-family:inherit;
        `;

        const rowsHtml = MODULES.map((mod) => {
            const enabled = settings.modules[mod.id]?.enabled !== false;
            return `
                <label style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);">
                    <input type="checkbox" data-module-id="${mod.id}" ${enabled ? 'checked' : ''} />
                    <span>${mod.label}</span>
                </label>
                <div class="moduleSettingsSection" data-module-id="${mod.id}" style="padding:6px 0 12px 24px;"></div>
            `;
        }).join('');

        overlay.innerHTML = `
            <div style="max-width:720px;margin:0 auto;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
                    <strong style="font-size:20px;">AstroGame Suite — Configuración</strong>
                    <button id="astroSuiteSettingsClose" class="button sm text" type="button">Cerrar</button>
                </div>
                ${rowsHtml}
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#astroSuiteSettingsClose').addEventListener('click', closeSettingsPage);

        overlay.querySelectorAll('input[data-module-id]').forEach((checkbox) => {
            checkbox.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-module-id');
                setModuleSettings(id, { enabled: e.target.checked });
            });
        });

        MODULES.forEach((mod) => {
            const renderFn = settingsSections[mod.id];
            if (typeof renderFn !== 'function') return;
            const section = overlay.querySelector(`.moduleSettingsSection[data-module-id="${mod.id}"]`);
            if (section) renderFn(section, getModuleSettings(mod.id));
        });
    }

    // ---------------------------------------------------------------------
    // Arranque
    // ---------------------------------------------------------------------

    const ctx = {
        getServerNow,
        formatFull,
        formatShort,
        toNumber,
        escapeHtml,
        readJSON,
        writeJSON,
        createPanel,
        insertPanelAfter,
        buildResourceTable,
        getModuleSettings,
        setModuleSettings,
        addNavButton,
        removeNavButton,
        registerSettingsSection,
    };

    function init() {
        addNavButton({
            id: SUITE_NAV_BTN_ID,
            label: 'AstroGame Suite',
            onClick: () => (isSettingsPageUrl() ? closeSettingsPage() : openSettingsPage()),
        });

        MODULES.forEach((mod) => {
            if (typeof mod.settingsInit === 'function') mod.settingsInit(ctx);
        });

        if (isSettingsPageUrl()) {
            showSettingsPanel();
            return;
        }

        const path = window.location.pathname;
        const settings = getSettings();

        MODULES.forEach((mod) => {
            if (!mod.matches(path)) return;
            const moduleSettings = settings.modules[mod.id] || { enabled: true };
            if (moduleSettings.enabled === false) return;
            if (typeof mod.init !== 'function') {
                console.info(`[AstroGame Suite] Módulo "${mod.label}" aún no migrado.`);
                return;
            }
            mod.init(ctx);
        });
    }

    init();
})();
