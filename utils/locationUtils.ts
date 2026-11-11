import { Vehicle, MoveTask, VehicleLocation } from '../types';

// Standard hubs / depots for logistics fleet in Czech Republic
export const FLEET_HUBS = [
  { name: 'Centrální sklad & Depo Malešice (Praha 10)', lat: 50.0841, lng: 14.5123, address: 'Průmyslová 1472, Praha 10 - Malešice' },
  { name: 'Depo Zličín (Praha 5)', lat: 50.0526, lng: 14.2831, address: 'Na Radosti 399, Praha 5 - Zličín' },
  { name: 'Depo Libeň (Praha 8)', lat: 50.1062, lng: 14.4755, address: 'Voctářova 2449/5, Praha 8 - Libeň' },
  { name: 'Depo Chodov (Praha 4)', lat: 50.0298, lng: 14.5028, address: 'Turkovo 828, Praha 4 - Chodov' },
  { name: 'Depo Letňany (Praha 9)', lat: 50.1345, lng: 14.5182, address: 'Veselská 699, Praha 9 - Letňany' },
  { name: 'Pobočka Brno - Sklad', lat: 49.1951, lng: 16.6068, address: 'Vídeňská 101, Brno' },
];

// Well-known coordinates for common Prague/CZ locations to provide realistic mock positions for tasks
const KNOWN_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  praha: { lat: 50.0755, lng: 14.4378 },
  prague: { lat: 50.0755, lng: 14.4378 },
  vinohrady: { lat: 50.0753, lng: 14.4442 },
  žižkov: { lat: 50.0864, lng: 14.4607 },
  zizkov: { lat: 50.0864, lng: 14.4607 },
  karlín: { lat: 50.0926, lng: 14.4503 },
  karlin: { lat: 50.0926, lng: 14.4503 },
  smíchov: { lat: 50.0712, lng: 14.4035 },
  smichov: { lat: 50.0712, lng: 14.4035 },
  dejvice: { lat: 50.1012, lng: 14.3912 },
  holešovice: { lat: 50.1039, lng: 14.4449 },
  holesovice: { lat: 50.1039, lng: 14.4449 },
  nusle: { lat: 50.0617, lng: 14.4429 },
  brno: { lat: 49.1951, lng: 16.6068 },
  plzeň: { lat: 49.7384, lng: 13.3736 },
  plzen: { lat: 49.7384, lng: 13.3736 },
  ostrava: { lat: 49.8209, lng: 18.2625 },
  olomouc: { lat: 49.5938, lng: 17.2509 },
  liberec: { lat: 50.7663, lng: 15.0543 },
};

/**
 * Returns a deterministic hash number for a string
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Resolves the effective current location for any vehicle in the fleet.
 * If the vehicle has an explicitly stored GPS location, that is used.
 * Otherwise, if the vehicle is on an active task, it is positioned near that task's location.
 * Otherwise, it is assigned a realistic base depot coordinate.
 */
export function getVehicleEffectiveLocation(
  vehicle: Vehicle,
  activeTask?: MoveTask | null
): VehicleLocation {
  if (vehicle.currentLocation && typeof vehicle.currentLocation.lat === 'number' && typeof vehicle.currentLocation.lng === 'number') {
    return vehicle.currentLocation;
  }

  // If vehicle is on an active task, place it near the task
  if (activeTask) {
    const textSearch = (activeTask.to || activeTask.from || '').toLowerCase();
    let baseCoord = { lat: 50.0820, lng: 14.4300 }; // Center of Prague

    for (const [key, coord] of Object.entries(KNOWN_LOCATIONS)) {
      if (textSearch.includes(key)) {
        baseCoord = coord;
        break;
      }
    }

    const h = hashString(vehicle.id + activeTask.id);
    const offsetLat = ((h % 100) - 50) * 0.0003;
    const offsetLng = (((h >> 3) % 100) - 50) * 0.0004;

    return {
      lat: Number((baseCoord.lat + offsetLat).toFixed(6)),
      lng: Number((baseCoord.lng + offsetLng).toFixed(6)),
      address: activeTask.to || activeTask.from || 'Na trase zakázky',
      updatedAt: new Date().toISOString(),
      speed: 38,
      driverName: 'Na zakázce',
      isOnline: true,
    };
  }

  // Otherwise, assign to one of the fleet hubs deterministically
  const hubIdx = hashString(vehicle.plate || vehicle.id) % FLEET_HUBS.length;
  const hub = FLEET_HUBS[hubIdx];
  const h = hashString(vehicle.id);
  const spreadLat = ((h % 20) - 10) * 0.00015;
  const spreadLng = (((h >> 2) % 20) - 10) * 0.0002;

  return {
    lat: Number((hub.lat + spreadLat).toFixed(6)),
    lng: Number((hub.lng + spreadLng).toFixed(6)),
    address: hub.address,
    updatedAt: new Date(Date.now() - (h % 3600000)).toISOString(),
    speed: 0,
    driverName: 'Centrála / Parkoviště',
    isOnline: vehicle.status === 'Ready' || vehicle.status === 'In Use',
  };
}

/**
 * Get device GPS coordinates using browser Geolocation API
 */
export function getCurrentBrowserPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Váš prohlížeč nepodporuje geolokaci.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        reject(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}
