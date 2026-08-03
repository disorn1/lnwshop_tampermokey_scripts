# lnwshop_tampermokey_scripts

Tampermonkey userscripts that extend the LnwShop admin panel at
`a.lnwstore.com/arduino4`. Most of them work by embedding a page from the
[management console](https://console.genlogic.co.th) in an iframe and passing
data across with `postMessage`, so the console owns the logic and the userscript
only bridges it into LnwShop's DOM.

## Scripts

| Script | Runs on | What it does |
| --- | --- | --- |
| [`embeded_receipt_info_filler.user.js`](embeded_receipt_info_filler.user.js) | `/arduino4/order/info/*` | Embeds the counterparty finder in the tax-invoice contact popup. Pick a company and it fills tax ID, branch, name and address, then selects the matching postcode/subdistrict row. |
| [`embeded_quote.user.js`](embeded_quote.user.js) | `/arduino4/order/info/*` | Embeds the quote generator below the order and hands it the order data from LnwShop's page state on request. |
| [`embeded_price_calculator.user.js`](embeded_price_calculator.user.js) | `/*/inventory/product/*` | Floating, draggable pricing calculator panel on the product page. |
| [`order_value_summary.user.js`](order_value_summary.user.js) | `/arduino4/order/*` | Sums the amount column on the order list and appends the total to the page heading. |
| [`bill.user.js`](bill.user.js) | `/arduino4/order/info/*` | Bill / receipt generation with XLSX export. |

## Install

Open each raw URL in a browser with Tampermonkey installed — it intercepts any
URL ending in `.user.js` and shows its install screen.

```
https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_receipt_info_filler.user.js
https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_quote.user.js
https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/embeded_price_calculator.user.js
https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/order_value_summary.user.js
https://raw.githubusercontent.com/disorn1/lnwshop_tampermokey_scripts/master/bill.user.js
```

Installing over an existing copy updates it rather than duplicating, because
Tampermonkey identifies a script by `@name` + `@namespace`.

**The embedded pages are behind the console's auth guard.** Be signed in to
`console.genlogic.co.th` in the same browser, or the iframes just render the
login page.

## Updating

Every script carries `@downloadURL` and `@updateURL` pointing at its own raw
URL, so an installed copy updates itself from `master`.

> **Bump `@version` in the same commit as any code change.**
> Tampermonkey applies an update only when the remote `@version` is *strictly
> higher* than the installed one. Push a fix without bumping it and nothing
> happens — no error, no update, no hint. That is indistinguishable from a
> broken URL and is the easiest way to waste an afternoon on this repo.

All scripts share a `1.0.0` baseline, so "did I bump it?" is answerable at a
glance across the repo.

Timing: Tampermonkey checks for updates once a day by default (adjustable in the
dashboard, which also has a manual *Check for userscript updates*), and
`raw.githubusercontent.com` sends `Cache-Control: max-age=300` — so a push can
take a few minutes to become visible even to a forced check.

## How the embeds talk to the console

The iframe and the host page are different origins, so they use `postMessage`
with an explicit target origin. The host drives a handshake on an interval,
because there is no reliable cross-origin "iframe is ready" event:

```
host   --> iframe   { scope, status: 200, data: "ready" }    every 1s
iframe --> host     { scope, action: "...", param: {...} }   when the user picks something
```

Both ends check `event.origin` before trusting a message, and the handshake
keeps running so the link re-establishes if the iframe reloads.

Console-side counterparts live in the `management-console` repo:

| Userscript | Console route | Component |
| --- | --- | --- |
| receipt info filler | `#/embeded/ctp-finder` | `pages/embeded/pages/receipt-info-filler` |
| price calculator | `#/embeded/price-cal` | `pages/embeded/pages/price-cal-filler` |
| quote | `#/secure/billings/quote-generator` | `pages/quote-generator` |

A `postMessage` payload shape is a contract across two repos with no shared
type — change one side and you must change the other.

## Notes

- `bill.user.js` is a **minified webpack bundle**. Its source is not in this
  repo, so it can only be replaced wholesale, not edited here.
- `embeded_quote.user.js` reads LnwShop's page-global `vm.odata` to get the
  order. That is LnwShop's internal state, not a public API, and can break
  without warning.
- Selectors and match patterns are pinned to LnwShop's current markup and to the
  `arduino4` store slug. LnwShop redesigns without notice — when a script stops
  working, suspect the DOM before the logic.
- Formatting follows `.editorconfig` (4-space indent).
