"use client"

import React, { useState, useCallback } from 'react';
import { Chat } from './components/ui/chat/chat';
import { Message } from './components/ui/chat/chat-message';
import { Button } from './components/ui/button';
import { Alert, AlertDescription } from './components/ui/alert';
import { MessageSquare } from 'lucide-react';

interface ChatMessage extends Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export default function SimpleChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessageToAI = useCallback(async (messageText: string, currentMessages: ChatMessage[]) => {
    let assistantMessage: ChatMessage | null = null;
    
    try {
      // Build messages array for AI context
      const messagesForAI = currentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Make API call to legacy endpoint for simple chats
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
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessage!.id 
            ? { 
                ...msg, 
                content: `❌ **Error**: ${errorMessage}\n\nPlease try again or contact support if the issue persists.`
              }
            : msg
        ));
      }
      
      throw error;
    }
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isGenerating) return;

    const messageText = input.trim();
    setInput('');
    setIsGenerating(true);
    setError(null);

    try {
      // Add user message to local state
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: messageText,
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, userMessage]);

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
  }, [input, isGenerating, messages, sendMessageToAI]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setError(null);
  }, []);

  return (
    <div className="flex h-full bg-background">
      <div className="flex-1 flex flex-col">
        {/* Header - show when there are messages */}
        {messages.length > 0 && (
          <div className="border-b p-3 flex items-center justify-end">
            <Button onClick={handleNewChat} variant="ghost" size="sm">
              New
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
        <div className="flex-1 flex flex-col">
          {messages.length > 0 ? (
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