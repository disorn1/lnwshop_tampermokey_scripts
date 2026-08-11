// ==UserScript==
// @name         Embeded Price Calculator
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Embed quote generator iframe in Lnwshop order page.
// @author       You
// @match        https://a.lnwstore.com/*/inventory/product/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        GM_addStyle
// @downloadURL  https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_price_calculator.user.js
// @updateURL    https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_price_calculator.user.js
// ==/UserScript==
const SCOPE = "price-cal-filler";

(function () {
    "use strict";

    GM_addStyle(`
        #floating-calc-container {
            position: fixed;
            top: 20px;
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
            max-height: calc(100vh - 40px);
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
        #calc-buttons { display: flex; gap: 10px; }
        #floating-calc-container.collapsed { min-width: 360px; }
        #floating-calc-container.collapsed #calc-body { display: none; }
        #floating-calc-container.collapsed #calc-header { border-radius: 8px; }
    `);

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
            <iframe id="calFrame" scrolling="no" style="width: 360px; height: 585px;"></iframe>
        </div>
    `;
    let container = null;
    let showCal = false;

    function load() {
        const embededUrlString =
            "https://console.genlogic.co.th/#/embeded/price-cal";
        const embededUrl = new URL(embededUrlString);
        const zoneBody = document.getElementById("zone_body");
        if (zoneBody) {
            container = document.createElement("div");
            container.id = "floating-calc-container";
            container.innerHTML = calcHTML;
            document.body.appendChild(container);

            const calFrame = document.getElementById("calFrame");
            calFrame.src = embededUrl;

            // 6. ระบบลากหน้าต่าง (Drag and Drop)
            const header = document.getElementById("calc-header");
            let isDragging = false,
                currentX,
                currentY,
                initialX,
                initialY,
                xOffset = 0,
                yOffset = 0;
            header.addEventListener("mousedown", dragStart);
            document.addEventListener("mouseup", dragEnd);
            document.addEventListener("mousemove", drag);
            function dragStart(e) {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
                if (e.target === header || e.target.parentNode === header)
                    isDragging = true;
            }
            function dragEnd(e) {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;
            }
            function drag(e) {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                    xOffset = currentX;
                    yOffset = currentY;
                    container.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
                }
            }

            // 7. ปุ่มปิดหน้าต่าง
            document
                .getElementById("calc-close")
                .addEventListener("click", () => {
                    container.style.display = "none";
                    showCal = false;
                });

            // 8. ปุ่มย่อ/ขยายหน้าต่าง
            const collapseBtn = document.getElementById("calc-collapse");
            collapseBtn.addEventListener("click", () => {
                const collapsed = container.classList.toggle("collapsed");
                collapseBtn.textContent = collapsed ? "+" : "−";
            });

            let handshake;

            window.addEventListener("message", (event) => {
                if (event.origin === embededUrl.origin && event.data) {
                    if (event.data.scope === SCOPE) {
                        if (event.data.status === "received" && handshake) {
                            clearInterval(handshake);
                            console.log("cleared handshake");
                        }
                        if (
                            event.data.status === "resize" &&
                            typeof event.data.height === "number"
                        ) {
                            calFrame.style.height = event.data.height + "px";
                        }
                    }
                }
            });

            handshake = setInterval(() => {
                if (vm && vm.pdata) {
                    console.log("sent pdata");
                    calFrame.contentWindow?.postMessage(
                        { scope: SCOPE, status: "send_data", data: vm.pdata },
                        embededUrl.origin,
                    );
                }
            }, 1000);
        } else {
            console.error("Cannot find lnwmain element.");
        }
    }

    const bigbar = document.getElementsByClassName("bigbar");
    const priceCalLink = document.createElement("a");
    priceCalLink.style = "margin-right: 15px;";
    priceCalLink.innerHTML = "เครื่องคิดเลขตั้งราคา";

    priceCalLink.onclick = function () {
        if (!showCal) {
            if (!container) {
                load();
                console.log("loading cal");
            }
            container.style.display = "flex";
            showCal = true;
        }
    };
    bigbar[0].appendChild(priceCalLink);
})();
