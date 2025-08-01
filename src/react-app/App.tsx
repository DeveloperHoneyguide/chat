// src/App.tsx

import React from 'react';
import { useAuth } from './hooks/use-auth';
import { LoginForm } from './components/ui/auth/login-form';
import PersistentChatPage from "./PersistentChatPage";
import { Loader2 } from 'lucide-react';

function App() {
  const { user, loading, error, login } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!user) {
    return (
      <LoginForm 
        onLogin={login}
        loading={loading}
        error={error}
      />
    );
  }

  // Show chat interface if authenticated
  return <PersistentChatPage />;
}

export default App;
