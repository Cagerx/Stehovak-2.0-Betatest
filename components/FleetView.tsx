
import React, { useState, useRef } from 'react';
import { Worker, Vehicle, MoveTask, OperationType } from '../types';
import { Icons } from '../constants';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError } from '../App';

interface FleetViewProps {
  workers: Worker[];
  setWorkers: React.Dispatch<React.SetStateAction<Worker[]>>;
  vehicles: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  tasks: MoveTask[];
  user: any;
  showToast: (message: string) => void;
}

const FleetView: React.FC<FleetViewProps> = ({ workers, setWorkers, vehicles, setVehicles, tasks, user, showToast }) => {
  const [activeSubTab, setActiveSubTab] = useState<'workers' | 'vehicles'>('workers');
  
  // Modal states
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Partial<Vehicle> | null>(null);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Partial<Worker> | null>(null);

  const carImageRef = useRef<HTMLInputElement>(null);
  const techCertImageRef = useRef<HTMLInputElement>(null);
  const workerPhotoRef = useRef<HTMLInputElement>(null);

  const getRoleLabel = (role: string) => {
    switch(role) {
      case 'Driver': return 'Řidič';
      case 'Loader': return 'Stěhovák';
      case 'Boss': return 'Boss';
      default: return role;
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'Available': return 'Volný';
      case 'On Task': return 'Na zakázce';
      case 'Off': return 'Mimo';
      case 'Ready': return 'V provozu';
      case 'In Use': return 'V provozu';
      case 'Maintenance': return 'Servis';
      default: return status;
    }
  };

  const isVehicleOnTask = (vehicleId: string) => {
    const now = new Date();
    return tasks.some(t => 
      t.assignedVehicles.includes(vehicleId) && 
      t.status !== 'Completed' &&
      now >= t.start && 
      now <= t.end
    );
  };

  const isWorkerOnTask = (workerId: string) => {
    const now = new Date();
    return tasks.some(t => 
      t.assignedWorkers.includes(workerId) && 
      t.status !== 'Completed' &&
      now >= t.start && 
      now <= t.end
    );
  };

  const getWorkerName = (id: string) => workers.find(w => w.id === id)?.name || id;

  const getUpcomingOrder = (workerId?: string) => {
    if (!workerId) return null;
    const now = new Date();
    return tasks
      .filter(t => t.assignedWorkers.includes(workerId) && t.start > now && t.status !== 'Completed')
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  };

  // Handlers
  const handleOpenWorker = (w: Worker) => { setSelectedWorker({...w}); setShowWorkerModal(true); };
  const handleAddWorker = () => { setSelectedWorker({ name: '', role: 'Loader', status: 'Available', phone: '' }); setShowWorkerModal(true); };
  
  const handleOpenVehicle = (v: Vehicle) => { setSelectedVehicle({...v}); setShowVehicleModal(true); };
  const handleAddVehicle = () => { setSelectedVehicle({ plate: '', model: '', status: 'Ready', capacity: '' }); setShowVehicleModal(true); };

  const saveWorker = async () => {
    if (!selectedWorker || !selectedWorker.name || !selectedWorker.phone || !selectedWorker.role) {
      alert("Prosím vyplňte jméno, telefon a roli.");
      return;
    }
    const workerData = {
      ...selectedWorker,
      id: selectedWorker.id || Math.random().toString(36).substr(2, 9)
    } as Worker;

    try {
      await setDoc(doc(db, 'workers', workerData.id), workerData);
      showToast("Record Saved");
      setShowWorkerModal(false);
    } catch (error) {
      const handled = handleFirestoreError(error, OperationType.WRITE, `workers/${workerData.id}`);
      if (!handled) {
        console.error("Worker save error:", error);
        alert("Chyba při ukládání pracovníka.");
      }
    }
  };

  const deleteWorker = async (id: string) => {
    if (!window.confirm("Opravdu chcete tohoto pracovníka smazat?")) return;
    try {
      await deleteDoc(doc(db, 'workers', id));
      showToast("Pracovník smazán");
      setShowWorkerModal(false);
    } catch (error) {
      const handled = handleFirestoreError(error, OperationType.DELETE, `workers/${id}`);
      if (!handled) {
        console.error("Worker delete error:", error);
        alert("Chyba při mazání pracovníka.");
      }
    }
  };

  const saveVehicle = async () => {
    if (!selectedVehicle || !selectedVehicle.plate || !selectedVehicle.model || !selectedVehicle.capacity) {
      alert("Prosím vyplňte SPZ, model a kapacitu.");
      return;
    }
    const vehicleData = {
      ...selectedVehicle,
      id: selectedVehicle.id || Math.random().toString(36).substr(2, 9)
    } as Vehicle;

    try {
      await setDoc(doc(db, 'vehicles', vehicleData.id), vehicleData);
      showToast("Record Saved");
      setShowVehicleModal(false);
    } catch (error) {
      const handled = handleFirestoreError(error, OperationType.WRITE, `vehicles/${vehicleData.id}`);
      if (!handled) {
        console.error("Vehicle save error:", error);
        alert("Chyba při ukládání vozidla.");
      }
    }
  };

  const deleteVehicle = async (id: string) => {
    if (!window.confirm("Opravdu chcete toto vozidlo smazat?")) return;
    try {
      await deleteDoc(doc(db, 'vehicles', id));
      showToast("Vozidlo smazáno");
      setShowVehicleModal(false);
    } catch (error) {
      const handled = handleFirestoreError(error, OperationType.DELETE, `vehicles/${id}`);
      if (!handled) {
        console.error("Vehicle delete error:", error);
        alert("Chyba při mazání vozidla.");
      }
    }
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>, type: 'photo' | 'car' | 'tech') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (type === 'photo') setSelectedWorker(p => ({...p, photo: base64}));
        if (type === 'car') setSelectedVehicle(p => ({...p, carImage: base64}));
        if (type === 'tech') setSelectedVehicle(p => ({...p, techCertImage: base64}));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 p-1 rounded-2xl flex border border-white/10">
        <button onClick={() => setActiveSubTab('workers')} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeSubTab === 'workers' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/30 hover:text-white'}`}>Tým</button>
        <button onClick={() => setActiveSubTab('vehicles')} className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeSubTab === 'vehicles' ? 'bg-white text-slate-900 shadow-lg' : 'text-white/30 hover:text-white'}`}>AUTA</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {activeSubTab === 'workers' ? (
          workers.map(w => {
            const onTask = isWorkerOnTask(w.id);
            const statusLabel = onTask ? 'Na zakázce' : getStatusLabel(w.status);
            const isAvailable = !onTask && w.status === 'Available';
            
            return (
              <div key={w.id} onClick={() => handleOpenWorker(w)} className="bg-slate-800 p-4 rounded-3xl border border-white/5 flex items-center gap-4 hover:border-blue-500/50 cursor-pointer group transition-all active:scale-95 shadow-lg">
                <div className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center transition-all ${
                  isAvailable 
                    ? 'bg-blue-600/10 border-blue-500/20 text-blue-400 group-hover:bg-blue-600/20' 
                    : onTask 
                      ? 'bg-orange-600/10 border-orange-500/20 text-orange-400 group-hover:bg-orange-600/20'
                      : 'bg-red-600/10 border-red-500/20 text-red-400 group-hover:bg-red-600/20'
                }`}>
                  {w.photo ? <img src={w.photo} className="w-full h-full object-cover rounded-xl" /> : <Icons.User className="w-6 h-6" />}
                </div>
                <div className="flex-1">
                  <h4 className="font-black text-white tracking-tight leading-tight group-hover:text-blue-400 transition-colors uppercase text-sm">{w.name}</h4>
                  <p className="text-[10px] text-white/50 font-black tracking-widest uppercase mt-0.5">{getRoleLabel(w.role)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[8px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${
                    isAvailable 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                      : onTask 
                        ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20'
                        : 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                  }`}>
                    {statusLabel}
                  </span>
                  {onTask && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
                      <span className="text-[8px] text-orange-400 font-bold uppercase">Aktivní</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          vehicles.map(v => {
            const onTask = isVehicleOnTask(v.id);
            const statusLabel = onTask ? 'Na zakázce' : getStatusLabel(v.status);
            const isReady = !onTask && (v.status === 'Ready' || v.status === 'In Use');
            
            return (
              <div key={v.id} onClick={() => handleOpenVehicle(v)} className="bg-slate-800 p-4 rounded-3xl border border-white/5 flex items-center gap-4 hover:border-blue-500/50 cursor-pointer group transition-all active:scale-95 shadow-lg">
                <div className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center transition-all ${
                  isReady 
                    ? 'bg-blue-600/10 border-blue-500/20 text-blue-400 group-hover:bg-blue-600/20' 
                    : onTask 
                      ? 'bg-orange-600/10 border-orange-500/20 text-orange-400 group-hover:bg-orange-600/20'
                      : 'bg-red-600/10 border-red-500/20 text-red-400 group-hover:bg-red-600/20'
                }`}>
                  {v.carImage ? <img src={v.carImage} className="w-full h-full object-cover rounded-xl" /> : <Icons.Truck className="w-6 h-6" />}
                </div>
                <div className="flex-1">
                  <h4 className="font-black text-white tracking-tight leading-tight group-hover:text-blue-400 transition-colors uppercase text-sm">{v.model}</h4>
                  <p className="text-[10px] text-white/50 font-black tracking-widest uppercase mt-0.5">{v.plate}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[8px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${
                    isReady 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                      : onTask 
                        ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20'
                        : 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                  }`}>
                    {statusLabel}
                  </span>
                  {onTask && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
                      <span className="text-[8px] text-orange-400 font-bold uppercase">Aktivní</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <button onClick={activeSubTab === 'workers' ? handleAddWorker : handleAddVehicle} className="w-full border-2 border-dashed border-white/10 py-4 rounded-2xl text-white/30 font-black text-[10px] uppercase hover:text-blue-400 hover:border-blue-500 transition-all flex items-center justify-center gap-2">
        <Icons.Plus /> Přidat {activeSubTab === 'workers' ? 'člena týmu' : 'vozidlo'}
      </button>

      {/* Worker Modal */}
      {showWorkerModal && selectedWorker && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-md rounded-[32px] p-8 border border-slate-800 animate-slide-up max-h-[90vh] overflow-y-auto no-scrollbar">
            <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">Profil pracovníka</h3>
            <div className="space-y-4">
              <div className="flex justify-center mb-4">
                <div onClick={() => workerPhotoRef.current?.click()} className="w-24 h-24 bg-slate-800 rounded-3xl border-2 border-slate-700 overflow-hidden cursor-pointer flex items-center justify-center">
                  {selectedWorker.photo ? <img src={selectedWorker.photo} className="w-full h-full object-cover" /> : <Icons.Camera />}
                </div>
                <input type="file" ref={workerPhotoRef} hidden onChange={e => handleImage(e, 'photo')} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase px-1">Jméno</label>
                <input value={selectedWorker.name} onChange={e => setSelectedWorker({...selectedWorker, name: e.target.value})} className="w-full bg-slate-800 rounded-xl p-3 text-white border-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">Telefon</label>
                  <input value={selectedWorker.phone} onChange={e => setSelectedWorker({...selectedWorker, phone: e.target.value})} className="w-full bg-slate-800 rounded-xl p-3 text-white border-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">Pozice</label>
                  <select 
                    value={selectedWorker.role} 
                    onChange={e => setSelectedWorker({...selectedWorker, role: e.target.value as any})} 
                    className={`w-full bg-slate-800 rounded-xl p-3 text-white border-none appearance-none ${user?.role !== 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={user?.role !== 'admin'}
                  >
                    <option value="Loader">Stěhovák</option>
                    <option value="Driver">Řidič</option>
                    <option value="Boss">Boss</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase px-1">Email</label>
                <input value={selectedWorker.email} onChange={e => setSelectedWorker({...selectedWorker, email: e.target.value})} className="w-full bg-slate-800 rounded-xl p-3 text-white border-none" />
              </div>

              {selectedWorker.id && (() => {
                const order = getUpcomingOrder(selectedWorker.id);
                if (!order) return null;
                return (
                  <div className="pt-4 border-t border-slate-800 space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nejbližší zakázka</h4>
                    <div className="bg-slate-800/50 p-4 rounded-3xl border border-white/5 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-white font-black text-sm uppercase tracking-tight">{order.title}</p>
                          <span className="text-[9px] text-blue-400 font-black uppercase tracking-[0.2em]">{order.type}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-black text-xs leading-none mb-1">{order.start.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</p>
                          <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{order.start.toLocaleDateString('cs-CZ')}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 pb-4 border-b border-white/5">
                        <div className="flex flex-col gap-1">
                          <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Odkud</p>
                          <p className="text-[10px] text-white font-bold leading-snug">{order.from}</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Kam</p>
                          <p className="text-[10px] text-white font-bold leading-snug">{order.to}</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Tým</p>
                        <div className="flex flex-wrap gap-1.5">
                          {order.assignedWorkers.map(wid => (
                            <span key={wid} className={`text-[8px] px-2.5 py-1 rounded-xl font-black uppercase tracking-wide border ${wid === selectedWorker.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-white/5 text-slate-400'}`}>
                              {getWorkerName(wid)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-4 mt-4">
                {selectedWorker.id && user?.role === 'admin' && (
                  <button 
                    onClick={() => deleteWorker(selectedWorker.id!)} 
                    className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all"
                  >
                    <Icons.Trash className="w-5 h-5" />
                  </button>
                )}
                <button onClick={saveWorker} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20">Upload Profile</button>
              </div>
              <button onClick={() => setShowWorkerModal(false)} className="w-full text-slate-500 font-bold py-2">Zavřít</button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Modal */}
      {showVehicleModal && selectedVehicle && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-xl rounded-[32px] p-8 border border-slate-800 animate-slide-up max-h-[90vh] overflow-y-auto no-scrollbar">
            <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">Detail Vozidla</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">SPZ</label>
                  <input value={selectedVehicle.plate} onChange={e => setSelectedVehicle({...selectedVehicle, plate: e.target.value})} className="w-full bg-slate-800 rounded-xl p-3 text-white border-none font-black uppercase" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase px-1">Model</label>
                  <input value={selectedVehicle.model} onChange={e => setSelectedVehicle({...selectedVehicle, model: e.target.value})} className="w-full bg-slate-800 rounded-xl p-3 text-white border-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase px-1">Kapacita (m³)</label>
                <input value={selectedVehicle.capacity} onChange={e => setSelectedVehicle({...selectedVehicle, capacity: e.target.value})} className="w-full bg-slate-800 rounded-xl p-3 text-white border-none" />
              </div>

              <div className="pt-4 border-t border-slate-800">
                <h4 className="text-[10px] font-black text-slate-400 uppercase mb-3">Dokumenty a Termíny</h4>
                <div className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase px-1">VIN číslo</label>
                        <input 
                            value={selectedVehicle.vin || ''} 
                            onChange={e => setSelectedVehicle({...selectedVehicle, vin: e.target.value})} 
                            className="w-full bg-slate-800 rounded-xl p-3 text-white border-none text-xs" 
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase px-1">Pojišťovna</label>
                            <input 
                                value={selectedVehicle.insuranceInfo || ''} 
                                onChange={e => setSelectedVehicle({...selectedVehicle, insuranceInfo: e.target.value})} 
                                className="w-full bg-slate-800 rounded-xl p-3 text-white border-none text-xs" 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase px-1 truncate">Asistenčná služba</label>
                            <div className="relative group/call">
                                <input 
                                    value={selectedVehicle.assistancePhone || ''} 
                                    onChange={e => setSelectedVehicle({...selectedVehicle, assistancePhone: e.target.value})} 
                                    placeholder="+421 ..."
                                    className="w-full bg-slate-800 rounded-xl p-3 text-white border-none text-xs pr-10" 
                                />
                                {selectedVehicle.assistancePhone && (
                                    <button 
                                        onClick={() => { window.location.href = `tel:${selectedVehicle.assistancePhone}`; }}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-lg"
                                        title="Zavolať asistenciu"
                                    >
                                        <Icons.Phone className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase px-1">Platnost STK</label>
                            <input 
                                type="date"
                                value={selectedVehicle.stkExpiration || ''} 
                                onChange={e => setSelectedVehicle({...selectedVehicle, stkExpiration: e.target.value})} 
                                className="w-full bg-slate-800 rounded-xl p-3 text-white border-none text-xs" 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase px-1">Dálniční známka</label>
                            <input 
                                type="date"
                                value={selectedVehicle.vignetteExpiration || ''} 
                                onChange={e => setSelectedVehicle({...selectedVehicle, vignetteExpiration: e.target.value})} 
                                className="w-full bg-slate-800 rounded-xl p-3 text-white border-none text-xs" 
                            />
                        </div>
                    </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase mb-3">Pneumatiky a Servis</h4>
                 <div className="grid grid-cols-2 gap-4">
                    <input value={selectedVehicle.tireSize} onChange={e => setSelectedVehicle({...selectedVehicle, tireSize: e.target.value})} placeholder="Rozměr" className="bg-slate-800 rounded-xl p-3 text-xs border-none" />
                    <input value={selectedVehicle.tireDepth} onChange={e => setSelectedVehicle({...selectedVehicle, tireDepth: e.target.value})} placeholder="Dezén (mm)" className="bg-slate-800 rounded-xl p-3 text-xs border-none" />
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div onClick={() => carImageRef.current?.click()} className="aspect-video bg-slate-800 rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer overflow-hidden">
                  {selectedVehicle.carImage ? <img src={selectedVehicle.carImage} className="w-full h-full object-cover" /> : <Icons.Camera />}
                </div>
                <div onClick={() => techCertImageRef.current?.click()} className="aspect-video bg-slate-800 rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer overflow-hidden">
                  {selectedVehicle.techCertImage ? <img src={selectedVehicle.techCertImage} className="w-full h-full object-cover" /> : <Icons.Sparkles />}
                </div>
              </div>
              <input type="file" ref={carImageRef} hidden onChange={e => handleImage(e, 'car')} />
              <input type="file" ref={techCertImageRef} hidden onChange={e => handleImage(e, 'tech')} />
              <div className="flex gap-4 mt-4">
                {selectedVehicle.id && user?.role === 'admin' && (
                  <button 
                    onClick={() => deleteVehicle(selectedVehicle.id!)} 
                    className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all"
                  >
                    <Icons.Trash className="w-5 h-5" />
                  </button>
                )}
                <button onClick={saveVehicle} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20">Uložit Vozidlo</button>
              </div>
              <button onClick={() => setShowVehicleModal(false)} className="w-full text-slate-500 font-bold py-2">Zavřít</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetView;
