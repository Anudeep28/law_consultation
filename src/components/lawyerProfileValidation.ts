export interface LawyerProfileInput {
  name: string;
  title: string;
  bio: string;
  practiceAreas: string[];
  languages: string[];
  experienceYears: number;
  barCouncil: string;
  enrollmentNumber: string;
  fee: number;
  documentFeePercent: number;
  avatarUrl: string;
  availability: { days: number[]; start: string; end: string };
}

export type LawyerProfileErrors = Partial<Record<keyof LawyerProfileInput, string>>;

export const parseCommaSeparatedList = (value: string): string[] => {
  const seen = new Set<string>();
  return value.split(',').map((item) => item.trim()).filter((item) => {
    const normalized = item.toLocaleLowerCase();
    if (!item || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

export const isPlausibleEnrollmentNumber = (value: string): boolean => /^[A-Z]{1,8}[/-][A-Z0-9-]{1,12}[/-](?:19|20)\d{2}$/i.test(value.trim());

export const validateLawyerProfile = (profile: LawyerProfileInput): LawyerProfileErrors => {
  const errors: LawyerProfileErrors = {};
  if (!profile.name.trim()) errors.name = 'Enter your full professional name';
  if (!profile.title.trim()) errors.title = 'Enter your professional title';
  if (profile.bio.trim().length < 40) errors.bio = 'Enter a professional biography of at least 40 characters';
  if (!profile.practiceAreas.length) errors.practiceAreas = 'Add at least one practice area';
  if (!profile.languages.length) errors.languages = 'Add at least one language';
  if (!Number.isInteger(profile.experienceYears) || profile.experienceYears < 0 || profile.experienceYears > 80) errors.experienceYears = 'Experience must be between 0 and 80 years';
  if (!profile.barCouncil.trim()) errors.barCouncil = 'Enter your Bar Council';
  if (!isPlausibleEnrollmentNumber(profile.enrollmentNumber)) errors.enrollmentNumber = 'Use the State Bar Council format, for example D/1234/2018';
  if (!Number.isInteger(profile.fee) || profile.fee < 100) errors.fee = 'Consultation fee must be at least ₹1';
  if (!Number.isInteger(profile.documentFeePercent) || profile.documentFeePercent < 0 || profile.documentFeePercent > 500) errors.documentFeePercent = 'Document fee percentage must be between 0 and 500';
  if (profile.avatarUrl && !/^https:\/\//i.test(profile.avatarUrl)) errors.avatarUrl = 'Use a secure https:// image URL';
  if (!profile.availability.days.length || !/^\d{2}:\d{2}$/.test(profile.availability.start) || !/^\d{2}:\d{2}$/.test(profile.availability.end) || profile.availability.start >= profile.availability.end) errors.availability = 'Choose working days and a valid start and end time';
  return errors;
};
