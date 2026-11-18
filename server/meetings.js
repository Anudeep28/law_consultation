const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const jaasEnabled = () => Boolean(process.env.JAAS_APP_ID || process.env.JAAS_API_KEY_ID || process.env.JAAS_PRIVATE_KEY);
const randomRoom = () => `law-writer-${crypto.randomBytes(16).toString('hex')}`;
const isJaasMeeting = (consultation) => jaasEnabled() || /^(jaas:|https:\/\/8x8\.vc\/)/.test(consultation.meetingUrl || '');
const publicMeetingUrl = (consultation) => isJaasMeeting(consultation) ? undefined : consultation.meetingUrl;
const createMeetingLocation = () => jaasEnabled()
  ? `jaas:${randomRoom()}`
  : `https://meet.jit.si/law-writer-${crypto.randomBytes(12).toString('hex')}`;
const storedRoom = (value) => /^jaas:(law-writer-[a-f0-9]{32})$/.exec(value || '')?.[1];

const mintMeetingUrl = (consultation, user, room) => {
  const { JAAS_APP_ID: appId, JAAS_API_KEY_ID: keyId, JAAS_PRIVATE_KEY: privateKey } = process.env;
  if (!appId || !keyId || !privateKey) throw new Error('JaaS configuration is incomplete');
  const token = jwt.sign({
    aud: 'jitsi',
    iss: 'chat',
    sub: appId,
    room,
    context: {
      user: { id: user.id, name: user.name, email: user.email, moderator: consultation.lawyer.userId === user.id ? 'true' : 'false' },
      features: { livestreaming: false, recording: false, transcription: false, 'sip-inbound-call': false, 'sip-outbound-call': false, 'inbound-call': false, 'outbound-call': false, 'file-upload': false, 'list-visitors': false },
      room: { regex: false },
    },
    nbf: Math.floor((new Date(consultation.startsAt).getTime() - 10 * 60000) / 1000),
    exp: Math.floor(new Date(consultation.endsAt).getTime() / 1000) + 60,
  }, privateKey.replace(/\\n/g, '\n'), { algorithm: 'RS256', keyid: keyId, jwtid: crypto.randomUUID() });
  return `https://8x8.vc/${encodeURIComponent(appId)}/${encodeURIComponent(room)}?jwt=${token}`;
};

module.exports = { jaasEnabled, randomRoom, isJaasMeeting, publicMeetingUrl, createMeetingLocation, storedRoom, mintMeetingUrl };
