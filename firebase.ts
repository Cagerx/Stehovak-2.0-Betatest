import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { GoogleGenAI } from '@google/genai';
import firebaseConfig from './firebase-applet-config.json';

// Initialize Firebase with the configuration from firebase-applet-config.json
const app = initializeApp(firebaseConfig);

// Export initialized services
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/calendar.events');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.modify');

// Initialize the Gemini API using the recommended @google/genai SDK
// This instance is optimized for this environment and uses the provided API key
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Validates the connection to Firestore by attempting to read a test document.
 */
export async function testDatabaseConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful");
    return true;
  } catch (error: any) {
    const errorMessage = (error.message || String(error)).toLowerCase();
    const isAbort = error.name === 'AbortError' || 
                    errorMessage.includes('aborted') || 
                    errorMessage.includes('cancel') ||
                    errorMessage.includes('the user aborted a request') ||
                    errorMessage.includes('signal is aborted');
    
    if (isAbort) return false;

    if (errorMessage.includes('permission') || errorMessage.includes('insufficient')) {
      console.warn("Firestore connection test: Missing permissions (this is expected if not logged in or rules are strict).");
    } else if (errorMessage.includes('offline')) {
      console.error("Firestore connection failed: the client is offline");
    } else if (errorMessage.includes('quota exceeded')) {
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
      console.warn("Firestore Quota Exceeded detected in connection test.");
    } else {
      console.error("Firestore connection test error:", error);
    }
    return false;
  }
}
