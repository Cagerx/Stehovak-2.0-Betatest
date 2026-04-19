
import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { MoveTask, Transaction } from '../types';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, isWithinInterval, startOfYear, endOfYear, startOfDay, endOfDay } from 'date-fns';
import { cs } from 'date-fns/locale';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend 
} from 'recharts';
import { Icons, COLORS } from '../constants';

interface OrderAnalysisProps {
  tasks: MoveTask[];
  transactions: Transaction[];
}

const OrderAnalysis: React.FC<OrderAnalysisProps> = ({ tasks, transactions }) => {
  const [timeRange, setTimeRange] = useState<'year' | 'half' | 'quarter'>('year');

  const filteredData = useMemo(() => {
    const now = new Date();
    let start: Date;
    const end = endOfDay(now);

    if (timeRange === 'year') {
      start = startOfYear(now);
    } else if (timeRange === 'half') {
      start = subMonths(now, 6);
    } else {
      start = subMonths(now, 3);
    }

    const interval = { start, end };

    const filteredTasks = tasks.filter(t => isWithinInterval(t.start, interval));
    const filteredTransactions = transactions.filter(tr => isWithinInterval(tr.date, interval));

    return { filteredTasks, filteredTransactions, start, end };
  }, [tasks, transactions, timeRange]);

  const monthRevenueData = useMemo(() => {
    const { start, end, filteredTransactions } = filteredData;
    const months = eachMonthOfInterval({ start, end });

    return months.map(month => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);
      
      const income = filteredTransactions
        .filter(tr => tr.type === 'income' && isWithinInterval(tr.date, { start: monthStart, end: monthEnd }))
        .reduce((sum, tr) => sum + tr.amount, 0);
        
      const expense = filteredTransactions
        .filter(tr => tr.type === 'expense' && isWithinInterval(tr.date, { start: monthStart, end: monthEnd }))
        .reduce((sum, tr) => sum + tr.amount, 0);

      return {
        name: format(month, 'MMM', { locale: cs }),
        příjem: income,
        výdaj: expense,
        zisk: income - expense
      };
    });
  }, [filteredData]);

  const taskStatusData = useMemo(() => {
    const stats = filteredData.filteredTasks.reduce((acc: any, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {});

    return [
      { name: 'Hotovo', value: stats['Completed'] || 0, color: COLORS.success },
      { name: 'Probíhá', value: stats['In Progress'] || 0, color: '#f59e0b' },
      { name: 'Potvrzeno', value: stats['Confirmed'] || 0, color: COLORS.primary },
      { name: 'Čeká', value: stats['Pending'] || 0, color: COLORS.muted },
    ].filter(d => d.value > 0);
  }, [filteredData]);

  const typeData = useMemo(() => {
    const stats = filteredData.filteredTasks.reduce((acc: any, t) => {
      const type = t.type || 'Ostatní';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Analýza Výkonu</h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest px-1">Statistiky zakázek a finanční přehled</p>
        </div>

        <div className="flex bg-slate-900 p-1 rounded-2xl border border-white/10 w-fit">
          <button onClick={() => setTimeRange('quarter')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timeRange === 'quarter' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-white'}`}>3 měsíce</button>
          <button onClick={() => setTimeRange('half')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timeRange === 'half' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-white'}`}>6 měsíců</button>
          <button onClick={() => setTimeRange('year')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${timeRange === 'year' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-500 hover:text-white'}`}>Tento rok</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Celkem Zakázek" value={filteredData.filteredTasks.length} icon={<Icons.Calendar />} color="blue" />
        <StatsCard label="Dokončeno" value={filteredData.filteredTasks.filter(t => t.status === 'Completed').length} icon={<Icons.Sparkles />} color="green" />
        <StatsCard label="Celkový Příjem" value={`${filteredData.filteredTransactions.filter(tr => tr.type === 'income').reduce((s,t)=>s+t.amount,0).toLocaleString()} Kč`} icon={<Icons.Zap />} color="orange" />
        <StatsCard label="Prům. na Zakázku" value={`${Math.round(filteredData.filteredTasks.length ? filteredData.filteredTransactions.filter(tr=>tr.type==='income').reduce((s,t)=>s+t.amount,0) / filteredData.filteredTasks.length : 0).toLocaleString()} Kč`} icon={<Icons.Truck />} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-800/50 p-6 rounded-[2.5rem] border border-white/10 shadow-2xl">
          <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-2">
            <div className="w-2 h-6 bg-blue-500 rounded-full" /> Finanční Vývoj
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthRevenueData}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} fontWeight="bold" axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="příjem" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" dataKey="zisk" stroke="#10b981" strokeWidth={3} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800/50 p-6 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col">
          <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-2">
            <div className="w-2 h-6 bg-orange-500 rounded-full" /> Stav Zakázek
          </h3>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={taskStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {taskStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4">
              {taskStatusData.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.name}</span>
                  <span className="text-xs font-black text-white ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 p-6 rounded-[2.5rem] border border-white/10 shadow-2xl">
          <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-2">
            <div className="w-2 h-6 bg-purple-500 rounded-full" /> Typy Stěhování
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#fff" fontSize={10} fontWeight="black" width={100} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px' }} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 10, 10, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800/50 p-6 rounded-[2.5rem] border border-white/10 shadow-2xl">
          <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-2">
            <div className="w-2 h-6 bg-rose-500 rounded-full" /> Poslední Transakce
          </h3>
          <div className="space-y-3">
            {filteredData.filteredTransactions.slice(0, 5).sort((a,b)=>b.date.getTime()-a.date.getTime()).map((tr) => (
              <div key={tr.id} className="bg-slate-900/50 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-black text-white uppercase tracking-tight">{tr.description}</span>
                  <span className="text-[8px] text-slate-500 font-bold uppercase">{format(tr.date, 'd. MMMM yyyy', { locale: cs })}</span>
                </div>
                <div className={`text-sm font-black ${tr.type === 'income' ? 'text-green-400' : 'text-rose-400'}`}>
                  {tr.type === 'income' ? '+' : '-'}{tr.amount.toLocaleString()} Kč
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'orange' | 'purple';
}

const StatsCard: React.FC<StatsCardProps> = ({ label, value, icon, color }) => {
  const colorClasses = {
    blue: 'bg-blue-600/10 text-blue-400 border-blue-500/20',
    green: 'bg-green-600/10 text-green-400 border-green-500/20',
    orange: 'bg-orange-600/10 text-orange-400 border-orange-500/20',
    purple: 'bg-purple-600/10 text-purple-400 border-purple-500/20',
  };

  return (
    <div className={`p-6 rounded-[2rem] border transition-all hover:scale-105 shadow-xl ${colorClasses[color]} flex items-center gap-4`}>
      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-xl shadow-inner">
        {icon}
      </div>
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</p>
        <p className="text-xl font-black text-white tracking-tighter uppercase leading-none">{value}</p>
      </div>
    </div>
  );
};

export default OrderAnalysis;
