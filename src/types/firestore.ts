import { Timestamp } from 'firebase/firestore';

export interface FirestoreChat {
  id: string;
  userId: string;
  title: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FirestoreMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Timestamp;
}