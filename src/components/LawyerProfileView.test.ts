import { validateLawyerProfile } from './lawyerProfileValidation';

const validProfile = {
  name: 'Asha Rao',
  title: 'Senior Advocate',
  bio: 'I advise clients on family and property disputes with a practical, resolution-focused approach.',
  practiceAreas: ['Family Law'],
  languages: ['English', 'Hindi'],
  experienceYears: 8,
  barCouncil: 'Bar Council of Delhi',
  enrollmentNumber: 'D/1234/2018',
  fee: 150000,
  avatarUrl: 'https://example.com/profile.jpg',
  availability: { days: [1, 2, 3], start: '09:00', end: '17:00' },
};

test('accepts a complete lawyer profile', () => {
  expect(validateLawyerProfile(validProfile)).toEqual({});
});

test('requires customer-facing professional details', () => {
  expect(validateLawyerProfile({ ...validProfile, bio: '', practiceAreas: [], languages: [] })).toEqual({
    bio: 'Enter a professional biography of at least 40 characters',
    practiceAreas: 'Add at least one practice area',
    languages: 'Add at least one language',
  });
});

test('rejects invalid experience, fee, photo, and availability', () => {
  expect(validateLawyerProfile({
    ...validProfile,
    experienceYears: -1,
    fee: 0,
    avatarUrl: 'profile.jpg',
    availability: { days: [], start: '17:00', end: '09:00' },
  })).toMatchObject({
    experienceYears: expect.any(String),
    fee: expect.any(String),
    avatarUrl: expect.any(String),
    availability: expect.any(String),
  });
});
