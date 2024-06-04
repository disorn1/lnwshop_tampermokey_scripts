// ==UserScript==
// @name         Embeded receipt info filler
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Embed receipt info filler in Lnwshop order page.
// @author       You
// @match        https://a.lnwstore.com/arduino4/order/info/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// ==/UserScript==

const SCOPE = "receipt-info-filler";

(function () {
    "use strict";
    const embededUrlString =
        "https://console.genlogic.co.th/#/embeded/ctp-finder";
    const embededUrl = new URL(embededUrlString);
    const mainDiv = document.createElement("iframe");
    mainDiv.setAttribute("id", "mainDiv");
    mainDiv.setAttribute("src", embededUrlString);
    mainDiv.style.height = "250px";
    mainDiv.style.width = "100%";

    let editElement;
    const findEditElementInterval = setInterval(() => {
        const _editElement = document
            .evaluate(
                "//div[@id='lnw-contact-popup']/div[@class='step-edit']/div[@class='modal-body']",
                document
            )
            .iterateNext();
        if (_editElement && editElement !== _editElement) {
            editElement = _editElement;
            editElement.prepend(mainDiv);
        }
        if (mainDiv.parentElement?.className === "modal-body") {
            mainDiv.style.display = "";
        } else {
            mainDiv.style.display = "none";
        }
    }, 1000);
    window.addEventListener("message", (event) => {
        if (event.origin === embededUrl.origin && event.data) {
            if (event.data.scope === SCOPE) {
                if (event.data.action === "ctp-selected" && event.data.param) {
                    fillInput(event.data.param);
                }
            }
        }
    });

    const handshake = setInterval(() => {
        mainDiv.contentWindow?.postMessage(
            { scope: SCOPE, status: 200, data: "ready" },
            embededUrl.origin
        );
    }, 1000);
})();

const fillInput = (ctp) => {
    let contactBoxElement = document
        .evaluate(
            "//div[@id='lnw-contact-popup']/div[@class='step-edit']/div[@class='modal-body']//div[@class='contact-box']",
            document
        )
        .iterateNext();

    if (contactBoxElement) {
        let taxIdInputElement = document
            .evaluate(
                "//div[@class='col-tax_id']//input[@class='input_field']",
                contactBoxElement
            )
            .iterateNext();
        if (taxIdInputElement) {
            taxIdInputElement.value = ctp.taxId;
            taxIdInputElement.dispatchEvent(
                new Event("input", { bubbles: true })
            );
        }

        let branchIdInputElement = document
            .evaluate(
                "//div[@class='col-branch_id']//input[@class='input_field']",
                contactBoxElement
            )
            .iterateNext();
        if (branchIdInputElement) {
            branchIdInputElement.value = ctp.branchId;
            branchIdInputElement.dispatchEvent(
                new Event("input", { bubbles: true })
            );
        }

        let companyNameInputElement = document
            .evaluate(
                "//div[@class='row row-name']//input[@class='input_field']",
                contactBoxElement
            )
            .iterateNext();

        if (companyNameInputElement) {
            companyNameInputElement.value = ctp.companyName;
            companyNameInputElement.dispatchEvent(
                new Event("input", { bubbles: true })
            );
        }

        let HouseNoInputElement = document
            .evaluate(
                "//div[@class='row row-address']//input[@class='input_field']",
                contactBoxElement
            )
            .iterateNext();
        if (HouseNoInputElement) {
            HouseNoInputElement.value = ctp.addrSegment.houseNo;
            HouseNoInputElement.dispatchEvent(
                new Event("input", { bubbles: true })
            );
        }

        let addrInputElement = document
            .evaluate(
                "//div[@class='row row-address']//textarea[@class='input_field']",
                contactBoxElement
            )
            .iterateNext();
        if (addrInputElement) {
            addrInputElement.value = ctp.addrSegment.addrLine;
            addrInputElement.dispatchEvent(
                new Event("input", { bubbles: true })
            );
        }

        let postcodeInputElement = document
            .evaluate(
                "//div[@class='col col-zipcode']//input",
                contactBoxElement
            )
            .iterateNext();
        if (postcodeInputElement) {
            postcodeInputElement.value = ctp.addrSegment.postcode;
            postcodeInputElement.dispatchEvent(
                new Event("input", { bubbles: true })
            );

            setTimeout(() => {
                let trCount = document.evaluate(
                    "count(//table[@class='subdistrict_choices']/tbody/tr)",
                    document
                ).numberValue;
                for (let rowNum = 1; rowNum <= trCount; rowNum++) {
                    let province = document.evaluate(
                        `//table[@class='subdistrict_choices']/tbody/tr[${rowNum}]/td[1]/text()`,
                        document,
                        null,
                        XPathResult.STRING_TYPE
                    ).stringValue;
                    let district = document.evaluate(
                        `//table[@class='subdistrict_choices']/tbody/tr[${rowNum}]/td[2]/text()`,
                        document,
                        null,
                        XPathResult.STRING_TYPE
                    ).stringValue;
                    let subDistrict = document.evaluate(
                        `//table[@class='subdistrict_choices']/tbody/tr[${rowNum}]/td[3]/text()`,
                        document,
                        null,
                        XPathResult.STRING_TYPE
                    ).stringValue;
                    if (
                        province.trim() === ctp.addrSegment.province.trim() &&
                        district.trim() === ctp.addrSegment.district.trim() &&
                        subDistrict.trim() ===
                            ctp.addrSegment.subDistrict.trim()
                    ) {
                        document
                            .evaluate(
                                `//table[@class='subdistrict_choices']/tbody/tr[${rowNum}]`,
                                document
                            )
                            .iterateNext()
                            .click();
                    }
                }
            }, 100);
        }
    }
};
