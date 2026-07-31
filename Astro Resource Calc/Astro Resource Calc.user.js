// ==UserScript==
// @author       LoneW0lf
// @name         Astro Resource Calc
// @namespace    astrogame-tools
// @version      1.0
// @description  Muestra la producción total (hora/día/semana/mes) de todos tus planetas en la vista de recursos
// @match        https://play.astrogame.org/uni25/game/feedstock*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

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
        const exp = Math.min(Math.floor(Math.log10(Math.abs(n)) / 3), SUFFIXES.length - 1);
        if (exp <= 0) return formatFull(n);
        const value = n / Math.pow(1000, exp);
        const decimals = value < 10 ? 1 : 0;
        return value.toFixed(decimals).replace('.', ',') + '\u00A0' + SUFFIXES[exp];
    }

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

    function buildPanel(planetCount) {
        const panel = document.createElement('div');
        panel.id = 'accountProdPanel';
        panel.style.cssText = 'margin:12px 0;padding:10px;border-radius:8px;background:var(--secondary-700,#1f2937);color:var(--text-primary,#e2e8f0);font-family:inherit;';
        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                <strong>Producción total de la cuenta (${planetCount} planetas)</strong>
                <button id="accountProdBtn" class="button sm warning" type="button">Calcular</button>
            </div>
            <div id="accountProdResult" style="font-size:13px;"></div>
        `;
        return panel;
    }

    function renderResult(container, totals) {
        const rows = PERIODS.map((period) => {
            const t = totals[period.key];
            const cells = METRICS.map((metric) => {
                const full = formatFull(t[metric]);
                const short = formatShort(t[metric]);
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

    function init() {
        const header = document.querySelector('.pageResourcesDefault .header');
        if (!header) return;

        const planets = getAccountPlanets();
        if (planets.length === 0) return;

        const panel = buildPanel(planets.length);
        header.insertAdjacentElement('afterend', panel);

        const btn = panel.querySelector('#accountProdBtn');
        const resultBox = panel.querySelector('#accountProdResult');

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Cargando...';
            resultBox.textContent = '';

            try {
                const all = await Promise.all(planets.map((p) => fetchPlanetProduction(p.id)));
                const totals = sumProduction(all);
                renderResult(resultBox, totals);
            } catch (err) {
                resultBox.textContent = 'Error al calcular: ' + err.message;
                console.error('[Astrogame Producción Total]', err);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Calcular';
            }
        });
    }

    init();
})();