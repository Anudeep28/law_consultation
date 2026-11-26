import React, { useId } from 'react';
import * as m from 'motion/react-m';
import { BadgeCheck, CreditCard, LockKeyhole } from 'lucide-react';
import { useMotionReady } from './MotionProvider';
import { useReducedMotion } from './useReducedMotion';

const chips = [
  { label: 'Verified lawyers', Icon: BadgeCheck, position: 'left-0 top-2', delay: 0 },
  { label: 'Secure payments', Icon: CreditCard, position: 'bottom-5 left-0', delay: 0.8 },
  { label: 'Private & confidential', Icon: LockKeyhole, position: 'bottom-0 right-0', delay: 1.6 },
];

export const AuthHeroIllustration = () => {
  const id = useId();
  const reduced = useReducedMotion();
  const ready = useMotionReady();
  const floating = ready && !reduced;
  return <div className="auth-art" aria-hidden="true" data-motion={floating ? 'floating' : 'static'}>
    <svg viewBox="0 0 520 350" fill="none" focusable="false" className="h-full w-full">
      <defs>
        <linearGradient id={`${id}-paper`} x1="170" y1="80" x2="360" y2="310" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgb(var(--illustration-paper))" /><stop offset="1" stopColor="rgb(var(--illustration-soft))" />
        </linearGradient>
        <radialGradient id={`${id}-halo`}>
          <stop stopColor="#C7D2FE" stopOpacity=".65" /><stop offset="1" stopColor="#EEF2FF" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-shadow`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="12" stdDeviation="12" floodColor="#312E81" floodOpacity=".1" />
        </filter>
      </defs>
      <ellipse cx="265" cy="177" rx="247" ry="167" fill={`url(#${id}-halo)`} />
      <ellipse cx="260" cy="182" rx="215" ry="131" stroke="#A5B4FC" strokeOpacity=".45" strokeDasharray="3 8" transform="rotate(-12 260 182)" />
      <circle cx="467" cy="182" r="6" fill="#FBBF24" fillOpacity=".7" />
      <path d="M139 64v12m-6-6h12M459 291v12m-6-6h12" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" />
      <g transform="rotate(-7 265 199)" filter={`url(#${id}-shadow)`}>
        <rect x="174" y="85" width="193" height="232" rx="20" fill="#C7D2FE" fillOpacity=".45" transform="rotate(7 174 85)" />
        <path d="M194 70h119l48 48v180a16 16 0 0 1-16 16H194a16 16 0 0 1-16-16V86a16 16 0 0 1 16-16Z" fill={`url(#${id}-paper)`} stroke="#C7D2FE" />
        <path d="M313 71v32a15 15 0 0 0 15 15h32" fill="#E0E7FF" stroke="#C7D2FE" strokeLinejoin="round" />
        <rect x="201" y="99" width="69" height="7" rx="3.5" fill="#4F46E5" />
        <rect x="201" y="115" width="42" height="4" rx="2" fill="#A5B4FC" />
        <path d="M201 153h131M201 169h111M201 185h125M201 201h87" stroke="#CBD5E1" strokeWidth="5" strokeLinecap="round" />
        <path d="m223 264-5 27 12-6 10 8 2-28" fill="#FDE68A" stroke="#D97706" strokeLinejoin="round" />
        <path d="m228 232 7 5 9-1 3 9 7 6-4 8v9l-9 3-6 7-8-4-9 1-3-9-7-6 4-8v-9l9-3Z" fill="#FBBF24" />
        <circle cx="231" cy="255" r="12" stroke="#92400E" strokeOpacity=".45" />
        <path d="m225 255 4 4 8-9" stroke="#92400E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M272 272c9-18 14-24 10-11-6 19 6-9 11-4s-5 13 2 10 11-11 13-6 8 2 15-4M271 282h55" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g filter={`url(#${id}-shadow)`}>
        <rect x="23" y="126" width="140" height="143" rx="26" fill="rgb(var(--illustration-paper))" fillOpacity=".85" stroke="#E0E7FF" />
        <circle cx="93" cy="155" r="8" fill="#FBBF24" />
        <path d="M93 164v76m-27 5h54m-42-5h30M47 175l91-12" stroke="#4F46E5" strokeWidth="5" strokeLinecap="round" />
        <path d="m55 175-14 35h29l-15-35Zm75-10-15 35h29l-14-35Z" stroke="#818CF8" strokeWidth="2" strokeLinejoin="round" />
        <path d="M36 210a19 19 0 0 0 38 0H36Zm74-10a19 19 0 0 0 38 0h-38Z" fill="#4F46E5" />
      </g>
      <g filter={`url(#${id}-shadow)`}>
        <rect x="306" y="27" width="191" height="119" rx="23" fill="rgb(var(--illustration-paper))" fillOpacity=".95" stroke="#C7D2FE" />
        <path d="m331 145-10 17 34-17" fill="rgb(var(--illustration-paper))" stroke="#C7D2FE" strokeLinejoin="round" />
        <circle cx="350" cy="89" r="29" fill="#EEF2FF" />
        <circle cx="350" cy="82" r="11" fill="#E7B18A" />
        <path d="M339 81c-3-16 23-18 23 0l-8-4-15 4Z" fill="#334155" />
        <path d="M329 109c1-20 40-20 42 0a29 29 0 0 1-42 0Z" fill="#6366F1" />
        <circle cx="451" cy="89" r="29" fill="#FEF3C7" />
        <circle cx="451" cy="81" r="11" fill="#B97955" />
        <path d="M440 78c-1-15 25-16 23 3l-6-6-17 3Z" fill="#1E293B" />
        <path d="M429 109c3-22 42-22 44 0a29 29 0 0 1-44 0Z" fill="#1E293B" />
        <path d="m444 96 7 17 7-17-7 4-7-4Z" fill="white" />
        <rect x="377" y="52" width="47" height="32" rx="12" fill="#4F46E5" />
        <path d="m389 65 5 4 10-10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m408 62 6-3v14l-6-3" fill="#C7D2FE" />
        <path d="M381 95h39" stroke="#A5B4FC" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 5" />
        <rect x="382" y="119" width="37" height="5" rx="2.5" fill="#E0E7FF" />
        <circle cx="400" cy="121" r="9" fill="#EEF2FF" />
        <path d="M397 121h6" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g filter={`url(#${id}-shadow)`}>
        <rect x="396" y="209" width="86" height="86" rx="25" fill="rgb(var(--illustration-paper))" fillOpacity=".9" stroke="#E0E7FF" />
        <path d="m439 222 8 5 9 1 2 9 5 8-5 8-2 9-9 2-8 5-8-5-9-2-2-9-5-8 5-8 2-9 9-1 8-5Z" fill="#4F46E5" />
        <path d="m429 245 7 7 13-15" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M427 282h24" stroke="#A5B4FC" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
    {chips.map(({ label, Icon, position, delay }) => <m.div key={label} className={`auth-feature-chip ${position}`} initial={{ y: 0, x: 0 }} animate={floating ? { y: [0, -6, 0], x: [0, 2, 0] } : { y: 0, x: 0 }} transition={floating ? { duration: 5, delay, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-brand"><Icon className="h-4 w-4" /></span>{label}
    </m.div>)}
  </div>;
};
