// Taiwan government-office holidays announced by the Directorate-General of
// Personnel Administration (DGPA), plus lunar festivals derived with Intl.
const officialDaysOff = {
  2026: {
    '01-01': '中華民國開國紀念日',
    '02-16': '春節假期', '02-17': '春節', '02-18': '春節假期', '02-19': '春節假期', '02-20': '春節補假',
    '02-27': '和平紀念日補假', '02-28': '和平紀念日',
    '04-03': '兒童節補假', '04-04': '兒童節', '04-05': '清明節', '04-06': '清明節補假',
    '05-01': '勞動節', '06-19': '端午節',
    '09-25': '中秋節', '09-28': '孔子誕辰紀念日／教師節',
    '10-09': '國慶日補假', '10-10': '國慶日',
    '10-25': '臺灣光復暨金門古寧頭大捷紀念日', '10-26': '臺灣光復暨金門古寧頭大捷紀念日補假',
    '12-25': '行憲紀念日'
  },
  2027: {
    '01-01': '中華民國開國紀念日',
    '02-04': '春節假期', '02-05': '除夕', '02-06': '春節', '02-07': '春節', '02-08': '春節假期', '02-09': '春節補假', '02-10': '春節補假',
    '02-28': '和平紀念日', '03-01': '和平紀念日補假',
    '04-04': '兒童節', '04-05': '清明節', '04-06': '兒童節補假',
    '04-30': '勞動節補假', '05-01': '勞動節',
    '06-09': '端午節', '09-15': '中秋節', '09-28': '孔子誕辰紀念日／教師節',
    '10-10': '國慶日', '10-11': '國慶日補假',
    '10-25': '臺灣光復暨金門古寧頭大捷紀念日',
    '12-24': '行憲紀念日補假', '12-25': '行憲紀念日'
  }
};

const solarFestivals = (year, month, day) => {
  const date = new Date(year, month - 1, day, 12);
  const weekday = date.getDay();
  const nthWeekday = Math.floor((day - 1) / 7) + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastWeekday = Math.floor((daysInMonth - day) / 7) === 0;
  const names = [];
  if (month === 1 && day === 1) names.push('元旦');
  if (month === 2 && day === 14) names.push('西洋情人節');
  if (month === 3 && day === 8) names.push('婦女節');
  if (month === 3 && day === 12) names.push('植樹節');
  if (month === 3 && day === 29) names.push('青年節');
  if (month === 4 && day === 4) names.push('兒童節');
  if (month === 5 && weekday === 0 && nthWeekday === 2) names.push('母親節');
  if (month === 6 && day === 5) names.push('世界環境日');
  if (month === 8 && day === 8) names.push('父親節');
  if (month === 8 && weekday === 0 && lastWeekday) names.push('祖父母節');
  if (month === 9 && day === 28) names.push('教師節');
  if (month === 10 && day === 10) names.push('國慶日');
  if (month === 12 && day === 25) names.push('聖誕節／行憲紀念日');
  return names;
};

const lunarFormatter = (() => {
  try { return new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' }); }
  catch { return null; }
})();

function lunarParts(date) {
  if (!lunarFormatter) return null;
  const parts = Object.fromEntries(lunarFormatter.formatToParts(date).map(part => [part.type, part.value]));
  const month = String(parts.month || '');
  if (!/^\d+$/.test(month)) return null; // Skip leap months.
  return { month: Number(month), day: Number(parts.day) };
}

export function getTaiwanCalendarEvents(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const events = [];
  const official = officialDaysOff[year]?.[mmdd];
  if (official) events.push({ name: official, kind: 'holiday' });
  const recurringStatutoryDays = {
    '01-01': '中華民國開國紀念日', '02-28': '和平紀念日', '04-04': '兒童節',
    '05-01': '勞動節', '09-28': '孔子誕辰紀念日／教師節', '10-10': '國慶日',
    '10-25': '臺灣光復暨金門古寧頭大捷紀念日', '12-25': '行憲紀念日'
  };
  const recurringHoliday = recurringStatutoryDays[mmdd];
  if (recurringHoliday && !events.some(event => event.name === recurringHoliday)) {
    events.push({ name: recurringHoliday, kind: 'holiday' });
  }

  for (const name of solarFestivals(year, month, day)) {
    if (!events.some(event => event.name === name)) events.push({ name, kind: 'festival' });
  }

  const lunar = lunarParts(new Date(year, month - 1, day, 12));
  if (lunar) {
    const lunarNames = {
      '1-1': '農曆春節', '1-15': '元宵節', '4-8': '佛誕日',
      '5-5': '端午節', '7-7': '七夕', '7-15': '中元節',
      '8-15': '中秋節', '9-9': '重陽節'
    };
    const lunarName = lunarNames[`${lunar.month}-${lunar.day}`];
    if (lunarName && !events.some(event => event.name.includes(lunarName.replace('農曆', '')))) {
      events.push({ name: lunarName, kind: 'festival' });
    }

    const nextDay = new Date(year, month - 1, day + 1, 12);
    const nextLunar = lunarParts(nextDay);
    if (lunar.month === 12 && nextLunar?.month === 1 && nextLunar.day === 1) {
      events.push({ name: '除夕', kind: 'festival' });
    }
  }
  return events;
}

export const holidayCalendarSources = {
  2026: 'https://www.dgpa.gov.tw/information?pid=12574&uid=2',
  2027: 'https://www.dgpa.gov.tw/information?pid=12983&uid=82'
};
