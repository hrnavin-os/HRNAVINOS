// The staff profile a User carries (backend/app/models/staff_profile.py),
// described once for both the Users form that fills it and the detail views
// that read it back. Each section lists its fields in the order they appear.
//
// type: 'text' (default) | 'date' | 'number' | 'select' | 'email' | 'tel'
// pattern/message: an optional format check, applied only when filled in.

const GENDERS = ['Male', 'Female', 'Other']
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed']
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern', 'Consultant']

export const MOBILE_PATTERN = { value: /^\+?[\d\s-]{10,}$/, message: 'Enter a valid mobile number' }

export const PERSONAL_FIELDS = [
  { name: 'gender', label: 'Gender', type: 'select', options: GENDERS },
  { name: 'date_of_birth', label: 'Date of Birth', type: 'date' },
  { name: 'blood_group', label: 'Blood Group', type: 'select', options: BLOOD_GROUPS },
  { name: 'marital_status', label: 'Marital Status', type: 'select', options: MARITAL_STATUSES },
  { name: 'father_or_spouse_name', label: "Father's / Spouse's Name" },
  { name: 'alternate_phone', label: 'Alternate Mobile', type: 'tel', pattern: MOBILE_PATTERN },
  { name: 'personal_email', label: 'Personal Email', type: 'email' },
  { name: 'emergency_contact_name', label: 'Emergency Contact Name' },
  { name: 'emergency_contact_phone', label: 'Emergency Contact Mobile', type: 'tel', pattern: MOBILE_PATTERN },
]

export const EMPLOYMENT_FIELDS = [
  { name: 'employee_code', label: 'Employee ID' },
  { name: 'designation', label: 'Designation' },
  { name: 'employment_type', label: 'Employment Type', type: 'select', options: EMPLOYMENT_TYPES },
  { name: 'date_of_joining', label: 'Date of Joining', type: 'date' },
  { name: 'work_location', label: 'Work Location' },
  { name: 'reporting_to', label: 'Reporting To' },
  { name: 'monthly_salary', label: 'Monthly Salary (₹)', type: 'number' },
]

export const IDENTITY_FIELDS = [
  {
    name: 'aadhaar_number',
    label: 'Aadhaar Number',
    pattern: { value: /^\d{4}\s?\d{4}\s?\d{4}$/, message: 'Aadhaar is 12 digits' },
  },
  {
    name: 'pan_number',
    label: 'PAN Number',
    pattern: { value: /^[A-Za-z]{5}\d{4}[A-Za-z]$/, message: 'PAN looks like ABCDE1234F' },
  },
  { name: 'passport_number', label: 'Passport Number' },
  { name: 'driving_license_number', label: 'Driving Licence Number' },
  { name: 'uan_number', label: 'UAN (PF) Number' },
  { name: 'esi_number', label: 'ESI Number' },
]

export const ADDRESS_FIELDS = [
  { name: 'line1', label: 'Address Line 1', wide: true },
  { name: 'line2', label: 'Address Line 2', wide: true },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'State' },
  { name: 'pincode', label: 'Pincode', pattern: { value: /^\d{6}$/, message: 'Pincode is 6 digits' } },
  { name: 'country', label: 'Country' },
]

export const BANK_FIELDS = [
  { name: 'account_holder_name', label: 'Account Holder Name' },
  { name: 'bank_name', label: 'Bank Name' },
  { name: 'account_number', label: 'Account Number', pattern: { value: /^\d{6,20}$/, message: 'Digits only' } },
  {
    name: 'ifsc_code',
    label: 'IFSC Code',
    pattern: { value: /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, message: 'IFSC looks like HDFC0001234' },
  },
  { name: 'branch', label: 'Branch' },
  { name: 'upi_id', label: 'UPI ID' },
]

// The labels offered for an uploaded document. Free text is allowed too.
export const DOCUMENT_LABELS = [
  'Aadhaar Card',
  'PAN Card',
  'Photo',
  'Resume',
  'Educational Certificate',
  'Experience Letter',
  'Relieving Letter',
  'Offer Letter',
  'Bank Passbook / Cheque',
  'Other',
]

export const fullName = (user) => [user.first_name, user.last_name].filter(Boolean).join(' ')
