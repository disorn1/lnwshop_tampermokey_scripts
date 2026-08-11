// ==UserScript==
// @name         Embeded Quote
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Embed quote generator iframe in Lnwshop order page.
// @author       You
// @match        https://a.lnwstore.com/arduino4/order/info/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_quote.user.js
// @updateURL    https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_quote.user.js
// ==/UserScript==

(function () {
    "use strict";

    const SCOPE = "quote-generator";
    const embededUrlString =
        "https://console.genlogic.co.th/#/secure/billings/quote-generator";
    const embededUrl = new URL(embededUrlString);

    const lnwMainElement = document.getElementById("lnwmain");
    if (!lnwMainElement) {
        console.error("Cannot find lnwmain element.");
        return;
    }

    const quoteFrame = document.createElement("iframe");
    // Not "mainDiv": embeded_receipt_info_filler.user.js runs on this same
    // page and creates its own iframe, so the id has to be script-specific.
    quoteFrame.setAttribute("id", "quote-frame");
    quoteFrame.setAttribute("src", embededUrl);
    quoteFrame.style.height = "1250px";
    quoteFrame.style.width = "100%";

    lnwMainElement.append(quoteFrame);

    setInterval(() => {
        quoteFrame.contentWindow?.postMessage(
            { scope: SCOPE, status: "ready" },
            embededUrl.origin,
        );
    }, 1000);

    window.addEventListener("message", (event) => {
        if (event.origin !== embededUrl.origin || !event.data) return;
        // The quote generator does not tag its replies yet, so untagged ones
        // have to be accepted - but never another embed's. The receipt
        // filler's iframe is served from this same origin on this same page.
        if (event.data.scope && event.data.scope !== SCOPE) return;
        if (event.data.status === "request") {
            // A bare `vm` throws ReferenceError when Lnwshop stops exposing
            // it, which would take the error reply below down with it.
            const message =
                typeof vm !== "undefined" && vm?.odata
                    ? { scope: SCOPE, status: "data", data: vm.odata }
                    : { scope: SCOPE, status: "error", message: "No data." };
            quoteFrame.contentWindow?.postMessage(message, embededUrl.origin);
        }
    });
})();
