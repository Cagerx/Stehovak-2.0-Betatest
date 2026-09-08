
import React, { useState, useMemo, DragEvent } from 'react';
import { MoveTask, Worker, Vehicle, OperationType, isManagementRole } from '../types';
import { Icons, COLORS } from '../constants';
import { geminiService } from '../services/geminiService';
import { db } from '../firebase';
import { doc, setDoc, Timestamp, addDoc, collection, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError } from '../App';
import { googleService } from '../services/googleService';

interface CalendarViewProps {
  tasks: MoveTask[];
  setTasks: React.Dispatch<React.SetStateAction<MoveTask[]>>;
  workers: Worker[];
  vehicles: Vehicle[];
  user: { 
    role: string;
    workerId?: string;
    email?: string;
  };
  googleAccessToken: string | null;
  showToast: (message: string) => void;
}

type ViewMode = 'day' | 'week' | 'list';

const CalendarView: React.FC<CalendarViewProps> = ({ tasks, setTasks, workers, vehicles, user, googleAccessToken, showToast }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const canManageTasks = Boolean(
    isManagementRole(user?.role) ||
    (user?.email && ['vitezslav.gercak@gmail.com', 'stehovanimatej@gmail.com', 'admin@stehovak2.com', 'najzarj99@gmail.com'].includes(user.email.toLowerCase())) ||
    workers.find(w => w.id === user?.workerId)?.role === 'Boss'
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [workerFilter, setWorkerFilter] = useState<string>('All');
  const [sortMode, setSortMode] = useState<'time' | 'driver'>('time');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const [currentTask, setCurrentTask] = useState<Partial<MoveTask>>({
    title: '', customer: '', customerPhone: '', from: '', to: '',
    status: 'Pending', type: 'Stěhování', priority: 'Medium', notes: '', assignedWorkers: [], assignedVehicles: [], images: []
  });

  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [modalImage, setModalImage] = useState<string | null>(null);
  const modalFileInputRef = React.useRef<HTMLInputElement>(null);

  // --- SPEECH RECOGNITION (STT) for Czech ---
  const startSTT = (callback: (text: string) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Rozpoznávání řeči není v tomto prohlížeči podporováno.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'cs-CZ';
    recognition.interimResults = true;
    
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);
    
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((res: any) => res[0].transcript)
        .join('');
      if (event.results[0].isFinal) {
        callback(transcript);
      }
    };

    recognition.start();
  };

  const handleQuickNoteSubmit = async () => {
    if (!quickNoteText || isAnalyzing) return;
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const extractedData = await geminiService.extractTaskFromNotes(quickNoteText);
      
      const start = new Date(currentDate);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

      setCurrentTask({
        title: extractedData.title || 'Nová zakázka z poznámky',
        customer: extractedData.customer || '',
        customerPhone: extractedData.customerPhone || '',
        from: extractedData.from || '',
        to: extractedData.to || '',
        status: 'Pending',
        start,
        end,
        assignedWorkers: [],
        assignedVehicles: [],
        notes: quickNoteText,
        estimatedPrice: extractedData.estimatedPrice
      });
      
      setIsEditing(false);
      setShowQuickNote(false);
      setQuickNoteText('');
      setShowModal(true);
    } catch (e: any) {
      const isAbort = e.name === 'AbortError' || e.message?.toLowerCase().includes('aborted');
      if (!isAbort) {
        console.error("Chyba při AI analýze:", e);
        setAnalysisError("Nepodařilo se automaticky rozpoznat údaje. Zkontrolujte text.");
      } else {
        setAnalysisError(null);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isSameDay = (d1: Date, d2: Date) => 
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(date.setDate(diff));
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(currentDate.getDate() + (direction === 'next' ? 1 : -1));
    } else {
      newDate.setDate(currentDate.getDate() + (direction === 'next' ? 7 : -7));
    }
    setCurrentDate(newDate);
  };

  const START_HOUR = 6;
  const END_HOUR = 22;
  const HOUR_HEIGHT = 90;

  const handleDragStart = (e: DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    setDraggedTaskId(taskId);
  };

  const createNotificationForWorkers = async (task: MoveTask, type: 'task_assigned' | 'task_changed') => {
    if (!task.assignedWorkers || task.assignedWorkers.length === 0) return;
    try {
      const title = type === 'task_assigned' ? 'Nová zakázka' : 'Změna v zakázce';
      const message = type === 'task_assigned' 
        ? `Byla vám přiřazena nová zakázka "${task.title}".`
        : `Zakázka "${task.title}" byla upravena (změna času nebo detailů).`;
      
      const notifPromises = task.assignedWorkers.map(workerId => 
        addDoc(collection(db, 'notifications'), {
          userId: workerId,
          title,
          message,
          taskId: task.id,
          read: false,
          type,
          createdAt: Timestamp.now()
        })
      );
      await Promise.all(notifPromises);
    } catch (e) {
      console.error('Failed to send notifications', e);
    }
  };

  const handleDropOnDayViewTime = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    setDraggedTaskId(null);
    if (!taskId) return;

    const taskToMove = tasks.find(t => t.id === taskId);
    if (!taskToMove) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;

    let exactHour = y / HOUR_HEIGHT + START_HOUR;
    exactHour = Math.max(START_HOUR, Math.min(END_HOUR, exactHour));
    
    // Snap to 15 mins
    const snappedHour = Math.round(exactHour * 4) / 4;
    const hours = Math.floor(snappedHour);
    const minutes = Math.round((snappedHour - hours) * 60);

    const duration = taskToMove.end.getTime() - taskToMove.start.getTime();
    const newStart = new Date(taskToMove.start);
    newStart.setFullYear(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    newStart.setHours(hours, minutes, 0, 0);
    const newEnd = new Date(newStart.getTime() + duration);

    const updatedTask = { ...taskToMove, start: newStart, end: newEnd };

    try {
      await setDoc(doc(db, 'tasks', taskId), {
        ...updatedTask,
        start: Timestamp.fromDate(newStart),
        end: Timestamp.fromDate(newEnd)
      });
      showToast("Čas plánování přesunut");
      await createNotificationForWorkers(updatedTask, 'task_changed');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
    }
  };

  const handleDropOnWeekDay = async (e: DragEvent<HTMLDivElement>, targetDate: Date) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-slate-700', 'border-blue-500');
    const taskId = e.dataTransfer.getData('text/plain');
    setDraggedTaskId(null);
    if (!taskId) return;

    const taskToMove = tasks.find(t => t.id === taskId);
    if (!taskToMove) return;

    const newStart = new Date(taskToMove.start);
    newStart.setFullYear(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const newEnd = new Date(taskToMove.end);
    newEnd.setFullYear(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

    const updatedTask = { ...taskToMove, start: newStart, end: newEnd };

    try {
      await setDoc(doc(db, 'tasks', taskId), {
        ...updatedTask,
        start: Timestamp.fromDate(newStart),
        end: Timestamp.fromDate(newEnd)
      });
      showToast("Termín přesunut");
      await createNotificationForWorkers(updatedTask, 'task_changed');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `tasks/${taskId}`);
    }
  };

  const handleOpenCreate = () => {
    setIsEditing(false);
    setAnalysisError(null);
    const start = new Date(currentDate);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    setCurrentTask({
      title: '', customer: '', customerPhone: '', from: '', to: '',
      status: 'Pending', type: 'Stěhování', priority: 'Medium', start, end, assignedWorkers: [], assignedVehicles: [], notes: '', images: [], estimatedPrice: undefined
    });
    setShowModal(true);
  };

  const handleOpenEdit = (task: MoveTask) => {
    setIsEditing(true);
    setAnalysisError(null);
    setCurrentTask({ ...task, images: task.images || [] });
    setShowModal(true);
  };

  const saveTask = async () => {
    if (!currentTask.title || !currentTask.start || !currentTask.end || !currentTask.customer || !currentTask.from || !currentTask.to) {
      alert("Prosím vyplňte všechna povinná pole (Název, Zákazník, Start, Konec, Odkud, Kam).");
      return;
    }
    const taskData = {
      ...currentTask,
      id: currentTask.id || Math.random().toString(36).substr(2, 9),
      start: new Date(currentTask.start),
      end: new Date(currentTask.end)
    } as MoveTask;

    try {
      await setDoc(doc(db, 'tasks', taskData.id), {
        ...taskData,
        start: Timestamp.fromDate(taskData.start),
        end: Timestamp.fromDate(taskData.end)
      });
      
      // --- GOOGLE CALENDAR SYNC ---
      const syncEnabled = localStorage.getItem('google_sync_enabled') === 'true';
      if (googleAccessToken && syncEnabled) {
        try {
          await googleService.createCalendarEvent(googleAccessToken, {
            summary: `Stěhování: ${taskData.title}`,
            description: `Zákazník: ${taskData.customer}\nZ: ${taskData.from}\nDo: ${taskData.to}\nPoznámky: ${taskData.notes || ''}`,
            start: taskData.start.toISOString(),
            end: taskData.end.toISOString()
          });
          console.log("Event synced to Google Calendar");
        } catch (err) {
          const isAbort = (err as any)?.name === 'AbortError' || (err as any)?.message?.toLowerCase().includes('aborted');
          if (!isAbort) console.error("Failed to sync to Google Calendar:", err);
        }
      }
      
      if (!isEditing) {
        await createNotificationForWorkers(taskData, 'task_assigned');
        // --- AUTOMATICKÁ NOTIFIKACE (SMS - HROMADNÁ) ---
        // Pokud je to nová zakázka, pošli SMS všem přiřazeným pracovníkům
        const assignedTeam = workers.filter(w => w.id && taskData.assignedWorkers.includes(w.id));
        
        if (assignedTeam.length > 0) {
          // Získat všechna telefonní čísla oddělená čárkou (standard pro hromadné SMS)
          const recipients = assignedTeam
              .map(w => w.phone.replace(/\s+/g, '')) // Odstranit mezery
              .filter(p => p.length > 0)
              .join(',');
          
          const dateStr = taskData.start.toLocaleDateString('cs-CZ');
          const timeStr = taskData.start.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
          
          // Formátování pro SMS (bez Markdownu, stručné)
          const msg = `🚚 NOVÁ ZAKÁZKA: ${taskData.title}\n` +
                      `📅 ${dateStr} v ${timeStr}\n` +
                      `📍 Z: ${taskData.from}\n` +
                      `🏁 Do: ${taskData.to}\n` +
                      `👤 Klient: ${taskData.customer}\n` +
                      `📞 ${taskData.customerPhone}\n` +
                      `📝 ${taskData.notes || ''}`;
          
          setTimeout(() => {
              // Otevření nativní aplikace Zprávy s předvyplněnými čísly a textem
              // 'sms:' schéma s oddělovačem čárkou funguje na většině Androidů i iOS pro hromadné zprávy
              window.open(`sms:${recipients}?body=${encodeURIComponent(msg)}`, '_self');
          }, 300);
        }
        // ----------------------------------------
      } else {
        await createNotificationForWorkers(taskData, 'task_changed');
      }
      showToast("Změny byly uloženy");
      setShowModal(false);
    } catch (error) {
      const handled = handleFirestoreError(error, OperationType.WRITE, `tasks/${taskData.id}`);
      if (!handled) console.error("Failed to save task:", error);
    }
  };

  const deleteTask = async (id: string) => {
    if (!window.confirm("Opravdu chcete tuto zakázku smazat?")) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
      showToast("Zakázka smazána");
      setShowModal(false);
    } catch (error) {
      const handled = handleFirestoreError(error, OperationType.DELETE, `tasks/${id}`);
      if (!handled) console.error("Failed to delete task:", error);
    }
  };

  const toggleResource = (id: string, type: 'worker' | 'vehicle') => {
    if (type === 'worker') {
      const current = currentTask.assignedWorkers || [];
      const updated = current.includes(id) ? current.filter(wid => wid !== id) : [...current, id];
      setCurrentTask({...currentTask, assignedWorkers: updated});
    } else {
      const current = currentTask.assignedVehicles || [];
      const updated = current.includes(id) ? current.filter(vid => vid !== id) : [...current, id];
      setCurrentTask({...currentTask, assignedVehicles: updated});
    }
  };

  const formatForInput = (date?: Date) => {
    if (!date) return '';
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const openMap = (address?: string) => {
    if (!address) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  };

  // Funkce pro chytré rozpoznání údajů z poznámky pomocí AI
  const parseNotesAndFill = async () => {
    if (!currentTask.notes || isAnalyzing) return;
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const extractedData = await geminiService.extractTaskFromNotes(currentTask.notes);
      
      const updates: Partial<MoveTask> = {};
      if (extractedData.title) updates.title = extractedData.title;
      if (extractedData.customer) updates.customer = extractedData.customer;
      if (extractedData.customerPhone) updates.customerPhone = extractedData.customerPhone;
      if (extractedData.from) updates.from = extractedData.from;
      if (extractedData.to) updates.to = extractedData.to;
      if (extractedData.estimatedPrice) updates.estimatedPrice = extractedData.estimatedPrice;

      // Aplikace změn pouze pro nevyplněná pole nebo přepis
      setCurrentTask(prev => ({ ...prev, ...updates }));
    } catch (e: any) {
      const isAbort = e.name === 'AbortError' || e.message?.toLowerCase().includes('aborted');
      if (!isAbort) console.error("Chyba při AI analýze:", e);
      
      if (isAbort) {
        setAnalysisError("Požadavek byl přerušen. Zkuste to prosím znovu.");
      } else {
        setAnalysisError("Nepodařilo se automaticky rozpoznat údaje. Zkontrolujte text nebo API klíč.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Funkce pro chytré rozpoznání údajů z fotky pomocí AI
  const parseImageAndFill = async (imageData: string) => {
    if (!imageData || isAnalyzing) return;
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const mimeType = imageData.substring(imageData.indexOf(':') + 1, imageData.indexOf(';'));
      const base64 = imageData.split(',')[1];
      const extractedData = await geminiService.extractTaskFromImage(base64, mimeType);
      
      const updates: Partial<MoveTask> = {};
      if (extractedData.title) updates.title = extractedData.title;
      if (extractedData.customer) updates.customer = extractedData.customer;
      if (extractedData.customerPhone) updates.customerPhone = extractedData.customerPhone;
      if (extractedData.from) updates.from = extractedData.from;
      if (extractedData.to) updates.to = extractedData.to;
      if (extractedData.estimatedPrice) updates.estimatedPrice = extractedData.estimatedPrice;
      if (extractedData.notes) updates.notes = (currentTask.notes ? currentTask.notes + "\n\n" : "") + extractedData.notes;

      setCurrentTask(prev => ({ ...prev, ...updates }));
    } catch (e: any) {
      const isAbort = e.name === 'AbortError' || e.message?.toLowerCase().includes('aborted');
      if (!isAbort) {
        console.error("Chyba při AI analýze fotky:", e);
        setAnalysisError("Nepodařilo se rozpoznat údaje z fotky. Zkuste jiný snímek.");
      } else {
        setAnalysisError(null);
      }
    } finally {
      setIsAnalyzing(false);
    }
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

  const getPriorityLabel = (priority: MoveTask['priority']) => {
    switch (priority) {
      case 'Low': return 'Nízká';
      case 'Medium': return 'Střední';
      case 'High': return 'Vysoká';
      case 'Critical': return 'Kritická';
      default: return priority;
    }
  };

  const filteredTasks = useMemo(() => {
    let result = tasks.filter(task => {
      const matchesSearch = 
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.to.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.notes?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'All' || task.status === statusFilter;
      const matchesType = typeFilter === 'All' || task.type === typeFilter;
      const matchesWorker = workerFilter === 'All' || task.assignedWorkers.includes(workerFilter);
      
      return matchesSearch && matchesStatus && matchesType && matchesWorker;
    });

    if (sortMode === 'driver') {
      result.sort((a, b) => {
        const aWorker = workers.find(w => a.assignedWorkers.includes(w.id))?.name || 'Z-Neznámý';
        const bWorker = workers.find(w => b.assignedWorkers.includes(w.id))?.name || 'Z-Neznámý';
        return aWorker.localeCompare(bWorker);
      });
    } else {
      result.sort((a, b) => b.start.getTime() - a.start.getTime());
    }

    return result;
  }, [tasks, searchTerm, statusFilter, typeFilter, workerFilter, sortMode, workers]);

  const renderDayView = () => {
    const dayTasks = filteredTasks.filter(task => isSameDay(task.start, currentDate));
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar relative p-5 md:p-8 pt-4 bg-slate-900">
        <div className="absolute left-4 top-4 bottom-0 w-12 z-10 pointer-events-none text-white/40 text-[10px] md:text-xs font-black">
          {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => (
            <div key={i} style={{ height: `${HOUR_HEIGHT}px` }}>{START_HOUR + i}:00</div>
          ))}
        </div>
        <div 
          className="ml-14 relative h-full min-h-[1440px]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOnDayViewTime}
        >
           {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => (
             <div key={i} className="border-t border-white/5 absolute w-full pointer-events-none" style={{ top: `${i * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }} />
           ))}
           {isSameDay(currentDate, new Date()) && (
              <div className="absolute left-0 right-0 border-t-2 border-red-500 z-10 flex items-center pointer-events-none" style={{ top: `${(new Date().getHours() - START_HOUR + new Date().getMinutes()/60) * HOUR_HEIGHT}px` }}>
                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-[0_0_10px_#ef4444]" />
              </div>
            )}
           {dayTasks.map(task => {
             const startHour = task.start.getHours() + task.start.getMinutes()/60;
             const endHour = task.end.getHours() + task.end.getMinutes()/60;
             const top = (startHour - START_HOUR) * HOUR_HEIGHT;
             const height = (endHour - startHour) * HOUR_HEIGHT;
             return (
               <div key={task.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={() => setDraggedTaskId(null)}
                    onClick={() => handleOpenEdit(task)} 
                    className={`absolute w-full p-1 z-20 cursor-move transition-opacity ${draggedTaskId === task.id ? 'opacity-40 scale-[0.98]' : ''}`} 
                    style={{ top: `${top}px`, height: `${height}px` }}>
                 <div className={`h-full w-full rounded-2xl border p-4 shadow-lg flex flex-col justify-between overflow-hidden cursor-pointer ${
                    task.status === 'Completed' ? 'bg-green-600 border-green-500 text-white' : 
                    task.status === 'Confirmed' ? 'bg-blue-600 border-blue-500 text-white' : 
                    'bg-red-600 border-red-500 text-white'
                  }`}>
                   <div>
                     <h4 className="text-xs md:text-lg font-black leading-none truncate">{task.title}</h4>
                     <p className="text-[9px] md:text-sm font-bold opacity-70 uppercase mt-1 truncate">{task.customer}</p>
                     
                     <div className="mt-2 space-y-1 hidden md:block">
                       {task.assignedWorkers.length > 0 && (
                         <div className="flex items-center gap-1.5 text-[10px] font-black uppercase opacity-80">
                           <Icons.User className="w-3 h-3" />
                           <span className="truncate">{task.assignedWorkers.map(id => workers.find(w => w.id === id)?.name).filter(Boolean).join(', ')}</span>
                         </div>
                       )}
                       {task.assignedVehicles.length > 0 && (
                         <div className="flex items-center gap-1.5 text-[10px] font-black uppercase opacity-80">
                           <Icons.Truck className="w-3 h-3" />
                           <span className="truncate">{task.assignedVehicles.map(id => vehicles.find(v => v.id === id)?.model).filter(Boolean).join(', ')}</span>
                         </div>
                       )}
                     </div>
                   </div>
                   <p className="text-[8px] md:text-xs font-black uppercase text-right opacity-60">{task.start.getHours()}:{task.start.getMinutes().toString().padStart(2, '0')}</p>
                 </div>
               </div>
             );
           })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const monday = getMonday(currentDate);
    const weekDays = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });

    return (
      <div className="flex-1 overflow-y-auto no-scrollbar p-5 md:p-8 space-y-4 bg-slate-900">
        {weekDays.map((day, idx) => {
          const dayTasks = filteredTasks.filter(t => isSameDay(t.start, day));
          const isToday = isSameDay(day, new Date());
          return (
            <div 
              key={idx} 
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('bg-slate-700', 'border-blue-500'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('bg-slate-700', 'border-blue-500'); }}
              onDrop={(e) => handleDropOnWeekDay(e, day)}
              className={`bg-slate-800 rounded-3xl p-5 border-2 transition-all ${isToday ? 'border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.1)]' : 'border-white/10'}`}
            >
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h4 className={`text-sm md:text-lg font-black uppercase tracking-widest ${isToday ? 'text-red-500' : 'text-slate-100'}`}>
                    {day.toLocaleDateString('cs-CZ', { weekday: 'long' })}
                  </h4>
                  <p className="text-[10px] md:text-sm font-bold text-white/50 mt-0.5">{day.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' })}</p>
                </div>
                {dayTasks.length > 0 && <span className="bg-slate-900 text-blue-400 text-[10px] md:text-xs font-black px-3 py-1 rounded-full border border-white/10">{dayTasks.length} akce</span>}
              </div>
              
              <div className="space-y-2 min-h-[50px]">
                {dayTasks.length > 0 ? dayTasks.map(task => (
                  <div 
                    key={task.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={() => setDraggedTaskId(null)}
                    onClick={() => handleOpenEdit(task)} 
                    className={`p-3 md:p-4 rounded-xl border flex items-center justify-between group cursor-move transition-all ${draggedTaskId === task.id ? 'opacity-40 scale-[0.98]' : ''} ${task.status === 'Completed' ? 'bg-green-900/20 border-green-500/30 hover:bg-green-900/30' : 'bg-slate-900/50 border-white/5 hover:bg-slate-900'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${task.status === 'Completed' ? 'bg-green-500' : task.status === 'Confirmed' ? 'bg-blue-500' : 'bg-red-500'}`} />
                      <div>
                        <p className="text-xs md:text-base font-bold text-slate-200 group-hover:text-blue-400 transition-colors">{task.title}</p>
                        <p className="text-[9px] md:text-xs text-white/50 font-black uppercase">{task.customer}</p>
                        
                        <div className="mt-1 flex flex-wrap gap-2 opacity-60">
                          {task.estimatedPrice && (
                            <div className="flex items-center gap-1 text-[8px] md:text-[10px] font-black uppercase text-blue-300">
                              <span>{task.estimatedPrice.toLocaleString()} Kč</span>
                            </div>
                          )}
                          {task.assignedWorkers.length > 0 && (
                            <div className="flex items-center gap-1 text-[8px] md:text-[10px] font-black uppercase">
                              <Icons.User className="w-2 h-2 md:w-3 md:h-3" />
                              <span>{task.assignedWorkers.map(id => workers.find(w => w.id === id)?.name.split(' ')[0]).filter(Boolean).join(', ')}</span>
                            </div>
                          )}
                          {task.assignedVehicles.length > 0 && (
                            <div className="flex items-center gap-1 text-[8px] md:text-[10px] font-black uppercase">
                              <Icons.Truck className="w-2 h-2 md:w-3 md:h-3" />
                              <span>{task.assignedVehicles.map(id => vehicles.find(v => v.id === id)?.model).filter(Boolean).join(', ')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] md:text-sm font-black text-white/30">{task.start.getHours()}:{task.start.getMinutes().toString().padStart(2, '0')}</span>
                      {canManageTasks && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTask(task.id);
                          }}
                          className="p-1.5 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white rounded-lg transition-all"
                          title="Vymazat zakázku"
                        >
                          <Icons.Trash className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )) : (
                  <p className="text-[10px] md:text-xs text-white/30 italic font-medium px-1">Žádné zakázky na tento den.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderListView = () => {
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar p-5 md:p-8 bg-slate-900">
        {filteredTasks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.map(task => (
              <div key={task.id} onClick={() => handleOpenEdit(task)} className={`rounded-3xl p-5 border transition-all cursor-pointer group flex flex-col ${task.status === 'Completed' ? 'bg-green-950/20 border-green-500/30 hover:border-green-500' : 'bg-slate-800 border-white/10 hover:border-blue-500'}`}>
                <div className="flex justify-between items-start mb-3 flex-1">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${task.status === 'Completed' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                        {task.type}
                      </span>
                    </div>
                    <h4 className={`text-lg font-black transition-colors ${task.status === 'Completed' ? 'text-green-400 group-hover:text-green-300' : 'text-white group-hover:text-blue-400'}`}>{task.title}</h4>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{task.customer}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-300">{task.start.toLocaleDateString('cs-CZ')}</p>
                      <p className="text-xs font-bold text-slate-500">{task.start.getHours()}:{task.start.getMinutes().toString().padStart(2, '0')}</p>
                    </div>
                    {canManageTasks && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTask(task.id);
                        }}
                        className="p-2 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white rounded-xl transition-all"
                        title="Vymazat zakázku"
                      >
                        <Icons.Trash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-[10px] font-black uppercase text-slate-400 border-t border-slate-700/50 pt-3 mt-auto">
                  <div className="flex items-center gap-1.5">
                    <Icons.Map className={`w-3 h-3 ${task.status === 'Completed' ? 'text-green-500' : 'text-blue-500'}`} />
                    <span className="truncate max-w-[150px]">{task.from} → {task.to}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Icons.User className={`w-3 h-3 ${task.status === 'Completed' ? 'text-green-600' : 'text-green-500'}`} />
                    <span>
                      {task.assignedWorkers.length > 0 
                        ? task.assignedWorkers.map(wid => workers.find(w => w.id === wid)?.name).filter(Boolean).join(', ')
                        : 'Neobsazeno'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${task.status === 'Completed' ? 'bg-green-500' : task.status === 'Confirmed' ? 'bg-blue-500' : 'bg-red-500'}`} />
                    <span className={task.status === 'Completed' ? 'text-green-500' : ''}>{getStatusLabel(task.status)}</span>
                  </div>
                  {task.estimatedPrice && (
                    <div className="flex items-center gap-1.5 text-blue-400 font-black ml-auto">
                      <span>{task.estimatedPrice.toLocaleString()} Kč</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 py-20">
            <Icons.Sparkles className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-black uppercase tracking-widest">Žádné zakázky nenalezeny</p>
          </div>
        )}
      </div>
    );
  };

  const getNavigationLabel = () => {
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });
    } else {
      const monday = getMonday(currentDate);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return `${monday.getDate()}. - ${sunday.getDate()}. ${sunday.toLocaleDateString('cs-CZ', { month: 'long' })}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* View Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-900 p-1 rounded-2xl border border-white/10 shadow-inner">
          <button 
            onClick={() => setViewMode('day')}
            className={`px-4 md:px-6 py-2 rounded-xl text-[10px] md:text-sm font-black uppercase tracking-widest transition-all ${viewMode === 'day' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/30 hover:text-white'}`}
          >
            Den
          </button>
          <button 
            onClick={() => setViewMode('week')}
            className={`px-4 md:px-6 py-2 rounded-xl text-[10px] md:text-sm font-black uppercase tracking-widest transition-all ${viewMode === 'week' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/30 hover:text-white'}`}
          >
            Týden
          </button>
          <button 
            onClick={() => setViewMode('list')}
            className={`px-4 md:px-6 py-2 rounded-xl text-[10px] md:text-sm font-black uppercase tracking-widest transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/30 hover:text-white'}`}
          >
            Seznam
          </button>
        </div>
        {canManageTasks && (
          <div className="flex gap-2">
            <button 
              onClick={() => setShowQuickNote(!showQuickNote)} 
              className={`p-3 md:p-4 rounded-2xl shadow-xl transition-all flex items-center gap-2 ${showQuickNote ? 'bg-slate-700 text-white' : 'bg-blue-600/20 text-blue-400 border border-blue-500/30'}`}
              title="Rychlá poznámka"
            >
              <Icons.Sparkles />
              <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest">Rychlá akce</span>
            </button>
            <button onClick={handleOpenCreate} className="bg-red-600 text-white p-3 md:p-4 rounded-2xl shadow-xl shadow-red-600/30 active:scale-95 transition-all">
              <Icons.Plus />
            </button>
          </div>
        )}
      </div>

      {/* Quick Note Input Area */}
      {showQuickNote && (
        <div className="bg-slate-800 rounded-[2rem] p-6 border border-blue-500/30 shadow-2xl animate-slide-down space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
              <Icons.Sparkles />
              Vytvořit zakázku z textu
            </h4>
            <button onClick={() => setShowQuickNote(false)} className="text-slate-500 hover:text-white transition-colors">
              <Icons.Plus className="rotate-45" />
            </button>
          </div>
          <div className="relative">
            <textarea 
              value={quickNoteText}
              onChange={e => setQuickNoteText(e.target.value)}
              placeholder="Vložte text (např. 'Karel Novák, 777123456, z Prahy do Brna, stěhování bytu 2+kk')"
              className="w-full bg-slate-900 border-none rounded-2xl p-4 pr-14 text-sm text-white placeholder-slate-600 min-h-[100px] focus:ring-2 focus:ring-blue-500/50 transition-all"
            />
            <button 
              onClick={() => startSTT((text) => setQuickNoteText(prev => prev ? `${prev} ${text}` : text))}
              className={`absolute right-4 top-4 p-2 rounded-xl transition-all ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-500 hover:text-white'}`}
              title="Diktovat česky"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            </button>
          </div>
          <div className="flex justify-end gap-3">
            <button 
              onClick={handleQuickNoteSubmit}
              disabled={isAnalyzing || !quickNoteText}
              className="bg-blue-600 text-white font-black px-6 py-3 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/20 disabled:opacity-30 flex items-center gap-2"
            >
              {isAnalyzing ? (
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : <Icons.Sparkles />}
              Analyzovat a vytvořit
            </button>
          </div>
          {analysisError && (
            <p className="text-[10px] text-red-400 font-bold px-1">{analysisError}</p>
          )}
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-slate-800 rounded-[2rem] p-4 md:p-6 shadow-sm border border-slate-700 space-y-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </div>
          <input 
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Hledat zakázku, klienta, adresu..."
            className="w-full bg-slate-900 border-none rounded-2xl py-3 md:py-4 pl-12 pr-4 text-xs md:text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 transition-all outline-none"
          />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full bg-slate-900 text-slate-300 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border border-slate-700 outline-none focus:border-blue-500 appearance-none"
          >
            <option value="All">Všechny stavy</option>
            <option value="Pending">Čekající</option>
            <option value="Confirmed">Potvrzené</option>
            <option value="In Progress">Probíhá</option>
            <option value="Completed">Hotovo</option>
          </select>

          <select 
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="w-full bg-slate-900 text-slate-300 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border border-slate-700 outline-none focus:border-blue-500 appearance-none"
          >
            <option value="All">Všechny druhy</option>
            <option value="Stěhování">Stěhování</option>
            <option value="Vyklízení">Vyklízení</option>
            <option value="Montáž">Montáž</option>
            <option value="Doprava">Doprava</option>
          </select>

          <select 
            value={workerFilter}
            onChange={e => setWorkerFilter(e.target.value)}
            className="w-full bg-slate-900 text-slate-300 text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border border-slate-700 outline-none focus:border-blue-500 appearance-none sm:col-span-2 lg:col-span-1"
          >
            <option value="All">Všichni řidiči</option>
            {workers.filter(w => w.role === 'Driver').map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-slate-800 rounded-[2rem] p-5 shadow-sm border border-slate-700 flex items-center justify-between">
        <button onClick={() => navigateDate('prev')} className="p-3 text-slate-500 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <div className="text-center">
          <p className="text-xs md:text-lg font-black text-slate-100 uppercase tracking-widest">
            {getNavigationLabel()}
          </p>
          {viewMode === 'day' && <p className="text-[10px] md:text-sm font-bold text-red-500 uppercase tracking-widest mt-0.5">{currentDate.toLocaleDateString('cs-CZ', { weekday: 'long' })}</p>}
          {viewMode === 'week' && <p className="text-[10px] md:text-sm font-bold text-blue-500 uppercase tracking-widest mt-0.5">Týdenní přehled</p>}
        </div>
        <button onClick={() => navigateDate('next')} className="p-3 text-slate-500 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="bg-slate-800 rounded-[3rem] shadow-sm border border-slate-700 overflow-hidden flex flex-col h-[600px] md:h-[800px] relative">
        {viewMode === 'day' ? renderDayView() : viewMode === 'week' ? renderWeekView() : renderListView()}
      </div>

      {/* Task Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-lg z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-2xl rounded-[32px] p-8 border border-slate-800 animate-slide-up max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl">
            <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">{isEditing ? 'Upravit zakázku' : 'Nová zakázka'}</h3>
            
            <div className="space-y-6">
              {/* Sekce pro nahrání a analýzu fotek */}
              <div className="space-y-3">
                <label className="text-xs font-black text-white uppercase px-1">Fotografie / Dokumenty ({currentTask.images?.length || 0})</label>
                
                <div className="grid grid-cols-2 gap-3">
                  {currentTask.images?.map((img, idx) => (
                    <div key={idx} className="relative aspect-video rounded-2xl overflow-hidden border border-slate-800 group">
                      <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button 
                          onClick={() => parseImageAndFill(img)}
                          disabled={isAnalyzing}
                          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                          title="Analyzovat AI"
                        >
                          <Icons.Sparkles className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            const updated = (currentTask.images || []).filter((_, i) => i !== idx);
                            setCurrentTask({ ...currentTask, images: updated });
                          }}
                          className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
                          title="Smazat"
                        >
                          <Icons.Plus className="w-4 h-4 rotate-45" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => modalFileInputRef.current?.click()}
                    className="aspect-video rounded-2xl border-2 border-dashed border-slate-800 bg-slate-950 hover:border-slate-700 flex flex-col items-center justify-center transition-all"
                  >
                    <Icons.Camera className="text-slate-700" />
                    <p className="text-[9px] font-black text-slate-700 mt-2 uppercase">Přidat foto</p>
                  </button>
                </div>

                <input 
                  type="file" 
                  ref={modalFileInputRef} 
                  hidden 
                  accept="image/*" 
                  capture="environment"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach(file => {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setCurrentTask(prev => ({
                          ...prev,
                          images: [...(prev.images || []), reader.result as string]
                        }));
                      };
                      reader.readAsDataURL(file);
                    });
                  }} 
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-white uppercase px-1">Název akce</label>
                <input value={currentTask.title} onChange={e => setCurrentTask({...currentTask, title: e.target.value})} placeholder="např. Stěhování bytu 3+1" className="w-full bg-slate-800 rounded-xl p-4 text-white border-none font-bold" />
              </div>

               <div className="space-y-1">
                <label className="text-xs font-black text-white uppercase px-1">Druh zakázky</label>
                <div className="grid grid-cols-2 gap-4">
                  <select 
                    value={currentTask.type} 
                    onChange={e => setCurrentTask({...currentTask, type: e.target.value})}
                    className="w-full bg-slate-800 rounded-xl p-3 text-sm text-white border-none outline-none"
                  >
                    <option value="Stěhování">Stěhování</option>
                    <option value="Vyklízení">Vyklízení</option>
                    <option value="Montáž">Montáž</option>
                    <option value="Doprava">Doprava</option>
                  </select>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={currentTask.estimatedPrice || ''} 
                      onChange={e => setCurrentTask({...currentTask, estimatedPrice: e.target.value ? Number(e.target.value) : undefined})} 
                      placeholder="Odhad. cena"
                      className="w-full bg-slate-800 rounded-xl p-3 text-sm text-white border-none pr-10" 
                    />
                    <span className="absolute right-3 top-3.5 text-[10px] font-black text-slate-500 uppercase">Kč</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                    <label className="text-xs font-black text-white uppercase px-1">Zákazník</label>
                    <input value={currentTask.customer} onChange={e => setCurrentTask({...currentTask, customer: e.target.value})} className="w-full bg-slate-800 rounded-xl p-3 text-sm text-white border-none" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-xs font-black text-white uppercase px-1">Telefon</label>
                    <input value={currentTask.customerPhone} onChange={e => setCurrentTask({...currentTask, customerPhone: e.target.value})} className="w-full bg-slate-800 rounded-xl p-3 text-sm text-white border-none" />
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                    <label className="text-xs font-black text-white uppercase px-1">Začátek</label>
                    <input type="datetime-local" value={formatForInput(currentTask.start)} onChange={e => setCurrentTask({...currentTask, start: new Date(e.target.value)})} className="w-full bg-slate-800 rounded-xl p-3 text-xs text-white border-none" />
                 </div>
                 <div className="space-y-1">
                    <label className="text-xs font-black text-white uppercase px-1">Konec</label>
                    <input type="datetime-local" value={formatForInput(currentTask.end)} onChange={e => setCurrentTask({...currentTask, end: new Date(e.target.value)})} className="w-full bg-slate-800 rounded-xl p-3 text-xs text-white border-none" />
                 </div>
              </div>

              {/* Adresní pole bez sekce Logistika */}
              <div className="space-y-3">
                <div className="space-y-1">
                    <label className="text-xs font-black text-white uppercase px-1">Nakládka (Odkud)</label>
                    <div className="flex gap-2">
                        <input 
                            value={currentTask.from} 
                            onChange={e => setCurrentTask({...currentTask, from: e.target.value})} 
                            placeholder="Ulice, Město" 
                            className="flex-1 bg-slate-800 rounded-xl p-3 text-sm text-white border-none" 
                        />
                        <button 
                            onClick={() => openMap(currentTask.from)}
                            className="bg-slate-800 text-blue-400 p-3 rounded-xl hover:bg-slate-700 transition-colors border border-slate-700"
                            title="Otevřít v mapách"
                        >
                            <Icons.Map />
                        </button>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-black text-white uppercase px-1">Vykládka (Kam)</label>
                    <div className="flex gap-2">
                        <input 
                            value={currentTask.to} 
                            onChange={e => setCurrentTask({...currentTask, to: e.target.value})} 
                            placeholder="Ulice, Město" 
                            className="flex-1 bg-slate-800 rounded-xl p-3 text-sm text-white border-none" 
                        />
                        <button 
                            onClick={() => openMap(currentTask.to)}
                            className="bg-slate-800 text-blue-400 p-3 rounded-xl hover:bg-slate-700 transition-colors border border-slate-700"
                            title="Otevřít v mapách"
                        >
                            <Icons.Map />
                        </button>
                    </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black text-white uppercase px-1">Tým (kliknutím vyber)</label>
                <div className="flex flex-wrap gap-2">
                   {workers.map(w => (
                     <button key={w.id} onClick={() => toggleResource(w.id, 'worker')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${currentTask.assignedWorkers?.includes(w.id) ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-white'}`}>{w.name}</button>
                   ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black text-white uppercase px-1">Vozidla (kliknutím vyber)</label>
                <div className="flex flex-wrap gap-2">
                   {vehicles.map(v => (
                     <button 
                        key={v.id} 
                        onClick={() => toggleResource(v.id, 'vehicle')} 
                        className={`px-4 py-2 rounded-xl transition-all border flex flex-col items-center ${currentTask.assignedVehicles?.includes(v.id) ? 'bg-red-600 border-red-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-white'}`}
                    >
                        <span className="text-xs font-black">{v.model}</span>
                        <span className="text-[8px] opacity-60 font-bold uppercase tracking-wider">{v.plate}</span>
                    </button>
                   ))}
                </div>
              </div>

              {/* Sekce Poznámky s AI funkcí */}
              <div className="space-y-2 pt-2 border-t border-slate-800/50">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-white uppercase px-1">Poznámky</label>
                    <button 
                        onClick={parseNotesAndFill}
                        disabled={isAnalyzing || !currentTask.notes}
                        className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 border ${
                          isAnalyzing 
                            ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed' 
                            : !currentTask.notes
                              ? 'bg-slate-800/50 border-slate-800 text-slate-600 cursor-not-allowed'
                              : 'bg-blue-600/10 border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white hover:border-blue-500 shadow-sm'
                        }`}
                    >
                        {isAnalyzing ? (
                          <>
                            <div className="w-2.5 h-2.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div> 
                            <span>Analyzuji...</span>
                          </>
                        ) : (
                          <>
                            <Icons.Sparkles /> 
                            <span>Rozpoznat údaje (AI)</span>
                          </>
                        )}
                    </button>
                </div>
                {analysisError && (
                  <div className="bg-red-900/20 border border-red-500/30 text-red-400 text-[10px] font-bold p-2 rounded-lg animate-fade-in">
                    {analysisError}
                  </div>
                )}
                <div className="relative">
                    <textarea 
                        value={currentTask.notes || ''} 
                        onChange={e => {
                          setCurrentTask({...currentTask, notes: e.target.value});
                          if (analysisError) setAnalysisError(null);
                        }} 
                        placeholder="Vložte text, např.: 'Karel Novák, 777123456, Nakládka: Praha 1, Vykládka: Brno'"
                        className="w-full bg-slate-800 rounded-xl p-4 pr-14 text-sm text-white border-none min-h-[120px] focus:ring-2 focus:ring-blue-500/50 transition-all"
                        rows={5}
                    />
                    <button 
                      onClick={() => startSTT((text) => setCurrentTask(prev => ({...prev, notes: prev.notes ? `${prev.notes} ${text}` : text})))}
                      className={`absolute right-4 top-4 p-2 rounded-xl transition-all ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
                      title="Diktovat česky"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                    </button>
                </div>
                <p className="text-[9px] text-slate-600 px-1 leading-relaxed">
                    Tip: Zkopírujte sem text emailu nebo zprávu od klienta a klikněte na <span className="text-blue-500/70">Rozpoznat údaje</span> pro automatické vyplnění polí pomocí Gemini AI.
                </p>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                {isEditing && (user.role === 'admin' || user.role === 'editor' || (user.workerId && currentTask.assignedWorkers?.includes(user.workerId) && workers.find(w => w.id === user.workerId)?.role === 'Driver')) && currentTask.status !== 'Completed' && (
                  <button 
                    onClick={async () => {
                      const updatedTask = { ...currentTask, status: 'Completed' as const };
                      setCurrentTask(updatedTask);
                      
                      // Immediate save for status change
                      try {
                        await setDoc(doc(db, 'tasks', currentTask.id!), {
                          ...updatedTask,
                          start: Timestamp.fromDate(new Date(updatedTask.start!)),
                          end: Timestamp.fromDate(new Date(updatedTask.end!))
                        });
                        showToast("Zakázka byla dokončena! 🎉");
                        setShowModal(false);
                      } catch (error) {
                        handleFirestoreError(error, OperationType.WRITE, `tasks/${currentTask.id}`);
                      }
                    }}
                    className="w-full bg-green-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-green-600/20 uppercase text-xs tracking-widest flex items-center justify-center gap-2 animate-bounce-subtle"
                  >
                    <Icons.Check className="w-4 h-4" /> Dokončit zakázku (Hotovo)
                  </button>
                )}
                
                <div className="flex gap-4">
                  <button onClick={() => setShowModal(false)} className="flex-1 text-slate-500 font-black uppercase text-xs tracking-widest">Zrušit</button>
                  {isEditing && canManageTasks && (
                    <button 
                      onClick={() => deleteTask(currentTask.id!)} 
                      className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
                      title="Vymazat zakázku"
                    >
                      <Icons.Trash className="w-5 h-5" />
                      <span className="text-xs font-black uppercase tracking-wider hidden sm:inline">Vymazat</span>
                    </button>
                  )}
                  <button onClick={saveTask} className="flex-[2] bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20 uppercase text-xs tracking-widest">Uložit změny</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
