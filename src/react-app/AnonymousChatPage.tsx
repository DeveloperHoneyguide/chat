"use client"

import React, { useState, useCallback, useEffect } from 'react';
import { Chat } from '@/components/ui/chat/chat';
import { ChatSidebar } from '@/components/ui/chat/chat-sidebar';
import { Message } from '@/components/ui/chat/chat-message';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MessageSquare } from 'lucide-react';
import {
  AnonymousChat,
  AnonymousMessage,
  createAnonymousChat,
  getAnonymousChats,
  getAnonymousMessages,
  addAnonymousMessage,
  updateAnonymousChatTitle,
  deleteAnonymousChat,
  generateChatTitle,
  getSessionId
} from '@/lib/anonymous-chat';

interface ChatMessage extends Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export default function AnonymousChatPage() {
  const { user } = useAuth();
  const [chats, setChats] = useState<AnonymousChat[]>([]);
  const [currentChat, setCurrentChat] = useState<AnonymousChat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load chats on component mount
  useEffect(() => {
    loadChats();
  }, []);

  // Load messages when current chat changes
  useEffect(() => {
    if (currentChat) {
      loadMessages(currentChat.id);
    } else {
      setMessages([]);
    }
  }, [currentChat]);

  const loadChats = async () => {
    try {
      setLoading(true);
      const loadedChats = await getAnonymousChats();
      setChats(loadedChats);
    } catch (error) {
      console.error('Error loading chats:', error);
      setError('Failed to load chats');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (chatId: string) => {
    try {
      const loadedMessages = await getAnonymousMessages(chatId);
      const convertedMessages = loadedMessages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt.toDate()
      }));
      setMessages(convertedMessages);
    } catch (error) {
      console.error('Error loading messages:', error);
      setError('Failed to load messages');
    }
  };

  const handleSelectChat = useCallback(async (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setCurrentChat(chat);
      setError(null);
    }
  }, [chats]);

  const handleNewChat = useCallback(async () => {
    try {
      const newChat = await createAnonymousChat('New Chat');
      setChats(prev => [newChat, ...prev]);
      setCurrentChat(newChat);
      setMessages([]);
      setInput('');
      setError(null);
    } catch (error) {
      console.error('Error creating new chat:', error);
      setError('Failed to create new chat');
    }
  }, []);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    if (confirm('Are you sure you want to delete this chat?')) {
      try {
        await deleteAnonymousChat(chatId);
        setChats(prev => prev.filter(c => c.id !== chatId));
        if (currentChat?.id === chatId) {
          setCurrentChat(null);
          setMessages([]);
        }
      } catch (error) {
        console.error('Error deleting chat:', error);
        setError('Failed to delete chat');
      }
    }
  }, [currentChat]);

  const handleRenameChat = useCallback(async (chatId: string, newTitle: string) => {
    try {
      await updateAnonymousChatTitle(chatId, newTitle);
      setChats(prev => prev.map(chat => 
        chat.id === chatId ? { ...chat, title: newTitle } : chat
      ));
      if (currentChat?.id === chatId) {
        setCurrentChat(prev => prev ? { ...prev, title: newTitle } : null);
      }
    } catch (error) {
      console.error('Error renaming chat:', error);
      setError('Failed to rename chat');
    }
  }, [currentChat]);

  const sendMessageToAI = useCallback(async (messageText: string, currentMessages: ChatMessage[]) => {
    if (!currentChat) return;

    try {
      // Build messages array for AI context
      const messagesForAI = currentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Make API call to legacy endpoint for anonymous chats
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messagesForAI
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      // Create assistant message with typing indicator
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

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
                  // Save final assistant message to Firestore
                  await addAnonymousMessage(currentChat.id, 'assistant', fullContent);
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: fullContent }
                      : msg
                  ));
                  return;
                }

                if (data.error) {
                  throw new Error(data.error);
                }

                if (data.content) {
                  fullContent += data.content;
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage.id 
                      ? { ...msg, content: fullContent + '|' }
                      : msg
                  ));
                }
              } catch (e) {
                console.warn('Failed to parse SSE data:', line);
              }
            }
          }
        }
      } catch (error) {
        console.error('Stream reading error:', error);
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage.id 
            ? { ...msg, content: fullContent }
            : msg
        ));
        throw error;
      }
    } catch (error) {
      console.error('Error sending message to AI:', error);
      throw error;
    }
  }, [currentChat]);

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isGenerating) return;

    const messageText = input.trim();
    setInput('');
    setIsGenerating(true);
    setError(null);

    // If this is the first message, open sidebar and create chat if needed
    if (messages.length === 0) {
      setSidebarOpen(true);
      
      if (!currentChat) {
        try {
          const newChat = await createAnonymousChat(generateChatTitle(messageText));
          setChats(prev => [newChat, ...prev]);
          setCurrentChat(newChat);
        } catch (error) {
          console.error('Error creating chat:', error);
          setError('Failed to create chat');
          setIsGenerating(false);
          return;
        }
      }
    }

    try {
      // Add user message to local state and Firestore
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: messageText,
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, userMessage]);

      // Save user message to Firestore
      if (currentChat) {
        await addAnonymousMessage(currentChat.id, 'user', messageText);
        
        // Update chat title if it's the first message
        if (messages.length === 0) {
          const newTitle = generateChatTitle(messageText);
          await updateAnonymousChatTitle(currentChat.id, newTitle);
          setChats(prev => prev.map(chat => 
            chat.id === currentChat.id ? { ...chat, title: newTitle } : chat
          ));
          setCurrentChat(prev => prev ? { ...prev, title: newTitle } : null);
        }
      }

      // Send to AI
      await sendMessageToAI(messageText, [...messages, userMessage]);

    } catch (error) {
      console.error('Error sending message:', error);
      setError(error instanceof Error ? error.message : 'Failed to send message');
    } finally {
      setIsGenerating(false);
    }
  }, [input, isGenerating, messages, currentChat, sendMessageToAI]);

  // Show loading state
  if (loading && chats.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your chats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      {sidebarOpen && (
        <ChatSidebar
          chats={chats.map(chat => ({
            id: chat.id,
            title: chat.title,
            created_at: chat.createdAt.toDate().toISOString(),
            updated_at: chat.updatedAt.toDate().toISOString(),
            user_id: getSessionId()
          }))}
          currentChatId={currentChat?.id}
          user={{ email: 'Anonymous User' }}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onRenameChat={handleRenameChat}
          onLogout={() => {}} // No logout for anonymous users
          loading={loading}
        />
      )}
      
      <div className="flex-1 flex flex-col">
        {/* Header - only show when there are messages */}
        {messages.length > 0 && (
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
        {error && (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Chat Interface */}
        {messages.length > 0 ? (
          <div className="flex-1">
            <Chat
              messages={messages}
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
                
                {/* Example prompts */}
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