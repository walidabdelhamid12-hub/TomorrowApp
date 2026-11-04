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
asset inputs naturally use the corrected valuation. The asset subtotal also remains
unquantized until display so it cannot reintroduce three-decimal double rounding;
the existing net-worth quantization and all non-asset subtotal rules are unchanged.
Missing/invalid metal prices
and unverified FX rates still produce unavailable valuations.

Run `npm run test:finance` and TypeScript checks. Native Expo Go display verification
is still needed; these tests execute actual pure valuation/formatting code on Node.

## Compact asset presentation

AssetsScreen, the reusable AssetRow, and FinanceHomeScreen's asset list share
AssetCard and AssetTypeIcon. Gold and silver use the installed MaterialCommunityIcons
`gold` bullion-bar vector glyph, tinted gold or silver for the current theme. No
new dependency or large gradient/icon background is introduced.

The outlined card uses 8 dp padding, 4 dp internal gaps, compact category/value
labels, and wrapping balance/valuation columns instead of the previous larger
padding/vertical gaps. There are no fixed card heights or text line caps. Movements,
Edit, Delete, and the movement-summary target retain at least 48 dp touch areas;
actions wrap at large font sizes. Labels, surfaces, borders, and action colors
support the existing light/dark palettes. AssetRow now exposes its existing
Movements callback alongside Edit/Delete and retains the amount privacy toggle.

UI tests exercise actual component elements and handlers with mocked native
surfaces, including the active Assets screen's modal/deletion bindings. They do
not measure native layout or font loading. Check Expo Go on Android for bullion
font loading, light/dark colors, long names/large values, font scaling, and touch
targets. Existing asset save/delete/persistence flows are not rewritten.
