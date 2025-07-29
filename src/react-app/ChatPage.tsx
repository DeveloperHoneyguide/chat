"use client"

import React, { useState, useCallback } from 'react';
import { Chat } from '@/components/ui/chat/chat';
import { Message } from '@/components/ui/chat/chat-message';

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const sendMessageToAIStream = async (allMessages: Message[]) => {
        console.log('ChatPage: Starting streaming with conversation history', {
            messageCount: allMessages.length
        });

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: allMessages }),
        });

        if (!response.ok) {
            console.error('ChatPage: API response error', response.status);
            throw new Error('Failed to get response');
        }

        console.log('ChatPage: Stream response received');

        // Create assistant message with typing indicator
        const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: '',
            createdAt: new Date(),
        };

        // Add to messages
        setMessages(prev => [...prev, assistantMessage]);

        if (!response.body) {
            throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        // Function to remove cursor and finalize message
        const finalizeMessage = () => {
            setMessages(prev => prev.map(msg =>
                msg.id === assistantMessage.id
                    ? { ...msg, content: fullContent }
                    : msg
            ));
        };

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    console.log('ChatPage: Stream reading completed');
                    finalizeMessage();
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });

                // Parse Server-Sent Events
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr) {
                            try {
                                const data = JSON.parse(dataStr);

                                if (data.done) {
                                    console.log('ChatPage: Stream marked as done');
                                    finalizeMessage();
                                    return;
                                }

                                if (data.error) {
                                    console.error('ChatPage: Stream error', data.error);
                                    finalizeMessage(); // Remove cursor even on error
                                    throw new Error(data.error);
                                }

                                if (data.content) {
                                    fullContent += data.content;

                                    // Update with typing cursor effect
                                    setMessages(prev => prev.map(msg =>
                                        msg.id === assistantMessage.id
                                            ? { ...msg, content: fullContent + '█' }
                                            : msg
                                    ));
                                }
                            } catch (parseError) {
                                console.error('ChatPage: Parse error', parseError);
                                finalizeMessage(); // Remove cursor on parse error too
                            }
                        }
                    }
                }
            }

        } catch (error) {
            // Ensure cursor is removed even if there's an error
            finalizeMessage();
            throw error;
        } finally {
            reader.releaseLock();
        }
    };

    const handleSubmit = useCallback(async (
        event?: { preventDefault?: () => void }
    ) => {
        if (event && event.preventDefault) {
            event.preventDefault();
        }

        if (!input.trim()) return;

        console.log('ChatPage: Submitting message with history', { input });

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            createdAt: new Date(),
        };

        // Add user message to conversation
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setInput('');
        setIsGenerating(true);

        try {
            // Send entire conversation history to maintain context
            await sendMessageToAIStream(updatedMessages);
            console.log('ChatPage: Streaming completed with memory');
        } catch (error) {
            console.error('ChatPage: Streaming failed', error);

            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Failed to get response. Please try again.',
                createdAt: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsGenerating(false);
        }
    }, [input, messages]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
    }, []);

    const append = useCallback((message: { role: "user"; content: string }) => {
        setInput(message.content);
        setTimeout(() => {
            handleSubmit();
        }, 0);
    }, [handleSubmit]);

    const stop = useCallback(() => {
        console.log('ChatPage: Stop generation requested');
        setIsGenerating(false);
        // In a full implementation, you'd cancel the streaming here and remove cursor
    }, []);

    // Clear conversation function
    const clearConversation = useCallback(() => {
        console.log('ChatPage: Clearing conversation history');
        setMessages([]);
    }, []);

    const suggestions = [
        "What is machine learning?",
        "Explain quantum computing",
        "How does blockchain work?"
    ];

    return (
        <div className="flex h-screen flex-col bg-white">
            <div className="border-b border-black/10 px-6 py-4 flex justify-between items-center">
                <h1 className="text-xl font-medium">Chat Assistant</h1>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-black/50">
                        {messages.length > 0 && `${Math.ceil(messages.length / 2)} messages`}
                    </span>
                    {messages.length > 0 && (
                        <button
                            onClick={clearConversation}
                            className="text-sm text-black/50 hover:text-black border border-black/10 hover:border-black px-3 py-1 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <Chat
                    messages={messages}
                    input={input}
                    handleInputChange={handleInputChange}
                    handleSubmit={handleSubmit}
                    isGenerating={isGenerating}
                    append={append}
                    suggestions={suggestions}
                    stop={stop}
                    setMessages={setMessages}
                    className="h-full px-6 py-4"
                />
            </div>
        </div>
    );
}