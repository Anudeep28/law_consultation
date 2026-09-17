import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { Dashboard } from './components/Dashboard';

function App() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const { isAuthenticated, refreshUser } = useAuthStore();

  useEffect(() => {
    void refreshUser().finally(() => setAuthReady(true));
  }, [refreshUser]);

  const toggleAuthMode = () => {
    setIsLoginMode(!isLoginMode);
  };

  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center bg-[#fffaf0] text-[#8c6b54]">Loading...</div>;
  }

  if (!isAuthenticated) {
    return isLoginMode ? (
      <Login onToggleMode={toggleAuthMode} />
    ) : (
      <Register onToggleMode={toggleAuthMode} />
    );
  }

  return <Dashboard />;
}

export default App;
