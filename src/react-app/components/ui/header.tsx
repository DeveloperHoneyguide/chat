import React from 'react';
import { Button } from './button';
import { ThemeToggle } from './theme-toggle';
import { MessageSquare, User } from 'lucide-react';

interface HeaderProps {
  onLoginClick?: () => void;
  user?: { email?: string; displayName?: string } | null;
  onLogout?: () => void;
}

export function Header({ onLoginClick, user, onLogout }: HeaderProps) {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-12 items-center justify-between px-4">
        <div className="flex items-center space-x-2">
          <MessageSquare className="h-5 w-5" />
          <h1 className="font-semibold">Chat</h1>
        </div>
        
        <div className="flex items-center space-x-1">
          <ThemeToggle />
          {user ? (
            <Button variant="ghost" size="sm" onClick={onLogout}>
              Logout
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onLoginClick}>
              <User className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}