# Invoice creation experience prototype

Throwaway UI used to decide how the invoice form, live preview, navigation, validation, history, clients, settings, backup, restore, and unreadable-data recovery should work.

`B`, Document studio, is the approved direction and the default. The rejected `A` and `C` variants remain switchable with `?variant=A` and `?variant=C` as decision evidence.

Run from the repository root:

```sh
vp run prototype:invoice-creation
```

Open <http://127.0.0.1:4173/?variant=B>.

The follow-up correction-flow prototype lives at <http://127.0.0.1:4173/correction.html?variant=A>. `A`, Guided correction, is the approved direction and the default. The rejected `B` Document chain and `C` Audit workspace variants remain available as decision evidence.

This prototype keeps all state in memory. Its calculations are sample display logic only; the calculation and form-validation contract remains a separate Wayfinder decision.
