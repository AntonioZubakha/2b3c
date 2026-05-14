# User flows & FAQ

Concise main scenarios and answers to common questions for the support assistant. No internal status codes or technical details.

---

## Main scenarios

### Buyer

1. **Register & log in** — sign up, verify email/phone if prompted, then log in.
2. **Select products** — use **Catalog** filters and add stones to **Cart**.
3. **Checkout** — in **Cart**, set delivery address and **initiate a deal**.
4. **Invoice** — after confirmation steps, an invoice appears; the buyer accepts it on the **Deal** page.
5. **Payment** — pay by card (Stripe) or bank transfer. Card confirmation is automatic after success. Bank transfer updates after LGDEAL/seller confirms receipt; if needed, contact support and attach proof of transfer (never share banking secrets).
6. **QC & delivery** — LGDEAL coordinates quality control and shipping. Tracking appears on the **Deal** page after shipment.
7. **Receive** — once received, click **Confirm delivery** on the **Deal** page.
8. **Alternative stone** — if an alternative is proposed (e.g., after QC), accept/decline on the **Deal** page.

### Supplier (seller)

1. **Registration & company** — sign up; use **My company** for settings/team; inventory if applicable.
2. **Deal requests** — requests appear in **My deals**; open and accept/decline.
3. **Invoice** — after accepting, upload an invoice on the **Deal** page when status allows.
4. **Tracking** — after shipment, add tracking on the **Deal** page.

### LGDEAL INC staff (brief)

- **Supervisor** — sees all LGDEAL INC deals; assigns manager/logistics; sets shipping cost; selects an alternative stone if QC fails.
- **Manager** — sees assigned deals; receives the stone, performs QC, assigns logistics.
- **Logistics** — sees assigned deals; adds tracking and ships. Delivery confirmation is done by the buyer.

The assistant may explain these steps in plain language and point to the right UI areas, without internal codes.

---

## Deal statuses — what they mean (buyer view)

Explain meaning only (no internal status codes). Typical mapping:

| What the user sees | What it means |
|-------------------------------|----------------|
| **Awaiting confirmation** | Request sent; waiting for supplier confirmation. |
| **Awaiting invoice** | Supplier confirmed; waiting for invoice upload. |
| **Invoice pending** | Invoice uploaded; buyer must accept/decline. |
| **Awaiting payment** | Invoice accepted; payment is due. |
| **Payment received** | Payment recorded; LGDEAL is processing. |
| **Quality check** | LGDEAL manager received the stone and is checking it. |
| **Shipped / in transit** | Shipped; tracking is available on the Deal page. |
| **Delivered (pending confirmation)** | Delivered; buyer should confirm delivery. |
| **Completed** | Deal finished. |
| **Cancelled** | Deal cancelled. |
| **Alternative proposed** | Alternative stone offered; waiting for buyer decision. |

---

## Payment: two methods

### Pay by card (Stripe)
- Fast method: on the **Deal** page, click the card payment button and complete the Stripe flow.
- Confirmation is **automatic** after a successful payment.
- If payment fails: check card details, limits, and 3D Secure in your banking app.

### Bank transfer
- Transfer details are on the invoice / **Deal** page.
- Status updates after LGDEAL/seller confirms receipt.
- Support may request proof of transfer. Attach a proof document (never share banking secrets).

---

## Alternative stone — what is it?

Sometimes after quality control, LGDEAL may offer a replacement stone. If this happens:
- On the **Deal** page you’ll see buttons to accept/decline the alternative.
- Accept → the deal continues with the replacement stone.
- Decline → contact support to discuss next steps.
- The assistant does not decide for the user; actions are taken on the Deal page.

---

## FAQ

**What is LGDEAL?**
LGDEAL is the **Global Lab-Grown Diamond Exchange Network** — a marketplace-exchange and ecosystem where buyers and suppliers execute deals. It is not “just a reseller”: it combines catalog, market orientation, QC coordination, and delivery workflow in one environment operated by LGDEAL (LGDEAL INC).

**How do I register?**
Go to **Register**, complete the form, then verify email/phone if prompted.

**No confirmation email / can’t log in.**
Check spam. If the email didn’t arrive or the link doesn’t work, contact support chat and share your email + the issue.

**How do I verify my phone?**
Open **Verify phone**, enter the SMS code, and use resend if needed. If the issue persists, contact support chat.

**Where is the catalog?**
Use **Catalog** in the main navigation. You can filter stones and add them to cart.

**How do I place an order?**
Add items to **Cart**, set the delivery address, and initiate the deal. Follow the next steps in **My deals** → open the deal.

**Where do I see my deals?**
Go to **My deals** and open the deal to view status, invoice, payment, and shipping.

**How do I accept an invoice / confirm payment?**
Open the deal: **My deals** → select deal. When applicable, you’ll see accept/decline invoice controls. Stripe updates automatically after success. Bank transfer updates after confirmation of receipt; contact support with proof if needed.

**How do I pay by card?**
On the **Deal** page in “Awaiting payment”, use the card payment button and complete the Stripe flow. Status updates automatically after success.

**How do I pay by bank transfer?**
Transfer details are on the invoice / Deal page. Status updates after LGDEAL/seller confirms receipt. If needed, ask support what proof documents are acceptable and attach proof of transfer (never share banking secrets).

**I paid, but the status didn’t change.**
- Card: verify the payment succeeded (bank/SMS/email). If it did, but status didn’t update, contact support with the deal number.
- Bank transfer: status updates after confirmation of receipt. If it’s taking too long, contact support and attach proof of transfer (never share banking secrets).

**Where do I confirm delivery?**
On the **Deal** page when the status is “Shipped” (or equivalent) and you received the parcel — click **Confirm delivery**.

**Where is the tracking number / delivery status?**
Tracking appears on the **Deal** page after shipment. Go to **My deals** → open the deal → tracking block. If there’s no tracking yet but the deal is paid, logistics may still be arranging shipment; contact support if it’s taking too long.

**What does “alternative proposed” mean?**
LGDEAL is offering a replacement stone (for example, if the original didn’t pass QC). On the **Deal** page you’ll see the alternative details and buttons to accept/decline. Your prior payment is accounted for. For questions, contact support chat.

**Why did my deal go back to the “request” stage?**
Sometimes a deal can return to the request stage (e.g., after a QC rejection) while LGDEAL selects an alternative option. Contact support with the deal number for clarification.

**Can I cancel a deal?**
It depends on the stage. Early stages often allow cancellation on the **Deal** page. If there’s no cancel option, contact support with the deal number.

**Can I change the delivery address after creating a deal?**
Usually this is not self-service after a deal is created. Contact support as soon as possible — if it hasn’t reached logistics yet, they may be able to help.

**The supplier declined my request — what now?**
LGDEAL will notify you. Depending on the situation, you may be offered an alternative stone or a refund. Contact support with the deal number.

**I don’t see an invoice on the deal page.**
An invoice appears after the supplier uploads it and it’s processed. If it’s been a long time in “Awaiting invoice”, contact support with the deal number.

**How do I contact support?**
Use the bottom-right chat widget to open the support chat and send a message. It works when logged in; guest mode may also be available.

**Who replies in support chat?**
Support chat provides fast first-line guidance and routes complex or account-specific issues to a specialist. Just describe your question and include the deal number if relevant.

**How do I invite a teammate to my company?**
Go to **My company** → **Team** and send an invite. The teammate accepts via the invitation link.

**Where do I edit company details?**
**My company** → **Settings** (name, description, logo, etc.).

**Supplier: where do I upload an invoice?**
In **My deals**, open the deal; when status allows, you’ll see the invoice upload option on the **Deal** page.

**Supplier: where do I add tracking?**
In **My deals**, open the deal and fill the tracking field when it appears for that status.

**Where do I see notifications?**
Use the header bell or the **Notifications** section. Notifications cover key deal events (invoice, payment, shipment, etc.).

**Why don’t I see a deal?**
**My deals** typically shows only deals tied to your account (buyer/supplier). LGDEAL INC staff (manager/logistics) see only assigned deals. If a deal is missing, contact support with the deal number.

**Who confirms delivery?**
The **buyer** confirms delivery on their **Deal** page after receiving the parcel. Logistics only adds tracking and ships.

**What is market price on the platform?**
Market price is a LGDEAL capability: a good-faith benchmark calculated by an internal proprietary methodology. It uses supply/demand economics, market indicators, and category signals to provide an objective reference. Calculation details are not disclosed. Market price is visible in the catalog and market-related sections.

**Why can market price differ from the listing price?**
Market price is a benchmark; the listing price is the supplier’s ask. Differences are normal: suppliers may price above/below the benchmark depending on availability, terms, speed-to-sell, and stone specifics.

**Is it a hidden fee/markup?**
No. Market price is a benchmark, not a fee. Suppliers set listing prices; market price helps compare offers consistently.

**Why does this support a healthier market?**
Because it provides a shared baseline that reduces pricing chaos, speeds up fair negotiation, and makes comparisons more consistent across similar stones.

**Why do some products not have market price?**
Not every stone is covered or has sufficient valid data for a benchmark. In such cases, use the listing price plus certificate/specs, and contact support if needed.

**Can I see the formula?**
No — formulas and implementation details are proprietary. Only high-level principles may be explained.

**Does market price affect the deal, or is it only informational?**
It functions as the platform’s pricing anchor: it supports consistent deal economics and reduces noise in negotiation. It is not a guaranteed final price and not coercion; final terms depend on the specific offer and agreement between parties.

**What is Perfect Pair / Find Pair?**
It helps find a closely matching second stone (e.g., for earrings) by choosing the same shape, color, close carat, and similar characteristics. Available in the catalog; see product details or ask support.

**LGDEAL manager/logistics: I don’t see my deals.**
Managers and logistics users see only deals assigned to them. If you expect a deal but don’t see it, contact your LGDEAL INC supervisor for assignment.

**Where do I download the invoice?**
On the **Deal** page when the invoice is available — use the download link/button.

---

## When the answer is not in the knowledge base

If the question is not covered here:
“Please contact support (bottom-right chat) or your account manager for clarification.”
Do not invent steps or UI labels.
