// ==UserScript==
// @name         Order Value Summary
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Display total value of orders on top of the order page.
// @author       You
// @match        https://a.lnwstore.com/arduino4/order/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/order_value_summary.user.js
// @updateURL    https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/order_value_summary.user.js
// ==/UserScript==

(function () {
    function numberWithCommas(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    var elements = document.querySelectorAll(
        "div.explorer_container td.amountTD",
    );

    // @match covers every /order/* page, including the single-order views the
    // other scripts target. No amount cells means this is not the order list,
    // so there is no total to report - say nothing rather than claim 0.00.
    if (!elements.length) {
        return;
    }

    var totalOrderValue = 0;
    for (var i = 0; i < elements.length; i++) {
        var valueString = elements[i].textContent.replace(/,/g, "");
        var orderValue = parseFloat(valueString);
        if (!isNaN(orderValue)) {
            totalOrderValue += orderValue;
        }
    }
    console.log("totalOrderValue=" + totalOrderValue.toFixed(2));

    var title = document.querySelector("h1.title");
    if (title) {
        // Append rather than overwrite - the heading text is Lnwshop's, and
        // reusing the span keeps a second run from stacking totals.
        var totalSpan = title.querySelector("[data-order-total]");
        if (!totalSpan) {
            totalSpan = document.createElement("span");
            totalSpan.setAttribute("data-order-total", "");
            title.appendChild(totalSpan);
        }
        totalSpan.textContent =
            " (รวม " + numberWithCommas(totalOrderValue.toFixed(2)) + " บาท)";
    }
})();
