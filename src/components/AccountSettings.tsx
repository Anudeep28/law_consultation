import React, { useState } from 'react';
import { changePassword, logoutAllDevices, exportAccountData, deleteAccount } from '../services/accountService';
import { useAuthStore } from '../stores/authStore';
import { Modal } from './ui/Modal';
import { notify } from './ui/Toasts';
import { PasswordRules } from './Auth/PasswordRules';

export const AccountSettings: React.FC = () => {
  const logout = useAuthStore((state) => state.logout);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setSessionError('');
    if (newPassword !== confirmPassword) {
      setSessionError('Passwords do not match');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify('Password changed. Your other sessions have been signed out.', 'success');
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Unable to change password.');
    } finally { setSavingPassword(false); }
  };

  const revokeSessions = async () => {
    setSessionError('');
    setRevoking(true);
    try {
      await logoutAllDevices();
      logout();
      notify('You have been logged out of all devices.', 'info');
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Unable to log out all devices.');
    } finally { setRevoking(false); }
  };

  const download = async () => {
    setDownloading(true);
    setDownloadError('');
    try { await exportAccountData(); }
    catch (err) { setDownloadError(err instanceof Error ? err.message : 'Unable to download your data.'); }
    finally { setDownloading(false); }
  };
  const close = () => {
    if (deleting) return;
    setOpen(false);
    setPassword('');
    setConfirmation('');
    setError('');
  };
  const remove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (confirmation !== 'DELETE' || !password || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await deleteAccount(password, confirmation);
      setPassword('');
      setOpen(false);
      logout();
      notify('Your account has been deleted. Records required for legal compliance are retained.', 'info');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete your account.');
    } finally { setDeleting(false); }
  };

  return (
    <div className="h-full overflow-y-auto bg-cream p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6 text-ink">
        <section className="rounded-2xl border border-line bg-cream-raised p-6">
          <h1 className="text-xl font-bold">Account &amp; Privacy</h1>
          <p className="my-4 text-sm text-ink-muted">Download a JSON copy of your profile, documents, consultations, payments, reviews, and notifications. Keep this file secure: it contains personal and legal information.</p>
          <button type="button" disabled={downloading || deleting} onClick={download} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50">{downloading ? 'Preparing download...' : 'Download my data'}</button>
          {downloadError && <p role="alert" className="mt-3 text-sm text-brand">{downloadError}</p>}
        </section>
        <section className="rounded-2xl border border-line bg-cream-raised p-6">
          <h2 className="font-bold">Password &amp; sessions</h2>
          <form onSubmit={updatePassword} className="mt-4 space-y-4">
            <PasswordRules />
            <label className="block text-sm font-medium">Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-line p-2" /></label>
            <label className="block text-sm font-medium">New password<input type="password" autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-line p-2" /></label>
            <label className="block text-sm font-medium">Confirm new password<input type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-line p-2" /></label>
            <button type="submit" disabled={savingPassword || revoking} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50">{savingPassword ? 'Changing password...' : 'Change password'}</button>
          </form>
          <p className="my-4 text-sm text-ink-muted">Changing your password signs out other sessions. Log out of all devices also signs you out here and removes push subscriptions on all devices.</p>
          <button type="button" disabled={savingPassword || revoking} onClick={revokeSessions} className="rounded-lg border border-brand px-4 py-2 font-semibold text-brand disabled:opacity-50">{revoking ? 'Logging out...' : 'Log out of all devices'}</button>
          {sessionError && <p role="alert" className="mt-3 text-sm text-brand">{sessionError}</p>}
        </section>
        <section className="rounded-2xl border border-brand bg-brand-soft p-6">
          <h2 className="font-bold text-brand">Danger zone</h2>
          <p className="my-4 text-sm text-ink-body">Deleting your account is permanent. Download your data first and cancel or complete upcoming consultations. Administrator accounts cannot be deleted through self-service.</p>
          <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-brand px-4 py-2 font-semibold text-brand hover:bg-cream">Delete account</button>
        </section>
      </div>
      <Modal open={open} onClose={close} title="Delete your account" panelClassName="overflow-y-auto">
        <form onSubmit={remove} className="space-y-4 p-6 text-sm text-ink-body">
          <p>Your documents, notifications, push subscriptions, and verification/reset tokens will be erased. Your profile will be anonymized and review comments removed; ratings are retained.</p>
          <p>Payments, consultations, messages, and deliverables are retained for up to 3 years for legal compliance. Deletion does not erase personal information you shared in those retained records.</p>
          <label className="block font-medium">Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-line p-2" /></label>
          <label className="block font-medium">Type DELETE to confirm<input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 block w-full rounded-lg border border-line p-2" /></label>
          {error && <p role="alert" className="text-brand">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" disabled={deleting} onClick={close} className="rounded-lg bg-cream-muted px-4 py-2">Cancel</button>
            <button type="submit" disabled={confirmation !== 'DELETE' || !password || deleting} className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50">{deleting ? 'Deleting...' : 'Permanently delete account'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
