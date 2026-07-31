// ==UserScript==
// @author       LoneW0lf
// @name         Astro ROI
// @namespace    astrogame-tools
// @version      1.0
// @description  Calcula cuántos días tardan en pagarse las mejoras de minas y de investigación de producción en Astrogame
// @match        https://play.astrogame.org/uni25/game/buildings?side=resources*
// @match        https://play.astrogame.org/uni25/game/research*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const RESOURCE_LABELS = { '901': 'Metal', '902': 'Cristal', '903': 'Deutério' };

    function formatFull(n) {
        return Math.round(n).toLocaleString('es-ES');
    }

    function formatShort(n) {
        const SUFFIXES = ['', 'K', 'M', 'Mr', 'T'];
        if (n === 0) return '0';
        const sign = n < 0 ? '-' : '';
        const abs = Math.abs(n);
        const exp = Math.min(Math.floor(Math.log10(abs) / 3), SUFFIXES.length - 1);
        if (exp <= 0) return sign + formatFull(abs);
        const value = abs / Math.pow(1000, exp);
        const decimals = value < 10 ? 1 : 0;
        return sign + value.toFixed(decimals).replace('.', ',') + ' ' + SUFFIXES[exp];
    }

    // Extrae un literal de objeto JS balanceando llaves (respetando comillas/escapes),
    // porque el HTML embebe buildingData/researchData/resourceTable como JS suelto,
    // no como JSON aislado, y un regex simple se rompe con objetos anidados.
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
            console.error('[AstroROI] No se pudo parsear', marker, e);
            return null;
        }
    }

    // Lee buildingData/researchData/resourceTable directo de los <script> inline
    // que el propio servidor ya insertó en el documento actual, en vez de re-fetchear
    // la página: el juego registra un Service Worker (sw.js) que puede interceptar
    // ese fetch y devolver una versión cacheada/parcial sin esos datos. Los <script>
    // inline conservan su textContent original aunque el userscript corra en un
    // mundo aislado (grant: none no garantiza compartir el scope léxico let/const
    // de la página), así que leer el DOM es más fiable que re-descargar.
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

    // La variable JS `resourceTable` solo viene embebida en las páginas de
    // Recursos/Instalaciones, NO en la de Investigación. En cambio los tooltips de
    // recursos del header (compartido en todas las páginas) sí traen la producción
    // actual en el atributo data-production, así que la leemos de ahí siempre -
    // funciona igual en las dos páginas sin depender de qué variable JS exista.
    function getResourceProductionFromDom() {
        const table = {};
        document.querySelectorAll('.resourceCardTooltip[data-id]').forEach((el) => {
            const id = el.getAttribute('data-id');
            const raw = el.getAttribute('data-production');
            if (!raw) return;
            const value = parseInt(raw.replace(/\./g, ''), 10);
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

    // Tasa de cambio del mercader de este servidor: 4 Metal = 2 Cristal = 1 Deutério.
    // En "valor-metal": Metal x1, Cristal x2, Deutério x4.
    const VALUE_WEIGHTS = { '901': 1, '902': 2, '903': 4 };

    function weightedValue(costResources) {
        if (!costResources) return 0;
        return ['901', '902', '903'].reduce((sum, key) => sum + (Number(costResources[key]) || 0) * VALUE_WEIGHTS[key], 0);
    }

    // Fórmula estándar de minas OGame: producción(nivel) = C * nivel * 1.1^nivel * k,
    // donde C (base por tipo de recurso) y k (velocidad de servidor, temperatura del
    // planeta, bonos de oficiales/investigación) son constantes multiplicativas
    // independientes del nivel. Al tomar el ratio producción(objetivo)/producción(actual)
    // esas constantes se cancelan por completo, así que no hace falta conocerlas ni
    // saber la velocidad real del servidor - el cálculo se recalibra solo con la
    // producción actual que ya trae la página.
    function mineProductionRatio(currentLevel, targetLevel) {
        return (targetLevel / currentLevel) * Math.pow(1.1, targetLevel - currentLevel);
    }

    function computeMineROI(buildingData, resourceTable, buildingId, resKey, label) {
        const b = buildingData[buildingId];
        if (!b || !b.buyable) return null;
        const currentLevel = Number(b.level);
        if (!currentLevel) return null;
        // El botón de mejora rápida siempre sube exactamente 1 nivel; levelToBuild
        // en esta página viene igual al nivel actual (no es "próximo nivel" como en
        // Investigación), así que no sirve para esto y se ignora.
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
            extraPerDay, resKey, days: costValue / extraValuePerDay,
        };
    }

    // Las investigaciones de producción (131/132/133) dan un bono ADITIVO plano de
    // +10% por nivel sobre la producción base (igual que un bono de oficial): el
    // factor total es (1 + 0.10*nivel). Se despeja la producción base a partir de la
    // producción actual (que ya incluye el bono del nivel actual) y se reaplica con
    // el factor del nivel objetivo.
    function computeTechROI(researchData, resourceTable, techId, resKey, label) {
        const r = researchData[techId];
        if (!r || !r.buyable) return null;
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
            extraPerDay, resKey, days: costValue / extraValuePerDay,
        };
    }

    function renderRow(entry) {
        const costParts = ['901', '902', '903']
            .filter((k) => entry.costResources[k])
            .map((k) => `${RESOURCE_LABELS[k]} ${formatShort(entry.costResources[k])}`)
            .join(' + ');
        return `
            <tr>
                <td style="padding:4px 10px;">${entry.label}</td>
                <td style="padding:4px 10px;">${entry.currentLevel} → ${entry.targetLevel}</td>
                <td style="padding:4px 10px;">${costParts}</td>
                <td style="padding:4px 10px;">+${formatShort(entry.extraPerDay)} ${RESOURCE_LABELS[entry.resKey]}/día</td>
                <td style="padding:4px 10px;font-weight:bold;">${entry.days.toFixed(1)} días</td>
            </tr>
        `;
    }

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'astroRoiPanel';
        panel.style.cssText = 'margin:12px 0;padding:10px;border-radius:8px;background:var(--secondary-700,#1f2937);color:var(--text-primary,#e2e8f0);';
        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                <strong>Astro ROI — Días para recuperar la inversión</strong>
                <button id="astroRoiBtn" class="button sm warning" type="button">Actualizar</button>
            </div>
            <div id="astroRoiResult" style="font-size:13px;">Cargando...</div>
        `;
        return panel;
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

    function refresh(panel) {
        const btn = panel.querySelector('#astroRoiBtn');
        const resultBox = panel.querySelector('#astroRoiResult');
        btn.disabled = true;
        btn.textContent = 'Cargando...';

        try {
            const { buildingData, researchData, resourceTable } = getPageData();
            if (!Object.keys(resourceTable).length) throw new Error('No se pudo leer la producción actual de recursos (tooltips) de la página');

            const entries = [];
            if (buildingData) {
                entries.push(computeMineROI(buildingData, resourceTable, '1', '901', 'Mina de Metal'));
                entries.push(computeMineROI(buildingData, resourceTable, '2', '902', 'Mina de Cristal'));
                entries.push(computeMineROI(buildingData, resourceTable, '3', '903', 'Sintetizador de Deuterio'));
            }
            if (researchData) {
                entries.push(computeTechROI(researchData, resourceTable, '131', '901', 'Máxima producción de metal'));
                entries.push(computeTechROI(researchData, resourceTable, '132', '902', 'Máxima producción de cristal'));
                entries.push(computeTechROI(researchData, resourceTable, '133', '903', 'Máxima producción de deuterio'));
            }

            renderResult(resultBox, entries.filter(Boolean));
        } catch (err) {
            resultBox.textContent = 'Error al calcular: ' + err.message;
            console.error('[AstroROI]', err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Actualizar';
        }
    }

    function init() {
        if (document.getElementById('astroRoiPanel')) return; // ya insertado, evita duplicados

        const header = document.querySelector('.pageHeader');
        if (!header) return;

        const panel = buildPanel();
        header.insertAdjacentElement('afterend', panel);
        refresh(panel);

        panel.querySelector('#astroRoiBtn').addEventListener('click', () => refresh(panel));
    }

    init();
})();
