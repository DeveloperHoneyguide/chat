import React from 'react';

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-12 items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">
          © {currentYear} Chat AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}