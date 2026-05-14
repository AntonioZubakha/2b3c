# Where to fill & where to view (UI map)

Quick reference for the application UI: where users enter data and where they can view information. Use UI-facing names (no internal technical details).

---

## Auth & registration

| Action | Where |
|----------|-----|
| Log in | **Login** page — email/phone + password. |
| Register | **Register** page. |
| Confirm email | **Email confirmation** (after signup or via email link). |
| Verify phone | **Verify phone** page. |
| Reset password | **Reset password** page. |
| Accept company invite | **Accept invite** page (via invitation link). |

After login: notifications in the header; reminders may appear if email/phone is unverified.

---

## Catalog & cart

| Action | Where |
|----------|-----|
| Browse stones | **Catalog** — listings + filters (shape, carat, color, clarity, etc.). |
| Add to cart | In **Catalog** — add control on the product. |
| View/edit cart | **Cart**. |
| Set delivery address | **Cart** — delivery address block. |
| Create a deal from cart | **Cart** — **Initiate deal** (or equivalent). |

---

## Deals

| Action | Where |
|----------|-----|
| View your deals list | **My deals** (My Deals). |
| Open a specific deal | **My deals** → click a deal → **Deal** page. |
| Supplier: accept/decline request | **Deal** page — accept/decline controls. |
| Supplier: upload invoice | **Deal** page — invoice upload (when status allows). |
| Buyer: accept/decline invoice | **Deal** page — accept/decline invoice. |
| Payment (general) | **Deal** page — payment block and current status. Card payments use Stripe UI; bank transfer details are in the invoice/Deal page. |
| Add tracking (supplier / logistics) | **Deal** page — tracking field (when available). |
| Confirm delivery (buyer) | **Deal** page — **Confirm delivery** (when shipped). |
| Accept/decline an alternative stone (buyer) | **Deal** page — when an alternative is proposed. |

For LGDEAL INC staff: manager/logistics assignment, shipping cost, and alternative selection are performed by role in admin tooling and/or on the deal page. Logistics staff see assigned deals in **Logist dashboard** (or in **My deals**, depending on UI).

---

## Company & profile

| Action | Where |
|----------|-----|
| Company settings, description, logo | **My company** (My Company) → **Settings**. |
| Team management, invites | **My company** → **Team**. |
| Inventory (suppliers) | **My company** → **Inventory**. |
| Account details | **My company** → **Account** (or equivalent). |

---

## Paying for a deal

| Action | Where |
|----------|-----|
| Pay by card (Stripe) | **Deal** page — card payment button; confirmation is automatic after success. |
| Bank transfer | Details are on the invoice / Deal page. After transfer, status updates when LGDEAL/seller confirms receipt. If needed, contact support chat and share proof of transfer (never share banking secrets). |
| Download invoice | **Deal** page — download link/button (when invoice exists). |
| Check payment status | **Deal** page — payment block / overall status. |

---

## Market, analytics & Perfect Pair

| Action | Where |
|----------|-----|
| Market overview | **Market overview** — for signed-in users. |
| Category statistics | **Category stats**. |
| Find a matching stone (Perfect Pair) | In **Catalog** — **Find pair / Perfect pair** on a product; the system suggests a close match by parameters. |

---

## Phone verification

| Action | Where |
|----------|-----|
| Verify phone | **Verify phone** — enter the SMS code. |
| Resend SMS | **Verify phone** — resend button. |
| Change phone number | **My company** → **Account** (or via support chat). |

---

## Notifications & support

| Action | Where |
|----------|-----|
| View notifications | Header bell or **Notifications** page. |
| Mark as read | In **Notifications** — open item or “mark all as read”. |
| Contact support | Bottom-right **support chat** widget — real-time messages; the support team replies. |

---

## Admin panel (LGDEAL INC staff only)

Access is restricted to authorized LGDEAL INC staff. It includes onboarding, companies/users, API settings, analytics, categories, FTP, support chat monitoring, system settings, constants, marketplace pricing, supplier stock, etc. Do not explain how to access admin to regular users; direct them to an administrator.

---

## General guidance for the assistant

- If the user asks “where do I fill X?” → map X to the table above and give the section/tab/button.
- If the user asks “where do I see Y?” → point to the right area (My deals, Deal page, Notifications, etc.).
- Never invent button/menu names. If UI labels differ, describe intent (“look for a section related to…”) and suggest sending a screenshot in support chat.
