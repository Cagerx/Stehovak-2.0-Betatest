import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MoveTask, Worker, Vehicle } from '../types';
import { Icons } from '../constants';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../App';

interface DashboardProps {
  tasks: MoveTask[];
  workers: Worker[];
  vehicles: Vehicle[];
  user: {
    workerId?: string;
    role: 'admin' | 'user';
  };
}

const Dashboard: React.FC<DashboardProps> = ({ tasks, workers, vehicles, user }) => {
  const [selectedTask, setSelectedTask] = useState<MoveTask | null>(null);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const weeklyStats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const weekTasks = tasks.filter(t => t.start >= startOfWeek && t.start <= endOfWeek);
    const completed = weekTasks.filter(t => t.status === 'Completed').length;
    return { total: weekTasks.length, completed };
  }, [tasks]);

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const monthTasks = tasks.filter(t => t.start >= startOfMonth && t.start <= endOfMonth);
    const completed = monthTasks.filter(t => t.status === 'Completed').length;
    return { total: monthTasks.length, completed };
  }, [tasks]);

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const isTomorrow = (date: Date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.getDate() === tomorrow.getDate() &&
      date.getMonth() === tomorrow.getMonth() &&
      date.getFullYear() === tomorrow.getFullYear();
  };

  const myAssignedTasks = user.workerId 
    ? tasks.filter(t => t.assignedWorkers.includes(user.workerId!))
    : [];

  const myTodayStartTask = [...myAssignedTasks]
    .filter(t => isToday(t.start))
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

  const myTomorrowStartTask = [...myAssignedTasks]
    .filter(t => isTomorrow(t.start))
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

  const updateTaskStatus = async (taskId: string, newStatus: MoveTask['status']) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const myTasksForList = useMemo(() => {
    return user.role === 'admin' 
      ? tasks 
      : tasks.filter(t => t.assignedWorkers.includes(user.workerId || ''));
  }, [tasks, user.role, user.workerId]);

  const todayTasks = useMemo(() => 
    myTasksForList
      .filter(t => isToday(t.start))
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [myTasksForList]
  );

  const tomorrowTasks = useMemo(() => 
    myTasksForList
      .filter(t => isTomorrow(t.start))
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [myTasksForList]
  );

  const firstTaskTomorrowGlobal = [...tasks]
    .filter(t => isTomorrow(t.start))
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

  const handleOpenMaps = (address?: string) => {
    if (!address) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const sendNotification = (type: 'whatsapp' | 'sms', task: MoveTask) => {
    const timeStr = `${task.start.getHours()}:${task.start.getMinutes().toString().padStart(2, '0')}`;
    const dateStr = task.start.toLocaleDateString('cs-CZ');
    
    const assignedTeam = workers.filter(w => task.assignedWorkers.includes(w.id));
    const recipients = assignedTeam
        .map(w => w.phone.replace(/\s+/g, ''))
        .filter(p => p.length > 0)
        .join(',');
    
    const message = `🚚 Stěhovák 2.0 INFO\n` +
                    `Zítřejší akce: ${task.title}\n` +
                    `⏰ Start: ${timeStr} (${dateStr})\n` +
                    `📍 ${task.from} -> ${task.to}\n` +
                    `📞 Klient: ${task.customer} (${task.customerPhone || 'bez tel.'})`;
    
    const encodedMsg = encodeURIComponent(message);
    
    if (type === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
    } else {
      window.open(`sms:${recipients}?body=${encodedMsg}`, '_self');
    }
  };

  const formatTime = (date: Date) => {
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const renderTaskCard = (task: MoveTask, index: number = 0) => (
    <motion.div
      key={task.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="w-full bg-slate-800 p-5 md:p-8 rounded-[2.5rem] shadow-sm border border-white/10 flex flex-col gap-4 hover:border-blue-500/30 transition-all relative overflow-hidden"
    >
      <div className="flex items-center gap-5 md:gap-8 cursor-pointer" onClick={() => setSelectedTask(task)}>
        <div className="flex flex-col items-center justify-center bg-slate-900 rounded-[2rem] p-4 md:p-6 min-w-[75px] md:min-w-[100px] text-white/70">
          <span className="font-black text-xl md:text-2xl leading-none text-white">
            {formatTime(task.start)}
          </span>
          <span className="text-[10px] md:text-xs font-black opacity-60 uppercase mt-1">START</span>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[8px] md:text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-900 text-white/50 uppercase">
              {task.type}
            </span>
          </div>
          <h3 className="font-black text-slate-100 text-base md:text-2xl leading-tight">{task.title}</h3>
          <p className="text-xs md:text-sm text-white/70 font-bold mt-1 uppercase tracking-tight">{task.customer}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className={`w-3 h-3 md:w-5 md:h-5 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] ${
              task.status === 'Confirmed' ? 'bg-blue-500' : 
              task.status === 'In Progress' ? 'bg-red-500 animate-pulse' : 
              task.status === 'Completed' ? 'bg-green-500' : 'bg-slate-600'
          }`} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/10">
        <button 
          onClick={(e) => { e.stopPropagation(); handleOpenMaps(task.from); }}
          className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-blue-400 p-3 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest border border-white/10"
        >
          <Icons.Map className="w-3 h-3" />
          Nakládka
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); handleOpenMaps(task.to); }}
          className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-blue-400 p-3 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest border border-white/10"
        >
          <Icons.Map className="w-3 h-3" />
          Vykládka
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); if (task.customerPhone) window.open(`tel:${task.customerPhone}`); }}
          disabled={!task.customerPhone}
          className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-700 text-green-400 p-3 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest border border-white/10 disabled:opacity-30"
        >
          <Icons.Phone className="w-3 h-3" />
          Volat
        </button>
        <div className="relative">
          <select 
            value={task.status}
            onChange={(e) => { e.stopPropagation(); updateTaskStatus(task.id, e.target.value as any); }}
            className="w-full bg-slate-900 hover:bg-slate-700 text-slate-300 p-3 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest border border-white/10 outline-none appearance-none text-center"
          >
            <option value="Pending">Čeká</option>
            <option value="Confirmed">Potvrzeno</option>
            <option value="In Progress">Probíhá</option>
            <option value="Completed">Hotovo</option>
          </select>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-4 md:gap-8">
        <StartCard 
          label="Tvůj dnešní start" 
          time={myTodayStartTask ? formatTime(myTodayStartTask.start) : '--:--'} 
          subtitle={myTodayStartTask?.title || 'Dnes nemáš zakázku'}
          color="red" 
        />
        <StartCard 
          label="Tvůj zítřejší start" 
          time={myTomorrowStartTask ? formatTime(myTomorrowStartTask.start) : '--:--'} 
          subtitle={myTomorrowStartTask?.title || 'Zítra nemáš zakázku'}
          color="blue" 
        />
      </div>

      {isDesktop && (
        <section className="grid grid-cols-2 gap-4 md:gap-8 animate-fade-in">
          <StatCard 
            title="Tento týden"
            completed={weeklyStats.completed}
            total={weeklyStats.total}
            color="blue"
          />
          <StatCard 
            title="Tento měsíc"
            completed={monthlyStats.completed}
            total={monthlyStats.total}
            color="red"
          />
        </section>
      )}

      {user.role === 'admin' && firstTaskTomorrowGlobal && (
        <section className="bg-blue-600/10 border border-blue-500/20 rounded-[3rem] p-6 md:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none transform scale-150">
            <Icons.Sparkles />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4 md:mb-6">
               <span className="w-2 h-2 md:w-3 md:h-3 bg-blue-400 rounded-full shadow-[0_0_8px_#60a5fa]" />
               <h2 className="text-[10px] md:text-sm font-black text-blue-400 uppercase tracking-widest">Zítřejší ranní start (Firma)</h2>
            </div>
            <div className="flex items-end justify-between">
               <div>
                  <p className="text-2xl md:text-5xl font-black text-white tracking-tighter">{formatTime(firstTaskTomorrowGlobal.start)}</p>
                  <p className="text-xs md:text-lg font-bold text-slate-400 uppercase truncate max-w-[180px] md:max-w-md mt-1">{firstTaskTomorrowGlobal.title}</p>
               </div>
               <div className="flex gap-2 md:gap-4">
                  <button 
                    onClick={() => sendNotification('sms', firstTaskTomorrowGlobal)}
                    className="p-4 md:p-6 bg-slate-800 text-white rounded-2xl border border-slate-700 hover:bg-slate-700 transition-all shadow-lg active:scale-90"
                  >
                    <div className="md:scale-125"><Icons.Message /></div>
                  </button>
                  <button 
                    onClick={() => sendNotification('whatsapp', firstTaskTomorrowGlobal)}
                    className="p-4 md:p-6 bg-green-600 text-white rounded-2xl border border-green-500 hover:bg-green-500 transition-all shadow-lg shadow-green-600/20 active:scale-90"
                  >
                    <div className="md:scale-125"><Icons.WhatsApp /></div>
                  </button>
               </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
        <section className="space-y-5 md:space-y-8">
            <div className="flex items-center justify-between px-2">
            <h2 className="text-xl md:text-3xl font-black text-slate-100 tracking-tighter uppercase">
              Dnešní <span className="text-red-500">Mise</span>
              {todayTasks.length > 0 && <span className="ml-3 text-sm md:text-xl opacity-30">({todayTasks.length})</span>}
            </h2>
            <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
            </div>
            <div className="space-y-4 md:space-y-6">
            {todayTasks.length > 0 ? todayTasks.map((task, index) => (
                renderTaskCard(task, index)
            )) : (
                <div className="bg-slate-800/50 rounded-[2.5rem] p-10 text-center border-2 border-dashed border-white/10">
                <p className="text-xs md:text-sm font-black text-white/40 uppercase tracking-widest">Žádné dnešní úkoly</p>
                </div>
            )}
            </div>
        </section>

        <section className="space-y-5 md:space-y-8">
            <h2 className="text-xl md:text-3xl font-black text-slate-100 tracking-tighter px-2 uppercase">
              Plány <span className="text-blue-500">Zítra</span>
              {tomorrowTasks.length > 0 && <span className="ml-3 text-sm md:text-xl opacity-30">({tomorrowTasks.length})</span>}
            </h2>
            <div className="space-y-4 md:space-y-6">
            {tomorrowTasks.length > 0 ? tomorrowTasks.map((task, index) => (
                renderTaskCard(task, index)
            )) : (
                <div className="bg-slate-800/50 rounded-[2.5rem] p-10 text-center border-2 border-dashed border-white/10">
                <p className="text-xs md:text-sm font-black text-white/40 uppercase tracking-widest">Zítra volno</p>
                </div>
            )}
            </div>
        </section>
      </div>

      {selectedTask && (
        <AnimatePresence>
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[70] flex items-end sm:items-center justify-center p-4" onClick={() => setSelectedTask(null)}>
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-slate-900 w-full max-w-lg rounded-[3rem] p-8 md:p-10 shadow-2xl border border-slate-800 max-h-[90vh] overflow-y-auto no-scrollbar"
              onClick={e => e.stopPropagation()}
            >
            <div className="flex justify-between items-start mb-8">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 text-white rounded-lg inline-block ${
                    selectedTask.status === 'Confirmed' ? 'bg-blue-600' : 
                    selectedTask.status === 'In Progress' ? 'bg-red-600' : 
                    selectedTask.status === 'Completed' ? 'bg-green-600' : 'bg-slate-600'
                  }`}>
                    {selectedTask.status}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 bg-slate-800 text-slate-400 rounded-lg inline-block">
                    {selectedTask.type}
                  </span>
                </div>
                <h3 className="text-3xl md:text-4xl font-black text-white tracking-tighter leading-tight">{selectedTask.title}</h3>
              </div>
              <button onClick={() => setSelectedTask(null)} className="bg-slate-800 p-3 rounded-2xl hover:bg-slate-700 transition-colors text-slate-400">
                <Icons.Plus className="rotate-45" />
              </button>
            </div>

            <div className="space-y-8">
              <div className="flex items-center justify-between bg-blue-600 text-white p-6 rounded-[2rem] shadow-xl shadow-blue-600/20">
                <div className="flex-1">
                  <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Zákazník</p>
                  <p className="text-xl font-black leading-tight">{selectedTask.customer}</p>
                </div>
                {selectedTask.customerPhone && (
                  <a href={`tel:${selectedTask.customerPhone.replace(/\s+/g, '')}`} className="bg-slate-900/40 text-white p-4 rounded-2xl shadow-lg active:scale-95 transition-all">
                    <Icons.Phone />
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleOpenMaps(selectedTask.from)} className="bg-slate-800 p-6 rounded-[2rem] text-left hover:bg-slate-700 transition-all border border-slate-700 group">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 group-hover:text-blue-400 transition-colors">PŘEVZETÍ</p>
                  <p className="text-xs font-black text-slate-200 truncate">{selectedTask.from}</p>
                </button>
                <button onClick={() => handleOpenMaps(selectedTask.to)} className="bg-slate-800 p-6 rounded-[2rem] text-left hover:bg-slate-700 transition-all border border-slate-700 group">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 group-hover:text-blue-400 transition-colors">CÍL</p>
                  <p className="text-xs font-black text-slate-200 truncate">{selectedTask.to}</p>
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Přiřazený tým (Řidiči a pracovníci)</p>
                <div className="grid grid-cols-1 gap-3">
                  {selectedTask.assignedWorkers.map(wid => {
                    const worker = workers.find(w => w.id === wid);
                    return (
                      <div key={wid} className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
                        <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center text-blue-400 overflow-hidden">
                          {worker?.photo ? <img src={worker.photo} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Icons.User />}
                        </div>
                        <div>
                          <p className="text-sm font-black text-white">{worker?.name || 'Neznámý pracovník'}</p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase">{worker?.role || 'Pracovník'}</p>
                        </div>
                        {worker?.phone && (
                          <a href={`tel:${worker.phone.replace(/\s+/g, '')}`} className="ml-auto p-2 text-slate-500 hover:text-blue-400 transition-colors">
                            <Icons.Phone className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                  {selectedTask.assignedWorkers.length === 0 && (
                    <p className="text-xs text-slate-600 italic px-2">Žádní pracovníci nebyli přiřazeni.</p>
                  )}
                </div>
              </div>

              {selectedTask.notes && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Poznámky k akci</p>
                  <div className="bg-slate-800/50 p-6 rounded-[2rem] border border-slate-700/50">
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{selectedTask.notes}</p>
                  </div>
                </div>
              )}

              {selectedTask.images && selectedTask.images.length > 0 && (
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Fotodokumentace ({selectedTask.images.length})</p>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedTask.images.map((img, idx) => (
                      <div key={idx} className="aspect-video rounded-2xl overflow-hidden border border-slate-800">
                        <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button 
                onClick={() => setSelectedTask(null)}
                className="w-full bg-blue-600 text-white font-black py-5 rounded-[2rem] shadow-xl shadow-blue-600/20 transition-all active:scale-95 text-sm uppercase tracking-widest hover:bg-blue-500"
              >
                Zavřít detail
              </button>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>
    )}
    </div>
  );
};

const StatCard = ({ title, completed, total, color }: { title: string, completed: number, total: number, color: 'blue' | 'red' }) => {
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    const themes = {
        blue: {
            border: 'border-blue-500/30',
            text: 'text-blue-400',
            progressBg: 'bg-blue-900/50',
            progressFill: 'bg-blue-500',
        },
        red: {
            border: 'border-red-500/30',
            text: 'text-red-500',
            progressBg: 'bg-red-900/50',
            progressFill: 'bg-red-500',
        },
    };
    const theme = themes[color];

    return (
        <div className={`p-6 md:p-8 rounded-[2.5rem] bg-slate-800 border ${theme.border} shadow-xl`}>
            <p className={`text-[10px] md:text-sm font-black uppercase tracking-widest mb-4 ${theme.text}`}>{title}</p>
            <div className="flex items-end justify-between">
                <div>
                    <span className="text-4xl md:text-5xl font-black text-white tracking-tighter">{completed}</span>
                    <span className="text-xl md:text-2xl font-bold text-slate-600 tracking-tighter"> / {total}</span>
                </div>
                <span className="text-sm md:text-base font-bold text-slate-400">Hotovo</span>
            </div>
            <div className={`w-full h-2 md:h-3 ${theme.progressBg} rounded-full mt-4 overflow-hidden`}>
                <div className={`h-full ${theme.progressFill} rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }}></div>
            </div>
        </div>
    );
};

const StartCard = ({ label, time, subtitle, color }: { label: string, time: string, subtitle: string, color: 'blue' | 'red' }) => {
  const themes = {
    blue: 'border-blue-500/30 text-blue-400',
    red: 'border-red-500/30 text-red-500'
  };

  return (
    <div className={`p-6 md:p-10 rounded-[2.5rem] bg-slate-800 border ${themes[color]} flex flex-col items-center text-center shadow-xl transition-transform hover:-translate-y-1 animate-fade-in`}>
      <p className="text-[9px] md:text-xs font-black uppercase tracking-widest opacity-60 mb-2">{label}</p>
      <span className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-1 md:mb-3">{time}</span>
      <p className="text-[9px] md:text-sm font-bold text-slate-500 uppercase truncate w-full px-2">{subtitle}</p>
    </div>
  );
};

export default Dashboard;
