// ==UserScript==
// @name         Embeded receipt info filler
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Embed receipt info filler in Lnwshop order page.
// @author       You
// @match        https://a.lnwstore.com/arduino4/order/info/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_receipt_info_filler.user.js
// @updateURL    https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_receipt_info_filler.user.js
// ==/UserScript==

// Tampermonkey applies an update only when @version is STRICTLY higher than
// the installed one. Bump it in the same commit as any code change, or the
// push silently does nothing.

(function () {
    "use strict";

    const SCOPE = "receipt-info-filler";
    const EMBEDED_URL = "https://console.genlogic.co.th/#/embeded/ctp-finder";
    const EMBEDED_ORIGIN = new URL(EMBEDED_URL).origin;
    const DEBUG = true;

    const log = (...args) => DEBUG && console.log("[ctp-filler]", ...args);
    const warn = (...args) => console.warn("[ctp-filler]", ...args);

    // ---------------------------------------------------------------- helpers

    // Polls until fn() returns something truthy, or the deadline passes.
    // Everything here is driven by Lnwshop's own async lookups, so there is no
    // fixed delay that is both safe and fast - poll instead.
    const waitFor = (fn, { timeout = 6000, interval = 100 } = {}) =>
        new Promise((resolve) => {
            const started = Date.now();
            const tick = () => {
                let value = null;
                try {
                    value = fn();
                } catch (e) {
                    /* keep polling */
                }
                if (value) return resolve(value);
                if (Date.now() - started >= timeout) return resolve(null);
                setTimeout(tick, interval);
            };
            tick();
        });

    // keyCode/which are readonly and ignored by the KeyboardEvent init dict,
    // so define them on the instance. Legacy handlers read e.which.
    const dispatchKey = (el, type, ch = "0") => {
        const code = ch.charCodeAt(0);
        const ev = new KeyboardEvent(type, {
            bubbles: true,
            cancelable: true,
            key: ch,
            code: /\d/.test(ch) ? `Digit${ch}` : `Key${ch.toUpperCase()}`,
        });
        Object.defineProperty(ev, "keyCode", { get: () => code });
        Object.defineProperty(ev, "which", { get: () => code });
        el.dispatchEvent(ev);
    };

    // Writes through the native prototype setter, then fires the full event
    // spread - we cannot know whether the page listens on input, change or
    // keyup, and firing all three is harmless.
    const setValue = (el, value, { blur = true } = {}) => {
        if (!el) return false;
        const text = value == null ? "" : String(value);
        const setter = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el),
            "value"
        )?.set;

        el.focus();
        dispatchKey(el, "keydown");
        if (setter) setter.call(el, text);
        else el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        dispatchKey(el, "keyup");
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (blur) el.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
    };

    // Types character by character. A single bulk assignment is invisible to
    // widgets that debounce per keystroke or only react once the field reaches
    // a given length - which is exactly how postcode lookups are usually built.
    const typeValue = (el, value) => {
        if (!el) return false;
        const text = value == null ? "" : String(value);
        const setter = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el),
            "value"
        )?.set;
        const write = (v) => (setter ? setter.call(el, v) : (el.value = v));

        el.focus();
        write("");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        for (const ch of text) {
            dispatchKey(el, "keydown", ch);
            write(el.value + ch);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            dispatchKey(el, "keyup", ch);
        }
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    };

    // The console strips administrative prefixes before sending; Lnwshop may
    // or may not render them. Normalising both sides makes the comparison
    // independent of which convention either end uses.
    const PREFIXES = /^(แขวง|ตำบล|ต\.|เขต|อำเภอ|อ\.|จังหวัด|จ\.)\s*/;
    const norm = (input) => {
        let text = (input == null ? "" : String(input))
            .replace(/ /g, " ")
            .trim();
        while (PREFIXES.test(text)) text = text.replace(PREFIXES, "").trim();
        text = text.replace(/\s+/g, "");
        if (/^(กรุงเทพ|กรุงเทพฯ|กทม\.?|กรุงเทพมหานคร)$/.test(text)) {
            return "กรุงเทพมหานคร";
        }
        return text;
    };

    // ------------------------------------------------------------ form fields

    const getContactBox = () =>
        document.querySelector(
            "#lnw-contact-popup .step-edit .modal-body .contact-box"
        );

    // Class-aware and scoped. The previous XPaths used @class='input_field',
    // which is whole-attribute equality - it misses class="input_field foo",
    // and this form really does carry multi-class inputs
    // (e.g. class="input_zipcode input_field").
    const setSimpleFields = (box, ctp) => {
        const seg = ctp.addrSegment ?? {};

        // There are two div.row.row-address blocks. Rather than trusting
        // document order, pick them by what they contain.
        const addressRows = [...box.querySelectorAll(".row-address")];
        const houseNoInput =
            addressRows
                .map((r) => r.querySelector("input"))
                .find((el) => el) ?? null;
        const addrTextarea =
            addressRows
                .map((r) => r.querySelector("textarea"))
                .find((el) => el) ?? null;

        const targets = [
            ["taxId", box.querySelector(".col-tax_id input"), ctp.taxId],
            ["branchId", box.querySelector(".col-branch_id input"), ctp.branchId],
            ["companyName", box.querySelector(".row-name input"), ctp.companyName],
            ["houseNo", houseNoInput, seg.houseNo],
            ["addrLine", addrTextarea, seg.addrLine],
        ];

        for (const [key, el, value] of targets) {
            if (!el) {
                warn("field not found:", key);
                continue;
            }
            setValue(el, value);
            log("set", key, "=", value);
        }
    };

    // ------------------------------------------------------ choices matching

    // Scores a row on how many of the three parts it contains, in any column.
    // Order-independent on purpose: the column layout is unknown and an extra
    // zipcode column would shift any fixed td[N] indexing.
    const pickChoiceRow = (table, seg) => {
        const want = {
            sub: norm(seg.subDistrict),
            district: norm(seg.district),
            province: norm(seg.province),
        };
        log("matching rows against", want);

        let best = null;
        let bestScore = 0;

        for (const tr of table.querySelectorAll("tr")) {
            const cells = [...tr.cells]
                .filter((c) => c.tagName === "TD")
                .map((c) => norm(c.textContent));
            if (!cells.length) continue; // header row

            let score = 0;
            if (want.sub && cells.includes(want.sub)) score += 4;
            if (want.district && cells.includes(want.district)) score += 2;
            if (want.province && cells.includes(want.province)) score += 1;

            if (score > bestScore) {
                bestScore = score;
                best = tr;
            }
        }

        // The subdistrict must match. Every row for a given postcode tends to
        // share a district and province, so a weaker threshold would pick an
        // arbitrary sibling subdistrict.
        return bestScore >= 4 ? best : null;
    };

    // Prints what the widget actually looks like right now. Called on every
    // failure path so a broken run explains itself instead of needing a
    // second round-trip.
    const dumpPicker = (picker) =>
        console.log(
            "[ctp-filler] subdistrict-box contents:\n" +
                picker.outerHTML
                    .replace(/<option[^>]*>[\s\S]*?<\/option>/g, "")
                    .slice(0, 4000)
        );

    const fillAddressPicker = async (box, seg) => {
        const picker = box.querySelector(".subdistrict-box");
        if (!picker) {
            warn("subdistrict-box not found - markup changed again");
            return;
        }

        if (DEBUG) {
            const obs = new MutationObserver((muts) => {
                for (const m of muts)
                    for (const n of m.addedNodes)
                        if (n.nodeType === 1)
                            log("picker gained", n.tagName + "." + n.className);
            });
            obs.observe(picker, { childList: true, subtree: true });
            setTimeout(() => obs.disconnect(), 12000);
        }

        const zip = picker.querySelector(".col-zipcode input, input.input_zipcode");
        if (!zip) {
            warn("zipcode input not found");
            dumpPicker(picker);
            return;
        }
        if (seg.postcode) {
            typeValue(zip, seg.postcode);
            log("typed postcode =", seg.postcode);
        }

        // Lnwshop builds table.subdistrict_choices in response to the postcode,
        // so it does not exist until now. Wait for it to carry real rows -
        // an empty shell can be inserted before the data arrives.
        const table = await waitFor(
            () => {
                const t =
                    picker.querySelector("table.subdistrict_choices") ??
                    box.querySelector("table.subdistrict_choices");
                return t && t.querySelector("td") ? t : null;
            },
            { timeout: 8000 }
        );

        if (!table) {
            warn("subdistrict_choices never appeared after entering the postcode");
            dumpPicker(picker);
            return;
        }

        const row = pickChoiceRow(table, seg);
        if (!row) {
            warn(
                "no row matched",
                { subDistrict: seg.subDistrict, district: seg.district, province: seg.province },
                [...table.querySelectorAll("tr")].map((tr) =>
                    [...tr.cells].map((c) => c.textContent.trim())
                )
            );
            return;
        }

        // Click the cell, not the row: the handler is normally delegated to
        // the td, and a td click bubbles to any tr handler anyway.
        (row.querySelector("td") ?? row).click();
        log(
            "selected",
            [...row.cells].map((c) => c.textContent.trim()).join(" / ")
        );
    };

    // ------------------------------------------------------------------- fill

    const fillInput = async (ctp) => {
        const box = getContactBox();
        if (!box) {
            warn("contact-box not found");
            return;
        }
        log("filling", ctp);
        setSimpleFields(box, ctp);
        await fillAddressPicker(box, ctp.addrSegment ?? {});
    };

    // Paste-in diagnostic: dumps whatever the address widget currently is,
    // so the picker can be adjusted if Lnwshop redesigns it again.
    window.__ctpDiag = () => {
        const box = getContactBox();
        if (!box) return warn("open the contact edit popup first");
        console.table(
            [...box.querySelectorAll("input, select, textarea")].map((el) => ({
                tag: el.tagName,
                cls: el.className,
                value: el.value,
                opts: el.tagName === "SELECT" ? el.options.length : "",
            }))
        );
        console.log(
            box
                .querySelector(".subdistrict-box")
                ?.outerHTML.replace(/<option[^>]*>[\s\S]*?<\/option>/g, "")
        );
    };

    // ------------------------------------------------------------ iframe wire

    const frame = document.createElement("iframe");
    frame.setAttribute("id", "mainDiv");
    frame.setAttribute("src", EMBEDED_URL);
    frame.style.height = "250px";
    frame.style.width = "100%";

    let editElement = null;
    setInterval(() => {
        const found = document.querySelector(
            "#lnw-contact-popup .step-edit .modal-body"
        );
        if (found && editElement !== found) {
            editElement = found;
            editElement.prepend(frame);
        }
        frame.style.display =
            frame.parentElement?.className === "modal-body" ? "" : "none";
    }, 1000);

    window.addEventListener("message", (event) => {
        if (event.origin !== EMBEDED_ORIGIN || !event.data) return;
        if (event.data.scope !== SCOPE) return;
        if (event.data.action === "ctp-selected" && event.data.param) {
            fillInput(event.data.param);
        }
    });

    setInterval(() => {
        // Until the iframe finishes navigating it sits on about:blank, which
        // inherits a.lnwstore.com as its origin - postMessage then throws
        // rather than deliver cross-origin. Swallow it; the next tick works.
        try {
            frame.contentWindow?.postMessage(
                { scope: SCOPE, status: 200, data: "ready" },
                EMBEDED_ORIGIN
            );
        } catch (e) {
            /* iframe not on EMBEDED_ORIGIN yet */
        }
    }, 1000);
})();
