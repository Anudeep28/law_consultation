import React from 'react';
import { setTheme, useTheme, type Theme } from '../../services/theme';

export const ThemeControl = () => {
  const theme = useTheme();
  return <select aria-label="Color theme" value={theme} onChange={event => setTheme(event.target.value as Theme)} className="theme-control rounded-xl border border-line bg-cream-raised px-2 py-2 text-xs font-semibold text-ink">
    <option value="light">Light</option>
    <option value="dark">Dark</option>
    <option value="system">System</option>
  </select>;
};
