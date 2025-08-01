"use client"

import React, { useState, useCallback, useEffect } from 'react';
import { Chat } from './components/ui/chat/chat';
import { ChatSidebar } from './components/ui/chat/chat-sidebar';
import { Message } from './components/ui/chat/chat-message';
import { Button } from './components/ui/button';
import { Alert, AlertDescription } from './components/ui/alert';
import { Loader2, MessageSquare } from 'lucide-react';
import {
  UserChat,
  UserMessage,
  createUserChat,
  getUserChats,
  getUserMessages,
  addUserMessage,
  updateUserChatTitle,
  deleteUserChat,
  generateChatTitle
} from '../lib/user-chat';

interface ChatMessage extends Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

interface AuthenticatedChatPageProps {
  userId: string;
  user: { email?: string; displayName?: string };
}

export default function AuthenticatedChatPage({ userId, user }: AuthenticatedChatPageProps) {
  const [chats, setChats] = useState<UserChat[]>([]);
  const [currentChat, setCurrentChat] = useState<UserChat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load chats on component mount
  useEffect(() => {
    loadChats();
  }, [userId]);

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
      const loadedChats = await getUserChats(userId);
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
      const loadedMessages = await getUserMessages(chatId, userId);
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
      const newChat = await createUserChat(userId, 'New Chat');
      setChats(prev => [newChat, ...prev]);
      setCurrentChat(newChat);
      setMessages([]);
      setInput('');
      setError(null);
    } catch (error) {
      console.error('Error creating new chat:', error);
      setError('Failed to create new chat');
    }
  }, [userId]);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    if (confirm('Are you sure you want to delete this chat?')) {
      try {
        await deleteUserChat(chatId, userId);
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
  }, [currentChat, userId]);

  const handleRenameChat = useCallback(async (chatId: string, newTitle: string) => {
    try {
      await updateUserChatTitle(chatId, userId, newTitle);
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
  }, [currentChat, userId]);

  const sendMessageToAI = useCallback(async (messageText: string, currentMessages: ChatMessage[]) => {
    if (!currentChat) return;

    let assistantMessage: ChatMessage | null = null;

    try {
      // Build messages array for AI context
      const messagesForAI = currentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Make API call to legacy endpoint
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
        let errorMessage = `Server error (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If response isn't JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Create assistant message with typing indicator
      assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (!response.body) {
        throw new Error('No response received from server');
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
                  try {
                    await addUserMessage(currentChat.id, userId, 'assistant', fullContent);
                  } catch (saveError) {
                    console.error('Failed to save message to Firestore:', saveError);
                    // Continue anyway, user can still see the response
                  }
                  
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessage!.id 
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
                    msg.id === assistantMessage!.id 
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
        // Finalize the message content
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage!.id 
            ? { ...msg, content: fullContent }
            : msg
        ));
        throw error;
      }
    } catch (error) {
      console.error('Error sending message to AI:', error);
      
      // If we created an assistant message, replace it with an error message
      if (assistantMessage) {
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
        const errorContent = `❌ **Error**: ${errorMessage}\n\nPlease try again or contact support if this issue persists.`;
        
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage!.id 
            ? { 
                ...msg, 
                content: errorContent
              }
            : msg
        ));
        
        // Try to save the error message to Firestore so it persists
        try {
          await addUserMessage(currentChat.id, userId, 'assistant', errorContent);
        } catch (saveError) {
          console.error('Failed to save error message to Firestore:', saveError);
        }
      }
      
      throw error;
    }
  }, [currentChat, userId]);

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isGenerating) return;

    const messageText = input.trim();
    setInput('');
    setIsGenerating(true);
    setError(null);

    // If this is the first message and no chat exists, create one
    if (messages.length === 0 && !currentChat) {
      try {
        const newChat = await createUserChat(userId, generateChatTitle(messageText));
        setChats(prev => [newChat, ...prev]);
        setCurrentChat(newChat);
      } catch (error) {
        console.error('Error creating chat:', error);
        setError('Failed to create chat');
        setIsGenerating(false);
        return;
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
        await addUserMessage(currentChat.id, userId, 'user', messageText);
        
        // Update chat title if it's the first message
        if (messages.length === 0) {
          const newTitle = generateChatTitle(messageText);
          await updateUserChatTitle(currentChat.id, userId, newTitle);
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      
      // Only show the error alert if the error wasn't already displayed in the message
      if (!errorMessage.includes('API key not configured') && 
          !errorMessage.includes('Server error') && 
          !errorMessage.includes('No response received')) {
        setError(errorMessage);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [input, isGenerating, messages, currentChat, sendMessageToAI, userId]);

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
            user_id: userId
          }))}
          currentChatId={currentChat?.id}
          user={user}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onRenameChat={handleRenameChat}
          onLogout={() => {}} // Handled by parent
          loading={loading}
        />
      )}
      
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b p-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          
          <Button onClick={handleNewChat} variant="ghost" size="sm">
            New
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Chat Interface */}
        <div className="flex-1 flex flex-col">
          {messages.length > 0 || currentChat ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-6">
                <div className="max-w-3xl mx-auto space-y-6">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-6 py-3 ${
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isGenerating && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl px-6 py-3">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Input - At bottom when messages exist */}
              <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="p-4">
                  <div className="relative max-w-3xl mx-auto">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Ask AI"
                      className="w-full min-h-[52px] px-4 py-3 pr-12 rounded-2xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-base"
                      disabled={isGenerating}
                      rows={1}
                      style={{ maxHeight: '120px' }}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isGenerating}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Initial state - Input centered in middle of browser */
            <div className="flex-1 flex items-center justify-center px-4">
              <div className="w-full max-w-2xl">
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
                    placeholder="Ask AI"
                    className="w-full min-h-[60px] px-6 py-4 pr-14 rounded-3xl border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-lg shadow-sm"
                    disabled={isGenerating}
                    rows={1}
                    style={{ maxHeight: '140px' }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!input.trim() || isGenerating}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2.5 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}