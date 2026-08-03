// ==UserScript==
// @name         Embeded Quote
// @namespace    http://tampermonkey.net/
// @version      1.0.0
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

    const embededUrlString =
        "https://console.genlogic.co.th/#/secure/billings/quote-generator";
    const embededUrl = new URL(embededUrlString);

    const lnwMainElement = document.getElementById("lnwmain");
    let mainDiv;
    if (lnwMainElement) {
        mainDiv = document.createElement("iframe");
        mainDiv.setAttribute("id", "mainDiv");
        mainDiv.setAttribute("src", embededUrl);
        mainDiv.style.height = "1250px";
        mainDiv.style.width = "100%";

        lnwMainElement.append(mainDiv);
    } else {
        console.error("Cannot find lnwmain element.");
    }

    console.log("embededUrl", embededUrl.origin);
    setInterval(() => {
        mainDiv.contentWindow.postMessage(
            { status: "ready" },
            embededUrl.origin,
        );
    }, 1000);

    window.addEventListener("message", (event) => {
        if (event.origin === embededUrl.origin && event.data) {
            if (event.data.status === "request") {
                let message;
                if (vm && vm.odata) {
                    message = {
                        status: "data",
                        data: vm.odata,
                    };
                } else {
                    message = {
                        status: "error",
                        message: "No data.",
                    };
                }
                mainDiv.contentWindow.postMessage(message, embededUrl.origin);
            }
        }
    });
})();
