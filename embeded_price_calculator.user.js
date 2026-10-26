// ==UserScript==
// @name         Embeded Price Calculator
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  Embed the console's pricing calculator and price setter in the Lnwshop product page.
// @author       You
// @match        https://a.lnwstore.com/*/inventory/product/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_price_calculator.user.js
// @updateURL    https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_price_calculator.user.js
// ==/UserScript==
(function () {
    "use strict";

    // @grant none keeps this script in page context, which is where Lnwshop's
    // `vm` global is reachable - the sibling scripts depend on the same thing.
    // That rules out GM_addStyle, so the stylesheet goes in by hand.
    const SCOPE = "price-cal-filler";

    const style = document.createElement("style");
    style.textContent = `
        #floating-calc-container {
            position: fixed;
            top: 60px;
            right: 20px;
            width: fit-content;
            background: #fff;
            border: 1px solid #ccc;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border-radius: 8px;
            z-index: 999999;
            font-family: 'Sarabun', sans-serif, Arial;
            font-size: 13px;
            display: flex;
            flex-direction: column;
            max-height: calc(100vh - 80px);
        }
        #calc-body {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
        }
        #calFrame {
            display: block;
            border: none;
        }
        #calc-header {
            background: rgb(17, 34, 51);
            color: white;
            padding: 10px;
            cursor: move;
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            user-select: none;
        }
        .btn-close { cursor: pointer; background: none; border: none; color: white; font-weight: bold; }
        #calc-fab {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: rgb(17, 34, 51);
            color: white;
            font-size: 24px;
            line-height: 56px;
            text-align: center;
            padding: 0;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 999998;
        }
        #calc-fab:hover { background: rgb(34, 51, 68); }
        #calc-buttons { display: flex; gap: 10px; }
        #floating-calc-container.collapsed { min-width: 360px; }
        #floating-calc-container.collapsed #calc-body { display: none; }
        #floating-calc-container.collapsed #calc-header { border-radius: 8px; }
    `;
    document.head.appendChild(style);

    // 2. สร้างโครงสร้าง HTML (UI)
    const calcHTML = `
        <div id="calc-header">
            <span>🧮 เครื่องคิดเลขตั้งราคา</span>
            <div id="calc-buttons">
                <button class="btn-close" id="calc-collapse">−</button>
                <button class="btn-close" id="calc-close">X</button>
            </div>
        </div>
        <div id="calc-body">
            <iframe id="calFrame" scrolling="no" style="width: 360px; height: 620px;"></iframe>
        </div>
    `;
    let container = null;

    // ------------------------------------------------------------------
    // ตัวกรอกราคาลงฟอร์ม lnwshop — ขับโดยหน้า #/embeded/price-set ของ console
    //
    // พอร์ตจาก lnw-crawler-v2 src/crawlers/price_update_crawler/price_dom.ts + price_tabs.ts
    // (ตัวเดียวกับที่ใช้ขึ้นราคา/จัดราคาทั้งแคตตาล็อก) ให้ทำงานในหน้า ไม่ใช่ใน Playwright:
    //   - กล่องราคาของแท็บช่องทางคือ .tab-channel-area:visible .price-box-area
    //     สวิตช์ "ใช้ราคาขายเหมือน <ต้นทาง>" (sync) ↔ "กำหนดราคาขายแยกต่างหาก" (แยก)
    //     โหมดแยกมี select โหมด ("" = กำหนดเป็น) / input จำนวน / select หน่วย ("" = บาท)
    //     ราคาสุทธิที่ Vue คำนวณสดอยู่ที่ .finaltotal .total — ใช้ยืนยันก่อนรายงานว่าสำเร็จ
    //   - กล่องบอกช่องของตัวเองด้วยลิงก์ .../channel/<boxKey>#setting-price (แท็บหลักไม่มีลิงก์)
    //     จึงหาแท็บจาก boxKey ที่หน้า console ส่งมา ไม่ต้องรู้ชื่อร้าน/shop id
    //   - แท็บร้านที่ "ใช้ราคาขายเหมือน X หลัก" (General4 ตาม Shopee หลัก, Lazada genlogic ตาม
    //     Lazada หลัก) ต้องเขียนที่แท็บหลัก ไม่งั้นร้านหลุดจากกฎ — และถ้ามีแท็บร้านอื่นตามแท็บหลัก
    //     เดียวกันอยู่ ราคาร้านนั้นจะขยับตาม จึงไม่เขียนแล้วบอกให้ตั้งแท็บนั้นก่อน
    //   - ไม่กดบันทึก: คนตรวจฟอร์มแล้วกดเอง
    // ------------------------------------------------------------------
    const USE_SAME = "ใช้ราคาขายเหมือน";
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const visible = (el) => !!el && el.offsetParent !== null;

    async function waitFor(fn, timeoutMs = 4000, stepMs = 150) {
        const until = Date.now() + timeoutMs;
        for (;;) {
            const v = fn();
            if (v) return v;
            if (Date.now() > until) return null;
            await sleep(stepMs);
        }
    }

    function channelTabs() {
        return Array.from(document.querySelectorAll("#tab_channels .action")).map((el) => ({
            el,
            title: el.getAttribute("data-original-title") || el.getAttribute("title") || "",
        }));
    }

    function visibleArea() {
        return Array.from(document.querySelectorAll(".tab-channel-area")).find(visible) || null;
    }

    /** สถานะกล่องราคาของแท็บที่มองเห็น — null ถ้าไม่มีกล่อง */
    function readBox() {
        const area = visibleArea();
        const box = area?.querySelector(".price-box-area");
        if (!box) return null;
        const sw = Array.from(box.querySelectorAll("span.switch")).find(
            (s) => (s.querySelector(".slabel")?.textContent || "").includes("ราคาขาย") && visible(s),
        );
        const real = box.querySelector(".real-price");
        const amount = real?.querySelector('input[type="number"]') || null;
        const separate = visible(amount);
        let mode = null;
        let unit = null;
        if (separate) {
            for (const sel of real.querySelectorAll("select")) {
                if (Array.from(sel.options).some((o) => o.value === "upper")) mode = sel.value;
                else unit = sel.value;
            }
        }
        const netText = box.querySelector(".finaltotal .total")?.textContent;
        const net = netText == null ? null : parseFloat(netText.replace(/,/g, ""));
        const href = box.querySelector('a[href*="/channel/"]')?.getAttribute("href") || "";
        const boxKey = (href.split("/channel/")[1] || "").split("#")[0].split("?")[0].split("/")[0] || null;
        const areaChannel = (/area-channel-([a-z_]+)/.exec(area.getAttribute("class") || "") || [])[1] || null;
        return {
            box,
            separate,
            switchLabel: sw ? (sw.querySelector(".slabel")?.textContent || "").trim() : null,
            switchEl: sw || null,
            mode,
            unit,
            amount: separate ? amount.value : null,
            net: Number.isFinite(net) ? net : null,
            boxKey,
            areaChannel,
        };
    }

    /** ลายเซ็นของ area ที่มองเห็น — ไว้รู้ว่าคลิกแท็บแล้ว Vue สลับ area ให้แล้วหรือยัง */
    function areaSignature() {
        const area = visibleArea();
        if (!area) return "none";
        const b = readBox();
        return `${area.getAttribute("class")}|${b ? b.boxKey : "nobox"}`;
    }

    /**
     * คลิกแท็บแล้วรอให้ area เปลี่ยนจริง — readBox() ทันทีหลังคลิกยังเห็นกล่องของแท็บเดิม (Vue สลับไม่ทัน)
     * ซึ่งทำให้เขียนผิดแท็บได้ · คลิกแท็บที่เปิดอยู่แล้ว area ไม่เปลี่ยน จึงรอแค่ช่วงสั้น ๆ แล้วไปต่อ
     */
    async function clickTab(tab) {
        const before = areaSignature();
        const el = channelTabs().find((t) => t.title === tab.title)?.el || tab.el;
        el.click();
        await waitFor(() => (areaSignature() !== before ? true : null), 1500);
        await sleep(250); // ให้ Vue render กล่องของแท็บใหม่ให้ครบ
        return readBox();
    }

    /** เปิดแท็บแล้วยืนยันว่ากล่องที่เห็นเป็นของ (channel, boxKey) จริง — คืน box หรือ null */
    async function openTab(tab, channel, boxKey) {
        const b = await clickTab(tab);
        return b && b.areaChannel === channel && b.boxKey === boxKey ? b : null;
    }

    /** หาแท็บของ instance จาก boxKey: ไล่คลิกแท็บของแพลตฟอร์มนั้นแล้วอ่านกล่อง (จำชื่อแท็บไว้ต่อหน้า) */
    const titleByKey = new Map(); // `${channel}/${boxKey}` -> ชื่อแท็บ
    function tabByTitle(title) {
        return channelTabs().find((t) => t.title === title) || null;
    }
    async function findInstanceTab(channel, boxKey) {
        const key = `${channel}/${boxKey}`;
        if (titleByKey.has(key)) return tabByTitle(titleByKey.get(key));
        for (const tab of channelTabs()) {
            if (/หลัก$/.test(tab.title)) continue;
            const b = await clickTab(tab);
            if (!b || !b.boxKey) continue; // ไม่มีกล่อง (ยังไม่ตั้งหมวดหมู่) หรืออ่านไม่ได้
            titleByKey.set(`${b.areaChannel}/${b.boxKey}`, tab.title);
            if (b.areaChannel === channel && b.boxKey === boxKey) return tab;
        }
        return null;
    }

    /** แท็บหลักที่กล่องนี้ sync ตามอยู่ — null ถ้าไม่ได้ตามแท็บหลัก (แยกเอง หรือตามราคาหลัก LnwShop) */
    function followedMainTab(box) {
        const label = box.switchLabel || "";
        if (box.separate || !label.startsWith(USE_SAME)) return null;
        const source = label.slice(USE_SAME.length).trim();
        if (!source.endsWith("หลัก")) return null;
        return channelTabs().find((t) => t.title === source || t.title.endsWith(source)) || null;
    }

    function fire(el, type) {
        el.dispatchEvent(new Event(type, { bubbles: true }));
    }

    async function setSeparate(wantSeparate) {
        let b = readBox();
        if (!b) return false;
        if (b.separate === wantSeparate) return true;
        if (!b.switchEl) return false;
        b.switchEl.click();
        b = await waitFor(() => {
            const s = readBox();
            return s && s.separate === wantSeparate ? s : null;
        });
        return !!b;
    }

    /** ตั้ง "กำหนดเป็น <price> บาท" ให้กล่องที่มองเห็น — รอ .finaltotal ให้ตรงก่อนถือว่าสำเร็จ */
    async function setBoxPrice(price) {
        if (!(await setSeparate(true))) return "เข้าโหมดราคาแยกไม่ได้";
        const b = readBox();
        const real = b.box.querySelector(".real-price");
        // select โหมดก่อน (กำหนดเป็น) แล้วค่อยหน่วย — โหมด "กำหนดเป็น" ล็อกหน่วยเป็นบาทเอง
        for (const wantMode of [true, false]) {
            for (const sel of real.querySelectorAll("select")) {
                const isMode = Array.from(sel.options).some((o) => o.value === "upper");
                if (isMode !== wantMode || sel.value === "") continue;
                if (sel.disabled) return `select ${wantMode ? "โหมด" : "หน่วย"} ถูกล็อกเป็น "${sel.value}"`;
                if (!Array.from(sel.options).some((o) => o.value === "")) return "ไม่มีตัวเลือก กำหนดเป็น/บาท";
                sel.value = "";
                fire(sel, "input");
                fire(sel, "change");
                await sleep(250);
            }
        }
        const input = real.querySelector('input[type="number"]');
        input.value = String(price);
        fire(input, "input");
        fire(input, "change");
        const ok = await waitFor(() => {
            const s = readBox();
            return s && s.net !== null && Math.abs(s.net - price) < 0.005 ? s : null;
        }, 3000);
        return ok ? null : `ราคาสุทธิบนฟอร์มเป็น ${readBox()?.net} ไม่ใช่ ${price}`;
    }

    /** ราคาหลัก LnwShop — กล่อง .price-editable-area นอกแท็บช่องทาง (สินค้าลูกที่ราคาตามแม่ไม่มี) */
    async function setBasePrice(price) {
        const input = Array.from(
            document.querySelectorAll('.price-editable-area.price-box-area .real-price input[type="number"]'),
        ).find((i) => visible(i) && !i.closest(".tab-channel-area"));
        if (!input) return "ไม่มีช่องราคาหลักให้แก้ (ราคาตามสินค้าแม่?)";
        if (input.disabled || input.readOnly) return "ช่องราคาหลักถูกล็อก";
        input.value = String(price);
        fire(input, "input");
        fire(input, "change");
        await sleep(300);
        return Number(input.value) === Number(price) ? null : `ฟอร์มรับค่าเป็น ${input.value}`;
    }

    /** ช่อง 1 ตัวตามคำขอของหน้า console — คืน {ok, message} */
    async function applyChannel(ch, batch) {
        // boxKey = เลข instance เมื่อแพลตฟอร์มมีหลายร้าน (Shopee/Lazada) · ช่องที่มีร้านเดียวใช้ channel key
        // (tiktok_shop, line_shopping) — ลองทั้งสองแบบ
        const tab =
            (await findInstanceTab(ch.channel, ch.instance)) ||
            (await findInstanceTab(ch.channel, ch.channel));
        if (!tab) return { ok: false, message: "ไม่พบแท็บ/กล่องราคาของช่องนี้ (ยังไม่ตั้งหมวดหมู่?)" };
        return applyToTab(tab, ch, batch);
    }

    async function applyToTab(tab, ch, batch) {
        const box = await clickTab(tab);
        if (!box || box.areaChannel !== ch.channel || !box.boxKey) {
            return { ok: false, message: `เปิด "${tab.title}" แล้วกล่องที่เห็นไม่ใช่ของช่องนี้` };
        }
        const ownKey = box.boxKey;

        if (ch.kind === "sync") {
            // ตามราคาหลัก LnwShop: กลับโหมด sync — ต้นทางต้องเป็น LnwShop ไม่ใช่แท็บหลัก
            if (!(await setSeparate(false))) return { ok: false, message: "สลับเป็นโหมดใช้ราคาเหมือน... ไม่ได้" };
            const s = readBox();
            if (followedMainTab(s)) return { ok: false, message: `แท็บนี้ตาม "${s.switchLabel}" ไม่ใช่ราคาหลัก LnwShop` };
            return { ok: true, message: `${s.switchLabel} → ${s.net}` };
        }

        const main = followedMainTab(box);
        if (!main) {
            const err = await setBoxPrice(ch.price);
            return err ? { ok: false, message: err } : { ok: true, message: `กำหนดเป็น ${ch.price} บาท` };
        }

        // ตามแท็บหลักอยู่ → เขียนที่แท็บหลัก แต่ก่อนนั้นดูว่ามีแท็บร้านอื่นของแพลตฟอร์มนี้ตามแท็บหลักเดียวกันไหม
        // (อ่านจากฟอร์มสด: แท็บที่เพิ่งถูกตั้งเป็นราคาแยกในรอบนี้ไม่นับ — จึงกรอกแท็บแยกก่อนแท็บหลัก)
        const prefix = `${main.title.replace(/\s*หลัก$/, "")} - `;
        const followers = [];
        for (const other of channelTabs()) {
            // เทียบด้วยชื่อ: channelTabs() สร้าง object ใหม่ทุกครั้ง
            if (other.title === main.title || other.title === tab.title || !other.title.startsWith(prefix)) continue;
            const ob = await clickTab(other);
            if (!ob) continue; // แท็บไม่มีกล่องราคา (ยังไม่ตั้งหมวดหมู่) = ไม่มีราคาให้ขยับ
            if (ob.areaChannel !== ch.channel || !ob.boxKey || ob.boxKey === ownKey) {
                return { ok: false, message: `อ่านกล่องของ "${other.title}" ไม่ได้ — ตรวจไม่ได้ว่าตามแท็บหลักไหม` };
            }
            const f = followedMainTab(ob);
            if (f && f.title === main.title) followers.push(other.title);
        }
        if (followers.length) {
            return {
                ok: false,
                message: `ตาม "${main.title}" อยู่ แต่ ${followers.join(", ")} ก็ตามแท็บเดียวกัน — ตั้งราคาแท็บนั้นก่อน ไม่งั้นขยับตาม`,
            };
        }
        const mb = await openTab(main, ch.channel, null);
        if (!mb) return { ok: false, message: `เปิด "${main.title}" ไม่ได้` };
        const err = await setBoxPrice(ch.price);
        if (err) return { ok: false, message: `ที่ ${main.title}: ${err}` };
        // กลับมาดูแท็บร้าน: ต้องยังตามแท็บหลักและโชว์ราคาใหม่
        const back = await openTab(tab, ch.channel, ownKey);
        if (!back || !followedMainTab(back) || back.net === null || Math.abs(back.net - ch.price) >= 0.005) {
            return { ok: false, message: `ตั้ง ${main.title} แล้ว แต่แท็บร้านโชว์ ${back?.net} (${back?.switchLabel})` };
        }
        batch.mainsWritten.add(main.title);
        return { ok: true, message: `กำหนดเป็น ${ch.price} บาท ที่ "${main.title}" (แท็บร้านตามอยู่)` };
    }

    async function applyPrices(req) {
        const results = [];
        const batch = { mainsWritten: new Set() };
        if (req.base !== null && req.base !== undefined) {
            const err = await setBasePrice(req.base);
            results.push({ target: "base", label: "ราคาหลัก LnwShop", ok: !err, message: err || `ตั้งเป็น ${req.base} บาท` });
        }
        // แท็บที่เขียนที่ตัวเองก่อน แล้วค่อยแท็บที่อาจต้องเขียนผ่านแท็บหลัก (ดูเหตุผลใน applyToTab)
        // ตามกฎตอนนี้ General4 (1005) ตาม Shopee หลัก และ Lazada genlogic (1003) ตาม Lazada หลัก
        const viaMain = (ch) => Number(ch.instance === "1005" || ch.instance === "1003");
        const order = [...(req.channels || [])].sort((a, b) => viaMain(a) - viaMain(b));
        for (const ch of order) {
            try {
                const r = await applyChannel(ch, batch);
                results.push({ target: ch.instance, label: ch.label, ...r });
            } catch (e) {
                results.push({ target: ch.instance, label: ch.label, ok: false, message: `พัง: ${e?.message || e}` });
            }
        }
        return results;
    }

    // ไว้เรียกจาก DevTools / ทดสอบนอก Tampermonkey: window.__lnwPriceSetter.applyPrices({ base, channels })
    window.__lnwPriceSetter = { applyPrices, readBox, channelTabs };

    function load() {
        const embededUrlString =
            "https://console.genlogic.co.th/#/embeded/price-cal";
        const embededUrl = new URL(embededUrlString);

        container = document.createElement("div");
        container.id = "floating-calc-container";
        container.innerHTML = calcHTML;
        document.body.appendChild(container);

        const calFrame = container.querySelector("#calFrame");
        calFrame.src = embededUrl;

        // 6. ระบบลากหน้าต่าง (Drag and Drop)
        const header = container.querySelector("#calc-header");
        let initialX = 0,
            initialY = 0,
            xOffset = 0,
            yOffset = 0;
        header.addEventListener("mousedown", dragStart);

        function dragStart(e) {
            if (e.target !== header && e.target.parentNode !== header) return;
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            // The iframe swallows mousemove/mouseup as soon as the cursor
            // crosses into it, which strands the drag and leaves the panel
            // stuck to the pointer. Nothing to swallow them while it is inert.
            calFrame.style.pointerEvents = "none";
            document.addEventListener("mousemove", drag);
            document.addEventListener("mouseup", dragEnd);
        }
        function dragEnd() {
            calFrame.style.pointerEvents = "";
            document.removeEventListener("mousemove", drag);
            document.removeEventListener("mouseup", dragEnd);
        }
        function drag(e) {
            e.preventDefault();
            xOffset = e.clientX - initialX;
            yOffset = e.clientY - initialY;
            container.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`;
        }

        // 7. ปุ่มปิดหน้าต่าง
        container.querySelector("#calc-close").addEventListener("click", () => {
            container.style.display = "none";
        });

        // 8. ปุ่มย่อ/ขยายหน้าต่าง
        const collapseBtn = container.querySelector("#calc-collapse");
        collapseBtn.addEventListener("click", () => {
            const collapsed = container.classList.toggle("collapsed");
            collapseBtn.textContent = collapsed ? "+" : "−";
        });

        let handshake = null;

        function sendData() {
            // A bare `vm` throws ReferenceError rather than reading as
            // falsy on any page that does not define it.
            if (typeof vm !== "undefined" && vm?.pdata) {
                calFrame.contentWindow?.postMessage(
                    { scope: SCOPE, status: "send_data", data: vm.pdata },
                    embededUrl.origin,
                );
                return true;
            }
            return false;
        }

        function startHandshake() {
            if (handshake) return;
            handshake = setInterval(sendData, 1000);
        }

        let applying = false;
        window.addEventListener("message", (event) => {
            if (event.origin !== embededUrl.origin || !event.data) return;
            if (event.data.scope !== SCOPE) return;
            if (event.data.status === "received" && handshake) {
                clearInterval(handshake);
                handshake = null;
            }
            // หน้า price-set เปิดจากลิงก์ภายใน iframe (ไม่มี load event) จึงขอ pdata เอง
            if (event.data.status === "request") sendData();
            if (
                event.data.status === "resize" &&
                typeof event.data.height === "number" &&
                event.data.height > 0
            ) {
                calFrame.style.height = event.data.height + "px";
            }
            if (event.data.action === "apply-prices" && event.data.param && !applying) {
                applying = true;
                applyPrices(event.data.param)
                    .catch((e) => [{ target: "all", label: "ตั้งราคา", ok: false, message: `พัง: ${e?.message || e}` }])
                    .then((results) => {
                        applying = false;
                        calFrame.contentWindow?.postMessage(
                            { scope: SCOPE, status: "applied", results },
                            embededUrl.origin,
                        );
                    });
            }
        });

        // This interval is the only thing that ever sends pdata, and the ack
        // stops it - so a reloaded iframe (auth bounce, in-frame navigation)
        // would sit empty forever. Re-arm on load; the next ack stops it again.
        calFrame.addEventListener("load", startHandshake);
        startHandshake();
    }

    const priceCalBtn = document.createElement("button");
    priceCalBtn.id = "calc-fab";
    priceCalBtn.title = "เครื่องคิดเลขตั้งราคา";
    priceCalBtn.innerHTML = "🧮";

    priceCalBtn.onclick = function () {
        if (!container) {
            load();
        }
        container.style.display = "flex";
    };
    document.body.appendChild(priceCalBtn);
})();
