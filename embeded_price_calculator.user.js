// ==UserScript==
// @name         Embeded Price Calculator
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  Embed quote generator iframe in Lnwshop order page.
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

        function startHandshake() {
            if (handshake) return;
            handshake = setInterval(() => {
                // A bare `vm` throws ReferenceError rather than reading as
                // falsy on any page that does not define it.
                if (typeof vm !== "undefined" && vm?.pdata) {
                    calFrame.contentWindow?.postMessage(
                        { scope: SCOPE, status: "send_data", data: vm.pdata },
                        embededUrl.origin,
                    );
                }
            }, 1000);
        }

        window.addEventListener("message", (event) => {
            if (event.origin === embededUrl.origin && event.data) {
                if (event.data.scope === SCOPE) {
                    if (event.data.status === "received" && handshake) {
                        clearInterval(handshake);
                        handshake = null;
                    }
                    if (
                        event.data.status === "resize" &&
                        typeof event.data.height === "number" &&
                        event.data.height > 0
                    ) {
                        calFrame.style.height = event.data.height + "px";
                    }
                }
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
