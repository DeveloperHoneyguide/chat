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

export interface UserChat {
  id: string;
  userId: string;
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Timestamp;
}

// Create a new user chat
export async function createUserChat(userId: string, title: string): Promise<UserChat> {
  const now = Timestamp.now();
  
  const chatData = {
    userId,
    title: title || 'New Chat',
    createdAt: now,
    updatedAt: now
  };
  
  const docRef = await addDoc(collection(db, 'user_chats'), chatData);
  
  return {
    id: docRef.id,
    ...chatData
  };
}

// Get all chats for a specific user
export async function getUserChats(userId: string): Promise<UserChat[]> {
  const q = query(
    collection(db, 'user_chats'),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as UserChat));
}

// Get a specific user chat
export async function getUserChat(chatId: string, userId: string): Promise<UserChat | null> {
  const docRef = doc(db, 'user_chats', chatId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    return null;
  }
  
  const chatData = docSnap.data() as Omit<UserChat, 'id'>;
  
  // Verify this chat belongs to the user
  if (chatData.userId !== userId) {
    return null;
  }
  
  return {
    id: docSnap.id,
    ...chatData
  };
}

// Update user chat title and timestamp
export async function updateUserChatTitle(chatId: string, userId: string, title: string): Promise<void> {
  // First verify ownership
  const chat = await getUserChat(chatId, userId);
  if (!chat) {
    throw new Error('Chat not found or access denied');
  }
  
  const chatRef = doc(db, 'user_chats', chatId);
  await updateDoc(chatRef, {
    title,
    updatedAt: Timestamp.now()
  });
}

// Delete a user chat and its messages
export async function deleteUserChat(chatId: string, userId: string): Promise<void> {
  // First verify ownership
  const chat = await getUserChat(chatId, userId);
  if (!chat) {
    throw new Error('Chat not found or access denied');
  }
  
  // Delete all messages first
  const messagesQuery = query(
    collection(db, 'user_messages'),
    where('chatId', '==', chatId)
  );
  
  const messagesSnapshot = await getDocs(messagesQuery);
  const deletePromises = messagesSnapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletePromises);
  
  // Delete the chat
  const chatRef = doc(db, 'user_chats', chatId);
  await deleteDoc(chatRef);
}

// Add a message to a user chat
export async function addUserMessage(
  chatId: string,
  userId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<UserMessage> {
  // First verify chat ownership
  const chat = await getUserChat(chatId, userId);
  if (!chat) {
    throw new Error('Chat not found or access denied');
  }
  
  const now = Timestamp.now();
  
  const messageData = {
    chatId,
    role,
    content,
    createdAt: now
  };
  
  const docRef = await addDoc(collection(db, 'user_messages'), messageData);
  
  // Update chat's updatedAt timestamp
  const chatRef = doc(db, 'user_chats', chatId);
  await updateDoc(chatRef, {
    updatedAt: now
  });
  
  return {
    id: docRef.id,
    ...messageData
  };
}

// Get all messages for a user chat
export async function getUserMessages(chatId: string, userId: string): Promise<UserMessage[]> {
  // First verify chat ownership
  const chat = await getUserChat(chatId, userId);
  if (!chat) {
    throw new Error('Chat not found or access denied');
  }
  
  const q = query(
    collection(db, 'user_messages'),
    where('chatId', '==', chatId),
    orderBy('createdAt', 'asc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as UserMessage));
}

// Generate a chat title from the first message
export function generateChatTitle(firstMessage: string): string {
  const cleaned = firstMessage.trim().replace(/\n/g, ' ').substring(0, 60);
  
  if (cleaned.length < 10) {
    return 'New Chat';
  }
  
  return cleaned.length === 60 ? cleaned + '...' : cleaned;
}