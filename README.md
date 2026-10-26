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
| [`embeded_quote.user.js`](embeded_quote.user.js) | `/arduino4/order/info/*` | Embeds the console below the order in embedded mode — quote generator first, with a dropdown to the tax invoice and delivery note — and hands whichever page is open the order data from LnwShop's page state on request. |
| [`embeded_price_calculator.user.js`](embeded_price_calculator.user.js) | `/*/inventory/product/*` | Floating, draggable pricing calculator panel on the product page. Its "ตั้งราคา →" link opens the price setter (`#/embeded/price-set`) in the same panel: one base price in, every channel tab filled by the align rules — see below. |
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

**The embedded pages are behind the console's auth guard, and an iframe has
its own sign-in.** Browsers partition a framed site's storage by the top-level
site, so being signed in to `console.genlogic.co.th` in a tab does not sign in
the iframes on LnwShop. Sign in inside an iframe once; it returns to the page
it was opened on.

## Updating

Every script carries `@downloadURL` and `@updateURL` pointing at its own raw
URL, so an installed copy updates itself from `master`.

> **Bump `@version` in the same commit as any code change.**
> Tampermonkey applies an update only when the remote `@version` is *strictly
> higher* than the installed one. Push a fix without bumping it and nothing
> happens — no error, no update, no hint. That is indistinguishable from a
> broken URL and is the easiest way to waste an afternoon on this repo.

Versions are per-script and drift apart as each one is fixed, so check the
`@version` line in the file you edited rather than assuming a shared baseline.

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
| price setter (same iframe, same scope) | `#/embeded/price-set` | `pages/embeded/pages/price-set-filler`, rules in `shared/config/channel-price-rules.ts` |
| quote | `#/secure/billings/quote-generator?embeded=true` | `pages/quote-generator`, plus `pages/tax-invoice` and `pages/temp-delivery-note` via the dropdown |

A `postMessage` payload shape is a contract across two repos with no shared
type — change one side and you must change the other.

### Price setter (`embeded_price_calculator.user.js` ≥ 1.4.0)

The price-set page sends `{ scope, action: "apply-prices", param: { pid, base, channels } }`
and the userscript fills LnwShop's product form **without pressing บันทึก** — the
person checks the form and saves. It replies `{ scope, status: "applied", results }`,
one `{ target, label, ok, message }` per item. The page also sends
`{ scope, status: "request" }` when it opens (it is reached by an in-frame link, so
the iframe `load` handshake never fires for it) and the host answers with `send_data`.

How a channel is filled mirrors `lnw-crawler-v2`'s `price_dom.ts` / `price_tabs.ts`,
the code that repriced the whole catalogue:

- A tab is found by the `.../channel/<boxKey>` link inside its price box, never by
  shop name or shop id — the box identifies itself.
- A shop tab set to "ใช้ราคาขายเหมือน X หลัก" (Shopee General4 → Shopee หลัก, Lazada
  genlogic → Lazada หลัก) is written **at the main tab**, then re-read to confirm it
  still follows and shows the new price. If another shop tab follows the same main
  tab, the item is refused with a message, because that shop's price would move too.
- `kind: "sync"` (LINE Shopping) flips the switch back to "ใช้ราคาขายเหมือน LnwShop".
- Every write waits for `.finaltotal` to show the price before it counts as done.
- After each tab click the script waits for the visible area to actually change:
  reading the box right after `click()` still returns the previous tab's box (Vue
  switches a moment later), which wrote values into the wrong tab in the first test.

`window.__lnwPriceSetter.applyPrices(request)` is exposed for DevTools / tests.

### Embedded mode

Framing a full console page (anything under `#/secure/`) with `embeded=true`
in the URL swaps the console's side menu for a slim bar with a page dropdown.
The dropdown lists the pages marked `showInEmbeded` in the console's
`src/app/app-navigation.ts` — the ones built to load lnwshop data. The flag is
read once when the frame loads, so in-frame navigation keeps the mode. The
`#/embeded/*` routes are chrome-less widgets already and don't need it.

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
