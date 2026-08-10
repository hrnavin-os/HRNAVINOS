// Dropdown suggestions for the Induction Call Form.
//
// These are suggestions, not a closed set: every one of these fields renders
// as a combobox, so a value typed here that isn't listed is accepted and
// stored as-is. The backend keeps the matching columns as free strings rather
// than enums for the same reason - adding an option is an edit to this file,
// with no migration and no API change.
export const SALES_PERSON_OPTIONS = [
  'Sudha',
  'Vikasini',
  'Kadharali',
  'Pavithra',
  'Shabna shireen',
  'Suguna',
  'Ezhilarasan',
  'Merlin Mary',
  'Kokila',
]

export const LEAD_SOURCE_OPTIONS = [
  'Meta-1',
  'Meta-2',
  'Meta-3',
  'Meta-4',
  'Meta-5',
  'Meta-6',
  'Meta-8',
  'Meta-9',
  'Meta-10',
  'Retargeting',
  'Hrhh Website 2',
  'Hrhh Website 3',
  'HRLH Insta Page',
  'Navin - YouTube',
  'Whatsapp Marketing',
  'HR Navin Page - Bio Link',
  'HR Navin DM & HR Navin Insta Story',
]

export const PAYMENT_MODE_OPTIONS = ['HRLH Razorpay Link', 'HRLH Razorpay QR Code', 'HRLH Old QR code']

export const CATEGORY_OPTIONS = [
  'Fresher',
  'Career Gap',
  'Job Switch',
  'Pursuing Student',
  'Currently Working in HR',
  'Currently Working in other field (Job Switch)',
  'Recently relieved from HR Job',
  'Recently relieved from other Job',
  'Not Worked',
  'Experienced i HR + Career Gap',
]
