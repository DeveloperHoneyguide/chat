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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
        {/* Header */}
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
              {currentChat?.title || 'Select a chat'}
            </h1>
          </div>
          
          {!currentChat && (
            <Button onClick={handleNewChat} size="sm">
              New Chat
            </Button>
          )}
        </div>

        {/* Error Display */}
        {error && !error.includes('Authentication required') && (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Chat Interface */}
        {currentChat ? (
          <div className="flex-1">
            <Chat
              messages={localMessages}
              input={input}
              onInputChange={setInput}
              onSendMessage={handleSendMessage}
              isGenerating={isGenerating}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">Welcome to Chat</h2>
              <p className="text-muted-foreground mb-4">
                Create a new chat or select an existing one to continue
              </p>
              <Button onClick={handleNewChat}>
                Start New Chat
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}