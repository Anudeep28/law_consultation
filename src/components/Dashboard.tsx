import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import * as m from 'motion/react-m';
import { AnimatePresence } from 'motion/react';
import { useReducedMotion } from './ui/useReducedMotion';
import { NavButton } from './ui/MotionPrimitives';
import { useMotionReady } from './ui/MotionProvider';
import { useAuthStore } from '../stores/authStore';
import { useDocumentStore } from '../stores/documentStore';
import { LoadingFallback } from './ui/LoadingFallback';
import { PhoneVerification } from './PhoneVerification';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { NotificationBell } from './NotificationBell';
import { PolicyModal } from './PolicyModal';
import { Modal } from './ui/Modal';
import { policies, policyTitles } from '../data/policies';
import { getSocket, disconnectSocket } from '../services/socket';
import { UserCircle, FileText, CreditCard, LogOut, Plus, LayoutTemplate, FilePlus, Menu, MessageSquareText, MessagesSquare, ShieldCheck, Users, X } from 'lucide-react';

const DocumentEditor = lazy(() => import('./DocumentEditor').then(module => ({ default: module.DocumentEditor })));
const DocumentList = lazy(() => import('./DocumentList').then(module => ({ default: module.DocumentList })));
const AccountSettings = lazy(() => import('./AccountSettings').then(module => ({ default: module.AccountSettings })));
const SubscriptionView = lazy(() => import('./SubscriptionView').then(module => ({ default: module.SubscriptionView })));
const ConsultationsView = lazy(() => import('./ConsultationsView').then(module => ({ default: module.ConsultationsView })));
const LawyerConsultationsView = lazy(() => import('./LawyerConsultationsView').then(module => ({ default: module.LawyerConsultationsView })));
const LawyerProfileView = lazy(() => import('./LawyerProfileView').then(module => ({ default: module.LawyerProfileView })));
const AdminLawyerReviewView = lazy(() => import('./AdminLawyerReviewView').then(module => ({ default: module.AdminLawyerReviewView })));
const AdminUsersView = lazy(() => import('./AdminUsersView').then(module => ({ default: module.AdminUsersView })));
const AdminReviewsView = lazy(() => import('./AdminReviewsView').then(module => ({ default: module.AdminReviewsView })));
const AdminPaymentsView = lazy(() => import('./AdminPaymentsView').then(module => ({ default: module.AdminPaymentsView })));

export const Dashboard: React.FC = () => {
  const reduced = useReducedMotion();
  const motionReady = useMotionReady();
  const { user, logout } = useAuthStore();
  const [activeView, setActiveView] = useState<'editor' | 'documents' | 'consultations' | 'subscription' | 'profile' | 'admin' | 'admin-users' | 'admin-reviews' | 'admin-payments' | 'account'>(user?.role === 'admin' ? 'admin' : user?.role === 'lawyer' ? 'profile' : 'consultations');
  const presenceKey = useRef(activeView);
  if (!motionReady) presenceKey.current = activeView;
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [openTemplateSelector, setOpenTemplateSelector] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [activePolicy, setActivePolicy] = useState<keyof typeof policies | null>(null);
  const { documents, createDocument, setCurrentDocument, loadDocuments, clearDocuments } = useDocumentStore();

  const userId = user?.id;

  useEffect(() => {
    if (user?.role === 'lawyer') void loadDocuments();
  }, [loadDocuments, user?.role]);

  useEffect(() => {
    if (userId) {
      getSocket();
    }
    return () => {
      disconnectSocket();
    };
  }, [userId]);

  useEffect(() => setIsMobileNavOpen(false), [activeView]);

  const handleNewBlankDocument = async () => {
    setOpenTemplateSelector(false);
    const document = await createDocument('Untitled Document');
    setShowNewDocModal(false);
    setActiveView(document ? 'editor' : 'subscription');
  };

  const handleNewFromTemplate = () => {
    const expiry = user?.subscriptionExpiry ? new Date(user.subscriptionExpiry).getTime() : 0;
    const hasTimedAccess = (user?.subscriptionPlan === 'trial' || user?.subscriptionPlan === 'monthly') && expiry > Date.now();
    if (!hasTimedAccess && !user?.documentCredits) {
      setShowNewDocModal(false);
      setActiveView('subscription');
      return;
    }
    setShowNewDocModal(false);
    setOpenTemplateSelector(true);
    setActiveView('editor');
  };

  const handleNewDocument = () => {
    setShowNewDocModal(true);
  };

  const handleEditDocument = (document: any) => {
    setOpenTemplateSelector(false);
    setCurrentDocument({
      ...document,
      createdAt: new Date(document.createdAt),
      updatedAt: new Date(document.updatedAt),
    });
    setActiveView('editor');
  };

  const handleLogout = () => {
    clearDocuments();
    logout();
  };

  const getSubscriptionStatusColor = () => {
    if (!user) return 'text-gray-500';
    const isExpired = user.subscriptionExpiry && new Date(user.subscriptionExpiry).getTime() <= Date.now();
    if (isExpired && user.subscriptionPlan !== 'single') return 'text-red-600';
    switch (user.subscriptionStatus) {
      case 'active':
        return 'text-green-700';
      case 'trial':
        return 'text-warning-ink';
      case 'expired':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  const getSubscriptionStatusText = () => {
    if (!user) return 'Unknown';
    const isExpired = user.subscriptionExpiry && new Date(user.subscriptionExpiry).getTime() <= Date.now();
    if (isExpired && user.subscriptionPlan !== 'single') return 'Expired';
    switch (user.subscriptionStatus) {
      case 'active':
        return 'Active';
      case 'trial':
        const daysLeft = user.subscriptionExpiry
          ? Math.ceil((new Date(user.subscriptionExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;
        return `Trial (${daysLeft} days left)`;
      case 'expired':
        return 'Expired';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="flex h-dvh min-h-0 bg-cream">
      {isMobileNavOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setIsMobileNavOpen(false)} />}
      {/* Sidebar */}
      <div className={`app-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line transition-transform lg:static lg:translate-x-0 ${isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-start justify-between p-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">Law Writer</h1>
            <p className="text-sm text-ink-faint mt-1">Professional Legal Documents</p>
          </div>
          <button type="button" aria-label="Close navigation" className="rounded-lg p-2 text-ink-muted lg:hidden" onClick={() => setIsMobileNavOpen(false)}><X className="h-5 w-5" /></button>
        </div>

        <nav className="mt-6 flex-1">
          <div className="px-4 space-y-2">
            {user?.role === 'admin' && <NavButton onClick={() => setActiveView('admin-payments')} className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeView === 'admin-payments' ? 'bg-warning-bg text-brand' : 'text-ink-muted hover:bg-cream'}`}><CreditCard className="w-5 h-5" /><span>Payments &amp; Refunds</span></NavButton>}
            <NavButton onClick={() => setActiveView('account')} className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeView === 'account' ? 'bg-warning-bg text-brand' : 'text-ink-muted hover:bg-cream'}`}><UserCircle className="w-5 h-5" /><span>Account &amp; Privacy</span></NavButton>
            {user?.role === 'admin' && <><NavButton onClick={() => setActiveView('admin')} className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeView === 'admin' ? 'bg-warning-bg text-brand' : 'text-ink-muted hover:bg-cream'}`}><ShieldCheck className="w-5 h-5" /><span>Lawyer Applications</span></NavButton><NavButton onClick={() => setActiveView('admin-users')} className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeView === 'admin-users' ? 'bg-warning-bg text-brand' : 'text-ink-muted hover:bg-cream'}`}><Users className="w-5 h-5" /><span>User Management</span></NavButton><NavButton onClick={() => setActiveView('admin-reviews')} className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeView === 'admin-reviews' ? 'bg-warning-bg text-brand' : 'text-ink-muted hover:bg-cream'}`}><MessageSquareText className="w-5 h-5" /><span>Review Moderation</span></NavButton></>}
            {user?.role === 'lawyer' && <>
            <NavButton onClick={() => setActiveView('profile')} className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeView === 'profile' ? 'bg-warning-bg text-brand' : 'text-ink-muted hover:bg-cream'}`}><UserCircle className="w-5 h-5" /><span>Professional Profile</span></NavButton>
            <NavButton
              onClick={() => setActiveView('editor')}
              className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeView === 'editor'
                  ? 'bg-warning-bg text-brand'
                  : 'text-ink-muted hover:bg-cream'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span>Document Editor</span>
            </NavButton>

            <NavButton
              onClick={() => setActiveView('documents')}
              className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeView === 'documents'
                  ? 'bg-warning-bg text-brand'
                  : 'text-ink-muted hover:bg-cream'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span>My Documents</span>
              {documents.length > 0 && (
                <span className="ml-auto bg-accent text-brand-darker text-xs px-2 py-1 rounded-full font-semibold">
                  {documents.length}
                </span>
              )}
            </NavButton>
            </>}

            {user?.role !== 'admin' && <NavButton
              onClick={() => setActiveView('consultations')}
              className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeView === 'consultations'
                  ? 'bg-warning-bg text-brand'
                  : 'text-ink-muted hover:bg-cream'
              }`}
            >
              <MessagesSquare className="w-5 h-5" />
              <span>{user?.role === 'lawyer' ? 'Client Consultations' : 'Consult a Lawyer'}</span>
            </NavButton>}

            {user?.role === 'lawyer' && <NavButton
              onClick={() => setActiveView('subscription')}
              className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeView === 'subscription'
                  ? 'bg-warning-bg text-brand'
                  : 'text-ink-muted hover:bg-cream'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              <span>Subscription</span>
            </NavButton>}
          </div>
        </nav>

        <div className="p-4 border-t border-line">
          <div className="flex items-center space-x-3 mb-3">
            <UserCircle className="w-8 h-8 text-ink-weakest" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">
                {user?.name}
              </p>
              <p className={`text-xs ${user?.role === 'lawyer' ? getSubscriptionStatusColor() : 'text-ink-faint'}`}>
                {user?.role === 'lawyer' ? getSubscriptionStatusText() : user?.role === 'admin' ? 'Administrator' : 'Client account'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm text-brand-darker bg-cream-muted rounded-lg hover:bg-cream-hover transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="app-topbar shrink-0 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <button type="button" aria-label="Open navigation" className="shrink-0 rounded-lg border border-line p-2 text-brand lg:hidden" onClick={() => setIsMobileNavOpen(true)}><Menu className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-ink sm:text-xl">
                {activeView === 'account' && 'Account & Privacy'}
                {activeView === 'editor' && 'Document Editor'}
                {activeView === 'documents' && 'My Documents'}
                {activeView === 'consultations' && 'Lawyer Consultations'}
                {activeView === 'subscription' && 'Subscription Management'}
                {activeView === 'profile' && 'Professional Profile'}
                {activeView === 'admin' && 'Lawyer Applications'}
                {activeView === 'admin-users' && 'User Management'}
                {activeView === 'admin-reviews' && 'Review Moderation'}
                {activeView === 'admin-payments' && 'Payments & Refunds'}
              </h2>
              <p className="mt-1 hidden text-sm text-ink-muted sm:block">
                {activeView === 'account' && 'Download your data and manage your account'}
                {activeView === 'editor' && 'Create and edit legal documents with AI-powered transcription'}
                {activeView === 'documents' && `You have ${documents.length} document${documents.length !== 1 ? 's' : ''}`}
                {activeView === 'consultations' && (user?.role === 'lawyer' ? 'Manage scheduled client sessions and active chats' : 'Book a private 10-minute session with a verified lawyer')}
                {activeView === 'subscription' && 'Manage your subscription and billing'}
                {activeView === 'profile' && 'Complete the details clients will see after approval'}
                {activeView === 'admin' && 'Verify lawyer credentials before publishing profiles'}
                {activeView === 'admin-users' && 'Manage client and lawyer account access'}
                {activeView === 'admin-reviews' && 'Moderate client reviews and ratings'}
              </p>
            </div>
            
            {activeView === 'documents' && (
              <button
                aria-label="New Document"
                onClick={handleNewDocument}
                className="flex items-center space-x-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Document</span>
              </button>
            )}
            {activeView === 'editor' && (
              <button
                onClick={handleNewDocument}
                className="flex items-center space-x-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark transition"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Document</span>
              </button>
            )}
            <NotificationBell />
          </div>
        </div>

        <PhoneVerification />
        <EmailVerificationBanner />

        {/* Content Area */}
      <AnimatePresence key={presenceKey.current} mode="wait" initial={false}>
        <m.div key={activeView} initial={reduced || !motionReady ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={motionReady ? { opacity: 0, y: reduced ? 0 : -6 } : undefined} transition={{ duration: reduced ? 0 : 0.18 }} className="view-transition min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<LoadingFallback />}>
          {activeView === 'account' && <AccountSettings />}
          {activeView === 'editor' && <DocumentEditor openTemplateSelector={openTemplateSelector} onTemplateSelectorOpened={() => setOpenTemplateSelector(false)} />}
          {activeView === 'documents' && <DocumentList onNewDocument={handleNewDocument} onEditDocument={handleEditDocument} />}
          {activeView === 'consultations' && (user?.role === 'lawyer' ? <LawyerConsultationsView onOpenDocument={(document) => { void loadDocuments(); handleEditDocument(document); }} /> : <ConsultationsView />)}
          {activeView === 'subscription' && <SubscriptionView />}
          {activeView === 'profile' && <LawyerProfileView />}
          {activeView === 'admin' && <AdminLawyerReviewView />}
          {activeView === 'admin-users' && <AdminUsersView />}
          {activeView === 'admin-reviews' && <AdminReviewsView />}
          {activeView === 'admin-payments' && <AdminPaymentsView />}
          </Suspense>
        </m.div>
        </AnimatePresence>

        <footer className="hidden shrink-0 flex-col gap-2 border-t border-line bg-white px-6 py-3 text-xs text-ink-faint sm:flex">
          <div className="flex items-center justify-between">
            <span>Built by Eneru 2026</span>
            <span>Powered by ElevenLabs and DeepSeek</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Need help?{' '}
              <a href={`mailto:${import.meta.env.REACT_APP_SUPPORT_EMAIL || 'support@consultwithlawyer.in'}`} className="text-brand hover:underline">
                {import.meta.env.REACT_APP_SUPPORT_EMAIL || 'support@consultwithlawyer.in'}
              </a>
            </span>
            <div className="flex flex-wrap gap-4">
              {(['terms', 'privacy', 'refunds', 'disclaimer'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActivePolicy(key)}
                  className="text-ink-muted hover:text-brand hover:underline"
                >
                  {policyTitles[key]}
                </button>
              ))}
            </div>
          </div>
        </footer>

        {activePolicy && (
          <PolicyModal
            title={policyTitles[activePolicy]}
            content={policies[activePolicy]}
            onClose={() => setActivePolicy(null)}
          />
        )}
      </div>

      {/* New Document Modal */}
      {showNewDocModal && (
        <Modal open onClose={() => setShowNewDocModal(false)} title="Create New Document" subtitle="Start from scratch or pick a template" maxWidth="sm">
          <div className="p-5 sm:p-6">
            <div className="space-y-3">
              <button
                onClick={handleNewBlankDocument}
                className="w-full flex items-center space-x-4 p-4 border-2 border-line rounded-xl hover:border-accent-dark hover:bg-cream transition text-left"
              >
                <FilePlus className="w-8 h-8 text-ink-faint" />
                <div>
                  <p className="font-semibold text-ink">Blank Document</p>
                  <p className="text-xs text-ink-faint">Start with an empty document</p>
                </div>
              </button>
              <button
                onClick={handleNewFromTemplate}
                className="w-full flex items-center space-x-4 p-4 border-2 border-line rounded-xl hover:border-accent-dark hover:bg-cream transition text-left"
              >
                <LayoutTemplate className="w-8 h-8 text-accent-dark" />
                <div>
                  <p className="font-semibold text-ink">From Template</p>
                  <p className="text-xs text-ink-faint">Choose from legal document templates</p>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowNewDocModal(false)}
              className="mt-4 w-full text-sm text-ink-faint hover:text-ink-muted"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};
