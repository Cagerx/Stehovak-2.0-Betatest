import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { AppTab, Worker, Vehicle, MoveTask, Transaction, CompanySettings, MaintenanceRequest, OperationType, AppNotification, AppRole, isManagementRole } from './types';
import { db, auth, testDatabaseConnection, googleProvider } from './firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, query, where, orderBy, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { handleFirestoreError } from './App';
import { getVehicleStkStatus, formatCzechDays } from './utils/stkUtils';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: AppRole;
  workerId?: string;
}

export interface AppContextType {
  activeTab: AppTab;
  setActiveTab: React.Dispatch<React.SetStateAction<AppTab>>;
  user: AppUser | null;
  setUser: React.Dispatch<React.SetStateAction<AppUser | null>>;
  workers: Worker[];
  setWorkers: React.Dispatch<React.SetStateAction<Worker[]>>;
  vehicles: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  tasks: MoveTask[];
  setTasks: React.Dispatch<React.SetStateAction<MoveTask[]>>;
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  maintenanceRequests: MaintenanceRequest[];
  setMaintenanceRequests: React.Dispatch<React.SetStateAction<MaintenanceRequest[]>>;
  companySettings: CompanySettings | null;
  notifications: AppNotification[];
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;
  googleAccessToken: string | null;
  setGoogleAccessToken: React.Dispatch<React.SetStateAction<string | null>>;
  toast: string | null;
  showToast: (message: string) => void;
  // Auth state
  isAuthReady: boolean;
  isApproved: boolean | null;
  authError: string | null;
  setAuthError: React.Dispatch<React.SetStateAction<string | null>>;
  quotaExceeded: boolean;
  apiKeySelected: boolean;
  setApiKeySelected: React.Dispatch<React.SetStateAction<boolean>>;
  checkingApiKey: boolean;
  handleGoogleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  handleSelectApiKey: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DASHBOARD);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

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
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(localStorage.getItem('google_access_token'));
  const [isAutoRegistering, setIsAutoRegistering] = useState(false);
  const registrationInProgress = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setIsAuthReady(true);
      } else {
        setUser(null);
        setIsApproved(null);
        setActiveTab(AppTab.DASHBOARD);
        setIsAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !auth.currentUser) return;

    const firebaseUser = auth.currentUser;
    const email = firebaseUser.email || '';
    const matchingWorker = workers.find(w => w.email?.toLowerCase() === email.toLowerCase());

    const processUser = async () => {
      const adminEmails = ['vitezslav.gercak@gmail.com', 'stehovanimatej@gmail.com', 'admin@stehovak2.com'];
      const editorEmails = ['najzarj99@gmail.com'];
      const allowedUserEmails = ['kubienalubo@gmail.com', 'zdenekondo444@gmail.com'];
      const isWhitelisted = adminEmails.includes(email.toLowerCase()) || 
                            editorEmails.includes(email.toLowerCase()) || 
                            allowedUserEmails.includes(email.toLowerCase());

      const isAdmin = adminEmails.includes(email.toLowerCase()) || matchingWorker?.id === '1';
      const isEditor = editorEmails.includes(email.toLowerCase());
      const approved = isAdmin || isEditor || allowedUserEmails.includes(email.toLowerCase()) || !!matchingWorker;

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
              name: firebaseUser.displayName || (isEditor ? 'Editor (Matěj Najzar)' : 'Nový člen týmu'),
              phone: '',
              role: isEditor ? 'Boss' : 'Loader',
              status: 'Available'
            };
            if (email) newWorker.email = email;
            if (firebaseUser.photoURL) newWorker.photo = firebaseUser.photoURL;
            
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
      
      setIsApproved(approved);

      if (approved) {
        let assignedRole: AppRole = isAdmin ? 'admin' : (isEditor ? 'editor' : 'user');
        if (email.toLowerCase() === 'stehovanimatej@gmail.com' || matchingWorker?.role === 'Boss') {
          assignedRole = 'owner';
        }

        // Check if role is stored in Firestore
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const savedRole = userDocSnap.data()?.role;
            if (savedRole === 'owner' || savedRole === 'vlastník') {
              assignedRole = 'owner';
            } else if (savedRole === 'admin') {
              assignedRole = 'admin';
            } else if (savedRole === 'editor') {
              assignedRole = 'editor';
            }
          }
          if (!userDocSnap.exists() || userDocSnap.data()?.role !== assignedRole) {
            await setDoc(userDocRef, {
              role: assignedRole,
              email: email
            }, { merge: true });
          }
        } catch (syncErr) {
          console.warn("User role sync warning:", syncErr);
        }

        const newUser: AppUser = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || matchingWorker?.name || (assignedRole === 'owner' ? 'Vlastník' : isEditor ? 'Editor' : 'Uživatel Stěhovák'),
          email: email,
          avatar: firebaseUser.photoURL || 'https://picsum.photos/seed/user/200/200',
          role: assignedRole,
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
    if (!user) return;
    const sessionId = `session_${user.id}_${Date.now()}`;
    const sessionRef = doc(db, 'user_sessions', sessionId);
    
    const initialSession = {
      id: sessionId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      loginTime: new Date().toISOString(),
      lastActiveTime: new Date().toISOString(),
      durationSeconds: 0,
      actions: [`Přihlášení / Start v záložce ${activeTab}`]
    };

    setDoc(sessionRef, initialSession).catch(err => console.error("Error creating session", err));

    let seconds = 0;
    const timer = setInterval(() => {
      seconds += 10;
      updateDoc(sessionRef, {
        durationSeconds: seconds,
        lastActiveTime: new Date().toISOString()
      }).catch(() => {});
    }, 10000);

    const handleBeforeUnload = () => {
      try {
        updateDoc(sessionRef, {
          lastActiveTime: new Date().toISOString(),
          durationSeconds: seconds
        });
      } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user?.id]);

  useEffect(() => {
    testDatabaseConnection().catch(() => {});
    
    // API Key Check
    const checkKey = async () => {
      try {
        // @ts-ignore
        if (window.aistudio) {
          // @ts-ignore
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setApiKeySelected(hasKey);
        } else {
          setApiKeySelected(true); 
        }
      } catch (error) {
        console.error("Error checking API key:", error);
        setApiKeySelected(true);
      } finally {
        setCheckingApiKey(false);
      }
    };
    setTimeout(checkKey, 500);

    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('firestore-quota-exceeded', handleQuota);
    return () => window.removeEventListener('firestore-quota-exceeded', handleQuota);
  }, []);

  useEffect(() => {
    if (!user?.id || !isAuthReady) return;

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

    const unsubSettings = onSnapshot(doc(db, 'settings', 'company'), (docSnap) => {
      if (docSnap.exists()) {
        setCompanySettings(docSnap.data() as CompanySettings);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/company'));

    const unsubMaintenance = onSnapshot(collection(db, 'maintenanceRequests'), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt)
        } as MaintenanceRequest;
      });
      setMaintenanceRequests(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'maintenanceRequests'));

    const unsubNotifications = onSnapshot(query(collection(db, 'notifications'), where('userId', '==', user.id), orderBy('createdAt', 'desc')), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          ...d,
          id: doc.id,
          createdAt: d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt)
        } as AppNotification;
      });
      setNotifications(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notifications'));

    return () => {
      unsubTasks();
      unsubWorkers();
      unsubVehicles();
      unsubTransactions();
      unsubSettings();
      unsubMaintenance();
      unsubNotifications();
    };
  }, [user?.id, isAuthReady]);

  // Automatické generování notifikace, pokud se přiblíží datum technické kontroly (STK) u vozidla (< 30 dní)
  useEffect(() => {
    if (!user?.id || !isAuthReady || vehicles.length === 0) return;

    const checkVehicleStkNotifications = async () => {
      for (const vehicle of vehicles) {
        const stkStatus = getVehicleStkStatus(vehicle.stkExpiration);
        if (!stkStatus || !stkStatus.isExpiringSoon) continue;

        // Deterministické ID dokumentu: každé vozidlo pro konkrétní termín a uživatele vygeneruje notifikaci pouze jednou
        const safeDate = (vehicle.stkExpiration || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const notifDocId = `stk_${vehicle.id}_${user.id}_${safeDate}`;
        const notifRef = doc(db, 'notifications', notifDocId);

        try {
          const snap = await getDoc(notifRef);
          if (!snap.exists()) {
            const isExpired = stkStatus.isExpired;
            const days = stkStatus.daysRemaining;

            const title = isExpired ? '⚠️ Propadlá STK vozidla' : '⚠️ Blíží se termín STK';
            const message = isExpired
              ? `Upozornění: STK u vozidla ${vehicle.model} (${vehicle.plate}) vypršela před ${formatCzechDays(days)} (${stkStatus.formattedDate})!`
              : days === 0
                ? `Upozornění: STK u vozidla ${vehicle.model} (${vehicle.plate}) končí dnes (${stkStatus.formattedDate})!`
                : `Upozornění: STK u vozidla ${vehicle.model} (${vehicle.plate}) vyprší za ${formatCzechDays(days)} (${stkStatus.formattedDate}).`;

            await setDoc(notifRef, {
              id: notifDocId,
              userId: user.id,
              title,
              message,
              vehicleId: vehicle.id,
              read: false,
              type: 'stk_warning',
              createdAt: serverTimestamp()
            });
          }
        } catch (err) {
          console.warn('Chyba při automatické synchronizaci STK notifikace:', vehicle.id, err);
        }
      }
    };

    checkVehicleStkNotifications();
  }, [vehicles, user?.id, isAuthReady]);

  const markNotificationAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllNotificationsAsRead = async () => {
    if (!user?.id) return;
    try {
      const batch = writeBatch(db);
      notifications.filter(n => !n.read).forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleSelectApiKey = async () => {
      // @ts-ignore
      if (window.aistudio) {
          try {
            // @ts-ignore
            await window.aistudio.openSelectKey();
            setApiKeySelected(true);
            setCheckingApiKey(false);
          } catch (error: any) {
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
      window.location.reload();
    } catch (error: any) {
      const errorMessage = (error.message || String(error)).toLowerCase();
      const isAbort = error.code === 'auth/popup-closed-by-user' || 
                      error.code === 'auth/cancelled-popup-request' ||
                      errorMessage.includes('aborted') ||
                      errorMessage.includes('cancel') ||
                      errorMessage.includes('the user aborted a request') ||
                      errorMessage.includes('signal is aborted') ||
                      errorMessage.includes('failed to fetch');

      if (isAbort) return;
      
      console.error("Google Auth Error:", error);
      setAuthError("Přihlášení selhalo. Zkontrolujte nastavení.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setActiveTab(AppTab.DASHBOARD);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <AppContext.Provider value={{
      activeTab, setActiveTab,
      user, setUser,
      workers, setWorkers,
      vehicles, setVehicles,
      tasks, setTasks,
      transactions, setTransactions,
      maintenanceRequests, setMaintenanceRequests,
      companySettings,
      notifications, markNotificationAsRead, markAllNotificationsAsRead,
      googleAccessToken, setGoogleAccessToken,
      toast, showToast,
      isAuthReady, isApproved, authError, setAuthError, quotaExceeded,
      apiKeySelected, setApiKeySelected, checkingApiKey,
      handleGoogleLogin, handleLogout, handleSelectApiKey
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
