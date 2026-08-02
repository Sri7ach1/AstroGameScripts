// ==UserScript==
// @author       LoneW0lf
// @name         Astro Expedition Reminder
// @namespace    astrogame-tools
// @version      1.1
// @description  Muestra un aviso flotante si no tienes ninguna expedición en el aire ahora mismo
// @source       https://raw.githubusercontent.com/Sri7ach1/AstroGameScripts/main/Astro%20Expedition%20Reminder/Astro%20Expedition%20Reminder.user.js
// @match        https://play.astrogame.org/uni25/game/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

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

    function showReminder() {
        setHidden(false);
        if (document.getElementById(REMINDER_ID)) return;

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

        banner.querySelector('#astroExpeditionReminderClose').addEventListener('click', hideReminder);
    }

    function toggleReminder() {
        if (document.getElementById(REMINDER_ID)) {
            hideReminder();
        } else {
            showReminder();
        }
    }

    function addNavItem() {
        const chatLink = document.querySelector('.sidebarNavList a.chatNavItem');
        if (!chatLink || document.getElementById(NAV_BTN_ID)) return;

        const link = document.createElement('a');
        link.id = NAV_BTN_ID;
        link.className = 'navItem';
        link.href = '#';
        link.innerHTML = `<span>Expedition Reminder</span>`;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            toggleReminder();
        });

        chatLink.insertAdjacentElement('afterend', link);
    }

    function init() {
        addNavItem();

        const ownExpeditions = getOwnExpeditionsInFlight();
        if (ownExpeditions === null) return;
        if (ownExpeditions.length === 0 && !isHidden()) {
            showReminder();
        }
    }

    init();
})();