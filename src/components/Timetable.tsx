import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Trash2, Calendar, Clock, MapPin, User, Info, Sparkles, ChevronRight, AlertCircle } from 'lucide-react';
import { toPng } from 'html-to-image';
import { CourseReview } from '../lib/supabase';
import { cn, parseCredit } from '../lib/utils';

interface TimetableItem {
  course: CourseReview;
  parsedTime: {
    day: number; // 0: Mon, 1: Tue, ..., 4: Fri
    start: number; // minutes from 00:00
    end: number; // minutes from 00:00
  }[];
  color: string;
}

const COLORS = [
  'bg-[#FF8585] text-white border-none shadow-sm',
  'bg-[#A6D96A] text-white border-none shadow-sm',
  'bg-[#FFC947] text-white border-none shadow-sm',
  'bg-[#7ED7C1] text-white border-none shadow-sm',
  'bg-[#8EACCD] text-white border-none shadow-sm',
  'bg-[#D291BC] text-white border-none shadow-sm',
  'bg-[#FFB07C] text-white border-none shadow-sm',
  'bg-[#B4AEE8] text-white border-none shadow-sm',
];

const DAYS_LABELS = ['월', '화', '수', '목', '금', '토'];

const parseClassTime = (timeStr: string) => {
  if (!timeStr) return [];
  
  const dayMap: Record<string, number> = {
    '월': 0, '화': 1, '수': 2, '목': 3, '금': 4, '토': 5,
    'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5,
    '一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5,
    '星期一': 0, '星期二': 1, '星期三': 2, '星期四': 3, '星期五': 4, '星期六': 5,
    '周一': 0, '周二': 1, '周三': 2, '周四': 3, '周五': 4, '周六': 5
  };

  const results: { day: number; start: number; end: number }[] = [];
  
  // Normalize: handle common separators and remove extra spaces
  const normalized = timeStr.replace(/\s+/g, ' ');
  
  // Split by day patterns to handle multiple days in one string
  // e.g., "월09:00-10:30, 수10:30-12:00" or "월,수09:00-10:30"
  const dayPattern = /([월화수목금토]|Mon|Tue|Wed|Thu|Fri|Sat|星期[一二三四五六]|周[一二三四五六]|[一二三四五六])/gi;
  
  // First, find all day occurrences and their positions
  const dayMatches: { day: string, index: number }[] = [];
  let match;
  while ((match = dayPattern.exec(normalized)) !== null) {
    dayMatches.push({ day: match[0], index: match.index });
  }

  if (dayMatches.length === 0) return [];

  for (let i = 0; i < dayMatches.length; i++) {
    const currentDayStr = dayMatches[i].day;
    const day = dayMap[currentDayStr.charAt(0).toUpperCase() + currentDayStr.slice(1).toLowerCase()] ?? dayMap[currentDayStr];
    
    if (day === undefined) continue;

    // Get the content between this day and the next day (or end of string)
    const startIdx = dayMatches[i].index + currentDayStr.length;
    const endIdx = i < dayMatches.length - 1 ? dayMatches[i + 1].index : normalized.length;
    let content = normalized.substring(startIdx, endIdx).trim();

    // If content is empty or just separators, it might be a multi-day prefix like "월,수 09:00"
    // We look ahead for the next content that has time
    if (!content.match(/\d/) && i < dayMatches.length - 1) {
      // Look for the next time content
      let nextWithTime = "";
      for (let j = i + 1; j < dayMatches.length; j++) {
        const s = dayMatches[j].index + dayMatches[j].day.length;
        const e = j < dayMatches.length - 1 ? dayMatches[j + 1].index : normalized.length;
        const c = normalized.substring(s, e).trim();
        if (c.match(/\d/)) {
          nextWithTime = c;
          break;
        }
      }
      content = nextWithTime;
    }

    if (!content) continue;

    // 1. Handle range format: HH:mm-HH:mm or HH-HH
    const rangeMatch = content.match(/(\d{1,2})(?::(\d{2}))?\s*[-~到至]\s*(\d{1,2})(?::(\d{2}))?/);
    if (rangeMatch) {
      const startH = parseInt(rangeMatch[1]);
      const startM = parseInt(rangeMatch[2] || '0');
      const endH = parseInt(rangeMatch[3]);
      const endM = parseInt(rangeMatch[4] || '0');
      results.push({ day, start: startH * 60 + startM, end: endH * 60 + endM });
      continue;
    }

    // 2. Handle comma-separated hours or periods: 9,10,11
    const hours = content.split(/[,，/]/).map(h => h.trim()).filter(h => h.match(/^\d/));
    for (const h of hours) {
      const hourMatch = h.match(/(\d{1,2})(?::(\d{2}))?/);
      if (hourMatch) {
        let startH = parseInt(hourMatch[1]);
        const startM = parseInt(hourMatch[2] || '0');
        
        // Heuristic for periods vs hours
        // If it's a single digit < 9, it's likely a period (1=9:00, 2=10:00...)
        if (startH < 9 && !hourMatch[2]) {
          const start = (startH + 8) * 60 + startM;
          results.push({ day, start, end: start + 60 });
        } else {
          const start = startH * 60 + startM;
          results.push({ day, start, end: start + 60 });
        }
      }
    }
  }
  
  return results;
};

const cleanCourseName = (name: string) => {
  return name.split(/[\(（]/)[0].trim();
};

export default function Timetable({ 
  selectedCourses, 
  onRemove, 
  onClose,
  conflicts = {}
}: { 
  selectedCourses: CourseReview[], 
  onRemove: (id: number) => void,
  onClose: () => void,
  conflicts?: Record<number, number[]>
}) {
  const timetableRef = useRef<HTMLDivElement>(null);
  
  const items = React.useMemo(() => {
    return selectedCourses.map((course, index) => {
      const parsed = parseClassTime(course.class_time || '');
      return {
        course,
        parsedTime: parsed,
        color: COLORS[index % COLORS.length]
      };
    });
  }, [selectedCourses]);

  const totalCredits = React.useMemo(() => {
    return selectedCourses.reduce((sum, c) => {
      return sum + parseCredit(c.grade_and_credit);
    }, 0);
  }, [selectedCourses]);

  // Determine dynamic hour range
  let minHour = 9;
  let maxHour = 19; // Default end at 19:00

  items.forEach(item => {
    item.parsedTime.forEach(time => {
      const startH = Math.floor(time.start / 60);
      const endH = Math.ceil(time.end / 60);
      if (startH < minHour) minHour = startH;
      if (endH > maxHour) maxHour = endH;
    });
  });

  const hours = Array.from({ length: maxHour - minHour }, (_, i) => i + minHour);
  const totalMinutes = (maxHour - minHour) * 60;

  const handleExport = async () => {
    if (!timetableRef.current) return;
    try {
      const dataUrl = await toPng(timetableRef.current, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        style: {
          borderRadius: '0'
        }
      });
      const link = document.createElement('a');
      link.download = `hanyang-timetable-${new Date().getTime()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  const hasSaturday = items.some(item => item.parsedTime.some(t => t.day === 5));
  const daysCount = hasSaturday ? 6 : 5;
  const currentDays = DAYS_LABELS.slice(0, daysCount);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/60 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white dark:bg-gray-900 w-full max-w-5xl h-[95vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-white/20"
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-[#1A1A1A] sticky top-0 z-10">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 mb-0.5 uppercase tracking-wider">2026 Spring Semester</span>
            <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
              시간표
              <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800">
                {totalCredits} 学分
              </span>
              <ChevronRight size={16} className="rotate-90 text-gray-400" />
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExport}
              className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
              title="导出图片"
            >
              <Download size={20} />
            </button>
            <button 
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-rose-500 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-[#1A1A1A] scrollbar-hide">
          <div className="w-full">
            {/* Timetable Grid */}
            <div 
              ref={timetableRef}
              className="bg-white dark:bg-[#1A1A1A] relative"
            >
              <div 
                className="grid bg-gray-100 dark:bg-[#2A2A2A] gap-px border-b border-gray-100 dark:border-[#2A2A2A]"
                style={{ gridTemplateColumns: `40px repeat(${daysCount}, 1fr)` }}
              >
                {/* Header Row */}
                <div className="bg-white dark:bg-[#1A1A1A] h-8 border-r border-gray-100 dark:border-[#2A2A2A]" />
                {currentDays.map(day => (
                  <div key={day} className="bg-white dark:bg-[#1A1A1A] h-8 flex items-center justify-center border-r border-gray-100 dark:border-[#2A2A2A] last:border-r-0">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{day}</span>
                  </div>
                ))}

                {/* Time Rows */}
                {hours.map(hour => (
                  <React.Fragment key={hour}>
                    <div className="bg-white dark:bg-[#1A1A1A] h-12 flex items-start justify-center pt-1 border-r border-gray-100 dark:border-[#2A2A2A]">
                      <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500">
                        {hour}
                      </span>
                    </div>
                    {currentDays.map((_, dayIndex) => (
                      <div key={`${hour}-${dayIndex}`} className="bg-white dark:bg-[#1A1A1A] h-12 relative border-r border-gray-100 dark:border-[#2A2A2A] last:border-r-0" />
                    ))}
                  </React.Fragment>
                ))}

                {/* Course Items Overlay */}
                <div className="absolute inset-0 pointer-events-none mt-8 ml-10">
                  <div className="relative w-full h-full">
                    {items.length === 0 && selectedCourses.length > 0 && (
                      <div className="absolute inset-0 flex items-center justify-center p-10 text-center">
                        <p className="text-[10px] font-bold text-gray-400 bg-white/80 dark:bg-[#1A1A1A]/80 p-2 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm">
                          无法解析课程时间格式，请检查数据
                        </p>
                      </div>
                    )}
                    {items.map((item) => (
                      item.parsedTime.map((time, tIdx) => {
                        const top = ((time.start - minHour * 60) / totalMinutes) * 100;
                        const height = ((time.end - time.start) / totalMinutes) * 100;
                        const left = (time.day / daysCount) * 100;
                        const width = (1 / daysCount) * 100;

                        const isConflicting = conflicts[item.course.id!];

                        return (
                          <motion.div 
                            key={`${item.course.id}-${tIdx}`}
                            initial={false}
                            animate={isConflicting ? {
                              scale: [1, 1.02, 1],
                              transition: { repeat: Infinity, duration: 2 }
                            } : { scale: 1 }}
                            className={cn(
                              "absolute p-1 pointer-events-auto transition-all hover:scale-[1.01] hover:z-20 overflow-hidden rounded-md sm:rounded-lg",
                              item.color,
                              isConflicting && "ring-2 ring-rose-500 ring-inset shadow-lg shadow-rose-500/30 z-10 opacity-90"
                            )}
                            style={{
                              top: `${top}%`,
                              height: `${height}%`,
                              left: `${left}%`,
                              width: `calc(${width}% - 1px)`,
                              margin: '0.5px'
                            }}
                          >
                            <div className="h-full flex flex-col justify-start relative">
                              {isConflicting && (
                                <div className="absolute top-0 right-0 p-0.5">
                                  <AlertCircle size={10} className="text-white fill-rose-500 animate-pulse" />
                                </div>
                              )}
                              <p className="text-[9px] font-bold text-white leading-tight mb-0.5 break-all line-clamp-2">
                                {cleanCourseName(item.course.course_name)}
                              </p>
                              <p className="text-[7px] text-white/90 leading-tight break-all truncate">
                                {item.course.classroom || 'TBA'}
                              </p>
                              <p className="text-[7px] text-white/80 leading-tight break-all truncate italic">
                                {item.course.professor}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Courses List - Simplified */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">已选课程 ({selectedCourses.length})</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <AnimatePresence mode="popLayout">
                  {selectedCourses.map(course => {
                    const isConflicting = conflicts[course.id!];
                    return (
                      <motion.div 
                        key={course.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={cn(
                          "p-2.5 rounded-xl border flex items-center justify-between group transition-colors",
                          isConflicting 
                            ? "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-900/40" 
                            : "bg-gray-50 dark:bg-[#252525] border-gray-100 dark:border-gray-800"
                        )}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className={cn(
                              "text-[11px] font-bold truncate",
                              isConflicting ? "text-rose-700 dark:text-rose-300" : "text-gray-900 dark:text-white"
                            )}>
                              {cleanCourseName(course.course_name)}
                            </h4>
                            {isConflicting && (
                              <span className="text-[7px] font-black bg-rose-500 text-white px-1 rounded uppercase">冲突</span>
                            )}
                          </div>
                          <p className={cn(
                            "text-[9px] truncate",
                            isConflicting ? "text-rose-600/70 dark:text-rose-400/70" : "text-gray-500 dark:text-gray-400"
                          )}>
                            {course.professor} · <span className={cn(isConflicting && "text-rose-600 dark:text-rose-400 font-black")}>{course.class_time}</span>
                          </p>
                        </div>
                        <button 
                          onClick={() => course.id && onRemove(course.id)}
                          className={cn(
                            "p-1.5 transition-colors",
                            isConflicting ? "text-rose-400 hover:text-rose-600" : "text-gray-300 hover:text-rose-500"
                          )}
                        >
                          <Trash2 size={12} />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {selectedCourses.length === 0 && (
                  <div className="col-span-full py-8 text-center space-y-2">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center mx-auto text-gray-400">
                      <Sparkles size={20} />
                    </div>
                    <p className="text-[11px] font-bold text-gray-400">还没有选择任何课程哦</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
