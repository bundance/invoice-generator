# 18 — Issue a GBP UK VAT invoice

**What to build:** Let the owner issue a UK-taxable GBP invoice whose VAT, totals, wording, retained PDF, and history are exact and auditable.

**Blocked by:** 16 — Issue and retain an outside-scope invoice.

**Status:** completed

- [ ] UK VAT treatment requires and displays the approved issuer, client, tax-point, VAT-rate, net, VAT, and gross facts and rejects every missing or malformed conditional value.
- [ ] Net and VAT use exact decimal arithmetic and the approved half-up rounding rules at the documented boundaries, with no binary floating-point calculations in the domain path.
- [ ] The preview, confirmation, issued snapshot, retained PDF, and history all show the same GBP VAT calculation and required fixed-layout wording.
- [ ] Issuing consumes the client's next invoice number exactly once and preserves the immutable VAT evidence after restart.
- [ ] The GBP fixture matrix, validation boundaries, production journey, and retained-document assertions pass the shared validation tasks.
