# 31: Give Client legal name the full inspector width

**What to build:** Let the issuer's owner read and edit a long Client legal name across the full width of the Unnumbered Draft inspector instead of constraining it to half of the two-column form.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The shared form-field presentation accepts an explicit full-width option without making every single-line field wide by default.
- [ ] Client legal name in the invoice-draft inspector opts into the full-width presentation and spans both inspector columns.
- [ ] The input continues to fill its wrapper and remains correctly labelled, focusable, editable, validated, and autosaved.
- [ ] Nearby paired invoice-draft fields retain their current two-column layout.
- [ ] Legal-name fields in Clients and Settings retain their current layouts.
- [ ] Focused React coverage proves the invoice-draft field width and guards the unrelated layouts against accidental change through observable rendered geometry or class-independent layout behavior.
- [ ] The required quality check, affected invoice-draft interaction tests, full validation gate, and live Electron verification pass before completion.
