import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useDocumentStore } from '../stores/documentStore';
import { DocumentEditor } from './DocumentEditor';
import { DocumentList } from './DocumentList';
import { SubscriptionView } from './SubscriptionView';
import { ConsultationsView } from './ConsultationsView';
import { LawyerConsultationsView } from './LawyerConsultationsView';
import { LawyerProfileView } from './LawyerProfileView';
import { AdminLawyerReviewView } from './AdminLawyerReviewView';
import { PhoneVerification } from './PhoneVerification';
import { UserCircle, FileText, CreditCard, LogOut, Plus, LayoutTemplate, FilePlus, Menu, MessagesSquare, ShieldCheck, X } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuthStore();
  const [activeView, setActiveView] = useState<'editor' | 'documents' | 'consultations' | 'subscription' | 'profile' | 'admin'>(user?.role === 'admin' ? 'admin' : user?.role === 'lawyer' ? 'profile' : 'consultations');
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const { documents, createDocument, setCurrentDocument, loadDocuments, clearDocuments } = useDocumentStore();

  useEffect(() => {
    if (user?.role === 'lawyer') void loadDocuments();
  }, [loadDocuments, user?.role]);

  useEffect(() => setIsMobileNavOpen(false), [activeView]);

  const handleNewBlankDocument = async () => {
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
    setActiveView('editor');
    // Signal DocumentEditor to open template selector via a small delay
    setTimeout(() => {
      (window as any).__openTemplateSelector?.();
    }, 100);
  };

  const handleNewDocument = () => {
    setShowNewDocModal(true);
  };

  const handleEditDocument = (document: any) => {
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
        return 'text-green-600';
      case 'trial':
        return 'text-yellow-600';
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
    <div className="flex h-dvh min-h-0 bg-[#fffaf0]">
      {isMobileNavOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setIsMobileNavOpen(false)} />}
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#eadbc1] bg-white shadow-lg transition-transform lg:static lg:translate-x-0 ${isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-start justify-between p-6">
          <div>
            <h1 className="text-2xl font-bold text-[#32151b]">Law Writer</h1>
            <p className="text-sm text-[#8c6b54] mt-1">Professional Legal Documents</p>
          </div>
          <button type="button" aria-label="Close navigation" className="rounded-lg p-2 text-[#6f5a49] lg:hidden" onClick={() => setIsMobileNavOpen(false)}><X className="h-5 w-5" /></button>
        </div>

        <nav className="mt-6 flex-1">
          <div className="px-4 space-y-2">
            {user?.role === 'admin' && <button onClick={() => setActiveView('admin')} className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeView === 'admin' ? 'bg-[#fff4d6] text-[#701f2f]' : 'text-[#6f5a49] hover:bg-[#fffaf0]'}`}><ShieldCheck className="w-5 h-5" /><span>Lawyer Applications</span></button>}
            {user?.role === 'lawyer' && <>
            <button onClick={() => setActiveView('profile')} className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeView === 'profile' ? 'bg-[#fff4d6] text-[#701f2f]' : 'text-[#6f5a49] hover:bg-[#fffaf0]'}`}><UserCircle className="w-5 h-5" /><span>Professional Profile</span></button>
            <button
              onClick={() => setActiveView('editor')}
              className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeView === 'editor'
                  ? 'bg-[#fff4d6] text-[#701f2f]'
                  : 'text-[#6f5a49] hover:bg-[#fffaf0]'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span>Document Editor</span>
            </button>

            <button
              onClick={() => setActiveView('documents')}
              className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeView === 'documents'
                  ? 'bg-[#fff4d6] text-[#701f2f]'
                  : 'text-[#6f5a49] hover:bg-[#fffaf0]'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span>My Documents</span>
              {documents.length > 0 && (
                <span className="ml-auto bg-[#f4c95d] text-[#3f1420] text-xs px-2 py-1 rounded-full font-semibold">
                  {documents.length}
                </span>
              )}
            </button>
            </>}

            {user?.role !== 'admin' && <button
              onClick={() => setActiveView('consultations')}
              className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeView === 'consultations'
                  ? 'bg-[#fff4d6] text-[#701f2f]'
                  : 'text-[#6f5a49] hover:bg-[#fffaf0]'
              }`}
            >
              <MessagesSquare className="w-5 h-5" />
              <span>{user?.role === 'lawyer' ? 'Client Consultations' : 'Consult a Lawyer'}</span>
            </button>}

            {user?.role === 'lawyer' && <button
              onClick={() => setActiveView('subscription')}
              className={`w-full flex items-center space-x-3 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeView === 'subscription'
                  ? 'bg-[#fff4d6] text-[#701f2f]'
                  : 'text-[#6f5a49] hover:bg-[#fffaf0]'
              }`}
            >
              <CreditCard className="w-5 h-5" />
              <span>Subscription</span>
            </button>}
          </div>
        </nav>

        <div className="p-4 border-t border-[#eadbc1]">
          <div className="flex items-center space-x-3 mb-3">
            <UserCircle className="w-8 h-8 text-[#a89580]" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#32151b] truncate">
                {user?.name}
              </p>
              <p className={`text-xs ${user?.role === 'lawyer' ? getSubscriptionStatusColor() : 'text-[#8c6b54]'}`}>
                {user?.role === 'lawyer' ? getSubscriptionStatusText() : user?.role === 'admin' ? 'Administrator' : 'Client account'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm text-[#3f1420] bg-[#f8f1e5] rounded-lg hover:bg-[#f2e4cc] transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-[#eadbc1] bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <button type="button" aria-label="Open navigation" className="shrink-0 rounded-lg border border-[#eadbc1] p-2 text-[#701f2f] lg:hidden" onClick={() => setIsMobileNavOpen(true)}><Menu className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-[#32151b] sm:text-xl">
                {activeView === 'editor' && 'Document Editor'}
                {activeView === 'documents' && 'My Documents'}
                {activeView === 'consultations' && 'Lawyer Consultations'}
                {activeView === 'subscription' && 'Subscription Management'}
                {activeView === 'profile' && 'Professional Profile'}
                {activeView === 'admin' && 'Lawyer Applications'}
              </h2>
              <p className="mt-1 hidden text-sm text-[#6f5a49] sm:block">
                {activeView === 'editor' && 'Create and edit legal documents with AI-powered transcription'}
                {activeView === 'documents' && `You have ${documents.length} document${documents.length !== 1 ? 's' : ''}`}
                {activeView === 'consultations' && (user?.role === 'lawyer' ? 'Manage scheduled client sessions and active chats' : 'Book a private 10-minute session with a verified lawyer')}
                {activeView === 'subscription' && 'Manage your subscription and billing'}
                {activeView === 'profile' && 'Complete the details clients will see after approval'}
                {activeView === 'admin' && 'Verify lawyer credentials before publishing profiles'}
              </p>
            </div>
            
            {activeView === 'documents' && (
              <button
                onClick={handleNewDocument}
                className="flex items-center space-x-2 px-4 py-2 bg-[#701f2f] text-white rounded-lg hover:bg-[#541522] transition"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Document</span>
              </button>
            )}
            {activeView === 'editor' && (
              <button
                onClick={handleNewDocument}
                className="flex items-center space-x-2 px-4 py-2 bg-[#701f2f] text-white rounded-lg hover:bg-[#541522] transition"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Document</span>
              </button>
            )}
          </div>
        </div>

        <PhoneVerification />

        {/* Content Area */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {activeView === 'editor' && <DocumentEditor />}
          {activeView === 'documents' && <DocumentList onNewDocument={handleNewDocument} onEditDocument={handleEditDocument} />}
          {activeView === 'consultations' && (user?.role === 'lawyer' ? <LawyerConsultationsView onOpenDocument={(document) => { void loadDocuments(); handleEditDocument(document); }} /> : <ConsultationsView />)}
          {activeView === 'subscription' && <SubscriptionView />}
          {activeView === 'profile' && <LawyerProfileView />}
          {activeView === 'admin' && <AdminLawyerReviewView />}
        </div>

        <footer className="hidden shrink-0 items-center justify-between border-t border-[#eadbc1] bg-white px-6 py-3 text-xs text-[#8c6b54] sm:flex">
          <span>Built by Eneru 2026</span>
          <span>Powered by ElevenLabs and DeepSeek</span>
        </footer>
      </div>

      {/* New Document Modal */}
      {showNewDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#eadbc1] bg-white p-5 shadow-2xl sm:p-6">
            <h2 className="text-lg font-bold text-[#32151b] mb-1">Create New Document</h2>
            <p className="text-sm text-[#8c6b54] mb-5">Start from scratch or pick a template</p>
            <div className="space-y-3">
              <button
                onClick={handleNewBlankDocument}
                className="w-full flex items-center space-x-4 p-4 border-2 border-[#eadbc1] rounded-xl hover:border-[#b8862d] hover:bg-[#fffaf0] transition text-left"
              >
                <FilePlus className="w-8 h-8 text-[#8c6b54]" />
                <div>
                  <p className="font-semibold text-[#32151b]">Blank Document</p>
                  <p className="text-xs text-[#8c6b54]">Start with an empty document</p>
                </div>
              </button>
              <button
                onClick={handleNewFromTemplate}
                className="w-full flex items-center space-x-4 p-4 border-2 border-[#eadbc1] rounded-xl hover:border-[#b8862d] hover:bg-[#fffaf0] transition text-left"
              >
                <LayoutTemplate className="w-8 h-8 text-[#b8862d]" />
                <div>
                  <p className="font-semibold text-[#32151b]">From Template</p>
                  <p className="text-xs text-[#8c6b54]">Choose from legal document templates</p>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowNewDocModal(false)}
              className="mt-4 w-full text-sm text-[#8c6b54] hover:text-[#6f5a49]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
