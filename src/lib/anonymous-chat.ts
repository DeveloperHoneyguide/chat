import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  getDoc,
  updateDoc,
  deleteDoc,
  query, 
  orderBy, 
  where,
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';

export interface AnonymousChat {
  id: string;
  sessionId: string;
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AnonymousMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Timestamp;
}

// Generate a unique session ID for anonymous users
export function generateSessionId(): string {
  return `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get or create session ID from localStorage
export function getSessionId(): string {
  let sessionId = localStorage.getItem('anonymous_session_id');
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem('anonymous_session_id', sessionId);
  }
  return sessionId;
}

// Create a new anonymous chat
export async function createAnonymousChat(title: string): Promise<AnonymousChat> {
  const sessionId = getSessionId();
  const now = Timestamp.now();
  
  const chatData = {
    sessionId,
    title: title || 'New Chat',
    createdAt: now,
    updatedAt: now
  };
  
  const docRef = await addDoc(collection(db, 'anonymous_chats'), chatData);
  
  return {
    id: docRef.id,
    ...chatData
  };
}

// Get all chats for current session
export async function getAnonymousChats(): Promise<AnonymousChat[]> {
  const sessionId = getSessionId();
  
  const q = query(
    collection(db, 'anonymous_chats'),
    where('sessionId', '==', sessionId),
    orderBy('updatedAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as AnonymousChat));
}

// Get a specific anonymous chat
export async function getAnonymousChat(chatId: string): Promise<AnonymousChat | null> {
  const sessionId = getSessionId();
  const docRef = doc(db, 'anonymous_chats', chatId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }
  
  const chatData = docSnap.data() as Omit<AnonymousChat, 'id'>;
  
  // Verify this chat belongs to current session
  if (chatData.sessionId !== sessionId) {
    return null;
  }
  
  return {
    id: docSnap.id,
    ...chatData
  };
}

// Update chat title and timestamp
export async function updateAnonymousChatTitle(chatId: string, title: string): Promise<void> {
  const chatRef = doc(db, 'anonymous_chats', chatId);
  await updateDoc(chatRef, {
    title,
    updatedAt: Timestamp.now()
  });
}

// Delete an anonymous chat and its messages
export async function deleteAnonymousChat(chatId: string): Promise<void> {
  // Delete all messages first
  const messagesQuery = query(
    collection(db, 'anonymous_messages'),
    where('chatId', '==', chatId)
  );
  
  const messagesSnapshot = await getDocs(messagesQuery);
  const deletePromises = messagesSnapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletePromises);
  
  // Delete the chat
  const chatRef = doc(db, 'anonymous_chats', chatId);
  await deleteDoc(chatRef);
}

// Add a message to an anonymous chat
export async function addAnonymousMessage(
  chatId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<AnonymousMessage> {
  const now = Timestamp.now();
  
  const messageData = {
    chatId,
    role,
    content,
    createdAt: now
  };
  
  const docRef = await addDoc(collection(db, 'anonymous_messages'), messageData);
  
  // Update chat's updatedAt timestamp
  const chatRef = doc(db, 'anonymous_chats', chatId);
  await updateDoc(chatRef, {
    updatedAt: now
  });
  
  return {
    id: docRef.id,
    ...messageData
  };
}

// Get all messages for an anonymous chat
export async function getAnonymousMessages(chatId: string): Promise<AnonymousMessage[]> {
  const q = query(
    collection(db, 'anonymous_messages'),
    where('chatId', '==', chatId),
    orderBy('createdAt', 'asc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as AnonymousMessage));
}

// Generate a chat title from the first message
export function generateChatTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim().replace(/\n/g, ' ').substring(0, 60);
  
  if (cleaned.length < 10) {
    return 'New Chat';
  }
  
  return cleaned.length === 60 ? cleaned + '...' : cleaned;
}