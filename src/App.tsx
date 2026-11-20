import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ResetPassword } from './components/Auth/ResetPassword';
import { LoadingFallback } from './components/ui/LoadingFallback';
import { verifyEmailToken } from './services/notificationService';

const Dashboard = lazy(() => import('./components/Dashboard').then(module => ({ default: module.Dashboard })));

function App() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [emailVerifyMessage, setEmailVerifyMessage] = useState('');
  const [resetToken, setResetToken] = useState(() =>
    window.location.pathname === '/reset-password'
      ? new URLSearchParams(window.location.search).get('token') || ''
      : ''
  );
  const { isAuthenticated, refreshUser } = useAuthStore();

  useEffect(() => {
    void refreshUser().finally(() => setAuthReady(true));
  }, [refreshUser]);

  useEffect(() => {
    if (window.location.pathname !== '/verify-email') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      verifyEmailToken(token)
        .then(() => {
          setEmailVerifyMessage('Your email has been verified. You can now close this message.');
          void refreshUser();
          window.history.replaceState({}, '', window.location.pathname);
        })
        .catch(() => {
          setEmailVerifyMessage('This verification link is invalid or has expired.');
        });
    }
  }, [refreshUser]);

  const toggleAuthMode = () => {
    setIsLoginMode(!isLoginMode);
  };

  const clearResetToken = () => {
    window.history.replaceState({}, '', '/');
    setResetToken('');
  };

  if (resetToken) {
    return <ResetPassword token={resetToken} onDone={clearResetToken} />;
  }

  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center bg-cream text-ink-faint">Loading...</div>;
  }

  return (
    <>
      {emailVerifyMessage && (
        <div className="bg-warning-bg px-4 py-2 text-center text-sm font-medium text-warning-ink">
          {emailVerifyMessage}
        </div>
      )}
      {!isAuthenticated ? (
        isLoginMode ? (
          <Login onToggleMode={toggleAuthMode} />
        ) : (
          <Register onToggleMode={toggleAuthMode} />
        )
      ) : (
        <Suspense fallback={<LoadingFallback />}><Dashboard /></Suspense>
      )}
    </>
  );
}

export default App;
