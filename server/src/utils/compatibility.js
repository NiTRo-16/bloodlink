// Blood compatibility and donor eligibility rules.
// These functions have no dependencies, so they are easy to unit test.

export const BLOOD_GROUPS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

// Red cell compatibility: which donor groups a patient of each group can receive from.
const DONORS_FOR = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

export function isValidBloodGroup(group) {
  return BLOOD_GROUPS.includes(group);
}

/** Donor groups that can give to a patient with `patientGroup`. */
export function compatibleDonorGroups(patientGroup) {
  return DONORS_FOR[patientGroup] ? [...DONORS_FOR[patientGroup]] : [];
}

/** Patient groups that a donor with `donorGroup` can give to. */
export function compatibleRecipientGroups(donorGroup) {
  return BLOOD_GROUPS.filter((patient) => DONORS_FOR[patient].includes(donorGroup));
}

export function canDonateTo(donorGroup, patientGroup) {
  return compatibleDonorGroups(patientGroup).includes(donorGroup);
}

// Minimum days between whole-blood donations.
// Commonly used gaps in India: about 3 months for men, 4 months for women.
// Check current national guidelines before relying on these numbers.
export const DONATION_GAP_DAYS = { male: 90, female: 120, other: 120 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The date a donor can give again, or null if they have no recorded donation. */
export function nextEligibleDate(donor) {
  if (!donor?.lastDonationDate) return null;
  const gap = DONATION_GAP_DAYS[donor.gender] ?? DONATION_GAP_DAYS.other;
  return new Date(new Date(donor.lastDonationDate).getTime() + gap * DAY_MS);
}

export function isEligible(donor, now = new Date()) {
  const next = nextEligibleDate(donor);
  return next === null || next <= now;
}
