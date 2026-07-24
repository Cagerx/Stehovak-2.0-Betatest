import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Icons } from '../constants';
import { format, parseISO } from 'date-fns';

interface UserSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  loginTime: string;
  lastActiveTime: string;
  durationSeconds: number;
  actions: string[];
}

interface UserSummary {
  userEmail: string;
  userName: string;
  userId: string;
  totalSessions: number;
  totalDurationSeconds: number;
  lastActiveTime: string;
  sessions: UserSession[];
}

interface AdminLogViewProps {
  showToast: (msg: string) => void;
}

const AdminLogView: React.FC<AdminLogViewProps> = ({ showToast }) => {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportFilter, setReportFilter] = useState<'all' | 'today' | 'week'>('all');

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'user_sessions'), orderBy('loginTime', 'desc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserSession));
      setSessions(data);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      try {
        const snapshot = await getDocs(collection(db, 'user_sessions'));
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserSession));
        data.sort((a, b) => new Date(b.loginTime).getTime() - new Date(a.loginTime).getTime());
        setSessions(data);
      } catch (err) {
        console.error("Fallback fetch failed:", err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // Group sessions by userEmail
  const userMap: Record<string, UserSummary> = {};
  sessions.forEach(session => {
    const email = session.userEmail || 'neznámý@email.cz';
    if (!userMap[email]) {
      userMap[email] = {
        userEmail: email,
        userName: session.userName || 'Neznámý uživatel',
        userId: session.userId || email,
        totalSessions: 0,
        totalDurationSeconds: 0,
        lastActiveTime: session.lastActiveTime || session.loginTime,
        sessions: []
      };
    }
    userMap[email].totalSessions += 1;
    userMap[email].totalDurationSeconds += (session.durationSeconds || 0);
    userMap[email].sessions.push(session);
    
    if (new Date(session.lastActiveTime || 0) > new Date(userMap[email].lastActiveTime || 0)) {
      userMap[email].lastActiveTime = session.lastActiveTime;
      userMap[email].userName = session.userName || userMap[email].userName;
    }
  });

  const usersList = Object.values(userMap).sort((a, b) => 
    new Date(b.lastActiveTime).getTime() - new Date(a.lastActiveTime).getTime()
  );

  const filteredUsers = usersList.filter(u => 
    u.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalUsageSeconds = sessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
  const uniqueUsersCount = usersList.length;

  const selectedUser = selectedUserEmail ? userMap[selectedUserEmail] : null;

  // Report generation handler
  const handleDownloadCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,Uživatel;E-mail;Počet relací;Celkový čas (s);Poslední aktivita\n";
    usersList.forEach(u => {
      const row = `"${u.userName}";"${u.userEmail}";${u.totalSessions};${u.totalDurationSeconds};"${u.lastActiveTime}"`;
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `admin_activity_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Report stažen ve formátu CSV.");
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
            <Icons.Shield className="w-6 h-6 text-blue-500" /> Admin Log & Aktivita Uživatelů
          </h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
            Přehled uživatelů, relací a časů používání aplikace
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {selectedUserEmail && (
            <button 
              onClick={() => setSelectedUserEmail(null)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-slate-700"
            >
              ← Zpět na seznam
            </button>
          )}
          <button 
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/30"
          >
            <Icons.FileText className="w-4 h-4" /> Generovat report
          </button>
          <button 
            onClick={fetchSessions}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-slate-700"
          >
            <Icons.RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Obnovit
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/80 p-5 rounded-3xl border border-slate-700/80 flex items-center gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center text-xl font-black">
            <Icons.Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Uživatelé v logu</p>
            <p className="text-2xl font-black text-white mt-0.5">{uniqueUsersCount}</p>
          </div>
        </div>

        <div className="bg-slate-800/80 p-5 rounded-3xl border border-slate-700/80 flex items-center gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-green-600/20 text-green-400 flex items-center justify-center text-xl font-black">
            <Icons.Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Celkem relací</p>
            <p className="text-2xl font-black text-white mt-0.5">{sessions.length}</p>
          </div>
        </div>

        <div className="bg-slate-800/80 p-5 rounded-3xl border border-slate-700/80 flex items-center gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-2xl bg-purple-600/20 text-purple-400 flex items-center justify-center text-xl font-black">
            <Icons.Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Celkový čas všech</p>
            <p className="text-xl font-black text-white mt-0.5">{formatDuration(totalUsageSeconds)}</p>
          </div>
        </div>
      </div>

      {!selectedUser ? (
        <>
          {/* Search Bar */}
          <div className="relative">
            <input 
              type="text"
              placeholder="Hledat uživatele podle jména nebo e-mailu..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-2xl px-4 py-3.5 text-white placeholder-slate-500 font-bold text-xs uppercase tracking-wider outline-none focus:border-blue-500 transition-all"
            />
          </div>

          {/* Users List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading ? (
              <div className="col-span-full flex justify-center p-12">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="col-span-full bg-slate-800/50 p-12 rounded-3xl border border-slate-700/50 text-center">
                <Icons.Shield className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 font-black uppercase text-xs tracking-widest">Žádní uživatelé v logu nenalezeni</p>
              </div>
            ) : (
              filteredUsers.map((u) => {
                let lastActiveFormatted = u.lastActiveTime;
                try {
                  lastActiveFormatted = format(parseISO(u.lastActiveTime), 'dd.MM.yyyy HH:mm:ss');
                } catch {}

                return (
                  <div 
                    key={u.userEmail}
                    onClick={() => setSelectedUserEmail(u.userEmail)}
                    className="bg-slate-800 p-6 rounded-3xl border border-slate-700/80 shadow-lg hover:border-blue-500/50 cursor-pointer transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-black text-lg uppercase group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            {u.userName ? u.userName[0] : 'U'}
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-white uppercase tracking-tight group-hover:text-blue-400 transition-colors">{u.userName}</h4>
                            <p className="text-[10px] text-slate-400 font-bold">{u.userEmail}</p>
                          </div>
                        </div>
                        <span className="bg-slate-900 text-slate-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-700">
                          {u.totalSessions} relací
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs font-bold text-slate-300 mt-4">
                        <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-700/30">
                          <span className="text-[9px] text-slate-500 uppercase tracking-widest block mb-0.5">Celková doba:</span>
                          <span className="text-white font-black">{formatDuration(u.totalDurationSeconds)}</span>
                        </div>
                        <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-700/30">
                          <span className="text-[9px] text-slate-500 uppercase tracking-widest block mb-0.5">Poslední aktivita:</span>
                          <span className="text-white font-black truncate block">{lastActiveFormatted}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center justify-between text-xs font-black text-blue-400 uppercase tracking-wider">
                      <span>Zobrazit detailní log</span>
                      <span className="transform group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* Selected User Detailed View */
        <div className="space-y-6">
          <div className="bg-slate-800 p-6 sm:p-8 rounded-3xl border border-slate-700 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-2xl uppercase shadow-lg">
                {selectedUser.userName ? selectedUser.userName[0] : 'U'}
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">{selectedUser.userName}</h3>
                <p className="text-xs text-slate-400 font-bold">{selectedUser.userEmail}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="bg-slate-900/80 px-4 py-3 rounded-2xl border border-slate-700">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest block font-black">Celkem aktivní čas</span>
                <span className="text-lg font-black text-blue-400">{formatDuration(selectedUser.totalDurationSeconds)}</span>
              </div>
              <div className="bg-slate-900/80 px-4 py-3 rounded-2xl border border-slate-700">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest block font-black">Celkem relací</span>
                <span className="text-lg font-black text-white">{selectedUser.totalSessions}</span>
              </div>
            </div>
          </div>

          <h4 className="text-sm font-black text-slate-300 uppercase tracking-widest px-2">
            Chronologický přehled relací a činností ({selectedUser.sessions.length})
          </h4>

          <div className="space-y-4">
            {selectedUser.sessions.map((session, index) => {
              let loginFormatted = session.loginTime;
              let lastActiveFormatted = session.lastActiveTime;
              try {
                loginFormatted = format(parseISO(session.loginTime), 'dd.MM.yyyy HH:mm:ss');
              } catch {}
              try {
                lastActiveFormatted = format(parseISO(session.lastActiveTime), 'dd.MM.yyyy HH:mm:ss');
              } catch {}

              return (
                <div key={session.id || index} className="bg-slate-800 p-6 rounded-3xl border border-slate-700/80 shadow-lg space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700/50 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center font-black text-xs">
                        #{selectedUser.sessions.length - index}
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Relace zahájena:</span>
                        <p className="text-xs font-black text-white">{loginFormatted}</p>
                      </div>
                    </div>
                    <span className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-500/30 self-start sm:self-auto">
                      Doba relace: {formatDuration(session.durationSeconds || 0)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-bold text-slate-300">
                    <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-700/30">
                      <span className="text-[9px] text-slate-500 uppercase tracking-widest block mb-1">Konec / Poslední aktivita:</span>
                      <span className="text-white font-black">{lastActiveFormatted}</span>
                    </div>
                    <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-700/30">
                      <span className="text-[9px] text-slate-500 uppercase tracking-widest block mb-1">ID relace:</span>
                      <span className="text-slate-400 font-mono text-[10px] truncate block">{session.id}</span>
                    </div>
                  </div>

                  {session.actions && session.actions.length > 0 && (
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-2 font-black">Zaznamenané akce:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {session.actions.map((action, idx) => (
                          <span key={idx} className="bg-slate-900 px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-300 border border-slate-700/50">
                            {action}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-black">
                  <Icons.FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Report aktivity uživatelů</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Generováno: {format(new Date(), 'dd.MM.yyyy HH:mm')}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowReportModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center font-black"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 grid grid-cols-3 gap-4 text-center">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-bold">Uživatelů</span>
                  <span className="text-xl font-black text-white">{uniqueUsersCount}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-bold">Relací</span>
                  <span className="text-xl font-black text-white">{sessions.length}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-bold">Celkový čas</span>
                  <span className="text-xl font-black text-blue-400">{formatDuration(totalUsageSeconds)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Přehled dle uživatelů:</span>
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {usersList.map((u, idx) => (
                    <div key={idx} className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-black text-white uppercase">{u.userName}</span>
                        <span className="text-slate-400 text-[10px] block">{u.userEmail}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-blue-400">{formatDuration(u.totalDurationSeconds)}</span>
                        <span className="text-slate-400 text-[10px] block">{u.totalSessions} relací</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-800">
              <button 
                onClick={handleDownloadCSV}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
              >
                <Icons.Download className="w-4 h-4" /> Stáhnout CSV report
              </button>
              <button 
                onClick={handlePrintReport}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-black py-3 px-6 rounded-xl uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 border border-slate-700"
              >
                <Icons.Printer className="w-4 h-4" /> Tisk / PDF
              </button>
              <button 
                onClick={() => setShowReportModal(false)}
                className="bg-slate-900 hover:bg-slate-800 text-slate-400 font-black py-3 px-6 rounded-xl uppercase text-[10px] tracking-widest transition-all"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLogView;
