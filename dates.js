/* Date rules for the maintenance log. Dates are plain YYYY-MM-DD strings in local time. */
(function (root) {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayStr = () => iso(new Date());
  const diffDays = (a, b) => Math.round((parseD(a) - parseD(b)) / 864e5);

  function addInterval(dateStr, n, unit) {
    const d = parseD(dateStr);
    if (unit === 'day') d.setDate(d.getDate() + n);
    else if (unit === 'week') d.setDate(d.getDate() + 7 * n);
    else {
      const months = unit === 'year' ? 12 * n : n, day = d.getDate();
      d.setDate(1); d.setMonth(d.getMonth() + months);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    }
    return iso(d);
  }

  // A day off is a Saturday, a Sunday, or a date in the holiday set.
  const isOff = (s, holidays) => { const w = parseD(s).getDay(); return w === 0 || w === 6 || holidays.has(s); };

  // Moves a date forward to the next working day (the date itself if it already is one).
  function rollWorking(s, holidays) {
    let n = 0;
    while (isOff(s, holidays) && n < 60) { s = addInterval(s, 1, 'day'); n++; }
    return s;
  }

  // Next due date after a task is done: add the interval, then skip weekends and holidays.
  const nextDueAfter = (doneDate, every, unit, holidays) => rollWorking(addInterval(doneDate, every, unit), holidays);

  function nthWeekday(year, month, weekday, n) {
    const first = new Date(year, month, 1);
    return iso(new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + 7 * (n - 1)));
  }
  function lastWeekday(year, month, weekday) {
    const last = new Date(year, month + 1, 0);
    return iso(new Date(year, month, last.getDate() - ((last.getDay() - weekday + 7) % 7)));
  }
  // Common US shop holidays for a year. Users can add or remove dates in the app.
  function usShopHolidays(y) {
    const thanks = nthWeekday(y, 10, 4, 4);
    return [
      { day: y + '-01-01', name: "New Year's Day" },
      { day: lastWeekday(y, 4, 1), name: 'Memorial Day' },
      { day: y + '-07-04', name: 'Independence Day' },
      { day: nthWeekday(y, 8, 1, 1), name: 'Labor Day' },
      { day: thanks, name: 'Thanksgiving' },
      { day: addInterval(thanks, 1, 'day'), name: 'Day after Thanksgiving' },
      { day: y + '-12-25', name: 'Christmas Day' }
    ];
  }

  const api = { pad, iso, parseD, todayStr, diffDays, addInterval, isOff, rollWorking, nextDueAfter, usShopHolidays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FuseDates = api;
})(typeof window !== 'undefined' ? window : globalThis);
