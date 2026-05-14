export const orderDetail = {
  loading: 'Opening order details…',
  missingOrder: 'Missing order',
  loadError: 'Could not load this order.',
  unavailableTitle: 'Order unavailable',
  notFound: 'This order could not be found.',
  backToOrders: 'Back to orders',
  back: 'Back',
  orderRef: 'Order reference',
  placedOn: 'Placed on',
  total: 'Total',
  items: 'Items',
  bespokeMeta: 'Diamond {{diamond}} · setting {{setting}}',
  shipping: 'Shipping',
  trackingTitle: 'Order progress',
  trackingContextBespoke:
    'Bespoke pairs usually involve workshop assembly after payment. The line below shows only order statuses from our system — there is no finer “manufacturing” step in the API.',
  trackingContextReady:
    'After confirmation we prepare your pieces for shipment. Progress is reflected only by the order statuses below (no extra production milestones in the app).',
  progressHints: {
    prePay: 'After you pay, the order moves to confirmed — exact timing depends on the line and concierge updates.',
    preShip:
      'Your order is confirmed. We will move it to Shipped when it leaves our side — there is no separate “in production” status in the buyer app.',
    inTransit: 'Carrier handling — use Shipped / Delivered on the timeline as the source of truth.',
    delivered: 'Delivered — the timeline reflects the final status from our system.',
    cancelled: 'Cancelled — earlier steps are shown for context only; they are not inferred from the API.',
  },
  allOrders: '← All orders',
};
