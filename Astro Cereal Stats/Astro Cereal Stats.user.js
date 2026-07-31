// ==UserScript==
// @author       LoneW0lf
// @name         Astro Cereal Stats
// @namespace    astrogame-tools
// @version      1.0
// @description  Evolución de puntos de la alianza para Astrogame, en Markdown para Discord. Fork/inspirado en CerealOgameStats v4.0.1 de Elías Grande y Ouraios.
// @source       https://github.com/ouraios/ogame-scripts/raw/master/cereal-ogame-stats/cereal-ogame-stats.user.js
// @match        https://play.astrogame.org/uni25/game/alliance/memberList*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// Este script está inspirado en CerealOgameStats (C) 2016 Elías Grande
// Cásedas, con el mantenimiento posterior de Ouraios | MIT License
// https://github.com/ouraios/ogame-scripts/raw/master/cereal-ogame-stats/cereal-ogame-stats.user.js
// Reimplementado desde cero para Astrogame (recursos, tabla de miembros,
// endpoints y estructura HTML distintos al OGame original), con salida en
// Markdown/ANSI para Discord en vez de BBCode para foros.

(function () {
    'use strict';

    const STORAGE_KEY = 'astro_alliance_checkpoint_v1';
    const DISCORD_CHUNK_LIMIT = 1900;

    function getServerNowFromDom() {
        const el = document.querySelector('.servertimeTop');
        if (!el) return null;
        const m = el.textContent.trim().match(/(\d{2})\.(\d{2})\.(\d{2,4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (!m) return null;
        const [, dd, mm, yy, hh, mi, ss] = m;
        const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
        return new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss)).getTime();
    }

    function getServerNow() {
        const domTime = getServerNowFromDom();
        if (domTime !== null) return domTime;
        const st = window.serverTime;
        if (st instanceof Date && !isNaN(st.getTime())) {
            return st.getTime();
        }
        return Date.now();
    }

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
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.timestamp !== 'number' || !parsed.members) return null;
            return parsed;
        } catch (e) {
            console.error('[AstroAllianceStats] Error leyendo localStorage:', e);
            return null;
        }
    }

    function saveCheckpoint(members) {
        const checkpoint = { timestamp: getServerNow(), members };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(checkpoint));
        return checkpoint;
    }

    function clearCheckpoint() {
        localStorage.removeItem(STORAGE_KEY);
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
        const nowStr = new Date(getServerNow()).toLocaleString('es-ES');
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

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'allianceStatsPanel';
        panel.style.cssText = 'margin:12px 0;padding:10px;border-radius:8px;background:var(--secondary-700,#1f2937);color:var(--text-primary,#e2e8f0);';
        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                <strong>Evolución de la alianza (Markdown para Discord)</strong>
                <div style="display:flex;gap:8px;">
                    <button id="allianceStatsResetBtn" class="button sm text" type="button">Nuevo punto de control</button>
                    <button id="allianceStatsBtn" class="button sm warning" type="button">Generar informe</button>
                </div>
            </div>
            <div id="allianceStatsStatus" style="font-size:12px;opacity:0.7;margin-bottom:8px;"></div>
            <div id="allianceStatsResult" style="font-size:13px;"></div>
        `;
        return panel;
    }

    function renderStatus(panel) {
        const checkpoint = loadCheckpoint();
        const statusBox = panel.querySelector('#allianceStatsStatus');
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

    function generateReport(panel) {
        const resultBox = panel.querySelector('#allianceStatsResult');

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
            console.error('[AstroAllianceStats]', err);
        }
    }

    function resetCheckpoint(panel) {
        const currentMembers = parseMemberList();
        if (Object.keys(currentMembers).length === 0) {
            panel.querySelector('#allianceStatsResult').textContent =
                'No se ha podido leer la tabla de miembros (¿ha cambiado la página?).';
            return;
        }
        saveCheckpoint(currentMembers);
        clearDeltaColumn();
        renderStatus(panel);
        panel.querySelector('#allianceStatsResult').innerHTML =
            '<div style="opacity:0.8;">Nuevo punto de control guardado. Pulsa "Generar informe" cuando quieras ver la evolución desde ahora.</div>';
    }

    function init() {
        const page = document.querySelector('.pageAllianceMemberList');
        if (!page) return;

        const panel = buildPanel();
        page.insertAdjacentElement('afterend', panel);

        renderStatus(panel);

        panel.querySelector('#allianceStatsBtn').addEventListener('click', () => generateReport(panel));
        panel.querySelector('#allianceStatsResetBtn').addEventListener('click', () => resetCheckpoint(panel));
    }

    init();
})();
