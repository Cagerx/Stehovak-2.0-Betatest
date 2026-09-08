
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icons, COLORS } from '../constants';
import { MaintenanceRequest, OperationType, isManagementRole, AppRole } from '../types';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { handleFirestoreError } from '../App';

interface MaintenanceViewProps {
  maintenanceRequests: MaintenanceRequest[];
  user: { id: string, name: string, email: string, avatar: string, role: AppRole };
  showToast: (message: string) => void;
}

const MaintenanceView: React.FC<MaintenanceViewProps> = ({ maintenanceRequests, user, showToast }) => {
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [newMaintenanceReason, setNewMaintenanceReason] = useState('');
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
  const isAdmin = isManagementRole(user.role);

  const handleAddMaintenance = async () => {
    if (!newMaintenanceReason.trim()) return;
    setIsSavingMaintenance(true);
    try {
      const id = Math.random().toString(36).substr(2, 9);
      // Use serverTimestamp() to match firestore rules request.time
      await setDoc(doc(db, 'maintenanceRequests', id), {
        id,
        reason: newMaintenanceReason,
        userId: user.id,
        userName: user.name,
        createdAt: serverTimestamp(),
        status: 'Pending'
      });
      showToast("Požadavek odeslán");
      setNewMaintenanceReason('');
      setShowMaintenanceModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'maintenanceRequests');
    } finally {
      setIsSavingMaintenance(false);
    }
  };

  const handleUpdateMaintenanceStatus = async (req: MaintenanceRequest, newStatus: 'Pending' | 'Resolved') => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'maintenanceRequests', req.id), {
        status: newStatus
      }, { merge: true });
      showToast("Stav aktualizován");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `maintenanceRequests/${req.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Údržba Vozového Parku</h2>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest px-1">Správa technických požadavků a oprav</p>
      </div>

      <button 
        onClick={() => setShowMaintenanceModal(true)}
        className="w-full bg-red-600 text-white font-black py-5 rounded-[2rem] shadow-2xl shadow-red-600/30 uppercase text-xs tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all"
      >
        <Icons.Plus className="w-5 h-5" /> Nový požadavek na údržbu
      </button>

      <div className="space-y-4">
        {maintenanceRequests.length > 0 ? (
          [...maintenanceRequests]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map(req => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                key={req.id}
                className={`p-6 rounded-[2.5rem] border-2 transition-all relative overflow-hidden ${
                  req.status === 'Pending' 
                    ? 'bg-red-500/5 border-red-500/20 shadow-[0_10px_40px_rgba(239,68,68,0.1)]' 
                    : 'bg-green-500/5 border-green-500/10 shadow-[0_10px_40px_rgba(34,197,94,0.05)]'
                }`}
              >
                {req.status === 'Pending' && (
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]" />
                )}
                
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col gap-1">
                    <span className={`text-[9px] font-black uppercase px-4 py-1.5 rounded-full inline-block w-fit tracking-widest ${
                      req.status === 'Pending' ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-green-600/20 text-green-400 border border-green-500/20'
                    }`}>
                      {req.status === 'Pending' ? 'SYSTÉMOVÁ ZÁVADA' : 'VYŘEŠENO'}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Datum nahlášení</p>
                    <span className="text-[10px] text-slate-400 font-bold">
                      {new Date(req.createdAt).toLocaleDateString('cs-CZ')} {new Date(req.createdAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <p className="text-white text-lg font-black leading-tight mb-6 tracking-tight pr-4">
                  {req.reason}
                </p>

                <div className="flex justify-between items-center bg-white/5 backdrop-blur-md p-4 rounded-[1.8rem] border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center text-lg shadow-inner">👤</div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">Hlásí</span>
                      <span className="text-xs text-white font-black">{req.userName}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <button 
                      onClick={() => handleUpdateMaintenanceStatus(req, req.status === 'Pending' ? 'Resolved' : 'Pending')}
                      className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase transition-all shadow-xl active:scale-95 ${
                        req.status === 'Pending' 
                          ? 'bg-white text-black hover:bg-slate-200' 
                          : 'bg-slate-800 text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      {req.status === 'Pending' ? 'Označit za vyřešené' : 'Znovu otevřít'}
                    </button>
                  )}
                </div>
              </motion.div>
            ))
        ) : (
          <div className="text-center py-20 bg-slate-900/30 rounded-[3rem] border-2 border-dashed border-slate-800 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center text-3xl">🛠️</div>
            <p className="text-slate-500 text-sm font-black uppercase tracking-[0.2em]">Žádné požadavky na údržbu</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showMaintenanceModal && (
          <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-3xl z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6" onClick={() => setShowMaintenanceModal(false)}>
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.9 }}
              className="bg-slate-900 w-full max-w-lg rounded-[3rem] p-10 border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.8)] relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-600 via-orange-600 to-red-600" />
              
              <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-8 leading-none">Vytvořit hlášení<br/><span className="text-red-500 text-xl">o technické závadě</span></h3>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-500 uppercase px-2 tracking-widest">Detailní popis závady nebo požadavku</label>
                  <textarea 
                    value={newMaintenanceReason}
                    onChange={e => setNewMaintenanceReason(e.target.value)}
                    placeholder="Např. IVECO (1AB 1234): Nefunguje levé zadní světlo, nutná oprava před další cestou."
                    className="w-full bg-slate-800/80 rounded-[2rem] p-6 text-white border-2 border-white/5 font-bold outline-none focus:border-red-500/50 focus:bg-slate-800 transition-all min-h-[180px] resize-none text-base placeholder:text-slate-600"
                  />
                </div>
                
                <div className="bg-red-500/10 p-4 rounded-2xl border border-red-500/20 flex gap-3">
                  <div className="text-xl">⚠️</div>
                  <p className="text-[10px] text-red-400 font-bold leading-relaxed uppercase tracking-wide">
                    Hlášení bude okamžitě odesláno k vyřízení a uvidí ho všichni administrátoři.
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button onClick={() => setShowMaintenanceModal(false)} className="flex-1 text-slate-500 font-black uppercase text-xs tracking-widest hover:text-white transition-colors">Storno</button>
                  <button 
                    onClick={handleAddMaintenance} 
                    disabled={isSavingMaintenance || !newMaintenanceReason.trim()}
                    className="flex-[2] bg-white text-black font-black py-5 rounded-[1.8rem] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 uppercase text-xs tracking-widest"
                  >
                    {isSavingMaintenance ? 'Odesílám...' : 'Potvrdit a odeslat'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MaintenanceView;
