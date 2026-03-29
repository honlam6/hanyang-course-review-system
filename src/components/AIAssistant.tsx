import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, User, Loader2, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { CourseReview } from '../lib/supabase';
import { CampusCode } from '../constants/campus';
import { fetchJson } from '../lib/api';
import type { CategoryOptionSnapshot } from '../lib/aiCategoryResolver';

interface AIAssistantProps {
  courses: CourseReview[];
  campus: CampusCode | null;
  semester: string;
}

interface CategoryOptionRow {
  category_top?: string | null;
  category_paths?: string[] | null;
  category_colleges?: string[] | null;
  category_departments?: string[] | null;
  category_leaves?: string[] | null;
}

const GENERAL_TOP = '공통과목(교양)';
const MAJOR_TOP = '학과과목(전공)';

function sanitize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item)).filter(Boolean);
  }

  const text = sanitize(value);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => sanitize(item)).filter(Boolean);
    }
  } catch {
    // fall through
  }

  return [text];
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
}

function parseCategoryPath(path: string) {
  const parts = path.split('>').map((part) => sanitize(part)).filter(Boolean);
  if (parts.length < 2) return null;

  if (parts[0] === GENERAL_TOP) {
    return {
      top: parts[0],
      leaf: parts[parts.length - 1],
    };
  }

  if (parts[0] === MAJOR_TOP && parts.length >= 3) {
    return {
      top: parts[0],
      college: parts[1],
      department: parts[2],
    };
  }

  return null;
}

function buildCategoryTree(rows: CategoryOptionRow[]) {
  const tops = new Set<string>();
  const majorCollegeMap = new Map<string, Set<string>>();
  const generalLeafSet = new Set<string>();

  for (const row of rows) {
    const top = sanitize(row.category_top);
    if (top) tops.add(top);

    const paths = toStringArray(row.category_paths);
    for (const path of paths) {
      const parts = path.split('>').map((part) => sanitize(part)).filter(Boolean);
      if (parts.length < 2) continue;

      if (parts[0] === GENERAL_TOP) {
        generalLeafSet.add(parts[parts.length - 1]);
        continue;
      }

      if (parts[0] === MAJOR_TOP && parts.length >= 3) {
        const college = parts[1];
        const department = parts[2];
        if (!majorCollegeMap.has(college)) {
          majorCollegeMap.set(college, new Set<string>());
        }
        majorCollegeMap.get(college)!.add(department);
      }
    }

    if (top === GENERAL_TOP) {
      for (const leaf of toStringArray(row.category_leaves)) {
        generalLeafSet.add(leaf);
      }
    }
  }

  return {
    tops: uniqueSorted(tops),
    colleges: uniqueSorted(majorCollegeMap.keys()),
    departmentsByCollege: new Map(
      [...majorCollegeMap.entries()].map(([college, departments]) => [college, uniqueSorted(departments)]),
    ),
    generalLeaves: uniqueSorted(generalLeafSet),
  };
}

function getCourseCategorySelection(course: CourseReview) {
  const preferredPath = sanitize(course.primary_category_path) || toStringArray(course.category_paths)[0] || '';
  const parsed = preferredPath ? parseCategoryPath(preferredPath) : null;

  if (parsed && 'leaf' in parsed) {
    return {
      selectedCategoryTop: GENERAL_TOP,
      selectedCategoryCollege: '',
      selectedCategoryDepartment: '',
      selectedCategoryLeaf: parsed.leaf,
    };
  }

  if (parsed && 'college' in parsed) {
    return {
      selectedCategoryTop: MAJOR_TOP,
      selectedCategoryCollege: parsed.college,
      selectedCategoryDepartment: parsed.department,
      selectedCategoryLeaf: '',
    };
  }

  return {
    selectedCategoryTop: course.category_top || '',
    selectedCategoryCollege: '',
    selectedCategoryDepartment: '',
    selectedCategoryLeaf: '',
  };
}

export default function AIAssistant({ courses, campus, semester }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [input, setInput] = useState('');
  const [activeCourse, setActiveCourse] = useState<CourseReview | null>(null);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
    { role: 'assistant', content: '你好！我是你的 AI 选课助手。你可以问我关于课程的建议，比如“哪门课给分比较宽容？”或者“推荐一些没有小组作业的课”。' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [categorySnapshot, setCategorySnapshot] = useState<CategoryOptionSnapshot | null>(null);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [selectedCategoryTop, setSelectedCategoryTop] = useState('');
  const [selectedCategoryCollege, setSelectedCategoryCollege] = useState('');
  const [selectedCategoryDepartment, setSelectedCategoryDepartment] = useState('');
  const [selectedCategoryLeaf, setSelectedCategoryLeaf] = useState('');
  const [isFilterExpanded, setIsFilterExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const categorySourceRows = React.useMemo<CategoryOptionRow[]>(() => {
    if (categorySnapshot) return [];
    return courses.map((course) => ({
      category_top: course.category_top,
      category_paths: course.category_paths,
      category_colleges: course.category_colleges,
      category_departments: course.category_departments,
      category_leaves: course.category_leaves,
    }));
  }, [categorySnapshot, courses]);

  const categoryTree = React.useMemo(() => {
    if (categorySnapshot) {
      return {
        tops: categorySnapshot.tops,
        colleges: categorySnapshot.colleges,
        departmentsByCollege: new Map(Object.entries(categorySnapshot.departmentsByCollege)),
        generalLeaves: categorySnapshot.leaves,
      };
    }

    return buildCategoryTree(categorySourceRows);
  }, [categorySnapshot, categorySourceRows]);
  const topOptions = categoryTree.tops;
  const collegeOptions = categoryTree.colleges;
  const departmentOptions = React.useMemo(
    () => (selectedCategoryCollege ? (categoryTree.departmentsByCollege.get(selectedCategoryCollege) || []) : []),
    [categoryTree, selectedCategoryCollege],
  );
  const generalLeafOptions = categoryTree.generalLeaves;
  const activeFilterTrail = [selectedCategoryTop, selectedCategoryCollege, selectedCategoryDepartment, selectedCategoryLeaf]
    .filter(Boolean)
    .join(' > ');
  const activeFilterSummary = activeFilterTrail || '未固定范围，AI 会先结合你的问题判断';
  const hasActiveFilters = Boolean(selectedCategoryTop || selectedCategoryCollege || selectedCategoryDepartment || selectedCategoryLeaf);
  const markdownComponents = React.useMemo(() => ({
    p: ({ children }: any) => <p className="mb-3 last:mb-0 break-words leading-7 text-sm sm:text-[15px] [overflow-wrap:anywhere]">{children}</p>,
    ul: ({ children }: any) => <ul className="mb-3 list-disc space-y-1.5 pl-5 text-sm sm:text-[15px] [overflow-wrap:anywhere]">{children}</ul>,
    ol: ({ children }: any) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-sm sm:text-[15px] [overflow-wrap:anywhere]">{children}</ol>,
    li: ({ children }: any) => <li className="break-words leading-7 [overflow-wrap:anywhere]">{children}</li>,
    strong: ({ children }: any) => <strong className="font-bold text-gray-900 dark:text-white">{children}</strong>,
    pre: ({ children }: any) => (
      <pre className="my-4 max-w-full overflow-x-auto rounded-2xl bg-gray-950">{children}</pre>
    ),
    code: ({ inline, children }: any) =>
      inline ? (
        <code className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[0.92em] break-all whitespace-pre-wrap dark:bg-gray-800">{children}</code>
      ) : (
        <code className="block min-w-max px-4 py-3 text-sm text-gray-100 whitespace-pre">{children}</code>
      ),
    table: ({ children }: any) => (
      <div className="my-4 max-w-full overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-600">
        <table className="min-w-full border-collapse text-left text-xs sm:text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => <thead className="bg-gray-50 dark:bg-gray-800/90">{children}</thead>,
    tbody: ({ children }: any) => <tbody className="divide-y divide-gray-200 dark:divide-gray-700">{children}</tbody>,
    tr: ({ children }: any) => <tr className="align-top">{children}</tr>,
    th: ({ children }: any) => (
      <th className="border-b border-gray-200 px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-600 break-words dark:border-gray-700 dark:text-gray-300 [overflow-wrap:anywhere]">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="px-3 py-2.5 text-gray-700 break-words whitespace-pre-wrap dark:text-gray-200 [overflow-wrap:anywhere]">{children}</td>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="my-4 rounded-r-2xl border-l-4 border-indigo-400 bg-indigo-50/70 px-4 py-3 text-sm text-gray-700 break-words dark:bg-indigo-950/30 dark:text-gray-200 [overflow-wrap:anywhere]">
        {children}
      </blockquote>
    ),
  }), []);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      setIsOpen(true);
      setIsFilterExpanded(true);
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.course) {
        const course = customEvent.detail.course;
        setActiveCourse(course);
        const selection = getCourseCategorySelection(course);
        setSelectedCategoryTop(selection.selectedCategoryTop);
        setSelectedCategoryCollege(selection.selectedCategoryCollege);
        setSelectedCategoryDepartment(selection.selectedCategoryDepartment);
        setSelectedCategoryLeaf(selection.selectedCategoryLeaf);
        const courseName = course.course_name;
        const prof = course.professor || '未知';
        const query = `请帮我详细分析一下 ${prof} 教授的《${courseName}》这门课，它的给分、作业和考试情况如何？`;
        // Small delay to allow modal to open before sending
        setTimeout(() => {
          handleSend(query);
        }, 300);
      }
    };
    window.addEventListener('open-ai-assistant', handleOpen);
    
    // Auto-popup tooltip on mount
    const timer = setTimeout(() => {
      setShowTooltip(true);
      // Hide tooltip after 5 seconds
      setTimeout(() => setShowTooltip(false), 5000);
    }, 1500);

    return () => {
      window.removeEventListener('open-ai-assistant', handleOpen as EventListener);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    if (selectedCategoryTop === GENERAL_TOP) {
      setSelectedCategoryCollege('');
      setSelectedCategoryDepartment('');
    } else if (selectedCategoryTop === MAJOR_TOP) {
      setSelectedCategoryLeaf('');
    } else {
      setSelectedCategoryCollege('');
      setSelectedCategoryDepartment('');
      setSelectedCategoryLeaf('');
    }
  }, [selectedCategoryTop]);

  useEffect(() => {
    if (selectedCategoryTop !== MAJOR_TOP) return;
    if (!selectedCategoryCollege) {
      setSelectedCategoryDepartment('');
    } else if (selectedCategoryDepartment && !departmentOptions.includes(selectedCategoryDepartment)) {
      setSelectedCategoryDepartment('');
    }
  }, [selectedCategoryCollege, selectedCategoryTop, selectedCategoryDepartment, departmentOptions]);

  useEffect(() => {
    if (selectedCategoryTop !== GENERAL_TOP && selectedCategoryLeaf) {
      setSelectedCategoryLeaf('');
    }
    if (selectedCategoryTop === GENERAL_TOP && selectedCategoryLeaf && !generalLeafOptions.includes(selectedCategoryLeaf)) {
      setSelectedCategoryLeaf('');
    }
  }, [selectedCategoryTop, selectedCategoryLeaf, generalLeafOptions]);

  useEffect(() => {
    if (!isOpen || !campus) return;

    let cancelled = false;
    const fetchCategoryRows = async () => {
      setCategoryLoading(true);
      try {
        const params = new URLSearchParams({
          campus,
          semester,
          includeCategorySnapshot: '1',
        });
        const result = await fetchJson<{ success: boolean; data: CategoryOptionSnapshot }>(`/api/courses?${params.toString()}`);

        if (!cancelled) {
          setCategorySnapshot(result.data);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch AI category options:', error);
        }
      } finally {
        if (!cancelled) {
          setCategoryLoading(false);
        }
      }
    };

    fetchCategoryRows();
    return () => {
      cancelled = true;
    };
  }, [isOpen, campus, semester]);

  const handleSend = async (overrideInput?: string) => {
    const textToSend = typeof overrideInput === 'string' ? overrideInput : input;
    if (!textToSend.trim() || isTyping) return;

    const userMessage = textToSend.trim();
    if (typeof overrideInput !== 'string') setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);
    setIsFilterExpanded(false);

    try {
      // 向我们自己的后端接口发起请求，而不是直接请求 Google
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          campus,
          semester,
          selectedCategoryTop: selectedCategoryTop || null,
          selectedCategoryCollege: selectedCategoryCollege || null,
          selectedCategoryDepartment: selectedCategoryDepartment || null,
          selectedCategoryLeaf: selectedCategoryLeaf || null,
        })
      });

      if (!response.ok) throw new Error('API request failed');

      const data = await response.json();
      const aiResponse = data.text || '抱歉，我现在无法回答这个问题。';
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (error) {
      console.error('AI Error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，连接 AI 服务时出现错误，请稍后再试。' }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        initial={{ scale: 0, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={() => setIsOpen(true)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="fixed bottom-24 right-6 z-40 bg-indigo-600 text-white p-2 rounded-full shadow-2xl shadow-indigo-300 dark:shadow-indigo-900/50 flex items-center justify-center active:scale-95 transition-all group w-12 h-12 sm:w-14 sm:h-14 overflow-hidden"
      >
        <img src="/10002.png" alt="AI" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
        
        <AnimatePresence>
          {showTooltip && (
            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.8 }}
              className="absolute right-full mr-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-2 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 whitespace-nowrap font-bold text-sm flex items-center gap-2"
            >
              <Sparkles size={16} className="text-indigo-600" />
              <span>AI 选课助手</span>
              <div className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-gray-800 border-r border-t border-gray-100 dark:border-gray-700 rotate-45" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg md:max-w-2xl bg-white dark:bg-gray-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[88dvh] md:h-[min(88vh,820px)]"
            >
              {/* Header */}
              <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-700 bg-indigo-600 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="bg-white p-1 rounded-lg sm:rounded-xl w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center overflow-hidden shrink-0">
                    <img src="/10002.png" alt="Logo" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-black text-sm sm:text-lg truncate">AI 智能选课助手</h2>
                    <p className="text-indigo-100 text-[8px] sm:text-[10px] uppercase tracking-widest font-bold truncate">Powered by Gemini 3.1 Lite</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-3 -mr-2 hover:bg-white/20 rounded-full transition-colors flex items-center justify-center shrink-0"
                  aria-label="关闭"
                >
                  <X size={28} className="sm:size-6" />
                </button>
              </div>

              <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-b from-white via-indigo-50/30 to-white dark:from-gray-800 dark:via-indigo-950/10 dark:to-gray-800 shrink-0">
                <div className="rounded-[1.35rem] border border-indigo-100/80 dark:border-indigo-900/40 bg-white/90 dark:bg-gray-900/70 px-3.5 py-3 shadow-[0_10px_32px_-24px_rgba(79,70,229,0.5)]">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal size={15} className="text-indigo-500" />
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-indigo-500 dark:text-indigo-300">
                          智能筛选
                        </p>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {activeFilterSummary}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:shrink-0">
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategoryTop('');
                            setSelectedCategoryCollege('');
                            setSelectedCategoryDepartment('');
                            setSelectedCategoryLeaf('');
                          }}
                          className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:border-indigo-300 hover:text-indigo-600"
                        >
                          清空
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsFilterExpanded((prev) => !prev)}
                        className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-200/70 transition hover:bg-indigo-700 dark:shadow-indigo-950/40"
                      >
                        {isFilterExpanded ? '收起筛选' : '展开筛选'}
                        {isFilterExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isFilterExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 border-t border-indigo-100/80 pt-3 dark:border-indigo-900/40">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                              先缩小课程范围，再让 AI 在范围内推荐
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              {categoryLoading ? '分类加载中...' : '支持学院 / 学部 / 教养领域'}
                            </p>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2">
                            {[
                              { value: '', label: '全部' },
                              { value: GENERAL_TOP, label: '教养' },
                              { value: MAJOR_TOP, label: '专业' },
                            ].map((option) => {
                              const isActive = selectedCategoryTop === option.value;
                              return (
                                <button
                                  key={option.label}
                                  type="button"
                                  onClick={() => setSelectedCategoryTop(option.value)}
                                  className={cn(
                                    "rounded-2xl px-3 py-2 text-sm font-semibold transition-all border",
                                    isActive
                                      ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200/70 dark:shadow-indigo-950/40"
                                      : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-300"
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>

                          {selectedCategoryTop === MAJOR_TOP && (
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <label className="space-y-1.5">
                                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">学院</span>
                                <select
                                  value={selectedCategoryCollege}
                                  onChange={(e) => setSelectedCategoryCollege(e.target.value)}
                                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600 dark:text-white"
                                >
                                  <option value="">不限学院</option>
                                  {collegeOptions.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </label>

                              <label className="space-y-1.5">
                                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">学部 / 学科</span>
                                <select
                                  value={selectedCategoryDepartment}
                                  onChange={(e) => setSelectedCategoryDepartment(e.target.value)}
                                  disabled={!selectedCategoryCollege}
                                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600 dark:text-white disabled:opacity-55 disabled:cursor-not-allowed"
                                >
                                  <option value="">{selectedCategoryCollege ? '不限学部 / 学科' : '请先选择学院'}</option>
                                  {departmentOptions.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          )}

                          {selectedCategoryTop === GENERAL_TOP && (
                            <label className="mt-3 space-y-1.5 block">
                              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">教养领域</span>
                              <select
                                value={selectedCategoryLeaf}
                                onChange={(e) => setSelectedCategoryLeaf(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-600 dark:text-white"
                              >
                                <option value="">不限教养领域</option>
                                {generalLeafOptions.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 scrollbar-hide"
              >
                {messages.map((msg, i) => (
                  <motion.div
                    initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i}
                    className={cn(
                      "flex max-w-[85%] min-w-0 gap-3",
                      msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm overflow-hidden",
                      msg.role === 'user' ? "bg-indigo-600 text-white" : "bg-white border border-gray-100 dark:border-gray-700"
                    )}>
                      {msg.role === 'user' ? <User size={16} /> : <img src="/10002.png" alt="AI" className="w-full h-full object-cover" />}
                    </div>
                    <div className={cn(
                      "min-w-0 max-w-full overflow-hidden p-4 text-sm leading-relaxed shadow-md",
                      msg.role === 'user' 
                        ? "bg-indigo-600 text-white rounded-tr-none" 
                        : "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none border border-gray-100 dark:border-gray-600"
                    )}>
                      {msg.role === 'assistant' ? (
                        <div className="max-w-full min-w-0 text-sm text-gray-800 dark:text-gray-200">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </motion.div>
                ))}
                {isTyping && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 dark:border-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                      <img src="/10002.png" alt="AI" className="w-full h-full object-cover" />
                    </div>
                    <div className="bg-white dark:bg-gray-700 p-4 rounded-[1.25rem] rounded-tl-none border border-gray-100 dark:border-gray-600 shadow-md">
                      <Loader2 size={16} className="animate-spin text-indigo-600 dark:text-indigo-400" />
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                <div className="relative flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="问问 AI 助手..."
                    className="flex-1 bg-white dark:bg-gray-800 border-transparent focus:ring-2 focus:ring-indigo-600 rounded-2xl px-5 py-4 text-base outline-none shadow-sm dark:text-white"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isTyping}
                    className="bg-indigo-600 text-white p-4 rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:shadow-none"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
