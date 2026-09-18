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
  avatarUrl: string;
  availability: { days: number[]; start: string; end: string };
}

export type LawyerProfileErrors = Partial<Record<keyof LawyerProfileInput, string>>;

export const validateLawyerProfile = (profile: LawyerProfileInput): LawyerProfileErrors => {
  const errors: LawyerProfileErrors = {};
  if (!profile.name.trim()) errors.name = 'Enter your full professional name';
  if (!profile.title.trim()) errors.title = 'Enter your professional title';
  if (profile.bio.trim().length < 40) errors.bio = 'Enter a professional biography of at least 40 characters';
  if (!profile.practiceAreas.length) errors.practiceAreas = 'Add at least one practice area';
  if (!profile.languages.length) errors.languages = 'Add at least one language';
  if (!Number.isInteger(profile.experienceYears) || profile.experienceYears < 0 || profile.experienceYears > 80) errors.experienceYears = 'Experience must be between 0 and 80 years';
  if (!profile.barCouncil.trim()) errors.barCouncil = 'Enter your Bar Council';
  if (!profile.enrollmentNumber.trim()) errors.enrollmentNumber = 'Enter your enrollment number';
  if (!Number.isInteger(profile.fee) || profile.fee < 100) errors.fee = 'Consultation fee must be at least ₹1';
  if (profile.avatarUrl && !/^https:\/\//i.test(profile.avatarUrl)) errors.avatarUrl = 'Use a secure https:// image URL';
  if (!profile.availability.days.length || !/^\d{2}:\d{2}$/.test(profile.availability.start) || !/^\d{2}:\d{2}$/.test(profile.availability.end) || profile.availability.start >= profile.availability.end) errors.availability = 'Choose working days and a valid start and end time';
  return errors;
};
