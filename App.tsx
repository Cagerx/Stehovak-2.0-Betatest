
import React from 'react';
import { motion, AnimatePresence, useDragControls, useMotionValue } from 'motion/react';
import { AppTab, OperationType } from './types';
import { Icons, COLORS } from './constants';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import FleetView from './components/FleetView';
import MaintenanceView from './components/MaintenanceView';
import OrderAnalysis from './components/OrderAnalysis';
import Profile from './components/Profile';
import ErrorBoundary from './components/ErrorBoundary';
import { useAppContext } from './AppContext';
import { auth } from './firebase';

// Error handling
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
                  errorMessage.toLowerCase().includes('failed to fetch') ||
                  (error as any)?.name === 'AbortError';

  if (isAbort) return true;

  if (errorMessage.toLowerCase().includes('quota exceeded')) {
    window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
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
  
  if (errorMessage.toLowerCase().includes('permission') || errorMessage.toLowerCase().includes('missing or insufficient')) {
    throw new Error(JSON.stringify(errInfo));
  }
  return false;
}

const LOGO_URL = "/logo.png"; 

const App: React.FC = () => {
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : false);
  const [isDraggingNav, setIsDraggingNav] = React.useState(false);
  const navRef = React.useRef<HTMLElement | null>(null);
  const navDragControls = useDragControls();

  // Initial free position and orientation
  const initialNav = React.useMemo(() => {
    if (typeof window === 'undefined') return { x: 200, y: 600, isVertical: false };
    try {
      const saved = localStorage.getItem('stehovak_nav_free_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          const isVert = !!parsed.isVertical;
          const w = isVert ? 74 : 620;
          const h = isVert ? 440 : 72;
          const clampedX = Math.max(16, Math.min(window.innerWidth - w - 16, parsed.x));
          const clampedY = Math.max(16, Math.min(window.innerHeight - h - 16, parsed.y));
          return { x: clampedX, y: clampedY, isVertical: isVert };
        }
      }
    } catch (e) {}
    const defX = Math.max(16, Math.round((window.innerWidth - 620) / 2));
    const defY = Math.max(16, window.innerHeight - 92);
    return { x: defX, y: defY, isVertical: false };
  }, []);

  const navX = useMotionValue(initialNav.x);
  const navY = useMotionValue(initialNav.y);
  const [isVertical, setIsVertical] = React.useState(initialNav.isVertical);

  // Keep within bounds on window resize
  React.useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 768;
      setIsDesktop(desktop);
      if (desktop) {
        const curX = navX.get();
        const curY = navY.get();
        const w = isVertical ? 74 : 620;
        const h = isVertical ? 440 : 72;
        const clampedX = Math.max(16, Math.min(window.innerWidth - w - 16, curX));
        const clampedY = Math.max(16, Math.min(window.innerHeight - h - 16, curY));
        navX.set(clampedX);
        navY.set(clampedY);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isVertical, navX, navY]);

  const handleDragEnd = () => {
    setIsDraggingNav(false);
    const curX = navX.get();
    const curY = navY.get();
    const w = window.innerWidth;
    const h = window.innerHeight;

    const width = isVertical ? 74 : (navRef.current?.offsetWidth || 620);
    const height = isVertical ? (navRef.current?.offsetHeight || 440) : 72;

    let clampedX = Math.max(16, Math.min(w - width - 16, curX));
    let clampedY = Math.max(16, Math.min(h - height - 16, curY));

    // When dragged to the side (left 32% or right 32%), enable vertical view
    // Do NOT snap to the side edge; keep the exact clampedX position
    const isLeftSide = clampedX < w * 0.32;
    const isRightSide = (clampedX + width) > w * 0.68;
    const isNearSide = isLeftSide || isRightSide;

    let nextVertical = isVertical;

    if (isNearSide && !isVertical) {
      nextVertical = true;
      setIsVertical(true);
      const vertHeight = 440;
      if (clampedY + vertHeight > h - 16) {
        clampedY = Math.max(16, h - vertHeight - 16);
      }
    } else if (!isNearSide && isVertical && clampedY > h * 0.6) {
      nextVertical = false;
      setIsVertical(false);
      const horizWidth = 620;
      if (clampedX + horizWidth > w - 16) {
        clampedX = Math.max(16, w - horizWidth - 16);
      }
    }

    navX.set(clampedX);
    navY.set(clampedY);

    try {
      localStorage.setItem(
        'stehovak_nav_free_pos',
        JSON.stringify({ x: clampedX, y: clampedY, isVertical: nextVertical })
      );
    } catch (e) {}
  };

  const toggleOrientation = () => {
    const next = !isVertical;
    setIsVertical(next);
    const curX = navX.get();
    const curY = navY.get();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const targetW = next ? 74 : 620;
    const targetH = next ? 440 : 72;

    const clampedX = Math.max(16, Math.min(w - targetW - 16, curX));
    const clampedY = Math.max(16, Math.min(h - targetH - 16, curY));

    navX.set(clampedX);
    navY.set(clampedY);

    try {
      localStorage.setItem(
        'stehovak_nav_free_pos',
        JSON.stringify({ x: clampedX, y: clampedY, isVertical: next })
      );
    } catch (e) {}
  };

  const resetToBottomCenter = () => {
    setIsVertical(false);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const defX = Math.max(16, Math.round((w - 620) / 2));
    const defY = Math.max(16, h - 92);
    navX.set(defX);
    navY.set(defY);
    try {
      localStorage.setItem(
        'stehovak_nav_free_pos',
        JSON.stringify({ x: defX, y: defY, isVertical: false })
      );
    } catch (e) {}
  };

  const {
    activeTab, setActiveTab,
    user,
    workers, setWorkers,
    vehicles, setVehicles,
    tasks, setTasks,
    transactions, setTransactions,
    maintenanceRequests,
    companySettings,
    notifications, markNotificationAsRead, markAllNotificationsAsRead,
    googleAccessToken,
    toast, showToast,
    isApproved, authError, setAuthError, quotaExceeded,
    apiKeySelected, checkingApiKey,
    handleGoogleLogin, handleLogout, handleSelectApiKey
  } = useAppContext();

  const getTabLabel = (tab: AppTab) => {
    switch (tab) {
      case AppTab.DASHBOARD: return 'PŘEHLED';
      case AppTab.CALENDAR: return 'KALENDÁŘ';
      case AppTab.FLEET: return 'FLOTILA';
      case AppTab.MAINTENANCE: return 'ÚDRŽBA';
      case AppTab.ANALYSIS: return 'ANALÝZA';
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
                  "Tady neprojdeš, kámo."
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
                 e.currentTarget.parentElement!.innerHTML = '<div class="text-center bg-slate-800 rounded-3xl p-8 border border-slate-700"><p class="text-[60px]">🚛</p><p class="text-[10px] text-slate-400 font-bold mt-2">LOGO.PNG<br/>CHYBÍ</p></div>';
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
        <div className="flex items-center gap-4">
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 md:p-3 bg-slate-800 rounded-2xl border border-white/10 hover:border-blue-500 hover:bg-slate-700 transition-all text-white/70 hover:text-white group"
            >
              <Icons.Bell className="w-5 h-5 md:w-6 md:h-6 group-hover:scale-110 transition-transform" />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-red-500 rounded-full text-[9px] md:text-[10px] font-black flex items-center justify-center text-white border-2 border-slate-900 shadow-[0_0_10px_#ef4444]">
                  {notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-3 w-80 max-h-96 bg-slate-800 rounded-3xl border border-white/10 shadow-2xl overflow-hidden z-50 flex flex-col"
                >
                  <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
                    <h3 className="text-xs font-black uppercase text-white tracking-widest">Oznámení</h3>
                    {notifications.filter(n => !n.read).length > 0 && (
                      <button 
                        onClick={markAllNotificationsAsRead}
                        className="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase"
                      >
                        Přečíst vše
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar">
                    {notifications.length > 0 ? (
                      notifications.map(notif => (
                        <div 
                          key={notif.id} 
                          onClick={() => {
                            if (!notif.read) markNotificationAsRead(notif.id);
                            if (notif.taskId) {
                              setActiveTab(AppTab.CALENDAR);
                              setShowNotifications(false);
                            } else if (notif.vehicleId || notif.type === 'stk_warning') {
                              setActiveTab(AppTab.FLEET);
                              setShowNotifications(false);
                            }
                          }}
                          className={`p-4 border-b border-white/5 cursor-pointer transition-colors hover:bg-slate-700/50 ${
                            notif.read ? 'opacity-50' : notif.type === 'stk_warning' ? 'bg-amber-500/10' : 'bg-blue-500/5'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center gap-1.5">
                              {notif.type === 'stk_warning' && <span className="text-amber-400">⚠️</span>}
                              <span className={`text-[10px] font-black uppercase tracking-widest ${
                                notif.type === 'stk_warning' ? 'text-amber-400' : 'text-blue-400'
                              }`}>
                                {notif.title}
                              </span>
                            </div>
                            <span className="text-[9px] font-bold text-slate-500">{notif.createdAt.toLocaleDateString('cs-CZ')}</span>
                          </div>
                          <p className="text-xs text-slate-300 font-medium leading-relaxed">{notif.message}</p>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                        <Icons.Check className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Žádná nová oznámení</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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

      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 100 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-8 py-4 rounded-3xl font-black uppercase text-xs tracking-[0.2em] shadow-[0_20px_50px_rgba(22,163,74,0.4)] flex items-center gap-3 border border-green-400/30"
          >
            <Icons.Sparkles className="w-5 h-5" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-y-auto no-scrollbar p-3 sm:p-6 md:p-8 lg:p-12 pb-32 md:pb-36 w-full max-w-7xl mx-auto transition-all duration-300">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === AppTab.DASHBOARD && <Dashboard tasks={tasks} workers={workers} vehicles={vehicles} user={user} showToast={showToast} />}
            {activeTab === AppTab.CALENDAR && <CalendarView tasks={tasks} setTasks={setTasks} workers={workers} vehicles={vehicles} user={user} googleAccessToken={googleAccessToken} showToast={showToast} />}
            {activeTab === AppTab.FLEET && (
              <FleetView 
                workers={workers} 
                setWorkers={setWorkers} 
                vehicles={vehicles} 
                setVehicles={setVehicles} 
                tasks={tasks}
                user={user} 
                showToast={showToast} 
              />
            )}
            {activeTab === AppTab.MAINTENANCE && (
              <MaintenanceView 
                maintenanceRequests={maintenanceRequests}
                user={user!}
                showToast={showToast}
              />
            )}
            {activeTab === AppTab.ANALYSIS && (
              <OrderAnalysis 
                tasks={tasks}
                transactions={transactions}
                workers={workers}
                vehicles={vehicles}
              />
            )}
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
                showToast={showToast}
                companySettings={companySettings}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Main Navigation Bar - Floating & freely draggable without edge snapping */}
      <motion.nav
        ref={navRef as any}
        drag={isDesktop}
        dragControls={navDragControls}
        dragListener={false}
        dragMomentum={false}
        onDragStart={() => setIsDraggingNav(true)}
        onDragEnd={handleDragEnd}
        style={isDesktop ? { x: navX, y: navY } : undefined}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget && isDesktop) {
            navDragControls.start(e);
          }
        }}
        className={`bg-slate-900/95 backdrop-blur-2xl z-40 select-none ${
          isDraggingNav ? 'ring-2 ring-blue-500/50 shadow-2xl scale-[1.01]' : 'shadow-2xl'
        } ${
          isDesktop
            ? isVertical
              ? 'fixed left-0 top-0 flex flex-col items-center p-2.5 border border-white/20 rounded-[28px] gap-2 max-h-[calc(100vh-32px)] overflow-y-auto no-scrollbar transition-shadow'
              : 'fixed left-0 top-0 flex flex-row items-center justify-center p-3 md:px-5 md:py-3 border border-white/20 rounded-full md:gap-3 lg:gap-4 transition-shadow'
            : 'fixed bottom-0 left-0 right-0 w-full flex flex-row items-center justify-around p-4 border-t border-white/10 rounded-t-[35px]'
        }`}
      >
        {/* Desktop Handle: Drag Grip + Orientation Toggle + Reset Button */}
        {isDesktop && (
          isVertical ? (
            <div 
              onPointerDown={(e) => navDragControls.start(e)}
              className="flex flex-col items-center gap-1.5 pb-2 mb-1 border-b border-white/10 cursor-grab active:cursor-grabbing group/drag w-full"
              title="Přetáhněte panel kamkoliv na obrazovce"
            >
              <div className="p-1 rounded-md text-white/40 group-hover/drag:text-blue-400 transition-colors">
                <Icons.Move className="w-4 h-4" />
              </div>
              <div 
                className="flex items-center gap-1 bg-slate-800/90 p-0.5 rounded-md border border-white/5 shadow-inner"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={toggleOrientation}
                  className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  title="Přepnout na vodorovné zobrazení"
                >
                  <Icons.PanelBottom className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={resetToBottomCenter}
                  className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  title="Vrátit dolů do středu"
                >
                  <Icons.RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <div 
              onPointerDown={(e) => navDragControls.start(e)}
              className="flex items-center gap-2 pr-3 mr-1 border-r border-white/10 cursor-grab active:cursor-grabbing group/drag"
              title="Přetáhněte panel kamkoliv na obrazovce"
            >
              <div className="p-1 rounded-md text-white/40 group-hover/drag:text-blue-400 transition-colors">
                <Icons.Move className="w-4 h-4" />
              </div>
              <div 
                className="flex items-center gap-1 bg-slate-800/90 p-0.5 rounded-md border border-white/5 shadow-inner"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={toggleOrientation}
                  className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  title="Přepnout na svislé zobrazení"
                >
                  <Icons.PanelLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={resetToBottomCenter}
                  className="p-1 rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  title="Vrátit dolů do středu"
                >
                  <Icons.RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        )}

        <NavButton 
          active={activeTab === AppTab.DASHBOARD} 
          onClick={() => setActiveTab(AppTab.DASHBOARD)} 
          icon={<Icons.Home />} 
          label="Domů" 
          isVertical={isDesktop && isVertical}
        />
        <NavButton 
          active={activeTab === AppTab.CALENDAR} 
          onClick={() => setActiveTab(AppTab.CALENDAR)} 
          icon={<Icons.Calendar />} 
          label="Kalendář" 
          isVertical={isDesktop && isVertical}
        />
        <NavButton 
          active={activeTab === AppTab.FLEET} 
          onClick={() => setActiveTab(AppTab.FLEET)} 
          icon={<Icons.Truck />} 
          label="Flotila" 
          isVertical={isDesktop && isVertical}
        />
        <NavButton 
          active={activeTab === AppTab.ANALYSIS} 
          onClick={() => setActiveTab(AppTab.ANALYSIS)} 
          icon={<Icons.Sparkles />} 
          label="Analýza" 
          disabled={user?.role !== 'admin' && user?.role !== 'editor'}
          isVertical={isDesktop && isVertical}
        />
        <NavButton 
          active={activeTab === AppTab.MAINTENANCE} 
          onClick={() => setActiveTab(AppTab.MAINTENANCE)} 
          icon={<Icons.Settings />} 
          label="Údržba" 
          isVertical={isDesktop && isVertical}
        />
        <NavButton 
          active={activeTab === AppTab.PROFILE} 
          onClick={() => setActiveTab(AppTab.PROFILE)} 
          icon={<Icons.User />} 
          label="Více" 
          isVertical={isDesktop && isVertical}
        />
      </motion.nav>
    </div>
  </ErrorBoundary>
  );
};

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  isVertical?: boolean;
}

const NavButton: React.FC<NavButtonProps> = ({ 
  active, 
  onClick, 
  icon, 
  label, 
  disabled, 
  isVertical = false 
}) => (
  <button 
    onClick={disabled ? undefined : onClick}
    onPointerDown={(e) => e.stopPropagation()}
    className={`flex flex-col items-center justify-center transition-all relative group select-none ${
      disabled ? 'cursor-not-allowed' : 'cursor-pointer'
    } ${
      isVertical
        ? 'w-14 h-14 md:w-16 md:h-16 rounded-2xl gap-1 p-1 hover:bg-white/5'
        : 'gap-1.5 md:gap-2 px-2.5 py-1 rounded-xl hover:bg-white/5'
    } ${
      active && isVertical ? 'bg-blue-600/15 border border-blue-500/30' : ''
    }`}
  >
    <div className={`transition-all duration-300 [&>svg]:w-6 [&>svg]:h-6 md:[&>svg]:w-7 md:[&>svg]:h-7 ${
      active 
        ? (label === 'AI Lab' ? 'scale-105 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'scale-105 text-white drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]') 
        : `scale-100 ${disabled ? 'text-white/20' : 'text-white/40 group-hover:text-white'}`
    }`}>
      {icon}
    </div>
    <span className={`text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${
      active ? 'opacity-100 text-white' : `opacity-100 ${disabled ? 'text-white/20' : 'text-white/40 group-hover:text-white'}`
    }`}>
      {label}
    </span>
    {active && !isVertical && (
      <motion.div 
        layoutId="nav-active"
        className="absolute -bottom-1.5 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_6px_#fff]"
      />
    )}
    {active && isVertical && (
      <motion.div 
        layoutId="nav-active-vertical"
        className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-400 rounded-full shadow-[0_0_8px_#60a5fa]"
      />
    )}
    {disabled && (
      <div className={`absolute opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 text-white text-[8px] font-black uppercase py-1.5 px-3 rounded-lg pointer-events-none whitespace-nowrap shadow-xl z-50 ${
        isVertical
          ? 'left-full ml-3 top-1/2 -translate-y-1/2'
          : 'bottom-full mb-4 left-1/2 -translate-x-1/2'
      }`}>
        Nemáte dostatečná oprávnění.
      </div>
    )}
  </button>
);

export default App;
