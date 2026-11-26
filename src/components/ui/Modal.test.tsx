import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { domMax, LazyMotion } from 'motion/react';
import { vi } from 'vitest';
import { Modal } from './Modal';

test('dismissed modal content cannot submit or activate while exiting', () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const activate = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    return <LazyMotion features={domMax}><Modal open={open} onClose={() => setOpen(false)} title="Delete account">
      <form aria-label="Delete account" onSubmit={submit}><button onClick={activate}>Delete</button></form>
    </Modal></LazyMotion>;
  }
  render(<Harness />);
  fireEvent.submit(screen.getByRole('form'));
  expect(submit).toHaveBeenCalledTimes(1);
  submit.mockClear();
  const form = screen.getByRole('form');
  const button = screen.getByRole('button', { name: 'Delete' });
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(form).toBeInTheDocument();
  expect(form.closest('[inert]')).not.toBeNull();
  fireEvent.submit(form);
  fireEvent.click(button);
  expect(submit).not.toHaveBeenCalled();
  expect(activate).not.toHaveBeenCalled();
});
