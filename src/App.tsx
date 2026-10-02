import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { Dashboard } from './components/Dashboard';
import { verifyEmailToken } from './services/notificationService';

function App() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [emailVerifyMessage, setEmailVerifyMessage] = useState('');
  const { isAuthenticated, refreshUser } = useAuthStore();

  useEffect(() => {
    void refreshUser().finally(() => setAuthReady(true));
  }, [refreshUser]);

  useEffect(() => {
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

  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center bg-[#fffaf0] text-[#8c6b54]">Loading...</div>;
  }

  return (
    <>
      {emailVerifyMessage && (
        <div className="bg-[#fff4d6] px-4 py-2 text-center text-sm font-medium text-[#765116]">
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
        <Dashboard />
      )}
    </>
  );
}

export default App;
