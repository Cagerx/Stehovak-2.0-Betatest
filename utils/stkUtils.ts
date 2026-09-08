export interface StkStatus {
  isExpiringSoon: boolean; // true if remaining days <= 30
  isExpired: boolean;      // true if remaining days < 0
  daysRemaining: number;
  formattedDate: string;
}

/**
 * Parses a vehicle STK expiration string (YYYY-MM-DD or parseable date string)
 * and calculates the remaining days relative to current date (at midnight).
 */
export function getVehicleStkStatus(stkExpiration?: string): StkStatus | null {
  if (!stkExpiration || !stkExpiration.trim()) return null;

  const parts = stkExpiration.trim().split('-');
  let stkDate: Date;
  if (parts.length === 3 && parts[0].length === 4) {
    // YYYY-MM-DD
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    stkDate = new Date(year, month, day);
  } else {
    stkDate = new Date(stkExpiration);
  }

  if (isNaN(stkDate.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(stkDate);
  targetDate.setHours(0, 0, 0, 0);

  const diffMs = targetDate.getTime() - today.getTime();
  const daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return {
    isExpiringSoon: daysRemaining <= 30,
    isExpired: daysRemaining < 0,
    daysRemaining,
    formattedDate: stkDate.toLocaleDateString('cs-CZ')
  };
}

export function formatCzechDays(days: number): string {
  const absDays = Math.abs(days);
  if (absDays === 1) return '1 den';
  if (absDays >= 2 && absDays <= 4) return `${absDays} dny`;
  return `${absDays} dní`;
}
