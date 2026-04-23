// ==UserScript==
// @name         Order Value Summary
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Display total value of orders on top of the order page.
// @author       You
// @match        https://a.lnwstore.com/arduino4/order/*
// @grant        none
// ==/UserScript==

(function () {
    function numberWithCommas(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    var elements = document.querySelectorAll(
        "div.explorer_container td.amountTD",
    );

    var totalOrderValue = 0;
    for (var i = 0; i < elements.length; i++) {
        var valueString = elements[i].textContent.replace(/,/g, "");
        var orderValue = parseFloat(valueString);
        if (!isNaN(orderValue)) {
            totalOrderValue += orderValue;
        }
        console.log(parseFloat(valueString));
    }
    totalOrderValue = totalOrderValue.toFixed(2);
    console.log("totalOrderValue=" + totalOrderValue);

    var title = document.querySelector("h1.title");
    if (title) {
        title.textContent =
            "รายการสั่งซื้อสินค้า (รวม " +
            numberWithCommas(totalOrderValue) +
            " บาท)";
    }
})();
