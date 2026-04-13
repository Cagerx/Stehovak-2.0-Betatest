
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppTab, Worker, Vehicle, MoveTask, Transaction } from './types';
import { Icons, COLORS } from './constants';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import FleetView from './components/FleetView';
import AILab from './components/AILab';
import Profile from './components/Profile';
import ErrorBoundary from './components/ErrorBoundary';
import { db, auth, googleProvider, testDatabaseConnection } from './firebase';
import { doc, getDoc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { signInWithPopup, onAuthStateChanged, signOut, GoogleAuthProvider } from 'firebase/auth';

// Error handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const isAbort = errorMessage.toLowerCase().includes('aborted') || 
                  errorMessage.toLowerCase().includes('cancel') ||
                  errorMessage.toLowerCase().includes('the user aborted a request') ||
                  errorMessage.toLowerCase().includes('signal is aborted') ||
                  (error as any)?.name === 'AbortError';

  if (isAbort) return true; // Silent return for aborted requests

  if (errorMessage.toLowerCase().includes('quota exceeded')) {
    window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    // We don't log to console.error for quota exceeded to keep logs clean
    // since we show a prominent banner in the UI.
    console.warn('Firestore Quota Exceeded. Banner displayed to user.');
    return true;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Only throw if it's a permission error to allow system diagnosis,
  // otherwise just log to prevent unhandled rejections for things like aborts.
  if (errorMessage.toLowerCase().includes('permission') || errorMessage.toLowerCase().includes('missing or insufficient')) {
    throw new Error(JSON.stringify(errInfo));
  }
  return false;
}

interface AppUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'admin' | 'user';
  workerId?: string;
}

// Helper to decode JWT safely
function decodeJwt(token: string) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("JWT Decode Error", e);
    return null;
  }
}

// DŮLEŽITÉ: Uložte váš obrázek jako 'logo.png' do složky 'public'.
const LOGO_URL = "/logo.png"; 

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DASHBOARD);
  const [user, setUser] = useState<AppUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isApproved, setIsApproved] = useState<boolean | null>(null);
  const [apiKeySelected, setApiKeySelected] = useState(false);
  const [checkingApiKey, setCheckingApiKey] = useState(true);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tasks, setTasks] = useState<MoveTask[]>([]);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(localStorage.getItem('google_access_token'));
  const [isAutoRegistering, setIsAutoRegistering] = useState(false);
  const registrationInProgress = React.useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email || '';
        
        // We'll handle the worker matching and auto-registration in a separate effect
        // to keep this listener stable.
        setIsAuthReady(true);
      } else {
        setUser(null);
        setIsApproved(null);
        setActiveTab(AppTab.DASHBOARD); // Reset tab to main page on logout
        setIsAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Separate effect for user profile and registration logic
  useEffect(() => {
    if (!isAuthReady || !auth.currentUser) return;

    const firebaseUser = auth.currentUser;
    const email = firebaseUser.email || '';
    const matchingWorker = workers.find(w => w.email?.toLowerCase() === email.toLowerCase());

    const processUser = async () => {
      const adminEmails = ['vitezslav.gercak@gmail.com', 'stehovanimatej@gmail.com', 'admin@stehovak2.com'];
      const allowedUserEmails = ['kubienalubo@gmail.com', 'zdenekondo444@gmail.com'];
      const isWhitelisted = adminEmails.includes(email.toLowerCase()) || allowedUserEmails.includes(email.toLowerCase());

      // Auto-registration logic - only for whitelisted emails
      if (!matchingWorker && !registrationInProgress.current && isAuthReady && isWhitelisted) {
        registrationInProgress.current = true;
        setIsAutoRegistering(true);
        try {
          const newWorkerId = firebaseUser.uid;
          const workerRef = doc(db, 'workers', newWorkerId);
          const workerSnap = await getDoc(workerRef);
          
          if (!workerSnap.exists()) {
            const newWorker: any = {
              id: newWorkerId,
              name: firebaseUser.displayName || 'Nový člen týmu',
              email: email || '',
              phone: '',
              role: 'Loader',
              status: 'Available'
            };
            if (firebaseUser.photoURL) {
              newWorker.photo = firebaseUser.photoURL;
            }
            
            await setDoc(workerRef, newWorker);
          }
        } catch (error) {
          const handled = handleFirestoreError(error, OperationType.WRITE, `workers/${firebaseUser.uid}`);
          if (!handled) console.error("Auto-registration failed:", error);
        } finally {
          setIsAutoRegistering(false);
          registrationInProgress.current = false;
        }
        return;
      }

      const isAdmin = adminEmails.includes(email.toLowerCase()) || matchingWorker?.id === '1';
      const approved = isAdmin || allowedUserEmails.includes(email.toLowerCase()) || !!matchingWorker;
      
      setIsApproved(approved);

      if (approved) {
        // Only update if data actually changed to prevent unnecessary re-renders of dependent effects
        const newUser: AppUser = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || matchingWorker?.name || 'Uživatel Stěhovák',
          email: email,
          avatar: firebaseUser.photoURL || 'https://picsum.photos/seed/user/200/200',
          role: isAdmin ? 'admin' : 'user',
          workerId: matchingWorker?.id
        };

        setUser(prev => {
          if (JSON.stringify(prev) === JSON.stringify(newUser)) return prev;
          return newUser;
        });
      } else {
        setUser(null);
      }
    };

    processUser();
  }, [workers, isAuthReady, isAutoRegistering]);

  useEffect(() => {
    // Only run connection test once and handle error silently if it's just a permission issue on mount
    testDatabaseConnection().catch(() => {});
    
    // API Key Check for premium models
    const checkKey = async () => {
      try {
        // @ts-ignore
        if (window.aistudio) {
          // @ts-ignore
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setApiKeySelected(hasKey);
        } else {
          // If aistudio is not available, assume we can proceed for local dev or other environments.
          setApiKeySelected(true); 
        }
      } catch (error) {
        console.error("Error checking API key:", error);
        setApiKeySelected(true); // Fallback
      } finally {
        setCheckingApiKey(false);
      }
    };
    // Use a timeout to ensure aistudio is loaded
    setTimeout(checkKey, 500);

    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('firestore-quota-exceeded', handleQuota);
    return () => window.removeEventListener('firestore-quota-exceeded', handleQuota);
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user?.id || !isAuthReady) return; // Only listen if authenticated and auth is ready

    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const tasksData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          start: data.start?.toDate ? data.start.toDate() : new Date(data.start),
          end: data.end?.toDate ? data.end.toDate() : new Date(data.end)
        } as MoveTask;
      });
      setTasks(tasksData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'tasks'));

    const unsubWorkers = onSnapshot(collection(db, 'workers'), (snapshot) => {
      const workersData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Worker));
      setWorkers(workersData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'workers'));

    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      const vehiclesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Vehicle));
      setVehicles(vehiclesData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'vehicles'));

    const unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      const txData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          date: data.date?.toDate ? data.date.toDate() : new Date(data.date)
        } as Transaction;
      });
      setTransactions(txData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    return () => {
      unsubTasks();
      unsubWorkers();
      unsubVehicles();
      unsubTransactions();
    };
  }, [user?.id, isAuthReady]);

  const handleSelectApiKey = async () => {
      // @ts-ignore
      if (window.aistudio) {
          try {
            // @ts-ignore
            await window.aistudio.openSelectKey();
            // Optimistically set to true to avoid race condition and proceed
            setApiKeySelected(true);
            setCheckingApiKey(false);
          } catch (error: any) {
            // Ignore abort errors when user closes the dialog
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (error?.name !== 'AbortError' && !errorMessage.toLowerCase().includes('aborted')) {
              console.error("Error selecting API key:", error);
            }
          }
      }
  };

  const handleGoogleLogin = async () => {
    try {
      setAuthError(null);
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (token) {
        setGoogleAccessToken(token);
        localStorage.setItem('google_access_token', token);
      }
      // Hard refresh to ensure clean state and immediate redirection to main app
      window.location.reload();
    } catch (error: any) {
      const errorMessage = (error.message || String(error)).toLowerCase();
      const isAbort = error.code === 'auth/popup-closed-by-user' || 
                      error.code === 'auth/cancelled-popup-request' ||
                      errorMessage.includes('aborted') ||
                      errorMessage.includes('cancel') ||
                      errorMessage.includes('the user aborted a request') ||
                      errorMessage.includes('signal is aborted');

      if (isAbort) {
        // User closed the popup or request was cancelled, no need to show a scary error
        return;
      }
      
      console.error("Google Auth Error:", error);
      setAuthError("Přihlášení selhalo. Zkontrolujte nastavení.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab(AppTab.DASHBOARD); // Ensure we land on dashboard next time
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const getTabLabel = (tab: AppTab) => {
    switch (tab) {
      case AppTab.DASHBOARD: return 'PŘEHLED';
      case AppTab.CALENDAR: return 'KALENDÁŘ';
      case AppTab.FLEET: return 'FLOTILA';
      case AppTab.AI_LAB: return 'AI LABORATOŘ';
      case AppTab.PROFILE: return 'VÍCE';
      default: return '';
    }
  };
  
  if (checkingApiKey) {
    return (
        <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );
  }

  if (!apiKeySelected) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-28 h-28 bg-blue-600 rounded-[35px] mb-8 flex items-center justify-center shadow-[0_20px_50px_rgba(59,130,246,0.3)] text-white">
            <Icons.Sparkles />
        </div>
        <h1 className="text-3xl font-black mb-2">Vyžadován API Klíč</h1>
        <p className="text-slate-400 mb-8 max-w-sm">
            Pro generování obrázků s prémiovým modelem je nutné vybrat Váš vlastní API klíč z placeného Google Cloud projektu.
        </p>
        <button 
            onClick={handleSelectApiKey}
            className="bg-blue-600 text-white font-black py-4 px-8 rounded-2xl shadow-xl shadow-blue-600/20 transition-all active:scale-95 text-sm uppercase tracking-widest hover:bg-blue-500"
        >
            Vybrat API klíč
        </button>
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs font-bold mt-6 hover:underline">
            Více o zpoplatnění &rarr;
          </a>
      </div>
    );
  }

  if (!user) {
    // Check if we are on a dynamic URL (usually ends in usercontent.goog or is local)
    const isDynamicUrl = window.location.hostname.includes('usercontent.goog') || window.location.hostname.includes('webcontainer');

    if (isApproved === false) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white text-center animate-fade-in">
          <div className="max-w-md w-full space-y-8">
            <div className="relative group">
              <img 
                src="https://images.squarespace-cdn.com/content/v1/51b3dc8ee4b051b96ceb10de/1371052601721-65I2Z0V9I598Y8N2C0Z0/image-asset.jpeg" 
                alt="Gandalf" 
                className="w-full rounded-2xl shadow-[0_0_50px_rgba(255,255,255,0.1)] border-4 border-slate-800"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent rounded-2xl flex items-end justify-center pb-6">
                <h2 className="text-2xl font-black tracking-tighter uppercase italic text-white drop-shadow-lg">
                  "You shall not pass, motherfucker."
                </h2>
              </div>
            </div>
            <div className="space-y-4">
              <h1 className="text-3xl font-black text-red-500 uppercase tracking-tighter">PŘÍSTUP ODEPŘEN</h1>
              <p className="text-slate-400 font-bold text-sm">
                Váš účet ({auth.currentUser?.email}) není v systému schválen. <br/>
                Kontaktujte administrátora pro přidělení přístupu.
              </p>
              <button 
                onClick={handleLogout}
                className="bg-white text-black font-black py-3 px-8 rounded-xl hover:bg-slate-200 transition-all active:scale-95 text-xs uppercase tracking-widest"
              >
                Zkusit jiný účet
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-6 text-white animate-fade-in relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-[120px] pointer-events-none" />

        {/* LOGO SECTION - MASCOT STYLE */}
        <div className="w-64 h-64 mb-6 relative z-10 animate-fade-in hover:scale-105 transition-transform duration-500">
          <div className="w-full h-full flex items-center justify-center">
             <img 
               src={LOGO_URL} 
               alt="Stěhovák 2.0 Mascot" 
               className="w-full h-full object-contain filter drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
               onError={(e) => {
                 e.currentTarget.onerror = null; 
                 e.currentTarget.style.display = 'none';
                 e.currentTarget.parentElement!.innerHTML = '<div class="text-center bg-slate-800 rounded-3xl p-8 border border-slate-700"><p class="text-[60px]">🚛</p><p class="text-[10px] text-slate-400 font-bold mt-2">LOGO.PNG<br/>MISSING</p></div>';
               }}
             />
          </div>
        </div>
        
        <h1 className="text-4xl font-black mb-2 tracking-tighter relative z-10 text-center">Stěhovák <span className="text-red-500">2.0</span></h1>
        <p className="text-slate-400 mb-8 text-center font-medium max-w-[250px] relative z-10">
          Logistický systém pro moderní týmy.
        </p>
        
        <div className="space-y-4 w-full max-w-[320px] relative z-10 flex flex-col items-center">
          
          {/* Main Auth Buttons */}
          <div className="space-y-3 w-full">
            <button 
                onClick={handleGoogleLogin}
                className="w-full bg-white text-slate-900 font-bold py-3 px-4 rounded-xl shadow-lg flex items-center justify-center gap-3 hover:bg-slate-50 transition-colors"
            >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Přihlásit se přes Google
            </button>
          </div>

          {/* Dynamic URL Warning - Educational Block */}
          {isDynamicUrl && (
            <div className="w-full bg-yellow-500/10 p-4 rounded-2xl border border-yellow-500/20 text-center mt-4">
                 <p className="text-[9px] text-yellow-500 font-black uppercase tracking-widest mb-2 flex items-center justify-center gap-2">
                    <span className="text-sm">⚠️</span> Vývojové prostředí
                 </p>
                 <p className="text-[10px] text-slate-400 leading-relaxed mb-2">
                   Běžíte na dynamické adrese. Google přihlášení nemusí fungovat (Chyba 400), protože se adresa mění.
                 </p>
                 <div className="bg-black/20 rounded p-2 text-[9px] text-slate-500 font-mono mb-2 break-all">
                    {window.location.origin}
                 </div>
                 <p className="text-[9px] text-slate-300 font-bold">
                   Pro trvalé fungování: <br/> Publikujte aplikaci na pevnou doménu (Vercel, Netlify, Firebase).
                 </p>
            </div>
          )}
        </div>
        
        {authError && (
          <div className="mt-8 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-2xl animate-slide-up relative z-10">
            <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">
              {authError}
            </p>
          </div>
        )}

        <div className="absolute bottom-12 text-center w-full">
           <p className="text-[10px] text-slate-700 font-black uppercase tracking-[0.4em]">Premium Logistics Core</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#0f172a] flex flex-col w-full md:max-w-[1920px] mx-auto shadow-2xl overflow-hidden relative border-x border-white/10">
      <header className="bg-slate-900/90 backdrop-blur-xl border-b border-white/10 p-5 md:p-8 sticky top-0 z-40 flex items-center justify-between h-[80px] md:h-[100px]">
        {quotaExceeded && (
          <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-[10px] font-black py-2 text-center animate-pulse z-50 shadow-lg flex items-center justify-center gap-2">
            <Icons.AlertTriangle className="w-3 h-3" />
            DENNÍ LIMIT DAT VYČERPÁN (QUOTA EXCEEDED). APLIKACE BUDE OPĚT PLNĚ FUNKČNÍ ZÍTRA.
          </div>
        )}
        <div className="flex items-center gap-3 md:gap-5">
          <div className="w-14 h-14 md:w-16 md:h-16 flex items-center justify-center transition-transform hover:scale-110">
            <img 
              src={LOGO_URL} 
              alt="Stěhovák 2.0 Logo" 
              className="w-full h-full object-contain filter drop-shadow-lg" 
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = '<span class="text-3xl">🚛</span>';
              }}
            />
          </div>
          <div>
            <h1 className="text-lg md:text-3xl font-black text-white leading-none">Stěhovák <span className="text-red-500 text-[32px] text-justify">2.0</span></h1>
            <p className="text-[9px] md:text-xs text-red-500 font-black tracking-widest mt-0.5 md:mt-1">{getTabLabel(activeTab)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl overflow-hidden border-2 border-white/20 shadow-md">
            <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 w-full h-[2px] flex">
          <div className="h-full w-1/3 bg-blue-600"></div>
          <div className="h-full w-1/3 bg-slate-200"></div>
          <div className="h-full w-1/3 bg-red-600"></div>
        </div>
      </header>
      
      {authError && (
        <div className="p-4 bg-red-600/10 border-b border-red-500/20 text-center text-red-400 text-xs font-bold relative">
          <p className="pr-8">{authError}</p>
          <button onClick={() => setAuthError(null)} className="absolute top-1/2 right-4 -translate-y-1/2 text-red-400/50 hover:text-red-400 font-black text-xl">&times;</button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto no-scrollbar p-5 md:p-10 pb-32 md:pb-40">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === AppTab.DASHBOARD && <Dashboard tasks={tasks} workers={workers} vehicles={vehicles} user={user} />}
            {activeTab === AppTab.CALENDAR && <CalendarView tasks={tasks} setTasks={setTasks} workers={workers} vehicles={vehicles} user={user} googleAccessToken={googleAccessToken} />}
            {activeTab === AppTab.FLEET && <FleetView workers={workers} setWorkers={setWorkers} vehicles={vehicles} setVehicles={setVehicles} user={user} />}
            {activeTab === AppTab.AI_LAB && <AILab user={user} />}
            {activeTab === AppTab.PROFILE && (
              <Profile 
                user={user} 
                onLogout={handleLogout} 
                transactions={transactions} 
                setTransactions={setTransactions} 
                tasks={tasks}
                workers={workers}
                vehicles={vehicles}
                googleAccessToken={googleAccessToken}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="bg-slate-900/95 backdrop-blur-2xl border-t border-white/10 fixed bottom-0 md:bottom-8 left-0 right-0 md:left-1/2 md:-translate-x-1/2 md:right-auto md:w-auto w-full z-40 flex justify-around p-4 md:px-12 md:py-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] rounded-t-[35px] md:rounded-full md:border md:border-white/20 md:shadow-2xl md:gap-8">
        <NavButton active={activeTab === AppTab.DASHBOARD} onClick={() => setActiveTab(AppTab.DASHBOARD)} icon={<Icons.Home />} label="Domů" />
        <NavButton active={activeTab === AppTab.CALENDAR} onClick={() => setActiveTab(AppTab.CALENDAR)} icon={<Icons.Calendar />} label="Kalendář" />
        <NavButton active={activeTab === AppTab.FLEET} onClick={() => setActiveTab(AppTab.FLEET)} icon={<Icons.Truck />} label="Flotila" />
        <NavButton active={activeTab === AppTab.AI_LAB} onClick={() => setActiveTab(AppTab.AI_LAB)} icon={<Icons.Sparkles />} label="AI Lab" />
        <NavButton active={activeTab === AppTab.PROFILE} onClick={() => setActiveTab(AppTab.PROFILE)} icon={<Icons.User />} label="Více" />
      </nav>
    </div>
  </ErrorBoundary>
  );
};

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-1.5 md:gap-2 transition-all relative group"
  >
    <div className={`transition-all duration-300 [&>svg]:w-6 [&>svg]:h-6 md:[&>svg]:w-8 md:[&>svg]:h-8 ${
      active 
        ? (label === 'AI Lab' ? 'scale-110 -translate-y-1 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'scale-110 -translate-y-1 text-white') 
        : 'scale-100 text-white/40 group-hover:text-white'
    }`}>
      {icon}
    </div>
    <span className={`text-[10px] md:text-xs font-black uppercase tracking-wider transition-all duration-300 ${active ? 'opacity-100 text-white' : 'opacity-100 text-white/40 group-hover:text-white'}`}>
      {label}
    </span>
    {active && (
      <motion.div 
        layoutId="nav-active"
        className="absolute -bottom-2 w-1 h-1 bg-white rounded-full"
      />
    )}
  </button>
);

export default App;
