// Where opening a notification takes you.
//
// A non-payment report is addressed to an HR Coordinator, who has no
// leads.view at all - sending them to the lead board would land them on a page
// they cannot open. Their work is on the coordinator board, so that is where
// they go.
//
// Everything else is a lead to chase: explicitly the Foundation board, since a
// lead_id is always a Lead and the Induction board holds different records,
// with ?lead= opening that candidate rather than leaving you to find the name
// on a board it may not even be on the first page of.
//
// Its own module rather than living beside the bell: the bell and the
// notifications page both need it, and a component file that also exports a
// plain function loses Fast Refresh.
export function destinationFor(notification) {
  if (notification.category === 'non_payment') return '/batch-confirmation'
  return `/leads?board=foundation&lead=${notification.lead_id}`
}
