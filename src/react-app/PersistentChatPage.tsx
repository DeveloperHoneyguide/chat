"use client"

import React, { useState, useCallback, useEffect } from 'react';
import { Chat } from '@/components/ui/chat/chat';
import { ChatSidebar } from '@/components/ui/chat/chat-sidebar';
import { Message } from '@/components/ui/chat/chat-message';
import { useChatPersistence } from '@/hooks/use-chat-persistence';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MessageSquare } from 'lucide-react';

interface ChatMessage extends Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export default function PersistentChatPage() {
  const { logout } = useAuth();
  const {
    chats,
    currentChat,
    messages: persistedMessages,
    user,
    loading,
    error,
    loadChat,
    createNewChat,
    sendMessage,
    renameChat,
    deleteChat,
    setMessages: setPersistedMessages,
    setError
  } = useChatPersistence();

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Convert persisted messages to local format
  useEffect(() => {
    const converted = persistedMessages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: new Date(msg.created_at)
    }));
    setLocalMessages(converted);
  }, [persistedMessages]);

  const handleSelectChat = useCallback(async (chatId: string) => {
    await loadChat(chatId);
  }, [loadChat]);

  const handleNewChat = useCallback(async () => {
    const newChat = await createNewChat();
    if (newChat) {
      setInput('');
      setLocalMessages([]);
    }
  }, [createNewChat]);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    if (confirm('Are you sure you want to delete this chat?')) {
      await deleteChat(chatId);
    }
  }, [deleteChat]);

  const sendMessageToAI = useCallback(async (messageText: string, currentMessages: ChatMessage[]) => {
    if (!currentChat) {
      // Create new chat if none exists
      const newChat = await createNewChat();
      if (!newChat) return;
    }

    const chatId = currentChat?.id;
    if (!chatId) return;

    console.log('PersistentChatPage: Starting streaming with persistence');

    const response = await sendMessage(chatId, messageText, true);
    if (!response) return;

    if (!response.ok) {
      console.error('PersistentChatPage: API response error', response.status);
      throw new Error('Failed to get response');
    }

    console.log('PersistentChatPage: Stream response received');

    // Create assistant message with typing indicator
    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    };

    // Add to local messages
    setLocalMessages(prev => [...prev, assistantMessage]);

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    // Function to remove cursor and finalize message
    const finalizeMessage = () => {
      setLocalMessages(prev => prev.map(msg => 
        msg.id === assistantMessage.id 
          ? { ...msg, content: fullContent }
          : msg
      ));
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.done) {
                console.log('PersistentChatPage: Stream completed');
                finalizeMessage();
                return;
              }

              if (data.error) {
                console.error('PersistentChatPage: Stream error:', data.error);
                throw new Error(data.error);
              }

              if (data.content) {
                fullContent += data.content;
                setLocalMessages(prev => prev.map(msg => 
                  msg.id === assistantMessage.id 
                    ? { ...msg, content: fullContent + '|' }
                    : msg
                ));
              }
            } catch (e) {
              console.warn('PersistentChatPage: Failed to parse SSE data:', line);
            }
          }
        }
      }
    } catch (error) {
      console.error('PersistentChatPage: Stream reading error:', error);
      finalizeMessage();
      throw error;
    }
  }, [currentChat, createNewChat, sendMessage]);

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isGenerating) return;

    const messageText = input.trim();
    setInput('');
    setIsGenerating(true);
    setError(null);

    // If this is the first message, open sidebar
    if (localMessages.length === 0) {
      setSidebarOpen(true);
    }

    try {
      // Add user message to local state immediately
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: messageText,
        createdAt: new Date(),
      };

      setLocalMessages(prev => [...prev, userMessage]);

      // Send to AI
      await sendMessageToAI(messageText, [...localMessages, userMessage]);

      // Reload the chat to get the persisted messages
      if (currentChat) {
        await loadChat(currentChat.id);
      }

    } catch (error) {
      console.error('PersistentChatPage: Error sending message:', error);
      setError(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsGenerating(false);
    }
  }, [input, isGenerating, localMessages, sendMessageToAI, currentChat, loadChat, setError]);

  // Show loading state
  if (loading && !currentChat) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your chats...</p>
        </div>
      </div>
    );
  }

  // Show authentication error
  if (error && error.includes('Authentication required')) {
    return (
      <div className="flex items-center justify-center h-screen p-4">
        <div className="text-center max-w-md">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground mb-4">
            Please configure Cloudflare Access or set development headers to use the chat persistence features.
          </p>
          <Alert>
            <AlertDescription>
              For development, make sure the worker can read authentication headers. 
              See DATABASE_SETUP.md for configuration instructions.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {sidebarOpen && (
        <ChatSidebar
          chats={chats}
          currentChatId={currentChat?.id}
          user={user || undefined}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onRenameChat={renameChat}
          onLogout={logout}
          loading={loading}
        />
      )}
      
      <div className="flex-1 flex flex-col">
        {/* Header - only show when there are messages */}
        {localMessages.length > 0 && (
          <div className="border-b p-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              <h1 className="font-semibold">
                {currentChat?.title || 'Chat'}
              </h1>
            </div>
            
            <Button onClick={handleNewChat} size="sm">
              New Chat
            </Button>
          </div>
        )}

        {/* Error Display */}
        {error && !error.includes('Authentication required') && (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Chat Interface */}
        {localMessages.length > 0 ? (
          <div className="flex-1">
            <Chat
              messages={localMessages}
              input={input}
              handleInputChange={setInput}
              handleSubmit={(e) => {
                e?.preventDefault?.();
                handleSendMessage();
              }}
              isGenerating={isGenerating}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl text-center">
              <MessageSquare className="h-16 w-16 mx-auto mb-6 text-muted-foreground" />
              <h1 className="text-3xl font-bold mb-2">Welcome to Chat</h1>
              <p className="text-muted-foreground mb-8 text-lg">
                Ask me anything to get started
              </p>
              
              {/* Centered Input */}
              <div className="w-full">
                <div className="relative">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Message Chat..."
                    className="w-full min-h-[60px] px-4 py-4 pr-16 rounded-3xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-base"
                    disabled={isGenerating}
                    rows={1}
                    style={{ maxHeight: '200px' }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!input.trim() || isGenerating}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  </button>
                </div>
                
                {/* Optional: Add some example prompts */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl mx-auto">
                  <button
                    onClick={() => setInput("Explain quantum computing")}
                    className="p-3 text-left rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                  >
                    <div className="font-medium">Explain quantum computing</div>
                    <div className="text-muted-foreground text-xs">Simple explanation</div>
                  </button>
                  <button
                    onClick={() => setInput("Write a Python function")}
                    className="p-3 text-left rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                  >
                    <div className="font-medium">Write a Python function</div>
                    <div className="text-muted-foreground text-xs">Code help</div>
                  </button>
                  <button
                    onClick={() => setInput("Plan a weekend trip")}
                    className="p-3 text-left rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                  >
                    <div className="font-medium">Plan a weekend trip</div>
                    <div className="text-muted-foreground text-xs">Travel planning</div>
                  </button>
                  <button
                    onClick={() => setInput("Creative writing prompt")}
                    className="p-3 text-left rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
                  >
                    <div className="font-medium">Creative writing prompt</div>
                    <div className="text-muted-foreground text-xs">Get inspired</div>
                  </button>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground mt-6">
                Press Enter to send, Shift + Enter for new line
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}