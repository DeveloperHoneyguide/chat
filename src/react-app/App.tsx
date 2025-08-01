// src/App.tsx

import React, { useState } from 'react';
import { useAuth } from './hooks/use-auth';
import { LoginForm } from './components/ui/auth/login-form';
import { Header } from './components/ui/header';
import { Footer } from './components/ui/footer';
import { ThemeProvider } from './contexts/theme-context';
import AuthenticatedChatPage from "./AuthenticatedChatPage";
import SimpleChat from "./SimpleChat";
import { Loader2 } from 'lucide-react';

function App() {
  const { user, loading, error, login, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <ThemeProvider>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  // Show login form if login is requested
  if (showLogin && !user) {
    return (
      <ThemeProvider>
        <div className="min-h-screen flex flex-col">
          <Header onLoginClick={() => setShowLogin(false)} />
          <div className="flex-1 flex items-center justify-center">
            <LoginForm 
              onLogin={async () => {
                await login();
                setShowLogin(false);
              }}
              loading={loading}
              error={error}
              onCancel={() => setShowLogin(false)}
            />
          </div>
          <Footer />
        </div>
      </ThemeProvider>
    );
  }

  // Main app layout with header and footer - always visible
  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col">
        <Header 
          onLoginClick={() => setShowLogin(true)}
          user={user}
          onLogout={logout}
        />
        
        <main className="flex-1 overflow-hidden">
          {user ? (
            <AuthenticatedChatPage 
              userId={user.uid || user.email || ''}
              user={user}
            />
          ) : (
            <SimpleChat />
          )}
        </main>
        
        <Footer />
      </div>
    </ThemeProvider>
  );
}

export default App;
