# Financial model and boundaries

## Scope

USD, one property, fixed-rate fully amortizing monthly mortgage or all-cash purchase, 365-day operating year. No current market estimates or local laws are inferred. Example inputs are fictional. The model screens user assumptions; it does not determine that a property is safe or suitable to buy.

## Acquisition and startup

Loan = price × (1 − down payment / 100). Cash equity = price − loan. Monthly P&I uses the standard annuity formula, with a zero-interest branch and numerically stable `expm1`/`log1p`. Cash financing uses a zero principal.

Closing includes quoted lender, title, transfer, legal, inspection, appraisal, prepaid-interest fees and loan points. Seller credits offset no more than closing charges. Dollar lender/appraisal/prepaid-interest amounts are not silently removed for all-cash: a warning asks the user to review them. Points are zero when principal is zero.

Guest-ready setup is the sum of the setup line items. Contingency applies only to that setup subtotal. Opening carrying = delay months × (annual fixed operating costs / 12 + monthly P&I).

Total cash = equity + net closing + setup + setup contingency + funded carrying + opening operating reserve + escrow/refundable deposits. Cash remaining = max(0, total cash − earnest money already paid). Earnest money never increases total acquisition cost. No construction loan, startup credit facility or later capital call is assumed.

Escrow and refundable deposits are held-up capital, not duplicate operating expenses. Recurring taxes and insurance are accrued separately. This calculator is not a closing disclosure: do not enter prepaid annual premiums in both escrow/deposits and recurring expenses. Timing of premium payment, escrow draws and refunds requires a separate liquidity check.

## Stabilized operating year

For each month: available nights = calendar nights − blocked nights. Booked nights = available nights × occupancy. Blank monthly ADR/occupancy inherits annual inputs. Blocked nights includes personal use and maintenance closures. Monthly occupancies stay between 0% and 100%. If the total exceeds the annual sold-night cap, requested nights are scaled proportionally. This does not optimize allocation to peak-rate months. Cap 0 means no rentals; 365 means unrestricted in this model.

Expected stays = booked nights / average stay length. Fractional stays are planning expectations. Lodging = nights × achieved ADR; cleaning revenue = stays × guest cleaning fee. Total revenue includes both. Guest-collected/remitted taxes are excluded. ADR should be after discounts and net of expected refunds/cancellations affecting achieved lodging revenue.

Fixed operating costs include taxes, STR insurance, HOA, utilities/services, subscriptions, annual professional fees/licenses, other fixed costs and scheduled routine repairs. They accrue during closed months too. Variable costs include platform/payment and management percentages (with explicit cleaning-fee inclusion flags), cleaner/laundry, turnover and night supplies, owner-absorbed lodging tax, and revenue-based routine repairs. Owner-absorbed tax is modeled on lodging plus cleaning; the user must verify the applicable tax base.

Replacement reserve = percentage of lodging revenue + fixed annual contribution. It is deducted from spendable cash, not NOI. Actual purchases paid out of this reserve must not be deducted a second time. Reserves accumulated for future replacements are not part of the spendable operating balance.

NOI = revenue − operating expenses. Cash flow = NOI − P&I − replacement reserve. Cash-on-cash = cash flow / total initial cash including reserve. Cap rate = NOI / purchase price, not all-in basis. DSCR = NOI / P&I; undefined with no debt. Owner labor is valued separately to show economic cash flow, not imputed as an actual cash payment.

## Acquisition-year planning

This illustration explicitly assumes **acquisition in January**. No guests during the whole-month opening delay. The first specified operating months have occupancy multiplied by the ramp-up percentage; monthly ADR remains unchanged. Capital-reserve contributions begin only when the property opens.

Starting spendable balance = operating reserve + funded carrying. The same first-year fixed costs/debt are then deducted once in the monthly cash statements. The carrying amount is not charged again as a separate expense. Closing and setup are considered already paid outside this balance. Lowest balance includes the starting balance. Additional cash needed = max(0, −lowest balance). A positive stabilized return does not override a first-year funding shortfall.

Annual bills are spread evenly through the year, rather than paid on actual due dates. This is monthly accrual planning, not exact bank-account cash timing. A user needing a non-January acquisition, balloon/ARM financing, a leap year, refinancing, long-term-rental fallback, resale analysis or income-tax treatment needs a separate model. No appreciation, depreciation benefit or resale gain is assumed.

## Break-even and scenarios

Break-even uses bisection over uniform occupancy 0–100%, retaining monthly rates, availability and the night cap. It includes operating costs, P&I and replacement contributions. If cash flow remains negative at maximum allowable nights, it reports not viable, rather than truncating an impossible occupancy to 100%.

Scenario rate changes are relative percentages. Occupancy changes are percentage points applied month by month. Running-cost changes scale operating expenses and replacement contributions, not debt. Setup shocks scale guest-ready setup and its contingency, not purchase price or closing. Carrying scales with any fixed-cost shock. Downside/upside labels are editable cases, not probabilities. Sensitivity varies ADR and occupancy with other inputs fixed.

## Input and decision guardrails

Required blanks produce incomplete results. Monetary omissions are provisionally zero, not verified free. Optional default zeros are explicitly subject to the cost-quote research confirmation. Invalid values are flagged; calculations are bounded for rendering but are not valid investment outputs until corrected. Structural inputs cannot silently become missing financing assumptions.

A favorable verdict requires non-example data, complete/valid core assumptions, no flagged research, all six research confirmations, positive/nonnegative cash flow meeting the user's return target, and sufficient acquisition-year operating funding. A favorable result remains conditional, not financial advice. Research is user-entered evidence, not automated verification.

## Test evidence

35 Node tests cover mortgage arithmetic, an independently hand-calculated operating case, all-cash/zero APR, zero occupancy, missing inputs, impossible break-even, annual caps, monthly overrides, seller credits, fee bases, carrying funded once, fully closed first year, reserves outside NOI, source/import validation and storage failure. Three Python tests cover reversible selection and unchanged originals. Browser tests exercise Chromium and WebKit at 320, 360, 375, 390, 430, 768 and 1280 CSS pixels. This is browser-engine testing, not a physical iPhone certification.

## Simplified display

The main interface groups setup and fixed-cost inputs and rounds displayed initial cash to $1,000 and monthly cash to $100. These are display approximations, not added calculation precision. Internal calculations and existing detailed inputs retain their original precision. New studies use explicit editable planning allowances of 3% booking fees, 5% routine repairs, 5% replacement reserves and 10% setup contingency; these are not current market fee claims. The What is assumed section exposes these values. Other detail remains optional.
