
import React, { useState, useRef } from 'react';
import { Worker, Vehicle } from '../types';
import { Icons } from '../constants';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../App';

interface FleetViewProps {
  workers: Worker[];
  setWorkers: React.Dispatch<React.SetStateAction<Worker[]>>;
  vehicles: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  user: any;
}

const FleetView: React.FC<FleetViewProps> = ({ workers, setWorkers, vehicles, setVehicles, user }) => {
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
      case 'Specialist': return 'Specialista';
      default: return role;
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'Available': return 'Volný';
      case 'On Task': return 'Na zakázce';
      case 'Off': return 'Mimo';
      case 'Ready': return 'Připraven';
      case 'In Use': return 'V provozu';
      case 'Maintenance': return 'Servis';
      default: return status;
    }
  };

  // Handlers
  const handleOpenWorker = (w: Worker) => { setSelectedWorker({...w}); setShowWorkerModal(true); };
  const handleAddWorker = () => { setSelectedWorker({ name: '', role: 'Loader', status: 'Available', phone: '' }); setShowWorkerModal(true); };
  
  const handleOpenVehicle = (v: Vehicle) => { setSelectedVehicle({...v}); setShowVehicleModal(true); };
  const handleAddVehicle = () => { setSelectedVehicle({ plate: '', model: '', status: 'Ready', capacity: '' }); setShowVehicleModal(true); };

  const saveWorker = async () => {
    if (!selectedWorker) return;
    const workerData = {
      ...selectedWorker,
      id: selectedWorker.id || Math.random().toString(36).substr(2, 9)
    } as Worker;

    try {
      await setDoc(doc(db, 'workers', workerData.id), workerData);
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
    if (!selectedVehicle) return;
    const vehicleData = {
      ...selectedVehicle,
      id: selectedVehicle.id || Math.random().toString(36).substr(2, 9)
    } as Vehicle;

    try {
      await setDoc(doc(db, 'vehicles', vehicleData.id), vehicleData);
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
          workers.map(w => (
            <div key={w.id} onClick={() => handleOpenWorker(w)} className="bg-slate-800 p-4 rounded-2xl border border-white/10 flex items-center gap-4 hover:border-blue-500/50 cursor-pointer group">
              <div className="w-12 h-12 bg-slate-900 rounded-full border border-white/10 overflow-hidden flex items-center justify-center">
                {w.photo ? <img src={w.photo} className="w-full h-full object-cover" /> : <Icons.User />}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-slate-100 group-hover:text-blue-400">{w.name}</h4>
                <p className="text-[10px] text-white/50 font-bold uppercase">{getRoleLabel(w.role)}</p>
              </div>
              <span className={`text-[9px] px-2 py-1 rounded font-black uppercase ${w.status === 'Available' ? 'bg-blue-900/30 text-blue-400' : 'bg-red-900/30 text-red-400'}`}>{getStatusLabel(w.status)}</span>
            </div>
          ))
        ) : (
          vehicles.map(v => (
            <div key={v.id} onClick={() => handleOpenVehicle(v)} className="bg-slate-800 p-4 rounded-2xl border border-white/10 flex items-center gap-4 hover:border-blue-500/50 cursor-pointer group">
              <div className="w-12 h-12 bg-slate-900 rounded-full border border-white/10 overflow-hidden flex items-center justify-center">
                {v.carImage ? <img src={v.carImage} className="w-full h-full object-cover" /> : <Icons.Truck />}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-slate-100 group-hover:text-blue-400">{v.model}</h4>
                <p className="text-[10px] text-white/50 font-bold uppercase">{v.plate}</p>
              </div>
              <span className={`text-[9px] px-2 py-1 rounded font-black uppercase ${v.status === 'Ready' ? 'bg-blue-900/30 text-blue-400' : 'bg-red-900/30 text-red-400'}`}>{getStatusLabel(v.status)}</span>
            </div>
          ))
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
                  <select value={selectedWorker.role} onChange={e => setSelectedWorker({...selectedWorker, role: e.target.value as any})} className="w-full bg-slate-800 rounded-xl p-3 text-white border-none appearance-none">
                    <option value="Driver">Řidič</option>
                    <option value="Loader">Stěhovák</option>
                    <option value="Specialist">Specialista</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase px-1">Email</label>
                <input value={selectedWorker.email} onChange={e => setSelectedWorker({...selectedWorker, email: e.target.value})} className="w-full bg-slate-800 rounded-xl p-3 text-white border-none" />
              </div>
              <div className="flex gap-4 mt-4">
                {selectedWorker.id && user.role === 'admin' && (
                  <button 
                    onClick={() => deleteWorker(selectedWorker.id!)} 
                    className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all"
                  >
                    <Icons.Trash className="w-5 h-5" />
                  </button>
                )}
                <button onClick={saveWorker} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/20">Uložit Profil</button>
              </div>
              <button onClick={() => setShowWorkerModal(false)} className="w-full text-slate-500 font-bold py-2">Zavřít</button>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Modal */}
      {showVehicleModal && selectedVehicle && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-md rounded-[32px] p-8 border border-slate-800 animate-slide-up max-h-[90vh] overflow-y-auto no-scrollbar">
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
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase px-1">VIN číslo</label>
                            <input 
                                value={selectedVehicle.vin || ''} 
                                onChange={e => setSelectedVehicle({...selectedVehicle, vin: e.target.value})} 
                                className="w-full bg-slate-800 rounded-xl p-3 text-white border-none text-xs" 
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-500 uppercase px-1">Pojišťovna</label>
                            <input 
                                value={selectedVehicle.insuranceInfo || ''} 
                                onChange={e => setSelectedVehicle({...selectedVehicle, insuranceInfo: e.target.value})} 
                                className="w-full bg-slate-800 rounded-xl p-3 text-white border-none text-xs" 
                            />
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
                {selectedVehicle.id && user.role === 'admin' && (
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
