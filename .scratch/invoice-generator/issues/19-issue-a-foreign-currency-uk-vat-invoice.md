# 19 — Issue a foreign-currency UK VAT invoice

**What to build:** Let the owner issue a foreign-currency UK VAT invoice with complete exchange evidence and independently calculated sterling VAT summaries.

**Blocked by:** 18 — Issue a GBP UK VAT invoice.

**Status:** completed

- [ ] A foreign-currency UK VAT draft requires the approved exchange rate, rate direction, source, and date and rejects zero, negative, malformed, or incomplete evidence.
- [ ] Client-currency and statutory sterling totals use exact decimals and the approved currency-specific precision and half-up rules. Sterling net is calculated from rounded client-currency net; sterling VAT is calculated independently from rounded sterling net.
- [ ] Zero-, two-, and three-minor-unit fixture currencies cover rounding boundaries and prove that sterling VAT is not converted from rounded client-currency VAT.
- [ ] Preview, confirmation, immutable history, and retained PDF show the same foreign-currency totals, sterling VAT evidence, and required wording.
- [ ] Restart, export, and calculation regression checks preserve the exact exchange evidence and retained bytes through the shared validation tasks.
