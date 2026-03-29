interface ParsedTimeSlot {
  day: number;
  start: number;
  end: number;
}

interface TimetableCourseLike {
  id?: number;
  class_time?: string | null;
}

export function parseClassTime(timeStr: string) {
  if (!timeStr) return [];

  const dayMap: Record<string, number> = {
    '월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5,
    'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5,
    '一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5,
    '星期一': 0, '星期二': 1, '星期三': 2, '星期四': 3, '星期五': 4, '星期六': 5,
    '周一': 0, '周二': 1, '周三': 2, '周四': 3, '周五': 4, '周六': 5,
  };

  const results: ParsedTimeSlot[] = [];
  const normalized = timeStr.replace(/\s+/g, ' ');
  const dayPattern = /([월화수목금토]|Mon|Tue|Wed|Thu|Fri|Sat|星期[一二三四五六]|周[一二三四五六]|[一二三四五六])/gi;
  const dayMatches: { day: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = dayPattern.exec(normalized)) !== null) {
    dayMatches.push({ day: match[0], index: match.index });
  }

  if (dayMatches.length === 0) return [];

  for (let i = 0; i < dayMatches.length; i += 1) {
    const currentDayStr = dayMatches[i].day;
    const day = dayMap[currentDayStr.charAt(0).toUpperCase() + currentDayStr.slice(1).toLowerCase()] ?? dayMap[currentDayStr];

    if (day === undefined) continue;

    const startIdx = dayMatches[i].index + currentDayStr.length;
    const endIdx = i < dayMatches.length - 1 ? dayMatches[i + 1].index : normalized.length;
    let content = normalized.substring(startIdx, endIdx).trim();

    if (!content.match(/\d/) && i < dayMatches.length - 1) {
      let nextWithTime = '';
      for (let j = i + 1; j < dayMatches.length; j += 1) {
        const nextStart = dayMatches[j].index + dayMatches[j].day.length;
        const nextEnd = j < dayMatches.length - 1 ? dayMatches[j + 1].index : normalized.length;
        const candidate = normalized.substring(nextStart, nextEnd).trim();
        if (candidate.match(/\d/)) {
          nextWithTime = candidate;
          break;
        }
      }
      content = nextWithTime;
    }

    if (!content) continue;

    const rangeMatch = content.match(/(\d{1,2})(?::(\d{2}))?\s*[-~到至]\s*(\d{1,2})(?::(\d{2}))?/);
    if (rangeMatch) {
      const startH = Number(rangeMatch[1]);
      const startM = Number(rangeMatch[2] || '0');
      const endH = Number(rangeMatch[3]);
      const endM = Number(rangeMatch[4] || '0');
      results.push({ day, start: startH * 60 + startM, end: endH * 60 + endM });
      continue;
    }

    const hours = content.split(/[,，/]/).map((entry) => entry.trim()).filter((entry) => entry.match(/^\d/));
    for (const hourToken of hours) {
      const hourMatch = hourToken.match(/(\d{1,2})(?::(\d{2}))?/);
      if (!hourMatch) continue;

      let startH = Number(hourMatch[1]);
      const startM = Number(hourMatch[2] || '0');

      if (startH < 9 && !hourMatch[2]) {
        const start = (startH + 8) * 60 + startM;
        results.push({ day, start, end: start + 60 });
        continue;
      }

      const start = startH * 60 + startM;
      results.push({ day, start, end: start + 60 });
    }
  }

  return results;
}

export function detectTimetableConflicts(courses: TimetableCourseLike[]) {
  const allTimes = courses.flatMap((course) =>
    parseClassTime(course.class_time || '').map((slot) => ({
      ...slot,
      id: Number(course.id),
    })),
  );

  const conflicts: Record<number, number[]> = {};

  for (let i = 0; i < allTimes.length; i += 1) {
    for (let j = i + 1; j < allTimes.length; j += 1) {
      const first = allTimes[i];
      const second = allTimes[j];
      if (first.day !== second.day || first.id === second.id) continue;
      if (first.start < second.end && first.end > second.start) {
        if (!conflicts[first.id]) conflicts[first.id] = [];
        if (!conflicts[second.id]) conflicts[second.id] = [];
        if (!conflicts[first.id].includes(second.id)) conflicts[first.id].push(second.id);
        if (!conflicts[second.id].includes(first.id)) conflicts[second.id].push(first.id);
      }
    }
  }

  return conflicts;
}
