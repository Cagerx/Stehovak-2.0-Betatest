import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MoveTask, Worker, Vehicle, OperationType, AppTab, isManagementRole } from '../types';
import { Icons } from '../constants';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError } from '../App';
import { useAppContext } from '../AppContext';
import { getVehicleStkStatus, formatCzechDays } from '../utils/stkUtils';

interface DashboardProps {
  tasks: MoveTask[];
  workers: Worker[];
  vehicles: Vehicle[];
  user: {
    workerId?: string;
    role: string;
    email?: string;
  };
  showToast: (message: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ tasks, workers, vehicles, user, showToast }) => {
  const { setActiveTab } = useAppContext();
  const [selectedTask, setSelectedTask] = useState<MoveTask | null>(null);
  const [isTabletOrDesktop, setIsTabletOrDesktop] = useState(window.innerWidth >= 768);

  const canManage = Boolean(
    isManagementRole(user?.role) ||
    (user?.email && ['vitezslav.gercak@gmail.com', 'stehovanimatej@gmail.com', 'admin@stehovak2.com', 'najzarj99@gmail.com'].includes(user.email.toLowerCase())) ||
    workers.find(w => w.id === user?.workerId)?.role === 'Boss'
  );

  const expiringStkVehicles = useMemo(() => {
    return vehicles
      .map(v => ({ vehicle: v, stk: getVehicleStkStatus(v.stkExpiration) }))
      .filter((item): item is { vehicle: Vehicle; stk: NonNullable<ReturnType<typeof getVehicleStkStatus>> } => 
        item.stk !== null && item.stk.isExpiringSoon
      )
      .sort((a, b) => a.stk.daysRemaining - b.stk.daysRemaining);
  }, [vehicles]);

  useEffect(() => {
    const handleResize = () => setIsTabletOrDesktop(window.innerWidth >= 768);
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

  const deleteTask = async (taskId: string) => {
    if (!window.confirm("Opravdu chcete tuto zakázku smazat?")) return;
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      showToast("Zakázka byla smazána");
      setSelectedTask(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
    }
  };

  const myTasksForList = useMemo(() => {
    return canManage 
      ? tasks 
      : tasks.filter(t => t.assignedWorkers.includes(user.workerId || ''));
  }, [tasks, canManage, user.workerId]);

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

  const myActiveTask = useMemo(() => {
    if (!user.workerId) return null;
    const now = new Date();
    return tasks.find(t => 
      t.assignedWorkers.includes(user.workerId!) && 
      t.status === 'In Progress' &&
      now >= t.start && 
      now <= t.end
    );
  }, [tasks, user.workerId]);

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

  const getStatusLabel = (status: MoveTask['status']) => {
    switch (status) {
      case 'Pending': return 'Čeká';
      case 'Confirmed': return 'Potvrzeno';
      case 'In Progress': return 'Probíhá';
      case 'Completed': return 'Hotovo';
      default: return status;
    }
  };

  const renderTaskCard = (task: MoveTask, index: number = 0) => (
    <motion.div
      key={task.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`w-full p-4 sm:p-5 md:p-8 rounded-[2.5rem] shadow-sm border flex flex-col gap-3 md:gap-4 transition-all relative overflow-hidden ${
        task.status === 'Completed' 
          ? 'bg-green-950/20 border-green-500/30 hover:border-green-500' 
          : 'bg-slate-800 border-white/10 hover:border-blue-500/30'
      }`}
    >
      <div className="flex items-center gap-3 md:gap-8 cursor-pointer" onClick={() => setSelectedTask(task)}>
        <div className={`flex flex-col items-center justify-center rounded-[2rem] p-3 md:p-6 min-w-[65px] md:min-w-[100px] shrink-0 ${task.status === 'Completed' ? 'bg-green-600/30 text-green-400' : 'bg-slate-900 text-white/70'}`}>
          <span className={`font-black text-xl md:text-2xl leading-none ${task.status === 'Completed' ? 'text-green-400' : 'text-white'}`}>
            {formatTime(task.start)}
          </span>
          <span className="text-[8px] md:text-[10px] font-black opacity-60 uppercase mt-1">ZAČÁTEK</span>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2 mb-1">
            <span className={`text-[8px] md:text-[10px] font-black px-2 py-0.5 rounded-full uppercase truncate max-w-full ${task.status === 'Completed' ? 'bg-green-600 text-white' : 'bg-slate-900 text-white/50'}`}>
              {task.type}
            </span>
            {task.estimatedPrice && (
              <span className={`text-[8px] md:text-[10px] font-black px-2 py-0.5 rounded-full uppercase whitespace-nowrap ${task.status === 'Completed' ? 'bg-green-600/20 text-green-300' : 'bg-blue-600/20 text-blue-400'}`}>
                {task.estimatedPrice.toLocaleString()} Kč
              </span>
            )}
          </div>
          <h3 className={`font-black text-base md:text-2xl leading-tight truncate ${task.status === 'Completed' ? 'text-green-400' : 'text-slate-100'}`}>{task.title}</h3>
          <p className="text-[10px] md:text-sm text-white/70 font-bold mt-0.5 uppercase tracking-tight truncate">{task.customer}</p>
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
          className={`flex items-center justify-center gap-2 p-3 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest border ${task.status === 'Completed' ? 'bg-green-900/30 text-green-400 border-green-500/20 hover:bg-green-800/30' : 'bg-slate-900 hover:bg-slate-700 text-blue-400 border-white/10'}`}
        >
          <Icons.Map className="w-3 h-3" />
          Nakládka
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); handleOpenMaps(task.to); }}
          className={`flex items-center justify-center gap-2 p-3 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest border ${task.status === 'Completed' ? 'bg-green-900/30 text-green-400 border-green-500/20 hover:bg-green-800/30' : 'bg-slate-900 hover:bg-slate-700 text-blue-400 border-white/10'}`}
        >
          <Icons.Map className="w-3 h-3" />
          Vykládka
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); if (task.customerPhone) window.open(`tel:${task.customerPhone}`); }}
          disabled={!task.customerPhone}
          className={`flex items-center justify-center gap-2 p-3 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest border disabled:opacity-30 ${task.status === 'Completed' ? 'bg-green-900/30 text-green-400 border-green-500/20 hover:bg-green-800/30' : 'bg-slate-900 hover:bg-slate-700 text-green-400 border-white/10'}`}
        >
          <Icons.Phone className="w-3 h-3" />
          Volat
        </button>
        <div className="relative">
          <select 
            value={task.status}
            onChange={(e) => { e.stopPropagation(); updateTaskStatus(task.id, e.target.value as any); }}
            className={`w-full p-3 rounded-xl transition-colors text-[10px] font-black uppercase tracking-widest border outline-none appearance-none text-center ${task.status === 'Completed' ? 'bg-green-600 text-white border-green-500' : 'bg-slate-900 hover:bg-slate-700 text-slate-300 border-white/10'}`}
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
      {/* STK Warning Widget */}
      {expiringStkVehicles.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 md:p-6 rounded-[2.5rem] bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl"
        >
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30 text-xl shadow-inner">
              ⚠️
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs md:text-sm font-black text-amber-400 uppercase tracking-wider">
                  Upozornění na technickou kontrolu (STK)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/25 text-amber-300 border border-amber-500/40">
                  {expiringStkVehicles.length} {expiringStkVehicles.length === 1 ? 'vozidlo' : expiringStkVehicles.length < 5 ? 'vozidla' : 'vozidel'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {expiringStkVehicles.map(item => `${item.vehicle.model} (${item.vehicle.plate}): ${item.stk.isExpired ? 'propadlá' : `zbývá ${formatCzechDays(item.stk.daysRemaining)}`}`).join(' • ')}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab(AppTab.FLEET)}
            className="shrink-0 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center gap-2 self-end md:self-center cursor-pointer active:scale-95"
          >
            <Icons.Truck className="w-4 h-4" />
            Vozový park
          </button>
        </motion.div>
      )}

      {myActiveTask && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-orange-600 p-6 md:p-10 rounded-[3rem] shadow-[0_20px_50px_rgba(249,115,22,0.3)] border border-orange-400/30 relative overflow-hidden group cursor-pointer"
          onClick={() => setSelectedTask(myActiveTask)}
        >
          <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none transform group-hover:scale-110 transition-transform duration-500">
            <Icons.Zap className="w-20 h-20" />
          </div>
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-6 relative z-10">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse shadow-[0_0_10px_#fff]" />
                <span className="text-[10px] md:text-sm font-black text-white uppercase tracking-[0.2em]">Aktuálně na zakázce</span>
              </div>
              <h2 className="text-xl sm:text-2xl md:text-5xl font-black text-white tracking-tighter leading-none pr-4 truncate">
                {myActiveTask.title}
              </h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black text-white uppercase tracking-wider backdrop-blur-md border border-white/10 truncate max-w-full">
                  {myActiveTask.type}
                </span>
                <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black text-white uppercase tracking-wider backdrop-blur-md border border-white/10 truncate max-w-full">
                  📍 {myActiveTask.from.split(',')[0]}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 md:gap-4 bg-black/20 p-3 md:p-6 rounded-[2rem] border border-white/5 backdrop-blur-xl shrink-0">
              <div className="text-right min-w-0">
                <p className="text-[10px] font-black text-orange-200 uppercase tracking-widest leading-none mb-1">Cílové místo</p>
                <p className="text-[11px] sm:text-xs md:text-lg font-black text-white uppercase truncate max-w-[120px] sm:max-w-[150px] md:max-w-xs">{myActiveTask.to.split(',')[0]}</p>
              </div>
              <div className="w-10 h-10 md:w-16 md:h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl shrink-0">
                <Icons.Map className="w-5 h-5 md:w-8 md:h-8 text-orange-600" />
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Crew Utilization Widget */}
      {canManage && (
        <section className="bg-slate-800 p-6 md:p-8 rounded-[3rem] border border-white/10 relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm md:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
              <Icons.Users className="w-5 h-5 text-blue-400" /> Vytížení posádek (Dnes)
            </h3>
          </div>
          <div className="flex overflow-x-auto no-scrollbar gap-4 pb-2">
            {workers.map(worker => {
              const workerTasksToday = tasks.filter(t => isToday(t.start) && t.assignedWorkers.includes(worker.id));
              const isBusy = workerTasksToday.length > 0;
              const currentTask = workerTasksToday.find(t => {
                const now = new Date();
                return now >= t.start && now <= t.end;
              });

              return (
                <div key={worker.id} className={`flex-shrink-0 w-[200px] p-4 rounded-3xl border transition-all ${isBusy ? 'bg-blue-950/30 border-blue-500/30' : 'bg-slate-900/50 border-white/5'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative">
                      {worker.photo ? <img src={worker.photo} className="w-full h-full object-cover" /> : <Icons.User className="w-5 h-5 text-slate-500" />}
                      <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${currentTask ? 'bg-red-500' : isBusy ? 'bg-blue-500' : 'bg-green-500'}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-white truncate">{worker.name}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{worker.role}</p>
                    </div>
                  </div>
                  {currentTask ? (
                    <div>
                      <p className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">Aktuálně:</p>
                      <p className="text-xs text-red-400 font-black truncate">{currentTask.title}</p>
                    </div>
                  ) : isBusy ? (
                    <div>
                      <p className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">Dnes celkem:</p>
                      <p className="text-xs text-blue-400 font-black truncate">{workerTasksToday.length} zakázek</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">Status:</p>
                      <p className="text-xs text-green-400 font-black truncate">Volno</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-8">
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

      {isTabletOrDesktop && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8 animate-fade-in">
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

      {firstTaskTomorrowGlobal && (
        <section className="bg-slate-800 p-6 md:p-10 rounded-[3rem] border border-blue-500/20 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none transform scale-150">
            <Icons.Calendar className="w-40 h-40" />
          </div>

          <div className="relative z-10 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-400 rounded-full shadow-[0_0_8px_#60a5fa] animate-pulse" />
                <h2 className="text-[10px] md:text-xs font-black text-blue-400 uppercase tracking-[0.2em]">První zítřejší mise</h2>
              </div>
              <div className="flex items-center gap-3">
                {firstTaskTomorrowGlobal.estimatedPrice && (
                  <span className="text-[10px] font-black px-4 py-1.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
                    {firstTaskTomorrowGlobal.estimatedPrice.toLocaleString()} Kč
                  </span>
                )}
                <span className="text-[10px] font-black px-4 py-1.5 rounded-full bg-blue-600 text-white uppercase tracking-widest shadow-lg shadow-blue-600/20">
                  {firstTaskTomorrowGlobal.type}
                </span>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <p className="text-4xl md:text-7xl font-black text-white tracking-tighter leading-none mb-2">
                  {formatTime(firstTaskTomorrowGlobal.start)}
                </p>
                <p className="text-xl md:text-2xl font-black text-slate-100 uppercase tracking-tight">{firstTaskTomorrowGlobal.title}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 max-w-xl">
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                  <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Nakládka</p>
                  <p className="text-xs text-white font-bold leading-tight">{firstTaskTomorrowGlobal.from}</p>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                  <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Vykládka</p>
                  <p className="text-xs text-white font-bold leading-tight">{firstTaskTomorrowGlobal.to}</p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-white/5 space-y-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Přiřazený tým na zítra</p>
              <div className="flex flex-wrap gap-2">
                {firstTaskTomorrowGlobal.assignedWorkers.map(wid => {
                  const worker = workers.find(w => w.id === wid);
                  if (!worker) return null;
                  return (
                    <div key={wid} className="flex items-center gap-3 bg-slate-900/80 p-2 pr-4 rounded-2xl border border-white/5 group hover:border-blue-500/30 transition-all">
                      <div className="w-8 h-8 rounded-xl bg-slate-800 overflow-hidden flex items-center justify-center text-blue-400">
                        {worker.photo ? <img src={worker.photo} className="w-full h-full object-cover" /> : <Icons.User className="w-4 h-4" />}
                      </div>
                      <span className="text-xs font-black text-white">{worker.name}</span>
                      <a 
                        href={`tel:${worker.phone.replace(/\s+/g, '')}`}
                        className="p-2 bg-slate-800 text-green-400 rounded-lg hover:bg-green-600 hover:text-white transition-all shadow-md"
                      >
                        <Icons.Phone className="w-3 h-3" />
                      </a>
                    </div>
                  );
                })}
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
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[70] flex items-end sm:items-center justify-center p-2 sm:p-4" onClick={() => setSelectedTask(null)}>
            <motion.div 
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="bg-slate-900 w-full max-w-2xl rounded-[2rem] sm:rounded-[3rem] p-5 sm:p-8 md:p-10 shadow-2xl border border-slate-800 max-h-[90vh] overflow-y-auto no-scrollbar"
              onClick={e => e.stopPropagation()}
            >
            <div className="flex justify-between items-start mb-6 sm:mb-8 gap-4">
              <div className="space-y-3 min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] px-2 sm:px-3 py-1 text-white rounded-lg inline-block ${
                    selectedTask.status === 'Confirmed' ? 'bg-blue-600' : 
                    selectedTask.status === 'In Progress' ? 'bg-red-600' : 
                    selectedTask.status === 'Completed' ? 'bg-green-600' : 'bg-slate-600'
                  }`}>
                    {getStatusLabel(selectedTask.status)}
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] px-2 sm:px-3 py-1 bg-slate-800 text-slate-400 rounded-lg inline-block">
                    {selectedTask.type}
                  </span>
                  {selectedTask.estimatedPrice && (
                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] px-2 sm:px-3 py-1 bg-blue-600/20 text-blue-400 rounded-lg inline-block">
                      {selectedTask.estimatedPrice.toLocaleString()} Kč
                    </span>
                  )}
                </div>
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tighter leading-tight break-words">{selectedTask.title}</h3>
              </div>
              <button onClick={() => setSelectedTask(null)} className="bg-slate-800 p-2 sm:p-3 rounded-xl sm:rounded-2xl hover:bg-slate-700 transition-colors text-slate-400 shrink-0 mt-1">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <button onClick={() => handleOpenMaps(selectedTask.from)} className="bg-slate-800 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] text-left hover:bg-slate-700 transition-all border border-slate-700 group flex flex-col justify-center min-h-[5rem]">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 sm:mb-2 group-hover:text-blue-400 transition-colors">PŘEVZETÍ</p>
                  <p className="text-[10px] sm:text-xs font-black text-slate-200 truncate w-full">{selectedTask.from}</p>
                </button>
                <button onClick={() => handleOpenMaps(selectedTask.to)} className="bg-slate-800 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] text-left hover:bg-slate-700 transition-all border border-slate-700 group flex flex-col justify-center min-h-[5rem]">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 sm:mb-2 group-hover:text-blue-400 transition-colors">CÍL</p>
                  <p className="text-[10px] sm:text-xs font-black text-slate-200 truncate w-full">{selectedTask.to}</p>
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Přiřazený tým (Řidiči a pracovníci)</p>
                <div className="grid grid-cols-1 gap-2 sm:gap-3">
                  {selectedTask.assignedWorkers.map(wid => {
                    const worker = workers.find(w => w.id === wid);
                    return (
                      <div key={wid} className="flex items-center gap-3 sm:gap-4 bg-slate-800/50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-700/50">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-slate-700 flex items-center justify-center text-blue-400 overflow-hidden shrink-0">
                          {worker?.photo ? <img src={worker.photo} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Icons.User className="w-4 h-4 sm:w-5 sm:h-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-black text-white truncate">{worker?.name || 'Neznámý pracovník'}</p>
                          <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase truncate">{worker?.role || 'Pracovník'}</p>
                        </div>
                        {worker?.phone && (
                          <a href={`tel:${worker.phone.replace(/\s+/g, '')}`} className="ml-auto p-1.5 sm:p-2 text-slate-500 hover:text-blue-400 transition-colors shrink-0">
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

              <div className="space-y-2">
                <div className="flex items-center justify-between px-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Přidat poznámku (hlasem)</p>
                </div>
                <div className="relative">
                    <textarea 
                        id="newNoteInput"
                        placeholder="Zde můžete napsat nebo nadiktovat poznámku..."
                        className="w-full bg-slate-800 rounded-[2rem] p-4 pr-14 text-sm text-white border-none min-h-[100px] focus:ring-2 focus:ring-blue-500/50 transition-all border border-slate-700/50"
                        rows={3}
                    />
                    <button 
                      onClick={() => {
                        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                        if (!SpeechRecognition) {
                          alert("Rozpoznávání řeči není v tomto prohlížeči podporováno.");
                          return;
                        }

                        const recognition = new SpeechRecognition();
                        recognition.lang = 'cs-CZ';
                        recognition.interimResults = false;
                        
                        const btn = document.getElementById('micBtn');
                        if (btn) btn.classList.add('bg-red-600', 'text-white', 'animate-pulse');
                        
                        recognition.onend = () => {
                          if (btn) btn.classList.remove('bg-red-600', 'text-white', 'animate-pulse');
                        };
                        recognition.onerror = () => {
                          if (btn) btn.classList.remove('bg-red-600', 'text-white', 'animate-pulse');
                        };
                        
                        recognition.onresult = (event: any) => {
                          const transcript = Array.from(event.results)
                            .map((res: any) => res[0].transcript)
                            .join('');
                          if (event.results[0].isFinal) {
                            const input = document.getElementById('newNoteInput') as HTMLTextAreaElement;
                            if (input) {
                              input.value = input.value ? `${input.value} ${transcript}` : transcript;
                            }
                          }
                        };

                        recognition.start();
                      }}
                      id="micBtn"
                      className="absolute right-4 top-4 p-3 rounded-2xl transition-all bg-slate-700 text-slate-400 hover:text-white"
                      title="Diktovat česky"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                    </button>
                </div>
                <button 
                  onClick={async () => {
                    const input = document.getElementById('newNoteInput') as HTMLTextAreaElement;
                    const val = input?.value?.trim();
                    if (!val) return;
                    
                    const newNotes = selectedTask.notes ? `${selectedTask.notes}\n\n[${new Date().toLocaleString('cs-CZ')}]: ${val}` : `[${new Date().toLocaleString('cs-CZ')}]: ${val}`;
                    
                    try {
                      await updateDoc(doc(db, 'tasks', selectedTask.id), { notes: newNotes });
                      setSelectedTask({...selectedTask, notes: newNotes});
                      input.value = '';
                      showToast("Poznámka byla přidána");
                    } catch (error) {
                      handleFirestoreError(error, OperationType.UPDATE, `tasks/${selectedTask.id}`);
                    }
                  }}
                  className="w-full bg-blue-600/20 text-blue-400 font-black py-3 rounded-2xl border border-blue-500/20 hover:bg-blue-600 hover:text-white transition-all uppercase tracking-widest text-xs"
                >
                  Uložit poznámku
                </button>
              </div>

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

              <div className="flex flex-col gap-3">
                {(user.role === 'admin' || user.role === 'editor' || (user.workerId && selectedTask.assignedWorkers?.includes(user.workerId) && workers.find(w => w.id === user.workerId)?.role === 'Driver')) && selectedTask.status !== 'Completed' && (
                  <button 
                    onClick={async () => {
                      await updateTaskStatus(selectedTask.id, 'Completed');
                      setSelectedTask({...selectedTask, status: 'Completed'});
                      showToast("Zakázka byla dokončena! 🎉");
                    }}
                    className="w-full bg-green-600 text-white font-black py-5 rounded-[2rem] shadow-xl shadow-green-600/20 transition-all active:scale-95 text-sm uppercase tracking-widest hover:bg-green-500 flex items-center justify-center gap-2 animate-bounce-subtle"
                  >
                    <Icons.Check className="w-5 h-5" /> Dokončit zakázku (Hotovo)
                  </button>
                )}
                
                {canManage && (
                  <button 
                    onClick={() => deleteTask(selectedTask.id)}
                    className="w-full bg-red-600/10 text-red-500 font-black py-4 rounded-[2rem] border border-red-500/20 transition-all active:scale-95 text-sm uppercase tracking-widest hover:bg-red-600 hover:text-white flex items-center justify-center gap-2"
                  >
                    <Icons.Trash className="w-5 h-5" /> Vymazat zakázku
                  </button>
                )}
                
                <button 
                  onClick={() => setSelectedTask(null)}
                  className="w-full bg-slate-800 text-white font-black py-5 rounded-[2rem] shadow-xl border border-slate-700 transition-all active:scale-95 text-sm uppercase tracking-widest hover:bg-slate-700"
                >
                  Zavřít detail
                </button>
              </div>
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
    <div className={`p-4 sm:p-6 md:p-10 rounded-[2.5rem] bg-slate-800 border ${themes[color]} flex flex-col items-center text-center shadow-xl transition-transform hover:-translate-y-1 animate-fade-in`}>
      <p className="text-[8px] sm:text-[10px] md:text-xs font-black uppercase tracking-widest opacity-60 mb-1 md:mb-2">{label}</p>
      <span className="text-2xl sm:text-4xl md:text-6xl font-black text-white tracking-tighter mb-1 md:mb-3">{time}</span>
      <p className="text-[8px] sm:text-[10px] md:text-sm font-bold text-slate-500 uppercase truncate w-full px-1 sm:px-2">{subtitle}</p>
    </div>
  );
};

export default Dashboard;
