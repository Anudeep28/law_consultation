import React, { useEffect, useState } from 'react';
import { Search, UserCheck, UserX } from 'lucide-react';
import { ApiError, apiRequest } from '../services/api';

interface AdminUser { id: string; name: string; email: string; role: 'client' | 'lawyer'; accountStatus: 'active' | 'suspended' | 'deactivated'; statusReason?: string; createdAt: string }

export const AdminUsersView: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => apiRequest<{ users: AdminUser[] }>('/api/admin/users').then((result) => setUsers(result.users)).catch(() => setError('Unable to load users.')).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);

  const setStatus = async (user: AdminUser, status: AdminUser['accountStatus']) => {
    const reason = reasons[user.id]?.trim() || '';
    if (status !== 'active' && reason.length < 10) { setError('Provide a reason of at least 10 characters.'); return; }
    setError('');
    try {
      const result = await apiRequest<{ user: AdminUser }>(`/api/admin/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
      setUsers((current) => current.map((item) => item.id === user.id ? result.user : item));
      setReasons((current) => ({ ...current, [user.id]: '' }));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to update this account.');
    }
  };

  const filtered = users.filter((user) => `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(query.toLowerCase()));
  if (loading) return <div className="flex h-full items-center justify-center text-gray-500">Loading users...</div>;
  return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-6xl">
    <h1 className="text-2xl font-bold text-[#32151b]">User management</h1><p className="text-sm text-[#6f5a49]">Suspend, deactivate, or reactivate client and lawyer accounts. Records are preserved.</p>
    <div className="relative mt-5"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users" className="w-full rounded-lg border border-[#eadbc1] py-2 pl-10 pr-3" /></div>
    {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5 space-y-3">{filtered.map((user) => <article key={user.id} className="rounded-xl border border-[#eadbc1] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold text-[#32151b]">{user.name}</h2><p className="text-sm text-gray-600">{user.email} · <span className="capitalize">{user.role}</span></p></div><span className="h-fit rounded-full bg-[#f8f1e5] px-3 py-1 text-xs font-semibold uppercase text-[#6f5a49]">{user.accountStatus}</span></div>
      {user.statusReason && <p className="mt-2 text-sm text-red-700">Reason: {user.statusReason}</p>}
      <label className="mt-3 block text-sm font-medium">Administrative reason<input aria-label={`Reason for ${user.name}`} value={reasons[user.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [user.id]: event.target.value }))} maxLength={500} className="mt-1 w-full rounded-lg border border-[#e6d8c2] px-3 py-2" /></label>
      <div className="mt-3 flex flex-wrap gap-2">{user.accountStatus !== 'suspended' && <button aria-label={`Suspend ${user.name}`} onClick={() => setStatus(user, 'suspended')} className="flex items-center gap-1 rounded-lg border border-amber-400 px-3 py-2 text-sm text-amber-800"><UserX className="h-4 w-4" />Suspend</button>}{user.accountStatus !== 'deactivated' && <button aria-label={`Deactivate ${user.name}`} onClick={() => setStatus(user, 'deactivated')} className="flex items-center gap-1 rounded-lg border border-red-400 px-3 py-2 text-sm text-red-700"><UserX className="h-4 w-4" />Deactivate</button>}{user.accountStatus !== 'active' && <button aria-label={`Reactivate ${user.name}`} onClick={() => setStatus(user, 'active')} className="flex items-center gap-1 rounded-lg bg-[#701f2f] px-3 py-2 text-sm text-white"><UserCheck className="h-4 w-4" />Reactivate</button>}</div>
    </article>)}</div>
  </div></div>;
};
