
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icons, COLORS } from '../constants';
import { Transaction, MoveTask, Worker, Vehicle, CompanySettings, OperationType } from '../types';
import { db } from '../firebase';
import { doc, setDoc, Timestamp, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError } from '../App';
import AILab from './AILab';

import { googleService, GoogleCalendarEvent, GmailMessage } from '../services/googleService';

interface ProfileProps {
  user: { id: string, name: string, email: string, avatar: string, role: 'admin' | 'user', workerId?: string };
  onLogout: () => void;
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  tasks: MoveTask[];
  workers: Worker[];
  vehicles: Vehicle[];
  googleAccessToken: string | null;
  showToast: (message: string) => void;
  companySettings: CompanySettings | null;
}

const Profile: React.FC<ProfileProps> = ({ user, onLogout, transactions, setTransactions, tasks, workers, vehicles, googleAccessToken, showToast, companySettings }) => {
  const [activeDetail, setActiveDetail] = useState<string | null>(null);
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Partial<Transaction> | null>(null);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanySettings | null>(null);
  
  const [calendarEvents, setCalendarEvents] = useState<GoogleCalendarEvent[]>([]);
  const [gmailMessages, setGmailMessages] = useState<GmailMessage[]>([]);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(localStorage.getItem('google_sync_enabled') === 'true');
  const [isSyncingGmail, setIsSyncingGmail] = useState(false);
  
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('app_notifications');
    return saved ? JSON.parse(saved) : {
      push: true,
      email: false,
      sms: true,
      whatsapp: false,
      newTasks: true,
      teamChanges: true,
      vehicleService: true,
      sounds: true,
      quietHours: false
    };
  });

  const isAdmin = user.role === 'admin';

  const updateNotification = (key: string, val: boolean) => {
    const newSettings = { ...notifications, [key]: val };
    setNotifications(newSettings);
    localStorage.setItem('app_notifications', JSON.stringify(newSettings));
    showToast("Nastavení aktualizováno");
  };

  const handleSyncToggle = (val: boolean) => {
    setSyncEnabled(val);
    localStorage.setItem('google_sync_enabled', val.toString());
    showToast("Synchronizace nastavena");
  };

  const syncGmailTasks = async () => {
    if (!googleAccessToken) return;
    setIsSyncingGmail(true);
    setGoogleError(null);
    try {
      const messages = await googleService.getGmailMessages(googleAccessToken);
      let count = 0;
      
      for (const msg of messages) {
        // Simple logic: if subject contains "stěhování" and it's not already processed
        // In a real app, we would track processed message IDs in Firestore
        const subject = (msg.subject || '').toLowerCase();
        if (subject.includes('stěhování')) {
          const taskId = `gmail-${msg.id}`;
          // Check if already exists (optimistic check)
          // For now, we just create a pending task
          await setDoc(doc(db, 'tasks', taskId), {
            id: taskId,
            title: `Z Gmailu: ${msg.subject}`,
            customer: msg.from || 'Neznámý',
            customerPhone: '',
            start: Timestamp.fromDate(new Date()),
            end: Timestamp.fromDate(new Date(Date.now() + 3600000)),
            from: 'Zjišťuji...',
            to: 'Zjišťuji...',
            status: 'Pending',
            type: 'Stěhování',
            priority: 'Medium',
            notes: msg.snippet,
            assignedWorkers: [],
            assignedVehicles: [],
            images: []
          });
          count++;
        }
      }
      showToast(`Synchronizováno ${count} nových zakázek z Gmailu`);
    } catch (error: any) {
      const handled = handleFirestoreError(error, OperationType.WRITE, 'tasks/sync');
      if (!handled) {
        console.error("Gmail Sync Error:", error);
        setGoogleError("Nepodařilo se synchronizovat Gmail.");
      }
    } finally {
      setIsSyncingGmail(false);
    }
  };

  const userTransactions = (isAdmin 
    ? [...transactions]
    : transactions.filter(t => t.userId === user.id)
  ).sort((a, b) => b.date.getTime() - a.date.getTime());

  const handleAddTransaction = () => {
    setEditingTransaction({
      type: 'expense',
      amount: 0,
      description: '',
      category: 'Ostatní',
      method: 'Cash',
      date: new Date(),
      userId: user.id,
      userName: user.name
    });
    setShowTransactionModal(true);
  };

  const handleEditTransaction = (tr: Transaction) => {
    if (!isAdmin && tr.userId !== user.id) return;
    setEditingTransaction({ ...tr });
    setShowTransactionModal(true);
  };

  const saveTransaction = async () => {
    if (!editingTransaction || !editingTransaction.description || editingTransaction.amount === undefined || editingTransaction.amount === null) {
      alert("Prosím vyplňte popis a částku.");
      return;
    }
    
    const newTr = {
      ...editingTransaction,
      id: editingTransaction.id || Math.random().toString(36).substr(2, 9),
      date: editingTransaction.date || new Date(),
      userId: editingTransaction.userId || user.id,
      userName: editingTransaction.userName || user.name,
      amount: Number(editingTransaction.amount),
      category: editingTransaction.category || 'Ostatní',
      method: editingTransaction.method || 'Cash'
    } as Transaction;

    if (isNaN(newTr.amount)) {
      alert("Částka musí být platné číslo.");
      return;
    }

    try {
      await setDoc(doc(db, 'transactions', newTr.id), {
        ...newTr,
        date: Timestamp.fromDate(newTr.date)
      });
      
      showToast(editingTransaction.id ? "Záznam upraven" : "Platba uložena");

      setShowTransactionModal(false);
      setEditingTransaction(null);
    } catch (error) {
      const handled = handleFirestoreError(error, OperationType.WRITE, `transactions/${newTr.id}`);
      if (!handled) {
        console.error("Transaction save error:", error);
        alert("Chyba při ukládání transakce.");
      }
    }
  };

  const saveCompanyInfo = async () => {
    if (!editingCompany || !editingCompany.name || !editingCompany.address || !editingCompany.phone || !editingCompany.email) {
      alert("Prosím vyplňte povinná pole (Název, Adresa, Telefon, Email).");
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'company'), editingCompany);
      showToast("Změny byly uloženy");
      setShowCompanyModal(false);
    } catch (error) {
      const handled = handleFirestoreError(error, OperationType.WRITE, 'settings/company');
      if (!handled) {
        console.error("Company info save error:", error);
        alert("Chyba při ukládání informací o firmě.");
      }
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!confirm("Opravdu chcete tento záznam smazat?")) return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
      showToast("Záznam smazán");
      setShowTransactionModal(false);
      setEditingTransaction(null);
    } catch (error) {
      const handled = handleFirestoreError(error, OperationType.DELETE, `transactions/${id}`);
      if (!handled) {
        console.error("Transaction delete error:", error);
        alert("Chyba při mazání.");
      }
    }
  };

  // --- CSV Export Logic ---

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toLocaleString('cs-CZ');
    if (Array.isArray(value)) return value.join('; ');
    if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
    return String(value).replace(/"/g, '""');
  };

  const generateCSV = (data: any[]) => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => 
      headers.map(header => `"${formatValue(obj[header])}"`).join(',')
    );
    // Add BOM for Excel UTF-8 compatibility
    return '\uFEFF' + [headers.join(','), ...rows].join('\n');
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportTasks = () => {
    const data = tasks.map(t => ({
      ID: t.id,
      Název: t.title,
      Zákazník: t.customer,
      Telefon: t.customerPhone || '',
      Start: t.start,
      Konec: t.end,
      Odkud: t.from,
      Kam: t.to,
      Tým: t.assignedWorkers.map(id => workers.find(w => w.id === id)?.name || id).join(', '),
      Vozidla: t.assignedVehicles.map(id => vehicles.find(v => v.id === id)?.model || id).join(', '),
      Stav: t.status,
      Poznámky: t.notes || ''
    }));
    downloadCSV(generateCSV(data), 'zakazky_export.csv');
  };

  const exportWorkers = () => {
    const data = workers.map(w => ({
      Jméno: w.name,
      Email: w.email || '',
      Telefon: w.phone,
      Pozice: w.role,
      Status: w.status
    }));
    downloadCSV(generateCSV(data), 'tym_export.csv');
  };

  const exportVehicles = () => {
    const data = vehicles.map(v => ({
      Vozidlo: v.model,
      SPZ: v.plate,
      Kapacita: v.capacity,
      Status: v.status,
      STK: v.stkExpiration || ''
    }));
    downloadCSV(generateCSV(data), 'flotila_export.csv');
  };

  const exportTransactions = () => {
    const data = transactions.map(t => ({
      Datum: t.date,
      Typ: t.type === 'income' ? 'Příjem' : 'Výdaj',
      Částka: t.amount,
      Popis: t.description,
      Autor: t.userName
    }));
    downloadCSV(generateCSV(data), 'transakce_export.csv');
  };

  // --- End CSV Export Logic ---

  const renderDetail = () => {
    switch (activeDetail) {
      case 'Informace o firmě':
        const displayInfo = companySettings || {
          name: 'Stěhovák 2.0 Logistics s.r.o.',
          address: 'Logistická 42, 110 00 Praha 1',
          phone: '+420 800 123 456',
          email: 'info@stehovak2.com',
          taxId: '12345678',
          vatId: 'CZ12345678'
        };

        return (
          <div className="space-y-6">
            <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Název firmy</p>
              <p className="text-white font-bold">{displayInfo.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">IČO</p>
                <p className="text-white font-bold text-sm">{displayInfo.taxId || '---'}</p>
              </div>
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">DIČ</p>
                <p className="text-white font-bold text-sm">{displayInfo.vatId || '---'}</p>
              </div>
            </div>
            <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Sídlo</p>
              <p className="text-white font-bold text-sm">{displayInfo.address}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Telefon</p>
                <p className="text-white font-bold text-sm">{displayInfo.phone}</p>
              </div>
              <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Email</p>
                <p className="text-white font-bold text-sm">{displayInfo.email}</p>
              </div>
            </div>
            {isAdmin && (
              <button 
                onClick={() => {
                  setEditingCompany({ ...displayInfo } as CompanySettings);
                  setShowCompanyModal(true);
                }}
                className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 uppercase text-[10px] tracking-widest flex items-center justify-center gap-2"
              >
                <Icons.Edit className="w-4 h-4" /> Upravit údaje
              </button>
            )}
          </div>
        );
      case 'Přijaté platby a výdaje':
        const totalIncome = userTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = userTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-green-500/20">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Celkové příjmy</p>
                <p className="text-green-500 font-black text-lg">{totalIncome.toLocaleString()} Kč</p>
              </div>
              <div className="bg-slate-800/50 p-4 rounded-2xl border border-red-500/20">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Celkové výdaje</p>
                <p className="text-red-500 font-black text-lg">{totalExpense.toLocaleString()} Kč</p>
              </div>
            </div>

            <button 
              onClick={handleAddTransaction}
              className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 uppercase text-[10px] tracking-widest flex items-center justify-center gap-2"
            >
              <Icons.Plus className="w-4 h-4" /> Nový záznam
            </button>

            <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-3 pr-1">
              {userTransactions.length > 0 ? userTransactions.map(tr => (
                <div 
                  key={tr.id} 
                  onClick={() => handleEditTransaction(tr)}
                  className="bg-slate-800 p-4 rounded-2xl border border-slate-700 flex justify-between items-center group cursor-pointer hover:border-blue-500/50 transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${tr.type === 'income' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                      {tr.category === 'Benzín' ? '⛽' : 
                       tr.category === 'Parkovné' ? '🅿️' : 
                       tr.category === 'Výplata' ? '💰' : 
                       tr.category === 'Materiál' ? '📦' : 
                       tr.category === 'Jídlo' ? '🍕' : '📝'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm truncate">{tr.description}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[9px] text-slate-500 font-black uppercase">{tr.category} • {tr.method}</p>
                        {isAdmin && (
                          <span className="text-[9px] bg-slate-900 px-2 py-0.5 rounded text-blue-400 border border-slate-700 font-black truncate max-w-[80px]">
                            {tr.userName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className={`font-black text-sm ${tr.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                      {tr.type === 'income' ? '+' : '-'} {tr.amount.toLocaleString()} Kč
                    </p>
                    <p className="text-[8px] text-slate-600 font-bold uppercase">{new Date(tr.date).toLocaleDateString('cs-CZ')}</p>
                  </div>
                </div>
              )) : (
                <div className="text-center py-12 bg-slate-800/30 rounded-3xl border border-dashed border-slate-700">
                  <p className="text-slate-600 text-xs font-bold uppercase tracking-widest">Žádné finanční záznamy</p>
                </div>
              )}
            </div>
          </div>
        );
      case 'Notifikační Hub':
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Základní kanály</h4>
              <ToggleItem 
                label="Push notifikace" 
                checked={notifications.push} 
                onChange={(val) => updateNotification('push', val)} 
                icon="📱"
              />
              <ToggleItem 
                label="Emailové reporty" 
                checked={notifications.email} 
                onChange={(val) => updateNotification('email', val)} 
                icon="📧"
              />
              <ToggleItem 
                label="SMS upozornění" 
                checked={notifications.sms} 
                onChange={(val) => updateNotification('sms', val)} 
                icon="💬"
              />
              <ToggleItem 
                label="WhatsApp integrace" 
                checked={notifications.whatsapp} 
                onChange={(val) => updateNotification('whatsapp', val)} 
                icon="🟢"
              />
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Typy upozornění</h4>
              <ToggleItem 
                label="Nové zakázky" 
                checked={notifications.newTasks} 
                onChange={(val) => updateNotification('newTasks', val)} 
              />
              <ToggleItem 
                label="Změny v týmu" 
                checked={notifications.teamChanges} 
                onChange={(val) => updateNotification('teamChanges', val)} 
              />
              <ToggleItem 
                label="Servis vozidel" 
                checked={notifications.vehicleService} 
                onChange={(val) => updateNotification('vehicleService', val)} 
              />
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Předvolby systému</h4>
              <ToggleItem 
                label="Zvukové signály" 
                checked={notifications.sounds} 
                onChange={(val) => updateNotification('sounds', val)} 
                icon="🔊"
              />
              <ToggleItem 
                label="Režim klidu (22:00 - 06:00)" 
                checked={notifications.quietHours} 
                onChange={(val) => updateNotification('quietHours', val)} 
                icon="🌙"
              />
            </div>
            
            <div className="bg-blue-600/10 p-4 rounded-2xl border border-blue-500/20">
              <p className="text-[10px] text-blue-400 font-bold text-center leading-relaxed">
                Nastavení se automaticky ukládají do vašeho prohlížeče a synchronizují se s vaším účtem.
              </p>
            </div>
          </div>
        );
      case 'Export Dat':
        return (
          <div className="space-y-4">
             <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 mb-4">
               <p className="text-slate-400 text-xs font-bold text-center leading-relaxed">
                 Data budou stažena ve formátu CSV. Tento formát je kompatibilní s Excelem a Google Sheets.
               </p>
             </div>
             <ExportButton label="Exportovat Zakázky" onClick={exportTasks} icon={<Icons.Calendar />} />
             <ExportButton label="Exportovat Tým" onClick={exportWorkers} icon={<Icons.User />} />
             <ExportButton label="Exportovat Flotilu" onClick={exportVehicles} icon={<Icons.Truck />} />
             <ExportButton label="Exportovat Transakce" onClick={exportTransactions} icon={<Icons.Sparkles />} />
          </div>
        );
      case 'AI Laboratoř':
        return <AILab user={user} showToast={showToast} />;
      case 'O Aplikaci':
        return (
          <div className="space-y-6">
            <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 text-center">
              <div className="w-24 h-24 mx-auto mb-4 relative flex items-center justify-center">
                 <img 
                   src="/logo.png" 
                   alt="App Logo" 
                   className="w-full h-full object-contain drop-shadow-2xl" 
                   onError={(e) => {
                     e.currentTarget.onerror = null;
                     e.currentTarget.style.display = 'none';
                     e.currentTarget.parentElement!.innerHTML = '<span class="text-5xl">🚛</span>';
                   }}
                 />
              </div>
              <h4 className="text-xl font-black text-white tracking-tighter">Stěhovák 2.0</h4>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">Logistics Core</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between p-4 bg-slate-800 rounded-2xl border border-slate-700">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Verze</span>
                <span className="text-xs font-black text-white">2.0.4 Premium</span>
              </div>
              <div className="flex justify-between p-4 bg-slate-800 rounded-2xl border border-slate-700">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Vývoj</span>
                <span className="text-xs font-black text-blue-400">Vítězslav Gerčák</span>
              </div>
              <div className="flex justify-between p-4 bg-slate-800 rounded-2xl border border-slate-700">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Licence</span>
                <span className="text-xs font-black text-green-500">Aktivní</span>
              </div>
            </div>
            {isAdmin && (
              <button 
                onClick={async () => {
                  try {
                    const workersRef = [
                      { id: '1', name: 'Jan Novák', email: 'admin@stehovak2.com', phone: '777123456', role: 'Driver', status: 'Available' },
                      { id: '2', name: 'Petr Svoboda', email: 'petr.svoboda@example.com', phone: '777654321', role: 'Loader', status: 'On Task' },
                      { id: '3', name: 'Marek Kučera', email: 'marek.kucera@example.com', phone: '777987654', role: 'Loader', status: 'Available' },
                    ];
                    const vehiclesRef = [
                      { id: '1', plate: '1AB 1234', model: 'Iveco Daily', capacity: '15m3', status: 'Ready' },
                      { id: '2', plate: '2BC 5678', model: 'Mercedes Sprinter', capacity: '12m3', status: 'In Use' },
                    ];
                    
                    const getTomorrow = () => {
                      const d = new Date();
                      d.setDate(d.getDate() + 1);
                      d.setHours(9, 0, 0, 0);
                      return d;
                    };
                    
                    const tasksRef = [
                      {
                        id: 't1',
                        title: 'Stěhování bytu 2+kk',
                        customer: 'Karel Dvořák',
                        customerPhone: '+420 720 123 456',
                        start: new Date(new Date().setHours(10, 0, 0, 0)),
                        end: new Date(new Date().setHours(14, 0, 0, 0)),
                        from: 'Praha 1',
                        to: 'Praha 4',
                        assignedWorkers: ['1', '2'],
                        assignedVehicles: ['1'],
                        status: 'Confirmed'
                      },
                      {
                        id: 't2',
                        title: 'Kanceláře "TechHub"',
                        customer: 'Alena Modrá',
                        customerPhone: '+420 603 444 555',
                        start: getTomorrow(),
                        end: new Date(getTomorrow().getTime() + 6 * 60 * 60 * 1000),
                        from: 'Brno Střed',
                        to: 'Ostrava - Poruba',
                        assignedWorkers: ['3'],
                        assignedVehicles: ['2'],
                        status: 'Pending'
                      }
                    ];
                    
                    for (const w of workersRef) await setDoc(doc(db, 'workers', w.id), w);
                    for (const v of vehiclesRef) await setDoc(doc(db, 'vehicles', v.id), v);
                    for (const t of tasksRef) await setDoc(doc(db, 'tasks', t.id), t);
                    alert('Ukázková data byla úspěšně nahrána!');
                  } catch (e: any) {
                    const isAbort = e.name === 'AbortError' || e.message?.toLowerCase().includes('aborted');
                    if (!isAbort) {
                      console.error(e);
                      alert('Chyba při nahrávání dat.');
                    }
                  }
                }}
                className="w-full bg-blue-600/20 text-blue-400 font-black py-4 rounded-2xl border border-blue-500/30 uppercase text-[10px] tracking-widest hover:bg-blue-600/40 transition-all"
              >
                Nahrát ukázková data (Tým, Flotila, Zakázky)
              </button>
            )}
            <div className="space-y-4">
              <p className="text-[10px] text-slate-400 text-center font-bold px-4 leading-relaxed">
                Tento systém je navržen pro maximální efektivitu stěhovacích týmů a plánování zakázek s využitím pokročilých AI technologií.
              </p>
              <p className="text-[10px] text-slate-400 text-center font-bold px-4 leading-relaxed border-t border-slate-800 pt-4">
                Tato aplikace byla vytvořena výhradně pro interní použití společnosti Stěhování Matěj a nesmí s ní být nijak nakládáno, bez výslovného souhlasu jejího vlastníka a vývojáře ( Vítězslav Gerčák ).
              </p>
            </div>
          </div>
        );
      case 'Google Integrace':
        return (
          <div className="space-y-6">
            {!googleAccessToken ? (
              <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 text-center">
                <p className="text-slate-400 text-xs font-bold mb-4">Pro aktivaci Google služeb se prosím znovu přihlaste a udělte potřebná oprávnění.</p>
                <button onClick={onLogout} className="bg-blue-600 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase">Odhlásit a přihlásit znovu</button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-white font-bold">Automatická synchronizace</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Kalendář & Gmail</p>
                    </div>
                    <div 
                      onClick={() => handleSyncToggle(!syncEnabled)}
                      className={`w-12 h-6 rounded-full transition-all cursor-pointer relative ${syncEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${syncEnabled ? 'left-7' : 'left-1'}`} />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Při zapnuté synchronizaci se každá nová zakázka automaticky zapíše do vašeho Google Kalendáře.
                  </p>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={syncGmailTasks}
                    disabled={isSyncingGmail}
                    className="w-full bg-slate-800 hover:bg-slate-750 text-white font-black py-4 rounded-2xl border border-slate-700 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSyncingGmail ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Icons.Sparkles className="w-4 h-4 text-blue-400" />
                    )}
                    <span className="text-[10px] uppercase tracking-widest">Vytěžit zakázky z Gmailu</span>
                  </button>
                  <p className="text-[9px] text-slate-500 text-center font-bold px-4">
                    Tato funkce prohledá váš Gmail a automaticky vytvoří koncepty zakázek na základě poptávek.
                  </p>
                </div>

                {googleError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-center">
                    <p className="text-red-500 text-[10px] font-bold">{googleError}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      default:
        return <p className="text-slate-500 text-center italic">Sekce ve vývoji...</p>;
    }
  };

  return (
    <div className="space-y-8 flex flex-col items-center animate-fade-in">

      <div className="text-center mt-8">
        <div className="w-32 h-32 rounded-[40px] border-4 border-white/20 shadow-2xl mx-auto overflow-hidden relative mb-6">
          <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col items-center gap-1">
           <h2 className="text-2xl font-black text-white tracking-tighter uppercase">{user.name}</h2>
           {isAdmin && <span className="text-[8px] bg-red-600 text-white px-3 py-0.5 rounded-full font-black uppercase tracking-widest">Administrátor</span>}
        </div>
        <p className="text-white/50 text-sm font-bold uppercase tracking-widest mt-1">{user.email}</p>
        
        {user.workerId && (
          <div className="mt-4 inline-flex items-center gap-2 bg-blue-900/30 px-4 py-1.5 rounded-full border border-blue-500/30">
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shadow-[0_0_8px_#60a5fa]" />
            <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Identita Ověřena</span>
          </div>
        )}
      </div>

      <div className="w-full space-y-3">
        <SettingItem 
          label="Informace o firmě" 
          icon="🏢" 
          onClick={() => setActiveDetail('Informace o firmě')} 
        />
        <SettingItem 
          label="Notifikační Hub" 
          icon="🔔" 
          onClick={() => setActiveDetail('Notifikační Hub')} 
        />
        <SettingItem 
          label="Přijaté platby a výdaje" 
          icon="💳" 
          onClick={() => setActiveDetail('Přijaté platby a výdaje')} 
        />
        <SettingItem 
          label="Export Dat" 
          icon="💾" 
          onClick={() => setActiveDetail('Export Dat')} 
        />
        <SettingItem 
          label="Google Integrace" 
          icon="🌐" 
          onClick={() => setActiveDetail('Google Integrace')} 
        />
        <SettingItem 
          label="AI Laboratoř" 
          icon="✨" 
          onClick={() => setActiveDetail('AI Laboratoř')} 
        />
        <SettingItem 
          label="O Aplikaci" 
          icon="🚀" 
          onClick={() => setActiveDetail('O Aplikaci')} 
        />
      </div>

      <button 
        onClick={onLogout}
        className="w-full py-5 text-red-500 font-black bg-red-950/20 border border-red-900/30 rounded-[2rem] mt-8 hover:bg-red-950/40 transition-all active:scale-[0.98] uppercase tracking-[0.2em] text-xs"
      >
        Ukončit Relaci
      </button>

      <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] text-center pt-4">Logistics Core v2.0.4</p>

      {/* Detail Modal */}
      <AnimatePresence>
        {activeDetail && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-lg z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setActiveDetail(null)}>
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-slate-900 w-full max-w-md rounded-[32px] p-8 border border-slate-800 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">{activeDetail}</h3>
                <button onClick={() => setActiveDetail(null)} className="p-2 bg-slate-800 rounded-xl text-white/50 hover:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              
              {renderDetail()}

              <button 
                onClick={() => setActiveDetail(null)}
                className="w-full bg-slate-800 text-white font-black py-4 rounded-2xl mt-8 uppercase text-[10px] tracking-widest"
              >
                Zavřít detail
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Company Info Edit Modal */}
      <AnimatePresence>
        {showCompanyModal && editingCompany && (
          <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[60] flex items-end sm:items-center justify-center p-4" onClick={() => setShowCompanyModal(false)}>
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-slate-900 w-full max-w-sm rounded-[32px] p-8 border border-slate-800 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Upravit údaje firmy</h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Název firmy</label>
                  <input 
                    value={editingCompany.name} 
                    onChange={e => setEditingCompany({...editingCompany, name: e.target.value})}
                    className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none focus:ring-2 ring-blue-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Sídlo (Adresa)</label>
                  <input 
                    value={editingCompany.address} 
                    onChange={e => setEditingCompany({...editingCompany, address: e.target.value})}
                    className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none focus:ring-2 ring-blue-500/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Telefon</label>
                    <input 
                      value={editingCompany.phone} 
                      onChange={e => setEditingCompany({...editingCompany, phone: e.target.value})}
                      className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none focus:ring-2 ring-blue-500/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Email</label>
                    <input 
                      value={editingCompany.email} 
                      onChange={e => setEditingCompany({...editingCompany, email: e.target.value})}
                      className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none focus:ring-2 ring-blue-500/50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">IČO</label>
                    <input 
                      value={editingCompany.taxId || ''} 
                      onChange={e => setEditingCompany({...editingCompany, taxId: e.target.value})}
                      className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none focus:ring-2 ring-blue-500/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">DIČ</label>
                    <input 
                      value={editingCompany.vatId || ''} 
                      onChange={e => setEditingCompany({...editingCompany, vatId: e.target.value})}
                      className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none focus:ring-2 ring-blue-500/50"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Webová stránka</label>
                  <input 
                    value={editingCompany.website || ''} 
                    onChange={e => setEditingCompany({...editingCompany, website: e.target.value})}
                    className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none focus:ring-2 ring-blue-500/50"
                  />
                </div>
                
                <div className="flex gap-4 pt-4">
                  <button onClick={() => setShowCompanyModal(false)} className="flex-1 text-slate-500 font-black uppercase text-[10px] tracking-widest">Zrušit</button>
                  <button onClick={saveCompanyInfo} className="flex-[2] bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 uppercase text-[10px] tracking-widest active:scale-95 transition-all">Uložit změny</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Edit Modal */}
      <AnimatePresence>
        {showTransactionModal && editingTransaction && (
          <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[60] flex items-end sm:items-center justify-center p-4" onClick={() => setShowTransactionModal(false)}>
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-slate-900 w-full max-w-sm rounded-[32px] p-8 border border-slate-800 shadow-2xl overflow-y-auto no-scrollbar max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">{editingTransaction.id ? 'Upravit záznam' : 'Nový záznam'}</h3>
              {editingTransaction.id && (
                <button 
                  onClick={() => deleteTransaction(editingTransaction.id!)}
                  className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                >
                  <Icons.Trash className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="space-y-5">
              <div className="flex bg-slate-800 p-1 rounded-2xl border border-slate-700">
                <button 
                  onClick={() => setEditingTransaction({...editingTransaction, type: 'income'})}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${editingTransaction.type === 'income' ? 'bg-green-600 text-white' : 'text-slate-500'}`}
                >
                  Příjem
                </button>
                <button 
                  onClick={() => setEditingTransaction({...editingTransaction, type: 'expense'})}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${editingTransaction.type === 'expense' ? 'bg-red-600 text-white' : 'text-slate-500'}`}
                >
                  Výdaj
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Popis</label>
                <input 
                  value={editingTransaction.description} 
                  onChange={e => setEditingTransaction({...editingTransaction, description: e.target.value})}
                  placeholder="např. Benzín IVECO"
                  className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none focus:ring-2 ring-blue-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Kategorie</label>
                  <select 
                    value={editingTransaction.category} 
                    onChange={e => setEditingTransaction({...editingTransaction, category: e.target.value})}
                    className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none appearance-none"
                  >
                    <option value="Benzín">⛽ Benzín</option>
                    <option value="Parkovné">🅿️ Parkovné</option>
                    <option value="Výplata">💰 Výplata</option>
                    <option value="Materiál">📦 Materiál</option>
                    <option value="Jídlo">🍕 Jídlo</option>
                    <option value="Ostatní">📝 Ostatní</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Metoda</label>
                  <select 
                    value={editingTransaction.method} 
                    onChange={e => setEditingTransaction({...editingTransaction, method: e.target.value as any})}
                    className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none appearance-none"
                  >
                    <option value="Cash">💵 Hotovost</option>
                    <option value="Card">💳 Karta</option>
                    <option value="Transfer">🏦 Převod</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Částka (Kč)</label>
                  <input 
                    type="number"
                    step="any"
                    value={editingTransaction.amount ?? ''} 
                    onChange={e => setEditingTransaction({...editingTransaction, amount: e.target.value === '' ? undefined : Number(e.target.value)})}
                    className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-black text-lg outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1 tracking-widest">Datum</label>
                  <input 
                    type="date"
                    value={editingTransaction.date ? new Date(editingTransaction.date).toISOString().split('T')[0] : ''} 
                    onChange={e => setEditingTransaction({...editingTransaction, date: new Date(e.target.value)})}
                    className="w-full bg-slate-800 rounded-2xl p-4 text-white border-none font-bold outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowTransactionModal(false)} className="flex-1 text-slate-500 font-black uppercase text-[10px] tracking-widest">Zrušit</button>
                <button onClick={saveTransaction} className="flex-[2] bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 uppercase text-[10px] tracking-widest active:scale-95 transition-all">Uložit</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </div>
  );
};

const SettingItem = ({ label, icon, onClick, className = "" }: { label: string, icon: string, onClick?: () => void, className?: string }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between p-5 bg-slate-800 rounded-[2rem] border border-slate-700 shadow-sm hover:bg-slate-750 hover:border-blue-500/30 transition-all group ${className}`}
  >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center text-xl shadow-inner group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className="flex flex-col items-start">
          <span className="text-xs font-black text-slate-300 uppercase tracking-widest">{label}</span>
        </div>
      </div>
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700 group-hover:text-blue-500 transition-colors"><path d="m9 18 6-6-6-6"/></svg>
  </button>
);

const ToggleItem = ({ label, checked, onChange, icon }: { label: string, checked: boolean, onChange?: (val: boolean) => void, icon?: string }) => (
  <div 
    onClick={() => onChange?.(!checked)}
    className="flex items-center justify-between bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors"
  >
    <div className="flex items-center gap-3">
      {icon && <span className="text-sm">{icon}</span>}
      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{label}</span>
    </div>
    <div className={`w-10 h-6 rounded-full transition-colors relative ${checked ? 'bg-blue-600' : 'bg-slate-700'}`}>
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${checked ? 'left-5' : 'left-1'}`} />
    </div>
  </div>
);

const ExportButton = ({ label, onClick, icon }: { label: string, onClick: () => void, icon: React.ReactNode }) => (
  <button 
    onClick={onClick}
    className="w-full flex items-center justify-between p-5 bg-slate-800 rounded-2xl border border-slate-700 hover:bg-blue-600 hover:border-blue-500 hover:text-white transition-all group"
  >
    <div className="flex items-center gap-3">
       <div className="text-blue-400 group-hover:text-white transition-colors">{icon}</div>
       <span className="text-xs font-black uppercase tracking-widest text-slate-300 group-hover:text-white">{label}</span>
    </div>
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
  </button>
);

export default Profile;
