# Asset valuation rounding

Monetary displays use one formatter: `formatMoney` delegates to `formatAmount`.
Currency precision comes from the existing currency table (EGP 2; OMR/KWD 3).
Decimal ties round away from zero, and displayed zero has no minus sign.
`formatNumber` remains separate for physical quantities such as grams.

Gold, silver and currency asset valuation use exact ratios of the decimal strings
of existing numeric inputs. Metal purity and FX factors are combined without
rounding an intermediate EGP or converted value to three decimals. The result is
converted once to the existing Number return type with 40 significant digits of
decimal working precision; final currency rounding happens in the display formatter.
Number's finite range/precision still bounds the public result. This does not
recover precision already lost before values were stored.

Examples: 2g of 21K at 7002.58 EGP/g is 12254.515, displayed as 12,254.52 EGP.
0.002g is 12.254515, displayed as 12.25 EGP rather than double-rounded to 12.26.
1g of 18K is 5251.935, displayed as 5,251.94 rather than a binary-product tie error.

Asset entries/balances, metal prices, exchange rates, and storage schemas are not
rewritten. Existing quantity-balance precision is retained. The shared ledger
`roundMoney` and `convertAmount` functions are unchanged, including account, loan,
debt, and transaction calculation behavior. Summary formulas are unchanged; their
asset inputs naturally use the corrected valuation. Missing/invalid metal prices
and unverified FX rates still produce unavailable valuations.

Run `npm run test:finance` and TypeScript checks. Native Expo Go display verification
is still needed; these tests execute actual pure valuation/formatting code on Node.
