// ==UserScript==
// @name         Embeded Quote
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Embed quote generator iframe in Lnwshop order page.
// @author       You
// @match        https://a.lnwstore.com/arduino4/order/info/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const embededUrlString =
        "https://console.arduino4.com/#/secure/utilities/quote-generator";
    const embededUrl = new URL(embededUrlString);

    const lnwMainElement = document.getElementById("lnwmain");
    let mainDiv;
    if (lnwMainElement) {
        mainDiv = document.createElement("iframe");
        mainDiv.setAttribute("id", "mainDiv");
        mainDiv.setAttribute("src", embededUrl);
        mainDiv.style.height = "1200px";
        mainDiv.style.width = "100%";

        lnwMainElement.append(mainDiv);
    } else {
        console.error("Cannot find lnwmain element.");
    }

    console.log("embededUrl", embededUrl.origin);
    const interval = setInterval(() => {
        mainDiv.contentWindow.postMessage(
            { status: "ready?" },
            embededUrl.origin
        );
    }, 1000);

    window.addEventListener("message", (event) => {
        if (event.origin === embededUrl.origin && event.data) {
            if (event.data.status === "ready") {
                clearInterval(interval);
            }
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
