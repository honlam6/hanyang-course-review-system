import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ThumbsUp, ThumbsDown, Info, Calendar, FileText, Star, ChevronRight, Sparkles, Sun, Moon, MessageSquare, AlertCircle, MapPin, Edit3, CheckCircle, Loader2, X } from 'lucide-react';
import { CourseReview } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getCourseDisplayGroupKey, parseCredit, normalizeAssignment, normalizeTeamProject, normalizeGrading, normalizeAttendance, normalizeExamCount, splitCourseName } from '../lib/utils';
import { createHomepageSeed, sortCoursesForHomepage } from '../lib/homeCourseRanking';
import IndicatorSegment from './IndicatorSegment';
import AIAssistant from './AIAssistant';
import Timetable from './Timetable';
import { Virtuoso } from 'react-virtuoso';
import { CAMPUS_LABELS, CampusCode, DEFAULT_SEMESTER } from '../constants/campus';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { fetchJson } from '../lib/api';
import {
  CORRECTABLE_FIELDS,
  FEEDBACK_ENUM_OPTIONS,
  FEEDBACK_FIELD_LABELS,
  FeedbackSubmissionType,
  StructuredFeedbackField,
  SUPPLEMENTABLE_FIELDS,
  isMissingFeedbackValue,
} from '../constants/feedback';

type FilterGroup = 'type' | 'attendance' | 'trait';

interface FilterOption {
  id: string;
  label: string;
  field: 'course_type' | 'attendance' | 'team_project' | 'grading' | 'assignment' | 'exam_count' | 'overall_score';
  group: FilterGroup;
  matchWords?: string[];
  value?: string | number;
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'type-major-core', label: '专业核心 / 전공핵심', field: 'course_type', group: 'type', matchWords: ['专业核心', '전공핵심'] },
  { id: 'type-major-adv', label: '专业深化 / 전공심화', field: 'course_type', group: 'type', matchWords: ['专业深化', '전공심화'] },
  { id: 'type-major-basic', label: '专业基础(必修) / 전공기초', field: 'course_type', group: 'type', matchWords: ['专业基础', '专业基础(必修)', '전공기초', '전공기본'] },
  { id: 'type-ge-req', label: '教养必修 / 교양필수', field: 'course_type', group: 'type', matchWords: ['教养必修', '교양필수'] },
  { id: 'type-core-ge', label: '核心教养 / 핵심교양', field: 'course_type', group: 'type', matchWords: ['核心教养', '핵심교양'] },
  { id: 'type-teaching', label: '教职 / 교직', field: 'course_type', group: 'type', matchWords: ['教职', '교직', '教职必修', '教职选择', '教职选修', '교직필수', '교직선택'] },
  { id: 'type-rotc', label: 'ROTC', field: 'course_type', group: 'type', matchWords: ['rotc', 'ROTC必修', 'rotc필수'] },
  { id: 'type-other-ele', label: '其他专业选择 / 타전공선택', field: 'course_type', group: 'type', matchWords: ['其他专业', '타전공', '일반선택', '一般选择'] },
  { id: 'attendance-call', label: '呼名点名 / 호명출석', field: 'attendance', group: 'attendance', matchWords: ['呼名点名', '点名', '호명', '직접호명'] },
  { id: 'attendance-electronic', label: '电子签到 / 전자출결', field: 'attendance', group: 'attendance', matchWords: ['电子签到', '电子出勤', '전자출결'] },
  { id: 'attendance-none', label: '不点名 / 출결미반영', field: 'attendance', group: 'attendance', matchWords: ['不点名', '不反映', '출결미반영', '미반영'] },
  { id: 'attendance-mixed', label: '混合点名 / 혼합출석', field: 'attendance', group: 'attendance', matchWords: ['混合点名', '혼합'] },
  { id: 'attendance-seat', label: '指定座位 / 지정좌석', field: 'attendance', group: 'attendance', matchWords: ['指定座位', '指定坐席', '지정좌석'] },
  { id: 'attendance-pending', label: '待补充 / 미기재', field: 'attendance', group: 'attendance', matchWords: ['待补充', '미기재', '未记录'] },
  { id: 'no-team', label: '🚫 无小组', field: 'team_project', group: 'trait', value: '无' },
  { id: 'generous', label: '😇 给分宽容', field: 'grading', group: 'trait', value: '宽容' },
  { id: 'no-assignment', label: '🛏️ 无作业', field: 'assignment', group: 'trait', value: '无' },
  { id: 'no-exam', label: '📝 无考试', field: 'exam_count', group: 'trait', value: '无考试' },
  { id: 'high-score', label: '🔥 高分课', field: 'overall_score', group: 'trait', value: 4.5 },
];

const tokenizedText = (text: string) => {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[/,，、|\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const matchByKeywords = (value: string | undefined, words: string[] = []) => {
  const normalizedValue = (value || '').toLowerCase();
  const tokens = tokenizedText(value || '');
  return words.some((word) => {
    const keyword = word.toLowerCase();
    if (normalizedValue.includes(keyword)) return true;
    return tokens.some((token) => token.includes(keyword) || keyword.includes(token));
  });
};

const USER_PAGE_SIZE = 120;

interface CourseListResponse {
  success: boolean;
  data: CourseReview[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

const CourseSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    {[1, 2, 3].map(group => (
      <div key={group} className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="h-6 w-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-lg w-32" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
          {[1, 2].map(i => (
            <div key={i} className="min-w-[280px] sm:min-w-[360px] bg-white dark:bg-gray-800 rounded-[1.25rem] sm:rounded-[2.5rem] p-4 sm:p-7 shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
              <div className="flex justify-between items-start">
                <div className="space-y-2 flex-1">
                  <div className="h-5 bg-gray-100 dark:bg-gray-700 rounded w-1/2" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/3" />
                </div>
                <div className="w-10 h-8 bg-gray-100 dark:bg-gray-700 rounded-xl" />
              </div>
              <div className="space-y-3">
                {[1, 2, 3].map(j => <div key={j} className="h-8 bg-gray-50 dark:bg-gray-700/30 rounded-lg" />)}
              </div>
              <div className="h-16 bg-gray-50 dark:bg-gray-700/20 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const CollapsibleDetails = ({ pros, cons, advice }: { pros: string[] | null, cons: string[] | null, advice: string | null }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = (pros && pros.length > 0) || (cons && cons.length > 0) || !!advice;

  if (!hasContent) return null;

  return (
    <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={12} />
          <span>详细评价 & 建议 Details</span>
          {!isExpanded && (
            <motion.span 
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className="ml-2 text-[8px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-md animate-pulse"
            >
              💡 点击展开
            </motion.span>
          )}
        </div>
        <ChevronRight size={14} className={cn("transition-transform duration-300", isExpanded && "rotate-90")} />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-3 px-1 select-none">
              {pros && pros.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                    <ThumbsUp size={10} /> 优点 Pros
                  </p>
                  <ul className="space-y-1">
                    {pros.map((p, i) => (
                      <li key={i} className="text-[11px] sm:text-[12px] text-gray-600 dark:text-gray-400 leading-relaxed flex gap-2">
                        <span className="text-emerald-500 shrink-0">•</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cons && cons.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-1">
                    <ThumbsDown size={10} /> 缺点 Cons
                  </p>
                  <ul className="space-y-1">
                    {cons.map((c, i) => (
                      <li key={i} className="text-[11px] sm:text-[12px] text-gray-600 dark:text-gray-400 leading-relaxed flex gap-2">
                        <span className="text-rose-500 shrink-0">•</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {advice && (
                <div className="space-y-1.5 bg-indigo-50/30 dark:bg-indigo-900/10 p-3 rounded-xl border border-indigo-100/30 dark:border-indigo-900/30">
                  <p className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                    <Info size={10} /> 选课建议 Advice
                  </p>
                  <p className="text-[11px] sm:text-[12px] text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                    {advice}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StarRating = ({ score }: { score: number }) => {
  // Logic: if score > 5, assume it's out of 100 and convert to 5-star scale
  const normalizedScore = score > 5 ? (score / 100) * 5 : score;
  const fullStars = Math.floor(normalizedScore);
  const hasHalfStar = normalizedScore % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-0.5">
        {[...Array(fullStars)].map((_, i) => (
          <Star key={`full-${i}`} size={14} className="text-amber-400 fill-amber-400" />
        ))}
        {hasHalfStar && (
          <div className="relative">
            <Star size={14} className="text-gray-200 dark:text-gray-700 fill-gray-200 dark:fill-gray-700" />
            <div className="absolute inset-0 overflow-hidden w-1/2">
              <Star size={14} className="text-amber-400 fill-amber-400" />
            </div>
          </div>
        )}
        {[...Array(emptyStars)].map((_, i) => (
          <Star key={`empty-${i}`} size={14} className="text-gray-200 dark:text-gray-700 fill-gray-200 dark:fill-gray-700" />
        ))}
      </div>
    </div>
  );
};

type FeedbackFormState = {
  rating: string;
  prosText: string;
  consText: string;
  advice: string;
  assignment: string;
  team_project: string;
  grading: string;
  attendance: string;
  exam_count: string;
  fieldName: StructuredFeedbackField | '';
  proposedValue: string;
};

const STRUCTURED_FEEDBACK_FIELDS = Object.keys(FEEDBACK_ENUM_OPTIONS) as StructuredFeedbackField[];

const EMPTY_FEEDBACK_FORM: FeedbackFormState = {
  rating: '',
  prosText: '',
  consText: '',
  advice: '',
  assignment: '',
  team_project: '',
  grading: '',
  attendance: '',
  exam_count: '',
  fieldName: '',
  proposedValue: '',
};

function getMissingStructuredFields(course: CourseReview) {
  return SUPPLEMENTABLE_FIELDS.filter((field) => isMissingFeedbackValue(course[field]));
}

function splitFeedbackLines(value: string) {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

interface UserViewProps {
  selectedCampus: CampusCode | null;
  onCampusChange: (campus: CampusCode) => void;
}

export default function UserView({ selectedCampus, onCampusChange }: UserViewProps) {
  const [courses, setCourses] = useState<CourseReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMoreCourses, setHasMoreCourses] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [favoriteCourses, setFavoriteCourses] = useState<CourseReview[]>([]);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [feedbackCourse, setFeedbackCourse] = useState<CourseReview | null>(null);
  const [feedbackType, setFeedbackType] = useState<FeedbackSubmissionType>('review');
  const [feedbackForm, setFeedbackForm] = useState<FeedbackFormState>(EMPTY_FEEDBACK_FORM);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const requestIdRef = useRef(0);
  const favoriteRequestIdRef = useRef(0);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

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
    const dayPattern = /([월화수목금토]|Mon|Tue|Wed|Thu|Fri|Sat|星期[一二三四五六]|周[一二三四五六]|[一二三四五六])/gi;
    
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

      const startIdx = dayMatches[i].index + currentDayStr.length;
      const endIdx = i < dayMatches.length - 1 ? dayMatches[i + 1].index : normalized.length;
      let content = normalized.substring(startIdx, endIdx).trim();

      if (!content.match(/\d/) && i < dayMatches.length - 1) {
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

      const rangeMatch = content.match(/(\d{1,2})(?::(\d{2}))?\s*[-~到至]\s*(\d{1,2})(?::(\d{2}))?/);
      if (rangeMatch) {
        const startH = parseInt(rangeMatch[1]);
        const startM = parseInt(rangeMatch[2] || '0');
        const endH = parseInt(rangeMatch[3]);
        const endM = parseInt(rangeMatch[4] || '0');
        results.push({ day, start: startH * 60 + startM, end: endH * 60 + endM });
        continue;
      }

      const hours = content.split(/[,，/]/).map(h => h.trim()).filter(h => h.match(/^\d/));
      for (const h of hours) {
        const hourMatch = h.match(/(\d{1,2})(?::(\d{2}))?/);
        if (hourMatch) {
          let startH = parseInt(hourMatch[1]);
          const startM = parseInt(hourMatch[2] || '0');
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
  const toggleFavorite = (id: number) => {
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const totalCredits = useMemo(() => {
    return favoriteCourses.reduce((sum, c) => {
      return sum + parseCredit(c.grade_and_credit);
    }, 0);
  }, [favoriteCourses]);

  const favoriteConflicts = useMemo(() => {
    const conflictMap: Record<number, number[]> = {};
    const allTimes: { id: number; day: number; start: number; end: number }[] = [];

    favoriteCourses.forEach(course => {
      const times = parseClassTime(course.class_time || '');
      times.forEach(t => allTimes.push({ id: course.id!, ...t }));
    });

    for (let i = 0; i < allTimes.length; i++) {
      for (let j = i + 1; j < allTimes.length; j++) {
        const t1 = allTimes[i];
        const t2 = allTimes[j];
        if (t1.day === t2.day && t1.id !== t2.id) {
          if ((t1.start < t2.end && t1.end > t2.start)) {
            if (!conflictMap[t1.id]) conflictMap[t1.id] = [];
            if (!conflictMap[t2.id]) conflictMap[t2.id] = [];
            if (!conflictMap[t1.id].includes(t2.id)) conflictMap[t1.id].push(t2.id);
            if (!conflictMap[t2.id].includes(t1.id)) conflictMap[t2.id].push(t1.id);
          }
        }
      }
    }
    return conflictMap;
  }, [favoriteCourses]);

  const favoritesStorageKey = selectedCampus ? `course_favorites_${selectedCampus}` : 'course_favorites_default';
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      // Default to light mode as requested
      return false;
    }
    return false;
  });

  // Apply dark mode class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Load favorites from localStorage by campus
  useEffect(() => {
    if (!selectedCampus) {
      setFavorites([]);
      return;
    }

    const savedFavs = localStorage.getItem(favoritesStorageKey);
    if (savedFavs) {
      try {
        setFavorites(JSON.parse(savedFavs).map(Number));
      } catch (e) {
        console.error(e);
        setFavorites([]);
      }
    } else {
      setFavorites([]);
    }

  }, [favoritesStorageKey, selectedCampus]);

  useEffect(() => {
    setActiveFilters([]);
    setIsPlannerOpen(false);
  }, [selectedCampus]);

  useEffect(() => {
    const handleScroll = () => {
      const shouldCompact = window.scrollY > 72;
      setIsHeaderCompact(shouldCompact);
      if (!shouldCompact) {
        setIsFilterPanelOpen(false);
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch courses when campus or search query changes
  useEffect(() => {
    fetchCourses({ reset: true, searchTerm: debouncedSearchQuery });
  }, [selectedCampus, debouncedSearchQuery]);

  // Save favorites to localStorage
  useEffect(() => {
    if (!selectedCampus) return;
    localStorage.setItem(favoritesStorageKey, JSON.stringify(favorites));
  }, [favorites, favoritesStorageKey, selectedCampus]);

  useEffect(() => {
    if (!selectedCampus || favorites.length === 0) {
      setFavoriteCourses([]);
      return;
    }

    const currentRequestId = ++favoriteRequestIdRef.current;

    const fetchFavoriteCourses = async () => {
      try {
        const params = new URLSearchParams({
          campus: selectedCampus,
          semester: DEFAULT_SEMESTER,
          ids: favorites.join(','),
        });
        const result = await fetchJson<CourseListResponse>(`/api/courses?${params.toString()}`);
        if (currentRequestId !== favoriteRequestIdRef.current) return;

        const courseMap = new Map(
          (result.data || []).map((row) => [Number(row.id), normalizeCourseRow(row, selectedCampus)])
        );

        setFavoriteCourses(
          favorites
            .map((id) => courseMap.get(id))
            .filter((course): course is CourseReview => Boolean(course))
        );
      } catch (error) {
        if (currentRequestId !== favoriteRequestIdRef.current) return;
        console.error('Error fetching favorite courses:', error);
        setFavoriteCourses([]);
      }
    };

    fetchFavoriteCourses();
  }, [favorites, selectedCampus]);

  function normalizeCourseRow(course: CourseReview, fallbackCampus = selectedCampus): CourseReview {
    return {
      ...course,
      campus: (course.campus || fallbackCampus) as CampusCode,
      semester: course.semester || DEFAULT_SEMESTER,
      assignment: normalizeAssignment(course.assignment),
      team_project: normalizeTeamProject(course.team_project),
      grading: normalizeGrading(course.grading),
      attendance: normalizeAttendance(course.attendance),
      exam_count: normalizeExamCount(course.exam_count),
    };
  }

  const dedupeCourses = (items: CourseReview[]) => {
    return Array.from(new Map(items.map(item => [item.id, item])).values());
  };
  const homepageSeedRef = useRef(createHomepageSeed('web-home'));

  async function fetchCourses(options: { reset?: boolean; searchTerm?: string } = {}) {
    const { reset = false, searchTerm = '' } = options;
    const currentRequestId = ++requestIdRef.current;
    const trimmedSearch = searchTerm.trim();
    const isSearchMode = trimmedSearch.length > 0;

    if (!selectedCampus) {
      setCourses([]);
      setHasMoreCourses(false);
      setLoading(false);
      setIsFetchingMore(false);
      return;
    }

    if (reset) {
      setLoading(true);
      setCourses([]);
      setHasMoreCourses(false);
    } else {
      setIsFetchingMore(true);
    }

    try {
      const currentPage = reset ? 1 : Math.floor(courses.length / USER_PAGE_SIZE) + 1;
      const params = new URLSearchParams({
        campus: selectedCampus,
        semester: DEFAULT_SEMESTER,
        page: String(currentPage),
        pageSize: String(USER_PAGE_SIZE),
      });
      if (isSearchMode) {
        params.set('q', trimmedSearch);
      }

      const result = await fetchJson<CourseListResponse>(`/api/courses?${params.toString()}`);
      if (currentRequestId !== requestIdRef.current) return;
      const normalizedData = (result.data || []).map((row) => normalizeCourseRow(row));

      setCourses((prev) => {
        const merged = reset ? normalizedData : [...prev, ...normalizedData];
        return dedupeCourses(merged);
      });
      setHasMoreCourses(Boolean(result.pagination?.hasMore));
    } catch (error) {
      if (currentRequestId !== requestIdRef.current) return;
      console.error('Error fetching courses:', error);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
        setIsFetchingMore(false);
      }
    }
  }

  function handleLoadMoreCourses() {
    if (loading || isFetchingMore || hasMoreCourses === false || debouncedSearchQuery.trim()) return;
    fetchCourses({ reset: false, searchTerm: '' });
  }

  const filteredCourses = React.useMemo(() => {
    let result = [...courses];
    const isHomepageDiscoveryMode = !debouncedSearchQuery.trim() && activeFilters.length === 0;

    // Chip filters
    if (activeFilters.length > 0) {
      result = result.filter(c => {
        const groups: Record<string, string[]> = {};
        activeFilters.forEach(id => {
          const filter = FILTER_OPTIONS.find(f => f.id === id);
          if (filter) {
            const groupKey = filter.group || filter.id;
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(id);
          }
        });

        return Object.values(groups).every(filterIds => {
          return filterIds.some(id => {
            const filter = FILTER_OPTIONS.find(f => f.id === id)!;
            
            if (filter.id === 'high-score') {
              return Number(c.overall_score || 0) >= (filter.value as number);
            }

            if (filter.field === 'course_type') {
              return matchByKeywords(c.course_type, filter.matchWords);
            }

            if (filter.field === 'attendance') {
              return matchByKeywords(c.attendance, filter.matchWords);
            }
            
            return (c as any)[filter.field] === filter.value;
          });
        });
      });
    }

    if (isHomepageDiscoveryMode) {
      return sortCoursesForHomepage(result, homepageSeedRef.current);
    }

    result.sort((a, b) => {
      const aScore = Number(a.overall_score || 0);
      const bScore = Number(b.overall_score || 0);
      
      // Define "has data" as having a score, pros, cons, or advice
      const aHasData = aScore > 0 || (a.pros && a.pros.length > 0) || (a.cons && a.cons.length > 0) || (a.advice && (a.advice || '').trim().length > 0);
      const bHasData = bScore > 0 || (b.pros && b.pros.length > 0) || (b.cons && b.cons.length > 0) || (b.advice && (b.advice || '').trim().length > 0);

      // Always push "no data" to the end
      if (aHasData && !bHasData) return -1;
      if (!aHasData && bHasData) return 1;
      if (!aHasData && !bHasData) return 0;

      if (aScore !== bScore) return bScore - aScore;
      return String(a.professor || '').localeCompare(String(b.professor || ''));
    });

    return result;
  }, [debouncedSearchQuery, courses, activeFilters]);

  const toggleFilter = (id: string) => {
    setActiveFilters(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const clearAllFavorites = () => {
    if (window.confirm('确定要清空所有收藏的课程吗？')) {
      setFavorites([]);
    }
  };

  const openFeedbackModal = (course: CourseReview) => {
    const missingFields = getMissingStructuredFields(course);
    setFeedbackCourse(course);
    setFeedbackType(missingFields.length > 0 ? 'supplement' : 'review');
    setFeedbackForm({
      ...EMPTY_FEEDBACK_FORM,
      fieldName: missingFields[0] || '',
    });
    setFeedbackError('');
    setFeedbackSuccess('');
    setIsSubmittingFeedback(false);
  };

  const closeFeedbackModal = () => {
    setFeedbackCourse(null);
    setFeedbackType('review');
    setFeedbackForm(EMPTY_FEEDBACK_FORM);
    setFeedbackError('');
    setFeedbackSuccess('');
    setIsSubmittingFeedback(false);
  };

  const updateFeedbackField = <K extends keyof FeedbackFormState>(field: K, value: FeedbackFormState[K]) => {
    setFeedbackForm((prev) => ({ ...prev, [field]: value }));
  };

  const availableSupplementFields = useMemo(
    () => (feedbackCourse ? getMissingStructuredFields(feedbackCourse) : []),
    [feedbackCourse]
  );

  useEffect(() => {
    if (!feedbackCourse) return;

    if (feedbackType === 'supplement') {
      const nextField = availableSupplementFields[0] || '';
      if (!nextField) {
        setFeedbackForm((prev) => ({ ...prev, fieldName: '', proposedValue: '' }));
        return;
      }

      if (!feedbackForm.fieldName || !availableSupplementFields.includes(feedbackForm.fieldName)) {
        setFeedbackForm((prev) => ({ ...prev, fieldName: nextField, proposedValue: '' }));
      }
      return;
    }

    if (feedbackType === 'correction' && (!feedbackForm.fieldName || !CORRECTABLE_FIELDS.includes(feedbackForm.fieldName))) {
      setFeedbackForm((prev) => ({ ...prev, fieldName: CORRECTABLE_FIELDS[0], proposedValue: '' }));
    }
  }, [availableSupplementFields, feedbackCourse, feedbackForm.fieldName, feedbackType]);

  async function handleFeedbackSubmit() {
    if (!feedbackCourse?.id) {
      setFeedbackError('课程信息缺失，请刷新后重试');
      return;
    }

    setFeedbackError('');
    setFeedbackSuccess('');

    const payload: Record<string, unknown> = {
      courseReviewId: Number(feedbackCourse.id),
      submissionType: feedbackType,
    };

    if (feedbackType === 'review') {
      const pros = splitFeedbackLines(feedbackForm.prosText);
      const cons = splitFeedbackLines(feedbackForm.consText);
      const advice = feedbackForm.advice.trim();
      const rating = feedbackForm.rating ? Number(feedbackForm.rating) : null;
      const structuredSelections = STRUCTURED_FEEDBACK_FIELDS.reduce((acc, field) => {
        if (feedbackForm[field]) {
          acc[field] = feedbackForm[field];
        }
        return acc;
      }, {} as Partial<Record<StructuredFeedbackField, string>>);

      const hasMeaningfulContent =
        rating !== null ||
        pros.length > 0 ||
        cons.length > 0 ||
        advice.length > 0 ||
        Object.keys(structuredSelections).length > 0;

      if (!hasMeaningfulContent) {
        setFeedbackError('请至少填写一项有效内容');
        return;
      }

      if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
        setFeedbackError('评分必须在 1 到 5 之间');
        return;
      }

      payload.rating = rating;
      payload.pros = pros;
      payload.cons = cons;
      payload.advice = advice;
      Object.assign(payload, structuredSelections);
    } else {
      if (!feedbackForm.fieldName) {
        setFeedbackError('请选择字段');
        return;
      }
      if (!feedbackForm.proposedValue) {
        setFeedbackError('请选择你想提交的新值');
        return;
      }
      if (feedbackType === 'supplement' && !availableSupplementFields.includes(feedbackForm.fieldName)) {
        setFeedbackError('当前字段不能作为补充信息提交');
        return;
      }

      payload.fieldName = feedbackForm.fieldName;
      payload.proposedValue = feedbackForm.proposedValue;
    }

    try {
      setIsSubmittingFeedback(true);
      const response = await fetch('/api/course-feedback-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '提交失败');
      }

      setFeedbackSuccess(result.message || '已提交，等待审核');
      setFeedbackForm({
        ...EMPTY_FEEDBACK_FORM,
        fieldName: feedbackType === 'supplement' ? availableSupplementFields[0] || '' : feedbackType === 'correction' ? CORRECTABLE_FIELDS[0] : '',
      });
    } catch (error: any) {
      setFeedbackError(error.message || '提交失败');
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  // Group courses by user-facing course identity so sections stay under one course.
  const groupedCourses = React.useMemo(() => {
    return filteredCourses.reduce((acc, course) => {
      const groupKey = getCourseDisplayGroupKey(course);
      
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(course);
      return acc;
    }, {} as Record<string, CourseReview[]>);
  }, [filteredCourses]);

  const groupedEntries = React.useMemo(() => Object.entries(groupedCourses), [groupedCourses]);
  const isRemoteSearch = debouncedSearchQuery.trim().length > 0;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { 
      opacity: 1, 
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  };

  const shouldShowFilterPanel = !isHeaderCompact || isFilterPanelOpen;

  return (
    <div className="min-h-screen bg-[#f3f4f6] dark:bg-gray-900 pb-24 transition-colors duration-300">
      {/* Header & Search */}
      <div className="sticky top-0 z-30 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 shadow-sm transition-all duration-300 safe-top">
                <div className={cn("max-w-2xl mx-auto px-4 py-3 transition-all duration-300", isHeaderCompact ? "space-y-2 sm:space-y-3" : "sm:py-6 sm:space-y-5 space-y-2")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center">
                <img src="/10001.png" alt="Logo" className="w-7 h-7 sm:w-9 sm:h-9 object-contain" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">汉阳选课指南</h1>
                <p className="text-[8px] sm:text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-0.5">Hanyang Course Guide</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
                {(['s', 'e'] as CampusCode[]).map((campusCode) => {
                  const isActive = selectedCampus === campusCode;
                  return (
                    <button
                      key={campusCode}
                      onClick={() => onCampusChange(campusCode)}
                      className={cn(
                        'px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-black transition-all',
                        isActive
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-600'
                      )}
                      title={CAMPUS_LABELS[campusCode]}
                    >
                      {campusCode === 's' ? '首尔' : 'ERICA'}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 sm:p-2.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors h-fit"
              >
                {isDarkMode ? <Sun size={18} className="sm:w-5 sm:h-5" /> : <Moon size={18} className="sm:w-5 sm:h-5" />}
              </button>
              
              <div className="flex flex-col gap-1.5">
                <button 
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('open-ai-assistant'));
                  }}
                >
                  <Sparkles size={18} />
                  <span>AI 助手</span>
                </button>
                {favorites.length > 0 && (
                  <button 
                    onClick={() => setIsPlannerOpen(true)}
                    className="flex items-center justify-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl font-bold text-xs sm:text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-100 dark:border-indigo-800"
                  >
                    <Calendar size={16} className="sm:w-[18px] sm:h-[18px]" />
                    <span>{favorites.length}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          {!isHeaderCompact && (
          <div className="px-1 flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400">
            <MapPin size={12} className="text-indigo-500" />
            <span>{selectedCampus ? CAMPUS_LABELS[selectedCampus] : '未选择校区'}</span>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span>{`${DEFAULT_SEMESTER}学期`}</span>
          </div>
          )}

          <div className="sm:space-y-4 space-y-2">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-indigo-600 transition-colors sm:w-5 sm:h-5" size={18} />
              <input
                type="text"
                placeholder="搜索课程名、代码或教授..."
                className="w-full pl-11 pr-4 py-2.5 sm:pl-12 sm:pr-4 sm:py-4 bg-gray-100 dark:bg-gray-700 border-transparent focus:bg-white dark:focus:bg-gray-800 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10 rounded-xl sm:rounded-2xl outline-none transition-all text-base sm:text-lg font-medium dark:text-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {isHeaderCompact && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setIsFilterPanelOpen((prev) => !prev)}
                    className="shrink-0 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px] sm:text-xs font-black text-gray-700 dark:text-gray-200"
                  >
                    {isFilterPanelOpen ? '收起筛选' : `筛选${activeFilters.length > 0 ? ` · ${activeFilters.length}` : ''}`}
                  </button>
                  {!isFilterPanelOpen && activeFilters.length > 0 && (
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide max-w-full">
                      {activeFilters.map((id) => {
                        const filter = FILTER_OPTIONS.find((item) => item.id === id);
                        if (!filter) return null;
                        return (
                          <span key={id} className="px-2 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold whitespace-nowrap">
                            {filter.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                {activeFilters.length > 0 && (
                  <button
                    onClick={() => setActiveFilters([])}
                    className="shrink-0 text-[10px] sm:text-xs font-black text-rose-500"
                  >
                    清空
                  </button>
                )}
              </div>
            )}

            {/* Filter Chips */}
            {shouldShowFilterPanel && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
                <span className="text-[8px] sm:text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest shrink-0">课程分类</span>
                {FILTER_OPTIONS.filter(f => f.group === 'type').map((filter) => {
                  const isActive = activeFilters.includes(filter.id);
                  return (
                    <button
                      key={filter.id}
                      onClick={() => toggleFilter(filter.id)}
                      className={cn(
                        "whitespace-nowrap px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-[9px] sm:text-xs font-black transition-all border shrink-0",
                        isActive 
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-indigo-900/20" 
                          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-300"
                      )}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
                <span className="text-[8px] sm:text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest shrink-0">出勤方式</span>
                {FILTER_OPTIONS.filter(f => f.group === 'attendance').map((filter) => {
                  const isActive = activeFilters.includes(filter.id);
                  return (
                    <button
                      key={filter.id}
                      onClick={() => toggleFilter(filter.id)}
                      className={cn(
                        "whitespace-nowrap px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-[9px] sm:text-xs font-black transition-all border shrink-0",
                        isActive
                          ? "bg-sky-600 border-sky-600 text-white shadow-md shadow-sky-100 dark:shadow-sky-900/20"
                          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-sky-300"
                      )}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
                <span className="text-[8px] sm:text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest shrink-0">课程特征</span>
                {FILTER_OPTIONS.filter(f => f.group === 'trait').map((filter) => {
                  const isActive = activeFilters.includes(filter.id);
                  return (
                    <button
                      key={filter.id}
                      onClick={() => toggleFilter(filter.id)}
                      className={cn(
                        "whitespace-nowrap px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-[9px] sm:text-xs font-black transition-all border shrink-0",
                        isActive 
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100 dark:shadow-emerald-900/20" 
                          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-emerald-300"
                      )}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>
            )}

          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 mt-8 min-h-[600px]">
        {loading ? (
          <div className="space-y-8">
            <CourseSkeleton />
            <CourseSkeleton />
            <CourseSkeleton />
          </div>
        ) : groupedEntries.length > 0 ? (
          <>
            <Virtuoso
              useWindowScroll
              data={groupedEntries}
              itemContent={(index, [groupKey, professorCourses]) => {
              const coursesList = professorCourses as CourseReview[];
              
              const representativeCourse = coursesList[0];
              const actualCourseName = representativeCourse.course_name || groupKey;
              const split = splitCourseName(actualCourseName);
              const original = split.original;
              const translation = split.translation;
              
              return (
                <div className="mb-12">
                  <div className="flex items-start gap-3 sm:gap-4 px-2 mb-4 sm:mb-6">
                    <div className="h-8 w-1.5 sm:w-2 bg-indigo-600 rounded-full mt-1" />
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
                        {original}
                      </h2>
                      {translation && (
                        <p className="text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400 mt-0.5">
                          {translation}
                        </p>
                      )}
                    </div>
                    <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-black shrink-0">
                      {coursesList.length} 条记录
                    </span>
                  </div>

                  <div className="flex gap-3 sm:gap-6 overflow-x-auto pb-4 sm:pb-6 scrollbar-hide -mx-4 px-4 snap-x">
                    {coursesList.map((course) => {
                      const score = Number(course.overall_score || 0);
                      const isFavorite = favorites.includes(course.id!);

                      return (
                        <div
                          key={course.id}
                          id={`course-card-${course.id}`}
                          className="relative min-w-[260px] sm:min-w-[360px] bg-white dark:bg-gray-800 rounded-[1.5rem] sm:rounded-[2.5rem] p-4 sm:p-7 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group snap-center"
                        >
                          {/* Add to Planner Button */}
                          <div className="absolute top-3 right-3 sm:top-7 sm:right-7 flex gap-1.5 z-10">
                            <button 
                              onClick={() => toggleFavorite(course.id!)}
                              className={cn(
                                "p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl transition-all active:scale-90 flex items-center gap-2 relative",
                                isFavorite 
                                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40" 
                                  : "bg-gray-50 dark:bg-gray-700 text-gray-300 dark:text-gray-500 hover:text-indigo-400 hover:bg-indigo-50/50"
                              )}
                              title={isFavorite ? "从课表移除" : "添加到课表"}
                            >
                              {!isFavorite && (
                                <motion.div 
                                  animate={{ 
                                    scale: [1, 1.4, 1],
                                    opacity: [0.5, 1, 0.5]
                                  }}
                                  transition={{ 
                                    duration: 2, 
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                  }}
                                  className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)] z-20"
                                />
                              )}
                              <Calendar size={14} className="sm:w-4 sm:h-4" />
                              <span className="text-[10px] font-black hidden sm:inline">
                                {isFavorite ? "已在课表" : "加入课表"}
                              </span>
                            </button>
                          </div>

                          {/* Header */}
                          <div className="flex justify-between items-start mb-3 sm:mb-6 pr-10 sm:pr-20">
                            <div>
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                                <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-[8px] sm:text-[10px]">
                                  {(course.professor || '?').charAt(0)}
                                </div>
                                <p className="text-gray-500 dark:text-gray-400 font-bold text-[10px] sm:text-sm truncate max-w-[100px] sm:max-w-none">
                                  {course.professor}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {course.course_code && (
                                  <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded text-[8px] sm:text-[9px] font-bold">
                                    {course.course_code}
                                  </span>
                                )}
                                {course.course_type && (
                                  <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded text-[8px] sm:text-[9px] font-bold">
                                    {course.course_type}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 sm:gap-1.5">
                              <StarRating score={score} />
                              <div className="text-[8px] sm:text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                {course.grade_and_credit || '3学分'}
                              </div>
                            </div>
                          </div>

                          {/* Academic Info */}
                          {(course.class_time || course.classroom) && (
                            <div className={cn(
                              "flex items-center gap-3 mb-4 p-2.5 rounded-xl border transition-colors",
                              favoriteConflicts[course.id!] 
                                ? "bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-900/30" 
                                : "bg-gray-50 dark:bg-gray-900/40 border-gray-100 dark:border-gray-800"
                            )}>
                              <Calendar size={14} className={cn(
                                favoriteConflicts[course.id!] ? "text-rose-500" : "text-indigo-500",
                                "shrink-0"
                              )} />
                              <div className="min-w-0 flex-1">
                                <p className={cn(
                                  "text-[9px] sm:text-[10px] font-bold truncate",
                                  favoriteConflicts[course.id!] ? "text-rose-600 dark:text-rose-400" : "text-gray-600 dark:text-gray-300"
                                )}>
                                  {course.class_time || '时间待定'}
                                </p>
                                <p className="text-[8px] sm:text-[9px] font-medium text-gray-400 dark:text-gray-500 truncate">
                                  {course.classroom || '教室待定'}
                                </p>
                              </div>
                              {favoriteConflicts[course.id!] && (
                                <div className="flex items-center gap-1 text-rose-500" title="时间冲突">
                                  <AlertCircle size={12} />
                                  <span className="text-[8px] font-black uppercase">时间冲突</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Indicators */}
                          <div className="space-y-1.5 sm:space-y-3 mb-4 sm:mb-7">
                            <IndicatorSegment 
                              label="作业量 Assignment" 
                              value={course.assignment} 
                              options={["无", "普通", "多"]} 
                            />
                            <IndicatorSegment 
                              label="小组项目 Team" 
                              value={course.team_project} 
                              options={["无", "普通", "多"]} 
                            />
                            <IndicatorSegment 
                              label="给分 Grading" 
                              value={course.grading} 
                              options={["宽容", "普通", "严格"]} 
                            />
                            
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/30 p-2 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                <Calendar size={12} className="text-indigo-500 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">出勤 Attendance</p>
                                  <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300 truncate">
                                    {course.attendance || '待补充'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/30 p-2 rounded-xl border border-gray-100 dark:border-gray-700/50">
                                <FileText size={12} className="text-indigo-500 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">考试 Exams</p>
                                  <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300 truncate">
                                    {course.exam_count || '待补充'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Advice Box */}
                          <CollapsibleDetails pros={course.pros} cons={course.cons} advice={course.advice} />

                          {/* Feedback Entry */}
                          <div className="flex items-center justify-between gap-3 pt-3.5 sm:pt-5 border-t border-gray-100 dark:border-gray-700">
                            <div className="min-w-0">
                              <p className="text-[8px] sm:text-[9px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                发现数据缺失、想补充评价或更正信息？
                              </p>
                              <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                                你可以只提交一项你确定的信息，后台审核后会生效。
                              </p>
                            </div>
                            <button
                              onClick={() => openFeedbackModal(course)}
                              className="shrink-0 inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-indigo-600 text-white font-black text-[10px] sm:text-xs hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30"
                            >
                              <Edit3 size={14} />
                              <span>反馈</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }}
            />
            {!isRemoteSearch && hasMoreCourses && (
              <div className="mt-2 sm:mt-6 flex justify-center">
                <button
                  onClick={handleLoadMoreCourses}
                  disabled={loading || isFetchingMore}
                  className="px-5 py-2.5 sm:px-6 sm:py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-bold text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isFetchingMore ? '加载中...' : '加载更多课程'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400 space-y-6">
            <div className="bg-white dark:bg-gray-800 p-10 rounded-[3rem] shadow-sm border border-gray-100 dark:border-gray-700">
              <Search size={64} className="text-gray-200 dark:text-gray-700" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-xl font-black text-gray-900 dark:text-white">没有找到匹配课程</p>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">尝试调整筛选条件或搜索词</p>
            </div>
            {activeFilters.length > 0 && (
              <button 
                onClick={() => setActiveFilters([])}
                className="text-indigo-600 dark:text-indigo-400 font-black text-xs uppercase tracking-widest hover:underline"
              >
                清除所有筛选
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating Planner Button */}
      <AnimatePresence>
        {favorites.length > 0 && !isPlannerOpen && (
          <motion.button
            initial={{ scale: 0, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0, y: 20 }}
            onClick={() => setIsPlannerOpen(true)}
            className="fixed bottom-6 right-6 z-40 bg-indigo-600 text-white p-4 sm:p-5 rounded-[2rem] shadow-2xl shadow-indigo-300 dark:shadow-indigo-900/50 flex items-center gap-3 active:scale-95 transition-all group"
          >
            <Calendar size={20} className="sm:w-6 sm:h-6" />
            <span className="font-black text-base sm:text-lg pr-1">{favorites.length}</span>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full border-2 border-white dark:border-gray-900 animate-ping" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Planner Modal */}
      <AnimatePresence>
        {isPlannerOpen && (
          <Timetable 
            selectedCourses={favoriteCourses}
            onRemove={(id) => toggleFavorite(id)}
            onClose={() => setIsPlannerOpen(false)}
            conflicts={favoriteConflicts}
          />
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <AnimatePresence>
        {feedbackCourse && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-2 md:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeFeedbackModal}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="relative bg-white dark:bg-gray-900 w-full max-w-2xl rounded-t-3xl md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
            >
              <div className="flex items-center justify-between p-5 sm:p-7 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">课程反馈</h2>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                    {feedbackCourse.course_name} · {feedbackCourse.professor} · {feedbackCourse.course_code || '无代码'}
                  </p>
                </div>
                <button
                  onClick={closeFeedbackModal}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X size={22} className="text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              <div className="p-5 sm:p-7 space-y-5 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { type: 'review', title: '写评价', description: '可只写你知道的一部分', disabled: false },
                    { type: 'supplement', title: '补充信息', description: '仅补当前缺失字段', disabled: availableSupplementFields.length === 0 },
                    { type: 'correction', title: '更正信息', description: '修正结构化字段', disabled: false },
                  ] as const).map((item) => {
                    const isActive = feedbackType === item.type;
                    return (
                      <button
                        key={item.type}
                        onClick={() => {
                          if (item.disabled) return;
                          setFeedbackType(item.type);
                          setFeedbackError('');
                          setFeedbackSuccess('');
                        }}
                        disabled={item.disabled}
                        className={cn(
                          'text-left p-4 rounded-2xl border transition-all',
                          isActive
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm'
                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80',
                          item.disabled && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <p className="text-sm font-black text-gray-900 dark:text-white">{item.title}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{item.description}</p>
                      </button>
                    );
                  })}
                </div>

                {feedbackSuccess && (
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 p-4">
                    <CheckCircle size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{feedbackSuccess}</p>
                  </div>
                )}

                {feedbackError && (
                  <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-4">
                    <AlertCircle size={18} className="text-rose-600 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{feedbackError}</p>
                  </div>
                )}

                {feedbackType === 'review' && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">评分（可选）</label>
                        <select
                          value={feedbackForm.rating}
                          onChange={(e) => updateFeedbackField('rating', e.target.value)}
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none dark:text-white"
                        >
                          <option value="">暂不评分</option>
                          {[1, 2, 3, 4, 5].map((value) => (
                            <option key={value} value={String(value)}>{value} 分</option>
                          ))}
                        </select>
                      </div>
                      <div className="rounded-2xl border border-amber-100 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4">
                        <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">提交规则</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 leading-relaxed">
                          你不需要填满整张表。只要至少提交一项你确定的信息，就可以送审。
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">优点 Pros（每行一条）</label>
                        <textarea
                          value={feedbackForm.prosText}
                          onChange={(e) => updateFeedbackField('prosText', e.target.value)}
                          rows={4}
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none resize-none dark:text-white"
                          placeholder="例如：课堂节奏舒服"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">缺点 Cons（每行一条）</label>
                        <textarea
                          value={feedbackForm.consText}
                          onChange={(e) => updateFeedbackField('consText', e.target.value)}
                          rows={4}
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none resize-none dark:text-white"
                          placeholder="例如：给分偏紧"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">建议 Advice（可选）</label>
                      <textarea
                        value={feedbackForm.advice}
                        onChange={(e) => updateFeedbackField('advice', e.target.value)}
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none resize-none dark:text-white"
                        placeholder="例如：适合想稳一点拿学分的人"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {STRUCTURED_FEEDBACK_FIELDS.map((field) => (
                        <div key={field} className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{FEEDBACK_FIELD_LABELS[field]}</label>
                          <select
                            value={feedbackForm[field]}
                            onChange={(e) => updateFeedbackField(field, e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none dark:text-white"
                          >
                            <option value="">暂不填写</option>
                            {FEEDBACK_ENUM_OPTIONS[field].map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(feedbackType === 'supplement' || feedbackType === 'correction') && (
                  <div className="space-y-5">
                    {feedbackType === 'supplement' && availableSupplementFields.length === 0 ? (
                      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200">当前没有可补充的缺失字段。</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">你可以切换到“写评价”或“更正信息”。</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">字段</label>
                            <select
                              value={feedbackForm.fieldName}
                              onChange={(e) => updateFeedbackField('fieldName', e.target.value as StructuredFeedbackField | '')}
                              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none dark:text-white"
                            >
                              <option value="">请选择字段</option>
                              {(feedbackType === 'supplement' ? availableSupplementFields : CORRECTABLE_FIELDS).map((field) => (
                                <option key={field} value={field}>{FEEDBACK_FIELD_LABELS[field]}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">新值</label>
                            <select
                              value={feedbackForm.proposedValue}
                              onChange={(e) => updateFeedbackField('proposedValue', e.target.value)}
                              disabled={!feedbackForm.fieldName}
                              className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none dark:text-white disabled:opacity-50"
                            >
                              <option value="">请选择</option>
                              {(feedbackForm.fieldName ? FEEDBACK_ENUM_OPTIONS[feedbackForm.fieldName] : []).map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {feedbackForm.fieldName && (
                          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 space-y-2">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">当前值</p>
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                              {isMissingFeedbackValue(feedbackCourse[feedbackForm.fieldName]) ? '缺失 / 待补充' : feedbackCourse[feedbackForm.fieldName]}
                            </p>
                            {(feedbackForm.fieldName === 'assignment' || feedbackForm.fieldName === 'team_project') && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                当前只支持 `无 / 普通 / 多` 三档。如果你想表达“少”，请选择最接近的 `普通` 或 `无`。
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 z-10 p-4 sm:p-6 border-t border-gray-100 dark:border-gray-800 shrink-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={isSubmittingFeedback || ((feedbackType === 'supplement') && availableSupplementFields.length === 0)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20"
                >
                  {isSubmittingFeedback ? <Loader2 className="animate-spin" size={18} /> : <Edit3 size={18} />}
                  提交反馈
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Assistant */}
      <AIAssistant courses={courses} campus={selectedCampus} semester={DEFAULT_SEMESTER} />
    </div>
  );
}
