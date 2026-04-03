/**
 * Smart time parser for the time picker.
 * Accepts: "2p", "2pm", "2:30pm", "14:30", "1430", "830", "noon", "midnight", etc.
 * Returns HH:MM (24h) string or null if unparseable.
 */
export function parseTimeInput(raw: string, context: 'morning' | 'evening' = 'evening'): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;

  // Named times
  if (s === 'noon' || s === '12p' || s === '12pm') return '12:00';
  if (s === 'midnight' || s === '12a' || s === '12am') return '00:00';

  // Extract meridiem
  let meridiem: 'am' | 'pm' | null = null;
  let numeric = s;
  if (s.endsWith('pm') || s.endsWith('p')) {
    meridiem = 'pm';
    numeric = s.replace(/p[m]?$/, '');
  } else if (s.endsWith('am') || s.endsWith('a')) {
    meridiem = 'am';
    numeric = s.replace(/a[m]?$/, '');
  }

  // Parse the numeric part
  let hours: number;
  let minutes: number;

  if (numeric.includes(':') || numeric.includes('.')) {
    // Separator present: H:MM or HH:MM or H.MM
    const parts = numeric.split(/[:.]/);
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1] || '0', 10);
  } else if (numeric.length <= 2) {
    // 1-2 digits: just hours
    hours = parseInt(numeric, 10);
    minutes = 0;
  } else if (numeric.length === 3) {
    // 3 digits: H:MM (e.g. "830" → 8:30)
    hours = parseInt(numeric[0], 10);
    minutes = parseInt(numeric.slice(1), 10);
  } else if (numeric.length === 4) {
    // 4 digits: HHMM (e.g. "1430" → 14:30, "0830" → 8:30)
    hours = parseInt(numeric.slice(0, 2), 10);
    minutes = parseInt(numeric.slice(2), 10);
  } else {
    return null;
  }

  if (isNaN(hours) || isNaN(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;
  if (hours < 0 || hours > 23) {
    // Handle 24 as midnight edge case
    if (hours === 24 && minutes === 0) return '00:00';
    return null;
  }

  // Apply meridiem
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  // Context-based AM/PM disambiguation (only when no explicit meridiem and hours <= 12)
  if (!meridiem && hours >= 1 && hours <= 12) {
    if (context === 'evening' && hours >= 1 && hours <= 6) {
      hours += 12; // 1-6 → 13-18 (PM) for evening context
    }
    // 7-12 stay as-is (7am-12pm for morning, 7pm-12am handled by explicit meridiem)
  }

  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  return `${hStr}:${mStr}`;
}

/**
 * Format a HH:MM (24h) string to display format.
 * Returns "8:30 PM" style for 12h display.
 */
export function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Generate the 15-minute interval list for the dropdown.
 * Returns array of { value: "HH:MM", label: "8:00 PM" } objects.
 */
export function generateTimeSlots(): { value: string; label: string }[] {
  const slots: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      slots.push({ value, label: formatTime12h(value) });
    }
  }
  return slots;
}

/**
 * Compute hours between two HH:MM strings.
 * Handles midnight-spanning (e.g. 22:00→02:00 = 4 hours).
 * Returns null if either input is invalid.
 */
export function computeHoursBetween(startHHMM: string, endHHMM: string): number | null {
  const parse = (s: string): number | null => {
    const parts = s.split(':');
    if (parts.length !== 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  };
  const startMin = parse(startHHMM);
  const endMin = parse(endHHMM);
  if (startMin == null || endMin == null) return null;
  const diff = endMin > startMin
    ? endMin - startMin
    : (24 * 60 - startMin + endMin); // spans midnight
  if (diff === 0) return null;
  return Math.round((diff / 60) * 100) / 100;
}
