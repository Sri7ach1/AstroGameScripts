// ==UserScript==
// @author       LoneW0lf
// @name         Astro Expedition Reminder
// @namespace    astrogame-tools
// @version      1.0
// @description  Muestra un aviso flotante si no tienes ninguna expedición en el aire ahora mismo
// @match        https://play.astrogame.org/uni25/game/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const MISSION_EXPEDITION = '15';
    const REMINDER_ID = 'astroExpeditionReminder';

    // `activeFleetActs` es una variable global que la propia página declara
    // inline en el <head> con `const` — por eso NO cuelga de `window.` (a
    // diferencia de `var`), pero sí es accesible como identificador directo
    // desde cualquier otro script que comparta el documento (como este,
    // gracias a @grant none). Referenciarla vía `window.activeFleetActs`
    // siempre da `undefined` aunque la variable exista.
    function getOwnExpeditionsInFlight() {
        let acts;
        try {
            // eslint-disable-next-line no-undef
            acts = activeFleetActs;
        } catch (e) {
            return null; // no declarada en esta página en absoluto
        }
        if (!Array.isArray(acts)) return null;
        return acts.filter((a) => a.mission === MISSION_EXPEDITION && a.is_own === true);
    }

    function showReminder() {
        if (document.getElementById(REMINDER_ID)) return; // ya está mostrado

        const banner = document.createElement('div');
        banner.id = REMINDER_ID;
        banner.style.cssText = `
            position:fixed; top:70px; right:16px; z-index:99999;
            background:#7c2d12; color:#fff; padding:10px 14px; border-radius:8px;
            box-shadow:0 4px 12px rgba(0,0,0,.4); font-size:13px; max-width:260px;
            display:flex; align-items:flex-start; gap:8px; font-family:inherit;
        `;
        banner.innerHTML = `
            <span style="font-size:20px;line-height:1;">🚀</span>
            <div style="flex:1;">
                <strong>Sin expediciones en el aire</strong><br>
                No tienes ninguna expedición volando ahora mismo.
                <div style="margin-top:6px;">
                    <a href="https://play.astrogame.org/uni25/game/fleetTable"
                       style="color:#fed7aa;text-decoration:underline;">Ir a la Base de la Flota</a>
                </div>
            </div>
            <button id="astroExpeditionReminderClose" type="button"
                    style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;line-height:1;padding:0;">
                &times;
            </button>
        `;
        document.body.appendChild(banner);

        banner.querySelector('#astroExpeditionReminderClose').addEventListener('click', () => banner.remove());
    }

    function init() {
        const ownExpeditions = getOwnExpeditionsInFlight();
        if (ownExpeditions === null) return; // variable no disponible en esta página
        if (ownExpeditions.length === 0) {
            showReminder();
        }
    }

    init();
})();