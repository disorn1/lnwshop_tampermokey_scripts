// ==UserScript==
// @name         Embeded Price Calculator
// @namespace    http://tampermonkey.net/
// @version      1.5.0
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
    //   - กล่องราคาของแท็บช่องทางคือ .tab-channel-area:visible .price-box-area (Vue วาดทีละแท็บ —
    //     กล่องของแท็บอื่นไม่อยู่ใน DOM จึงต้องเปิดแท็บก่อนอ่าน/เขียน)
    //     สวิตช์ "ใช้ราคาขายเหมือน <ต้นทาง>" (sync) ↔ "กำหนดราคาขายแยกต่างหาก" (แยก)
    //     โหมดแยกมี select โหมด ("" = กำหนดเป็น) / input จำนวน / select หน่วย ("" = บาท)
    //     ราคาสุทธิที่ Vue คำนวณสดอยู่ที่ .finaltotal .total — ใช้ยืนยันก่อนรายงานว่าสำเร็จ
    //   - กล่องบอกช่องของตัวเองด้วยลิงก์ .../channel/<boxKey>#setting-price (แท็บหลักไม่มีลิงก์)
    //     boxKey = เลข instance เมื่อแพลตฟอร์มมีหลายร้าน (Shopee/Lazada) · ช่องที่มีร้านเดียวใช้ชื่อช่อง
    //     (tiktok_shop, line_shopping)
    //   - แท็บร้านที่ "ใช้ราคาขายเหมือน X หลัก" (General4 ตาม Shopee หลัก, Lazada genlogic ตาม
    //     Lazada หลัก) ต้องเขียนที่แท็บหลัก ไม่งั้นร้านหลุดจากกฎ — และถ้ามีแท็บร้านอื่นตามแท็บหลัก
    //     เดียวกันอยู่ ราคาร้านนั้นจะขยับตาม จึงไม่เขียนแล้วบอกให้ตั้งแท็บนั้นก่อน
    //   - ไม่กดบันทึก: คนตรวจฟอร์มแล้วกดเอง
    //
    // 1.5.0 (GLP-269) — เร็วขึ้นและตรวจละเอียดขึ้น (pid 91, 7 รายการ: 17.1 → 2.5 วินาที):
    //   - ไล่เปิดทุกแท็บรอบเดียวแล้วจดแผนที่ (ช่อง, boxKey, ตามใครอยู่) — 1.4.x ไล่คลิกหาใหม่ทุกช่อง
    //     และหา TikTok/LINE ด้วยเลข instance ก่อนซึ่งไม่มีวันเจอ จึงไล่ครบทุกแท็บเปล่า ๆ สองรอบ
    //   - ไม่คลิกแท็บที่เปิดอยู่แล้ว (class selected) — 1.4.x คลิกซ้ำแล้วรอให้ area เปลี่ยนซึ่งไม่มีวัน
    //     เปลี่ยน เสียรอบละ 1.5 วินาที
    //   - รอเงื่อนไขจริงแทนเวลาตายตัว (250ms หลังทุกคลิก/ทุก select): รอจนกล่องนิ่ง แล้วค่อยอ่าน/เขียน
    //   - หาช่องกรอกใหม่จาก DOM ทุกครั้ง — Vue วาดกล่องใหม่ได้หลังเปลี่ยนโหมด ช่องที่จับไว้ก่อนอาจหลุดไปแล้ว
    //   - ตรวจท้าย: อ่านราคาจริงทุกรายการอีกรอบหลังกรอกครบ — การเขียนแท็บหลักทีหลังขยับแท็บที่
    //     ตามมันได้ ตรวจตอนกรอกอย่างเดียวไม่พอ
    // ------------------------------------------------------------------
    const USE_SAME = "ใช้ราคาขายเหมือน";
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const visible = (el) => !!el && el.offsetParent !== null;
    const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.005;
    const short = (title) => title.replace(/^ข้อมูลสินค้า\s*/, "");

    /** ถามทุก 20ms จนได้ค่า truthy — คืนค่านั้น หรือ null เมื่อหมดเวลา */
    async function waitFor(fn, timeoutMs = 2000, stepMs = 20) {
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

    /** สถานะกล่องราคาของแท็บที่มองเห็น — null ถ้าไม่มีกล่อง · อ่านจาก DOM ใหม่ทุกครั้ง */
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

    /** ลายเซ็นของสิ่งที่เห็นในแท็บ (รวมโหมดและราคา) — ไว้รอจนเปลี่ยน และรอจนนิ่ง */
    function boxSignature() {
        const area = visibleArea();
        if (!area) return "none";
        const b = readBox();
        return [area.getAttribute("class"), b?.boxKey, b?.switchLabel, b?.separate, b?.mode, b?.unit, b?.amount, b?.net].join("|");
    }

    /** รอจนกล่องที่เห็นนิ่ง (ลายเซ็นเดิม 3 รอบติด ~60ms) แล้วคืนสถานะกล่อง */
    async function settle(timeoutMs = 2000) {
        const until = Date.now() + timeoutMs;
        let last = boxSignature();
        let same = 0;
        while (same < 3 && Date.now() < until) {
            await sleep(20);
            const s = boxSignature();
            if (s === last) same++;
            else {
                same = 0;
                last = s;
            }
        }
        return readBox();
    }

    /**
     * เปิดแท็บตามชื่อ แล้วรอจนกล่องของแท็บนั้นนิ่ง · แท็บที่เปิดอยู่แล้ว (class selected) ไม่คลิกซ้ำ
     * readBox() ทันทีหลังคลิกยังเห็นกล่องของแท็บเดิม (Vue สลับไม่ทัน) ซึ่งทำให้เขียนผิดแท็บได้ — จึงรอจน
     * selected ย้าย, area เป็นของช่องของแท็บนี้ (class product-field-channel-<ช่อง> ของปุ่มแท็บ) และสิ่งที่
     * เห็นเปลี่ยนจากเดิม รอได้ถึง 1.5 วินาทีเท่า 1.4.x (ปกติ 13–64ms) แล้วค่อยรอนิ่ง · แท็บไม่มีกล่องสองแท็บ
     * ติดกันของช่องเดียวกันหน้าตาเหมือนกันทุกอย่าง จะรอจนหมดเวลาแล้วไปต่อ
     */
    async function showTab(title) {
        const el = channelTabs().find((t) => t.title === title)?.el;
        if (!el) return null;
        if (!el.classList.contains("selected")) {
            const before = boxSignature();
            const want = (/product-field-channel-([a-z_]+)/.exec(el.className) || [])[1] || null;
            el.click();
            await waitFor(() => {
                const areaChannel = (/area-channel-([a-z_]+)/.exec(visibleArea()?.getAttribute("class") || "") || [])[1] || null;
                return el.classList.contains("selected") && (!want || areaChannel === want) && boxSignature() !== before ? true : null;
            }, 1500);
        }
        return settle();
    }

    /** ต้นทางที่กล่องนี้ "ใช้ราคาขายเหมือน" อยู่ ("LnwShop", "Shopee หลัก", …) — null = ราคาแยก */
    function sourceOf(b) {
        const label = b?.switchLabel || "";
        if (!b || b.separate || !label.startsWith(USE_SAME)) return null;
        return label.slice(USE_SAME.length).trim();
    }

    /** ชื่อแท็บหลักที่กล่องนี้ตามอยู่ — null ถ้าแยกเอง หรือตามราคาหลัก LnwShop */
    function followedMainTitle(b) {
        const source = sourceOf(b);
        if (!source || !source.endsWith("หลัก")) return null;
        return channelTabs().find((t) => t.title === source || t.title.endsWith(source))?.title || null;
    }

    /**
     * ไล่เปิดทุกแท็บรอบเดียว จดว่าแต่ละแท็บเป็นกล่องของช่อง/ร้านไหน ตามแท็บหลักไหนอยู่ และราคาสุทธิ
     * รายการนี้ถูกปรับตามที่เขียนในรอบนี้ (ตั้งแยก = เลิกตาม) — ใช้ตรวจแท็บที่ตามแท็บหลักเดียวกันโดยไม่ต้องคลิกซ้ำ
     */
    async function mapTabs() {
        const tabs = [];
        for (const { title } of channelTabs()) {
            const b = await showTab(title);
            tabs.push({
                title,
                isMain: /หลัก$/.test(title),
                channel: b?.areaChannel || null,
                boxKey: b?.boxKey || null,
                hasBox: !!b,
                followsMain: b ? followedMainTitle(b) : null,
                net: b?.net ?? null,
                unreadable: false,
            });
        }
        // กล่องเดียวกัน (ช่อง + boxKey) โผล่ในสองแท็บ = แท็บหนึ่งถูกอ่านตอน Vue ยังไม่สลับ — ไม่รู้ว่าแท็บไหน
        // ตามใครอยู่จริง จึงไม่ใช้ทั้งคู่ (งานที่ต้องพึ่งมันจะปฏิเสธพร้อมบอก) เหมือน 1.4.x ที่บอก "อ่านกล่องไม่ได้"
        for (const t of tabs) {
            if (t.boxKey && tabs.some((o) => o !== t && o.channel === t.channel && o.boxKey === t.boxKey)) t.unreadable = true;
        }
        return tabs;
    }

    function fire(el, type) {
        el.dispatchEvent(new Event(type, { bubbles: true }));
    }

    async function setSeparate(wantSeparate) {
        const b = readBox();
        if (!b) return false;
        if (b.separate === wantSeparate) return true;
        if (!b.switchEl) return false;
        b.switchEl.click();
        const s = await waitFor(() => {
            const x = readBox();
            return x && x.separate === wantSeparate ? x : null;
        });
        if (!s) return false;
        await settle();
        return true;
    }

    /** select โหมด (มีตัวเลือก "upper") หรือ select หน่วย ของกล่องที่เห็น — หาใหม่ทุกครั้ง */
    function findSelect(isMode) {
        const real = readBox()?.box.querySelector(".real-price");
        if (!real) return null;
        return (
            Array.from(real.querySelectorAll("select")).find(
                (sel) => Array.from(sel.options).some((o) => o.value === "upper") === isMode,
            ) || null
        );
    }

    /** ตั้ง "กำหนดเป็น <price> บาท" ให้กล่องที่มองเห็น — รอ .finaltotal ให้ตรงก่อนถือว่าสำเร็จ */
    async function setBoxPrice(price) {
        if (!(await setSeparate(true))) return "เข้าโหมดราคาแยกไม่ได้";
        // select โหมดก่อน (กำหนดเป็น) แล้วค่อยหน่วย — โหมด "กำหนดเป็น" ล็อกหน่วยเป็นบาทเอง
        for (const isMode of [true, false]) {
            const sel = findSelect(isMode);
            if (!sel || sel.value === "") continue;
            const what = isMode ? "โหมด" : "หน่วย";
            if (sel.disabled) return `select ${what} ถูกล็อกเป็น "${sel.value}"`;
            if (!Array.from(sel.options).some((o) => o.value === "")) return "ไม่มีตัวเลือก กำหนดเป็น/บาท";
            sel.value = "";
            fire(sel, "input");
            fire(sel, "change");
            // ตรวจหลังกล่องนิ่ง ไม่ใช่ทันที: ค่าที่เพิ่งตั้งเองอ่านได้ "" เสมอ — ถ้า Vue ไม่รับ มันจะวาดกลับเป็นค่าเดิม
            await settle();
            if (findSelect(isMode)?.value !== "") return `เปลี่ยน select ${what} เป็น "กำหนดเป็น/บาท" ไม่ได้`;
        }
        // ช่องจำนวนหาใหม่หลังเปลี่ยนโหมด และเขียนซ้ำได้หนึ่งครั้งถ้า Vue วาดช่องใหม่ทับไปก่อนราคาขึ้น
        for (let attempt = 0; attempt < 2; attempt++) {
            const input = readBox()?.box.querySelector('.real-price input[type="number"]');
            if (!visible(input)) return "ไม่เห็นช่องกรอกราคา";
            input.value = String(price);
            fire(input, "input");
            fire(input, "change");
            const ok = await waitFor(() => {
                const s = readBox();
                return s && near(s.net, price) ? s : null;
            }, 1500);
            if (ok) return null;
        }
        return `ราคาสุทธิบนฟอร์มเป็น ${readBox()?.net} ไม่ใช่ ${price}`;
    }

    /** กล่องราคาหลัก LnwShop (.price-editable-area นอกแท็บช่องทาง) — null ถ้าไม่มี (ราคาตามสินค้าแม่) */
    function baseBox() {
        const input = Array.from(
            document.querySelectorAll('.price-editable-area.price-box-area .real-price input[type="number"]'),
        ).find((i) => visible(i) && !i.closest(".tab-channel-area"));
        if (!input) return null;
        const box = input.closest(".price-box-area");
        const n = parseFloat((box.querySelector(".finaltotal .total")?.textContent || "").replace(/,/g, ""));
        return { input, box, net: Number.isFinite(n) ? n : null };
    }

    /**
     * ราคาหลัก LnwShop
     *
     * ราคาหลักที่หน้า console เทียบและวางแผนคือราคาสุทธิ (pdata.props.price = .finaltotal ของกล่อง)
     * สินค้าที่เปิด "ลดราคาสินค้า" อยู่ ช่องที่กรอกได้คือ "ราคาขาย" ก่อนลด (price_old) ไม่ใช่ราคาสุทธิ
     * — pid 3: ราคาขาย 480 ลดเหลือ 220 · เขียนลงช่องนั้นราคาสุทธิไม่ขยับ จึงไม่แตะ ให้คนแก้เอง
     * และยืนยันผลจากราคาสุทธิ ไม่ใช่จากค่าในช่อง
     */
    async function setBasePrice(price) {
        const bb = baseBox();
        if (!bb) return "ไม่มีช่องราคาหลักให้แก้ (ราคาตามสินค้าแม่?)";
        const { input, box } = bb;
        if (input.disabled || input.readOnly) return "ช่องราคาหลักถูกล็อก";
        const saleOn =
            Array.from(box.querySelectorAll("span.switch")).some(
                (s) => (s.querySelector(".slabel")?.textContent || "").includes("ลดราคา") && s.classList.contains("switchOn"),
            ) ||
            (typeof vm !== "undefined" && Number(vm?.pdata?.props?.sale) === 1);
        if (saleOn) {
            return `เปิด "ลดราคาสินค้า" อยู่ (ราคาขาย ${input.value} → สุทธิ ${bb.net}) — ช่องที่กรอกได้เป็นราคาก่อนลด ไม่ได้แตะ แก้ราคาหลักเองบนฟอร์ม`;
        }
        input.value = String(price);
        fire(input, "input");
        fire(input, "change");
        const ok = await waitFor(() => (near(baseBox()?.net, price) ? true : null), 2000);
        return ok ? null : `ราคาสุทธิบนฟอร์มเป็น ${baseBox()?.net} ไม่ใช่ ${price}`;
    }

    /** แท็บของช่องตามคำขอ — ร้านใน Shopee/Lazada ตรงด้วยเลข instance, ช่องร้านเดียวตรงด้วยชื่อช่อง */
    function findTab(tabs, ch) {
        return (
            tabs.find(
                (t) =>
                    !t.isMain &&
                    t.hasBox &&
                    !t.unreadable &&
                    t.channel === ch.channel &&
                    (t.boxKey === ch.instance || t.boxKey === ch.channel),
            ) || null
        );
    }

    /** แท็บร้านของช่องนี้ที่อ่านไม่ได้ตอนไล่แท็บ (ดู mapTabs) */
    const unreadableOf = (tabs, channel) => tabs.filter((t) => t.unreadable && t.channel === channel).map((t) => short(t.title));

    /** กรอก 1 รายการ — คืน {ok, message} · job.via = ชื่อแท็บหลักที่เขียนแทน (ไว้ให้ตรวจท้ายรู้ว่าต้องเห็นอะไร) */
    async function applyJob(job, tabs) {
        const { ch, tab } = job;
        if (!tab) {
            const bad = unreadableOf(tabs, ch.channel);
            return {
                ok: false,
                message: bad.length
                    ? `อ่านแท็บ ${bad.join(", ")} ไม่ได้ (กล่องซ้ำกับแท็บอื่น) — กดตั้งราคาใหม่อีกครั้ง`
                    : "ไม่พบแท็บ/กล่องราคาของช่องนี้ (ยังไม่ตั้งหมวดหมู่?)",
            };
        }
        const own = await showTab(tab.title);
        if (!own || own.areaChannel !== ch.channel || own.boxKey !== tab.boxKey) {
            return { ok: false, message: `เปิด "${short(tab.title)}" แล้วกล่องที่เห็นไม่ใช่ของช่องนี้` };
        }

        if (ch.kind === "sync") {
            // ตามราคาหลัก LnwShop: กลับโหมด sync — ต้นทางต้องเป็น LnwShop ไม่ใช่แท็บหลัก
            const switched = await setSeparate(false);
            const s0 = readBox();
            // จดโหมดจริงก่อนตัดสิน — แม้จะปฏิเสธ แท็บนี้ก็สลับไปตามแท็บหลักแล้ว งานที่เขียนแท็บหลักนั้นทีหลัง
            // ต้องรู้ว่ามันตามอยู่ ไม่งั้นราคามันขยับตามโดยไม่มีใครเตือน
            tab.followsMain = followedMainTitle(s0);
            if (!switched) return { ok: false, message: "สลับเป็นโหมดใช้ราคาเหมือน... ไม่ได้" };
            if (tab.followsMain) return { ok: false, message: `แท็บนี้ตาม "${s0.switchLabel}" ไม่ใช่ราคาหลัก LnwShop` };
            // ต้องโชว์ราคาหลักตามแผน — ไม่ตรง = ราคาหลักไม่ได้เป็นค่าใหม่ (เช่นสินค้าลดราคาที่ไม่ได้แตะราคาหลัก)
            const s = await waitFor(() => {
                const b = readBox();
                return b && near(b.net, ch.price) ? b : null;
            }, 2000);
            if (!s) {
                return { ok: false, message: `${s0.switchLabel} แล้ว แต่โชว์ ${readBox()?.net} ไม่ใช่ ${ch.price} — ราคาหลักบนฟอร์มยังไม่ใช่ราคาใหม่` };
            }
            return { ok: true, message: `${s.switchLabel} → ${s.net}` };
        }

        // ทางเขียนตัดสินจากกล่องที่เพิ่งเปิด ไม่ใช่จากแผนที่ — แผนที่ผิดแล้วเขียนที่แท็บร้านตรง ๆ จะพาร้าน
        // หลุดจากแท็บหลักเงียบ ๆ (ตรวจท้ายก็ผ่าน เพราะเห็นราคาแยกตรงตามที่สั่ง)
        const mainTitle = followedMainTitle(own);
        tab.followsMain = mainTitle;
        if (!mainTitle) {
            const err = await setBoxPrice(ch.price);
            tab.followsMain = followedMainTitle(readBox()); // โหมดจริงหลังเขียน ผ่านหรือไม่ก็ตาม
            if (err) return { ok: false, message: err };
            return { ok: true, message: `กำหนดเป็น ${ch.price} บาท` };
        }

        // ตามแท็บหลักอยู่ → เขียนที่แท็บหลัก แต่ก่อนนั้นดูว่ามีแท็บร้านอื่นตามแท็บหลักเดียวกันไหม
        // (จากแผนที่ที่ปรับตามรอบนี้แล้ว: แท็บที่เพิ่งถูกตั้งเป็นราคาแยกไม่นับ — จึงกรอกแท็บแยกก่อนแท็บหลัก)
        // แท็บร้านของช่องเดียวกันที่อ่านไม่ได้ อาจตามแท็บหลักนี้อยู่ — ตรวจไม่ได้ก็ไม่เขียน
        const bad = unreadableOf(tabs, ch.channel);
        if (bad.length) {
            return { ok: false, message: `อ่านแท็บ ${bad.join(", ")} ไม่ได้ — ตรวจไม่ได้ว่าตาม "${short(mainTitle)}" ไหม จึงไม่เขียน` };
        }
        const followers = tabs.filter((t) => t !== tab && !t.isMain && t.followsMain === mainTitle).map((t) => short(t.title));
        if (followers.length) {
            return {
                ok: false,
                message: `ตาม "${short(mainTitle)}" อยู่ แต่ ${followers.join(", ")} ก็ตามแท็บเดียวกัน — ตั้งราคาแท็บนั้นก่อน ไม่งั้นขยับตาม`,
            };
        }
        const mb = await showTab(mainTitle);
        if (!mb || mb.areaChannel !== ch.channel || mb.boxKey) return { ok: false, message: `เปิด "${short(mainTitle)}" ไม่ได้` };
        const err = await setBoxPrice(ch.price);
        if (err) return { ok: false, message: `ที่ ${short(mainTitle)}: ${err}` };
        // กลับมาดูแท็บร้าน: ต้องยังตามแท็บหลักและโชว์ราคาใหม่
        const back = await showTab(tab.title);
        if (!back || back.boxKey !== tab.boxKey || followedMainTitle(back) !== mainTitle || !near(back.net, ch.price)) {
            return { ok: false, message: `ตั้ง ${short(mainTitle)} แล้ว แต่แท็บร้านโชว์ ${back?.net} (${back?.switchLabel})` };
        }
        job.via = mainTitle;
        return { ok: true, message: `กำหนดเป็น ${ch.price} บาท ที่ "${short(mainTitle)}" (แท็บร้านตามอยู่)` };
    }

    /**
     * ตรวจท้าย: อ่านฟอร์มจริงทุกรายการที่ผ่านอีกรอบหลังกรอกครบ — การเขียนแท็บหลักหรือราคาหลักทีหลัง
     * ขยับแท็บที่ตามมันได้ · ไม่ตรง (ราคา หรือโหมด) → ✗ พร้อมสิ่งที่เห็นจริง
     */
    async function verifyAll(req, jobs, results) {
        const baseResult = results.find((r) => r.target === "base");
        if (baseResult?.ok) {
            const net = baseBox()?.net ?? null;
            if (near(net, req.base)) baseResult.message += " · ตรวจท้ายตรง";
            else Object.assign(baseResult, { ok: false, message: `ตรวจท้ายเห็น ${net} ไม่ใช่ ${req.base}` });
        }
        for (const job of jobs) {
            const r = job.result;
            if (!r?.ok) continue;
            const shown = await showTab(job.tab.title);
            // กล่องที่เห็นต้องเป็นของแท็บนี้จริง — ช่องที่ราคาเท่ากัน (× 1.02 สองร้าน) อ่านกล่องแท็บก่อนหน้าแล้วผ่านได้
            const b = shown && shown.areaChannel === job.ch.channel && shown.boxKey === job.tab.boxKey ? shown : null;
            const mode =
                job.ch.kind === "sync"
                    ? !!b && !b.separate && !followedMainTitle(b)
                    : job.via
                      ? followedMainTitle(b) === job.via
                      : !!b && b.separate;
            if (b && mode && near(b.net, job.ch.price)) {
                r.message += " · ตรวจท้ายตรง";
            } else {
                r.ok = false;
                r.message = b
                    ? `ตรวจท้ายเห็น ${b.net} (${b.switchLabel}) ไม่ใช่ ${job.ch.price} — ตอนกรอก: ${r.message}`
                    : `ตรวจท้ายเปิดกล่องของ "${short(job.tab.title)}" ไม่ได้ — ตอนกรอก: ${r.message}`;
            }
        }
    }

    async function applyPrices(req) {
        const started = Date.now();
        const results = [];
        const startTab = channelTabs().find((t) => t.el.classList.contains("selected"))?.title || null;
        // ราคาหลักก่อน: ช่องที่ตามราคาหลัก (LINE, แท็บหลักที่ sync) ต้องเห็นค่าใหม่ตอนกรอก/ตรวจ
        if (req.base !== null && req.base !== undefined) {
            const err = await setBasePrice(req.base);
            results.push({ target: "base", label: "ราคาหลัก LnwShop", ok: !err, message: err || `ตั้งเป็น ${req.base} บาท` });
        }
        // ส่วนที่เหลือพังได้ (DOM หายกลางทาง) — อย่าให้ผลของราคาหลักที่กรอกไปแล้วหาย และกลับแท็บเดิมเสมอ
        try {
            const tabs = await mapTabs();
            const jobs = (req.channels || []).map((ch) => ({ ch, tab: findTab(tabs, ch), via: null, result: null }));
            // แท็บที่เขียนที่ตัวเองก่อน แล้วค่อยแท็บที่ต้องเขียนผ่านแท็บหลัก (ดูเหตุผลใน applyJob) — ดูจากฟอร์มจริง
            // ไม่ใช่เลข instance ตายตัว (1.4.x ล็อก 1005/1003 ไว้)
            const viaMain = (j) => Number(!!(j.tab && j.ch.kind === "set" && j.tab.followsMain));
            jobs.sort((a, b) => viaMain(a) - viaMain(b));
            for (const job of jobs) {
                let r;
                try {
                    r = await applyJob(job, tabs);
                } catch (e) {
                    r = { ok: false, message: `พัง: ${e?.message || e}` };
                }
                job.result = { target: job.ch.instance, label: job.ch.label, ...r };
                results.push(job.result);
            }
            await verifyAll(req, jobs, results);
        } catch (e) {
            results.push({
                target: "error",
                label: "ตั้งราคา",
                ok: false,
                message: `พังกลางทาง: ${e?.message || e} — รายการข้างบนกรอกลงฟอร์มไปแล้ว ตรวจฟอร์มก่อนกดบันทึก`,
            });
        } finally {
            if (startTab) await showTab(startTab).catch(() => null);
        }
        console.info(`[price-setter] ${results.filter((r) => r.ok).length}/${results.length} ok in ${Date.now() - started} ms`);
        return results;
    }

    // ไว้เรียกจาก DevTools / ทดสอบนอก Tampermonkey: window.__lnwPriceSetter.applyPrices({ base, channels })
    window.__lnwPriceSetter = { applyPrices, mapTabs, readBox, channelTabs };

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
