import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { Vehicle, MoveTask, Worker, OperationType } from '../types';
import { Icons } from '../constants';
import { getVehicleEffectiveLocation, getCurrentBrowserPosition, FLEET_HUBS } from '../utils/locationUtils';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError } from '../App';

declare const google: any;

// Source: Google Maps Platform Code Assist
// Complies with @vis.gl/react-google-maps standard and Google Maps Platform zero-legacy mandate

interface FleetMapViewProps {
  vehicles: Vehicle[];
  tasks: MoveTask[];
  workers: Worker[];
  selectedVehicleId?: string | null;
  onClose: () => void;
  showToast: (msg: string) => void;
}

// Subcomponent to control camera panning & bounds
const MapCameraController: React.FC<{
  targetLocation: { lat: number; lng: number } | null;
  allLocations: { lat: number; lng: number }[];
  shouldFitBounds?: boolean;
}> = ({ targetLocation, allLocations, shouldFitBounds }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (targetLocation) {
      map.panTo(targetLocation);
      map.setZoom(15);
    }
  }, [map, targetLocation]);

  useEffect(() => {
    if (!map || !shouldFitBounds || allLocations.length === 0) return;
    try {
      const bounds = new google.maps.LatLngBounds();
      allLocations.forEach((loc) => bounds.extend(loc));
      map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
    } catch (e) {
      // LatLngBounds fallback
    }
  }, [map, shouldFitBounds, allLocations]);

  return null;
};

// Marker item with attached InfoWindow
interface VehicleMarkerProps {
  vehicle: Vehicle;
  location: { lat: number; lng: number; address?: string; speed?: number; updatedAt?: string };
  isOnTask: boolean;
  activeTask?: MoveTask | null;
  isSelected: boolean;
  workers: Worker[];
  onSelect: () => void;
  onUpdateLocation: (vehicleId: string) => void;
  isUpdatingLoc: boolean;
}

const VehicleMarkerItem: React.FC<VehicleMarkerProps> = ({
  vehicle,
  location,
  isOnTask,
  activeTask,
  isSelected,
  workers,
  onSelect,
  onUpdateLocation,
  isUpdatingLoc,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  const getWorkerNames = (workerIds: string[] = []) => {
    return workerIds
      .map((id) => workers.find((w) => w.id === id)?.name || id)
      .join(', ');
  };

  const getStatusColor = () => {
    if (vehicle.status === 'Maintenance') return 'bg-red-500 border-red-400 text-white';
    if (isOnTask) return 'bg-orange-500 border-orange-400 text-white';
    return 'bg-blue-600 border-blue-400 text-white';
  };

  const getStatusBadge = () => {
    if (vehicle.status === 'Maintenance') {
      return <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-[9px] font-black uppercase">Servis</span>;
    }
    if (isOnTask) {
      return (
        <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded text-[9px] font-black uppercase flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
          Na zakázce
        </span>
      );
    }
    return <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-[9px] font-black uppercase">V provozu</span>;
  };

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: location.lat, lng: location.lng }}
        title={`${vehicle.model} (${vehicle.plate})`}
        zIndex={isSelected ? 9999 : isOnTask ? 500 : 100}
        onClick={onSelect}
      >
        <div className="relative group cursor-pointer select-none">
          {/* Pulsing highlight ring if selected */}
          {isSelected && (
            <div className="absolute -inset-3 bg-blue-500/40 rounded-full animate-ping pointer-events-none" />
          )}

          {/* Marker pin box */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl shadow-2xl border-2 transition-all transform duration-200 ${
              isSelected
                ? 'scale-110 ring-4 ring-blue-400 bg-slate-900 border-blue-400 text-white shadow-[0_0_25px_rgba(59,130,246,0.8)]'
                : 'bg-slate-900/90 border-slate-700 hover:border-slate-500 text-white hover:scale-105'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shadow-md border ${getStatusColor()}`}
            >
              <Icons.Truck className="w-4 h-4" />
            </div>

            <div className="flex flex-col text-left leading-tight pr-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-white">
                {vehicle.plate}
              </span>
              <span className="text-[9px] font-bold text-slate-400 max-w-[90px] truncate">
                {vehicle.model}
              </span>
            </div>
          </div>

          {/* Pointer tail */}
          <div
            className={`w-2.5 h-2.5 mx-auto -mt-1 rotate-45 border-r-2 border-b-2 bg-slate-900 ${
              isSelected ? 'border-blue-400' : 'border-slate-700'
            }`}
          />
        </div>
      </AdvancedMarker>

      {/* InfoWindow anchored directly to selected marker */}
      {isSelected && marker && (
        <InfoWindow
          anchor={marker}
          onCloseClick={onSelect}
          headerContent={
            <div className="flex items-center gap-2 pr-2">
              <span className="text-xs font-black uppercase tracking-tight text-slate-900">
                {vehicle.model}
              </span>
              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                {vehicle.plate}
              </span>
            </div>
          }
        >
          <div className="p-1 max-w-[280px] space-y-2 text-slate-800 text-left font-sans">
            <div className="flex items-center justify-between">
              {getStatusBadge()}
              <span className="text-[10px] font-bold text-slate-500">
                Objem: <strong className="text-slate-800">{vehicle.capacity || 'N/A'}</strong>
              </span>
            </div>

            {/* Current Address / Hub */}
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
              <div className="flex items-start gap-1.5">
                <Icons.MapPin className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-[10px]">
                  <p className="font-bold text-slate-700 leading-snug">
                    {location.address || 'Souřadnice k dispozici'}
                  </p>
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                    {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                  </p>
                </div>
              </div>
            </div>

            {/* Active task details if on task */}
            {isOnTask && activeTask && (
              <div className="bg-orange-50 p-2.5 rounded-xl border border-orange-200 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase text-orange-800">
                    Aktivní zakázka
                  </span>
                  <span className="text-[9px] text-orange-700 font-semibold">
                    {activeTask.customer}
                  </span>
                </div>
                <p className="text-xs font-black text-slate-900 leading-tight">
                  {activeTask.title}
                </p>
                <div className="text-[9px] text-slate-600 space-y-0.5 pt-1">
                  <p>
                    <strong>Trasa:</strong> {activeTask.from} &rarr; {activeTask.to}
                  </p>
                  {activeTask.assignedWorkers?.length > 0 && (
                    <p className="truncate">
                      <strong>Posádka:</strong> {getWorkerNames(activeTask.assignedWorkers)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 flex flex-col gap-1.5">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase py-2 px-3 rounded-lg text-center flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                <Icons.Navigation className="w-3.5 h-3.5" />
                Navigovat v Google Maps
              </a>

              <button
                type="button"
                onClick={() => onUpdateLocation(vehicle.id)}
                disabled={isUpdatingLoc}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-[9px] font-black uppercase py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition-all disabled:opacity-50"
              >
                <Icons.RefreshCw className={`w-3 h-3 ${isUpdatingLoc ? 'animate-spin' : ''}`} />
                {isUpdatingLoc ? 'Zjišťuji GPS...' : 'Aktualizovat polohu (Moje GPS)'}
              </button>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

export const FleetMapView: React.FC<FleetMapViewProps> = ({
  vehicles,
  tasks,
  workers,
  selectedVehicleId: initialSelectedVehicleId,
  onClose,
  showToast,
}) => {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    initialSelectedVehicleId || (vehicles.length > 0 ? vehicles[0].id : null)
  );
  const [filter, setFilter] = useState<'all' | 'onTask' | 'ready' | 'service'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0);
  const [isUpdatingLoc, setIsUpdatingLoc] = useState(false);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid'>('roadmap');

  // Google Maps API Key resolution
  const mapsApiKey =
    (typeof process !== 'undefined' && process.env?.VITE_GOOGLE_MAPS_API_KEY) ||
    (typeof process !== 'undefined' && process.env?.GOOGLE_MAPS_API_KEY) ||
    (import.meta as any)?.env?.VITE_GOOGLE_MAPS_API_KEY ||
    '';

  const isVehicleOnTask = (vehicleId: string) => {
    const now = new Date();
    return tasks.some(
      (t) =>
        t.assignedVehicles.includes(vehicleId) &&
        t.status !== 'Completed' &&
        now >= t.start &&
        now <= t.end
    );
  };

  const getVehicleActiveTask = (vehicleId: string): MoveTask | null => {
    const now = new Date();
    return (
      tasks.find(
        (t) =>
          t.assignedVehicles.includes(vehicleId) &&
          t.status !== 'Completed' &&
          now >= t.start &&
          now <= t.end
      ) || null
    );
  };

  // Compute effective locations for all vehicles
  const vehiclesWithLocations = useMemo(() => {
    return vehicles.map((v) => {
      const activeTask = getVehicleActiveTask(v.id);
      const onTask = isVehicleOnTask(v.id);
      const location = getVehicleEffectiveLocation(v, activeTask);
      return {
        vehicle: v,
        location,
        isOnTask: onTask,
        activeTask,
      };
    });
  }, [vehicles, tasks]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehiclesWithLocations.filter(({ vehicle, isOnTask }) => {
      // Status filter
      if (filter === 'onTask' && !isOnTask) return false;
      if (filter === 'ready' && (isOnTask || vehicle.status === 'Maintenance')) return false;
      if (filter === 'service' && vehicle.status !== 'Maintenance') return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchPlate = vehicle.plate.toLowerCase().includes(q);
        const matchModel = vehicle.model.toLowerCase().includes(q);
        const matchVin = vehicle.vin?.toLowerCase().includes(q) || false;
        if (!matchPlate && !matchModel && !matchVin) return false;
      }
      return true;
    });
  }, [vehiclesWithLocations, filter, searchQuery]);

  // Selected vehicle item
  const selectedVehicleItem = useMemo(() => {
    return vehiclesWithLocations.find((item) => item.vehicle.id === selectedVehicleId) || null;
  }, [vehiclesWithLocations, selectedVehicleId]);

  // All coordinates for fitBounds
  const allCoordinates = useMemo(() => {
    return vehiclesWithLocations.map((item) => ({
      lat: item.location.lat,
      lng: item.location.lng,
    }));
  }, [vehiclesWithLocations]);

  // Target location for camera
  const targetLocation = useMemo(() => {
    if (selectedVehicleItem) {
      return {
        lat: selectedVehicleItem.location.lat,
        lng: selectedVehicleItem.location.lng,
      };
    }
    return null;
  }, [selectedVehicleItem]);

  // Update vehicle GPS with browser GPS
  const handleUpdateVehicleLocation = async (vehicleId: string) => {
    setIsUpdatingLoc(true);
    try {
      const coords = await getCurrentBrowserPosition();
      const updatedLoc = {
        lat: coords.lat,
        lng: coords.lng,
        address: 'Aktuální GPS poloha zařízení',
        updatedAt: new Date().toISOString(),
        speed: 0,
        isOnline: true,
      };

      await updateDoc(doc(db, 'vehicles', vehicleId), {
        currentLocation: updatedLoc,
      });

      showToast('Poloha vozidla byla aktualizována na základě vaší GPS.');
    } catch (err: any) {
      console.warn('Geolocation error:', err);
      // If browser denies GPS, assign a depot location
      const fallbackHub = FLEET_HUBS[0];
      try {
        await updateDoc(doc(db, 'vehicles', vehicleId), {
          currentLocation: {
            lat: fallbackHub.lat,
            lng: fallbackHub.lng,
            address: fallbackHub.address,
            updatedAt: new Date().toISOString(),
            speed: 0,
            isOnline: true,
          },
        });
        showToast('Nastavena výchozí poloha depa.');
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.UPDATE, `vehicles/${vehicleId}`);
      }
    } finally {
      setIsUpdatingLoc(false);
    }
  };

  // Center on Prague by default
  const defaultCenter = useMemo(() => {
    if (selectedVehicleItem) {
      return { lat: selectedVehicleItem.location.lat, lng: selectedVehicleItem.location.lng };
    }
    if (allCoordinates.length > 0) {
      return allCoordinates[0];
    }
    return { lat: 50.0878, lng: 14.4205 }; // Prague
  }, [selectedVehicleItem, allCoordinates]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col overflow-hidden animate-fade-in text-white">
      {/* Top Header */}
      <header className="bg-slate-900/90 border-b border-white/10 px-4 py-3 sm:px-6 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
            <Icons.Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black uppercase tracking-tight flex items-center gap-2">
              Mapa flotily <span className="text-red-500">2.0</span>
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              Aktuální poloha vozidel ({vehiclesWithLocations.length} celkem)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFitBoundsTrigger((prev) => prev + 1)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black uppercase rounded-xl border border-white/10 transition-all shadow-md"
            title="Zobrazit všechna vozidla na mapě"
          >
            <Icons.Maximize className="w-3.5 h-3.5" />
            <span>Zobrazit vše</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setMapType((prev) => (prev === 'roadmap' ? 'satellite' : prev === 'satellite' ? 'hybrid' : 'roadmap'))
            }
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black uppercase rounded-xl border border-white/10 transition-all"
            title="Změnit typ mapy"
          >
            <Icons.Layers className="w-3.5 h-3.5" />
            <span className="capitalize">{mapType}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 sm:px-4 sm:py-2 bg-white/10 hover:bg-white/20 text-white font-black text-xs uppercase rounded-xl transition-all flex items-center gap-1.5"
            title="Zavřít mapu"
          >
            <Icons.X className="w-4 h-4" />
            <span className="hidden sm:inline">Zavřít</span>
          </button>
        </div>
      </header>

      {/* Main Container: Map + Left/Bottom Drawer */}
      <div className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        {/* Vehicles Sidebar / Tray */}
        <aside className="w-full md:w-80 lg:w-96 bg-slate-900/95 border-b md:border-b-0 md:border-r border-white/10 flex flex-col max-h-[35vh] md:max-h-full shrink-0 z-10 shadow-2xl">
          {/* Search & Filters */}
          <div className="p-3 sm:p-4 space-y-2.5 border-b border-white/5">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Hledat podle SPZ nebo modelu..."
                className="w-full bg-slate-800 text-white placeholder-slate-500 text-xs rounded-xl pl-9 pr-3 py-2.5 border border-white/5 focus:outline-none focus:border-blue-500"
              />
              <Icons.Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <Icons.X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter pills */}
            <div className="grid grid-cols-4 gap-1 text-[9px] font-black uppercase tracking-wider">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`py-1.5 rounded-lg transition-all ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Vše ({vehiclesWithLocations.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('onTask')}
                className={`py-1.5 rounded-lg transition-all ${
                  filter === 'onTask'
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Zakázka ({vehiclesWithLocations.filter((v) => v.isOnTask).length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('ready')}
                className={`py-1.5 rounded-lg transition-all ${
                  filter === 'ready'
                    ? 'bg-blue-500 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Volná ({vehiclesWithLocations.filter((v) => !v.isOnTask && v.vehicle.status !== 'Maintenance').length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('service')}
                className={`py-1.5 rounded-lg transition-all ${
                  filter === 'service'
                    ? 'bg-red-500 text-white shadow-md'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Servis ({vehiclesWithLocations.filter((v) => v.vehicle.status === 'Maintenance').length})
              </button>
            </div>
          </div>

          {/* Vehicle List */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-2 sm:p-3 space-y-1.5">
            {filteredVehicles.length > 0 ? (
              filteredVehicles.map(({ vehicle, location, isOnTask, activeTask }) => {
                const isSelected = vehicle.id === selectedVehicleId;
                return (
                  <div
                    key={vehicle.id}
                    onClick={() => setSelectedVehicleId(vehicle.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 select-none ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500/80 shadow-lg ring-1 ring-blue-500/50'
                        : 'bg-slate-800/60 border-white/5 hover:border-white/20 hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                        vehicle.status === 'Maintenance'
                          ? 'bg-red-500/20 text-red-400 border-red-500/40'
                          : isOnTask
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                          : 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                      }`}
                    >
                      <Icons.Truck className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-black text-xs uppercase tracking-tight text-white truncate">
                          {vehicle.model}
                        </span>
                        <span className="font-mono text-[10px] font-bold text-slate-400 shrink-0">
                          {vehicle.plate}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        {isOnTask && activeTask
                          ? `Zakázka: ${activeTask.title}`
                          : location.address || 'Základna'}
                      </p>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span
                        className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                          vehicle.status === 'Maintenance'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : isOnTask
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {vehicle.status === 'Maintenance'
                          ? 'Servis'
                          : isOnTask
                          ? 'Zakázka'
                          : 'Volno'}
                      </span>
                      {isSelected && (
                        <span className="text-[8px] font-black uppercase text-blue-400 flex items-center gap-0.5">
                          <span>Vybráno</span>
                          <Icons.ChevronRight className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-500">
                <Icons.Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-bold uppercase tracking-wider">Žádná vozidla</p>
              </div>
            )}
          </div>

          {/* Quick Stats Footer in Sidebar */}
          <div className="p-3 bg-slate-950/60 border-t border-white/5 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <span>Vybrané: <strong className="text-white">{selectedVehicleItem?.vehicle.model || 'Žádné'}</strong></span>
            {selectedVehicleItem && (
              <button
                type="button"
                onClick={() => handleUpdateVehicleLocation(selectedVehicleItem.vehicle.id)}
                disabled={isUpdatingLoc}
                className="text-blue-400 hover:text-blue-300 font-black uppercase flex items-center gap-1"
              >
                <Icons.RefreshCw className={`w-3 h-3 ${isUpdatingLoc ? 'animate-spin' : ''}`} />
                GPS
              </button>
            )}
          </div>
        </aside>

        {/* Map View Area */}
        <div className="flex-1 relative w-full h-full min-h-[350px]">
          <APIProvider apiKey={mapsApiKey} libraries={['marker']}>
            <Map
              mapId="DEMO_MAP_ID"
              defaultCenter={defaultCenter}
              defaultZoom={12}
              gestureHandling="greedy"
              disableDefaultUI={false}
              mapTypeId={mapType}
              className="w-full h-full min-h-[350px]"
              style={{ width: '100%', height: '100%' }}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            >
              {/* Camera Pan & Bounds Helper */}
              <MapCameraController
                targetLocation={targetLocation}
                allLocations={allCoordinates}
                shouldFitBounds={fitBoundsTrigger > 0}
              />

              {/* Render vehicle markers */}
              {vehiclesWithLocations.map(({ vehicle, location, isOnTask, activeTask }) => {
                const isSelected = vehicle.id === selectedVehicleId;
                return (
                  <VehicleMarkerItem
                    key={vehicle.id}
                    vehicle={vehicle}
                    location={location}
                    isOnTask={isOnTask}
                    activeTask={activeTask}
                    isSelected={isSelected}
                    workers={workers}
                    onSelect={() =>
                      setSelectedVehicleId((prev) => (prev === vehicle.id ? null : vehicle.id))
                    }
                    onUpdateLocation={handleUpdateVehicleLocation}
                    isUpdatingLoc={isUpdatingLoc}
                  />
                );
              })}
            </Map>
          </APIProvider>

          {/* Floating Mobile Controls overlay */}
          <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => setFitBoundsTrigger((prev) => prev + 1)}
              className="p-3 bg-slate-900/90 text-white rounded-2xl border border-white/20 shadow-xl"
              title="Zobrazit vše"
            >
              <Icons.Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FleetMapView;
