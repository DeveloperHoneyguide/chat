import { useState, useEffect, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { useAuth } from './use-auth';

interface Chat {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function useChatPersistence() {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all chats for the user
  const loadChats = useCallback(async () => {
    if (!user) {
      setChats([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const chatsRef = collection(db, 'chats');
      const q = query(
        chatsRef, 
        where('userId', '==', user.id),
        orderBy('updatedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const loadedChats: Chat[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        loadedChats.push({
          id: doc.id,
          title: data.title,
          created_at: data.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
          updated_at: data.updatedAt?.toDate?.().toISOString() || new Date().toISOString()
        });
      });
      
      setChats(loadedChats);
      setError(null);
    } catch (err) {
      console.error('Error loading chats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load a specific chat with its messages
  const loadChat = useCallback(async (chatId: string) => {
    if (!user) return;

    try {
      // Load chat
      const chatRef = doc(db, 'chats', chatId);
      const chatDoc = await getDoc(chatRef);
      
      if (!chatDoc.exists()) {
        throw new Error('Chat not found');
      }
      
      const chatData = chatDoc.data();
      const chat: Chat = {
        id: chatDoc.id,
        title: chatData.title,
        created_at: chatData.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
        updated_at: chatData.updatedAt?.toDate?.().toISOString() || new Date().toISOString()
      };
      
      setCurrentChat(chat);
      
      // Load messages
      const messagesRef = collection(db, 'messages');
      const q = query(
        messagesRef,
        where('chatId', '==', chatId),
        orderBy('createdAt', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      const loadedMessages: Message[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        loadedMessages.push({
          id: doc.id,
          role: data.role,
          content: data.content,
          created_at: data.createdAt?.toDate?.().toISOString() || new Date().toISOString()
        });
      });
      
      setMessages(loadedMessages);
      setError(null);
    } catch (err) {
      console.error('Error loading chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chat');
    }
  }, [user]);

  // Create a new chat
  const createNewChat = useCallback(async (title?: string) => {
    if (!user) return null;

    try {
      const chatData = {
        userId: user.id,
        title: title || 'New Chat',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'chats'), chatData);
      
      const newChat: Chat = {
        id: docRef.id,
        title: chatData.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      setChats(prev => [newChat, ...prev]);
      setCurrentChat(newChat);
      setMessages([]);
      setError(null);
      
      return newChat;
    } catch (err) {
      console.error('Error creating chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to create chat');
      return null;
    }
  }, [user]);

  // Add a message to Firestore
  const addMessageToFirestore = useCallback(async (chatId: string, role: 'user' | 'assistant', content: string) => {
    if (!user) return null;

    try {
      const messageData = {
        chatId,
        role,
        content,
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'messages'), messageData);
      
      const newMessage: Message = {
        id: docRef.id,
        role,
        content,
        created_at: new Date().toISOString()
      };
      
      // Update chat's updatedAt timestamp
      await updateDoc(doc(db, 'chats', chatId), {
        updatedAt: serverTimestamp()
      });
      
      return newMessage;
    } catch (err) {
      console.error('Error adding message:', err);
      return null;
    }
  }, [user]);

  // Send a message to a chat (returns response for streaming)
  const sendMessage = useCallback(async (chatId: string, message: string, autoTitle = true) => {
    if (!user) return null;

    try {
      // Add user message to Firestore
      const userMessage = await addMessageToFirestore(chatId, 'user', message);
      if (userMessage) {
        setMessages(prev => [...prev, userMessage]);
      }

      // For now, we'll return a mock response
      // In production, this would call your API endpoint
      const mockResponse = new Response(
        JSON.stringify({ 
          message: "I'm using Firebase now! This is a placeholder response.",
          role: 'assistant'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

      // Add assistant message after a delay (simulating API response)
      setTimeout(async () => {
        const assistantMessage = await addMessageToFirestore(
          chatId, 
          'assistant', 
          "I'm using Firebase now! This is a placeholder response."
        );
        if (assistantMessage) {
          setMessages(prev => [...prev, assistantMessage]);
        }

        // Auto-generate title if it's the first message
        if (autoTitle && messages.length === 0) {
          const newTitle = message.slice(0, 50) + (message.length > 50 ? '...' : '');
          await updateDoc(doc(db, 'chats', chatId), {
            title: newTitle,
            updatedAt: serverTimestamp()
          });
          setChats(prev => prev.map(chat => 
            chat.id === chatId ? { ...chat, title: newTitle } : chat
          ));
          if (currentChat?.id === chatId) {
            setCurrentChat(prev => prev ? { ...prev, title: newTitle } : null);
          }
        }
      }, 500);

      return mockResponse;
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      return null;
    }
  }, [user, addMessageToFirestore, messages.length, currentChat]);

  // Rename a chat
  const renameChat = useCallback(async (chatId: string, newTitle: string) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, 'chats', chatId), {
        title: newTitle,
        updatedAt: serverTimestamp()
      });
      
      setChats(prev => prev.map(chat => 
        chat.id === chatId ? { ...chat, title: newTitle } : chat
      ));
      
      if (currentChat?.id === chatId) {
        setCurrentChat(prev => prev ? { ...prev, title: newTitle } : null);
      }
      
      setError(null);
    } catch (err) {
      console.error('Error renaming chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to rename chat');
    }
  }, [user, currentChat]);

  // Delete a chat
  const deleteChat = useCallback(async (chatId: string) => {
    if (!user) return;

    try {
      // Delete all messages in the chat
      const messagesRef = collection(db, 'messages');
      const q = query(messagesRef, where('chatId', '==', chatId));
      const querySnapshot = await getDocs(q);
      
      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // Delete the chat
      await deleteDoc(doc(db, 'chats', chatId));
      
      setChats(prev => prev.filter(chat => chat.id !== chatId));
      
      if (currentChat?.id === chatId) {
        setCurrentChat(null);
        setMessages([]);
      }
      
      setError(null);
    } catch (err) {
      console.error('Error deleting chat:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete chat');
    }
  }, [user, currentChat]);

  // Initialize - load chats when user changes
  useEffect(() => {
    if (user) {
      loadChats();
    } else {
      setChats([]);
      setCurrentChat(null);
      setMessages([]);
      setLoading(false);
    }
  }, [user, loadChats]);

  return {
    chats,
    currentChat,
    messages,
    user,
    loading,
    error,
    loadChats,
    loadChat,
    createNewChat,
    sendMessage,
    renameChat,
    deleteChat,
    setMessages,
    setError
  };
}