import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Edit3, Search, Save, X, Upload, CheckCircle, AlertCircle, Loader2, ArrowLeft, ChevronDown, ChevronUp, Sparkles, MessageSquare } from 'lucide-react';
import { CourseFeedbackSubmissionWithCourse, CourseReview, isSupabaseAuthConfigured, supabaseAuth } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getCourseDisplayGroupKey, getCourseIdentityKey, normalizeAssignment, normalizeTeamProject, normalizeGrading, normalizeAttendance, normalizeExamCount, splitCourseName } from '../lib/utils';
import { CampusCode, DEFAULT_SEMESTER } from '../constants/campus';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { CORRECTABLE_FIELDS, FEEDBACK_FIELD_LABELS, FEEDBACK_SUBMISSION_TYPES, FeedbackSubmissionType, FEEDBACK_STATUSES, FeedbackStatus } from '../constants/feedback';
import { fetchJson, fetchJsonWithAuth } from '../lib/api';

// Normalization functions for course stats
interface PreviewItem {
  item: CourseReview;
  status: 'new' | 'duplicate' | 'update';
  diff?: { field: string; old: any; new: any }[];
  ai_duplicate_check?: { is_duplicate: boolean; reason: string; confidence: number };
}

interface UploadLogEntry {
  id: string;
  createdAt: string;
  newCount: number;
  updateCount: number;
  duplicateSkipped: number;
  totalPlanned: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  failedItems: string[];
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

interface AdminStatusResponse {
  authenticated: boolean;
  isAdmin: boolean;
  email: string | null;
  user: {
    id: string;
    email: string | null;
  } | null;
}

interface AdminCoursesResponse {
  success: boolean;
  data: CourseReview[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
}

function normalizeCampus(value: unknown): CampusCode {
  return value === 's' ? 's' : 'e';
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export default function AdminDashboard() {
  const ADMIN_PAGE_SIZE = 120;
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingMoreCourses, setIsFetchingMoreCourses] = useState(false);
  const [hasMoreCourses, setHasMoreCourses] = useState(false);
  const [batchJson, setBatchJson] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCourse, setEditingCourse] = useState<CourseReview | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' }[]>([]);
  const [confirmConfig, setConfirmConfig] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [previewData, setPreviewData] = useState<PreviewItem[] | null>(null);
  const [expandedDiffs, setExpandedDiffs] = useState<number[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadLogs, setUploadLogs] = useState<UploadLogEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [isAIChecking, setIsAIChecking] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);
  const [adminStatusLoaded, setAdminStatusLoaded] = useState(false);
  const [adminStatusError, setAdminStatusError] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [feedbackItems, setFeedbackItems] = useState<CourseFeedbackSubmissionWithCourse[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<'all' | FeedbackStatus>('pending');
  const [feedbackTypeFilter, setFeedbackTypeFilter] = useState<'all' | FeedbackSubmissionType>('all');
  const [feedbackSearchQuery, setFeedbackSearchQuery] = useState('');
  const [feedbackReviewNotes, setFeedbackReviewNotes] = useState<Record<number, string>>({});
  const [processingFeedbackIds, setProcessingFeedbackIds] = useState<number[]>([]);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);
  const debouncedFeedbackSearchQuery = useDebouncedValue(feedbackSearchQuery, 250);
  const accessToken = session?.access_token || '';

  useEffect(() => {
    if (!supabaseAuth || !isSupabaseAuthConfigured) {
      setAuthMessage('请先配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY。');
      setAuthReady(true);
      setAuthChecking(false);
      setLoading(false);
      return;
    }

    let active = true;
    supabaseAuth.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('Failed to load admin session:', error);
        setAuthMessage('加载登录状态失败，请刷新后重试。');
      } else {
        setSession(data.session);
      }
      setAuthReady(true);
      setAuthChecking(false);
    });

    const { data } = supabaseAuth.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!accessToken) {
      setIsAdminAuthorized(false);
      setAdminStatusLoaded(false);
      setAdminStatusError('');
      setAdminEmail('');
      setCourses([]);
      setFeedbackItems([]);
      setTotalEntries(0);
      setLoading(false);
      setAuthChecking(false);
      return;
    }

    fetchAdminStatus(accessToken);
  }, [accessToken, authReady]);

  useEffect(() => {
    if (!isAdminAuthorized || !accessToken) {
      setCourses([]);
      setHasMoreCourses(false);
      setTotalEntries(0);
      setLoading(false);
      return;
    }

    fetchCourses({ reset: true, query: debouncedSearchQuery });
  }, [accessToken, debouncedSearchQuery, isAdminAuthorized]);

  useEffect(() => {
    if (!isAdminAuthorized || !accessToken) {
      setFeedbackItems([]);
      return;
    }
    fetchFeedbackItems();
  }, [accessToken, debouncedFeedbackSearchQuery, feedbackStatusFilter, feedbackTypeFilter, isAdminAuthorized]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('admin_upload_logs');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setUploadLogs(parsed);
      }
    } catch (error) {
      console.error('Failed to load upload logs:', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('admin_upload_logs', JSON.stringify(uploadLogs));
  }, [uploadLogs]);

  async function fetchAdminStatus(token: string) {
    try {
      setAuthChecking(true);
      setAdminStatusError('');
      const result = await fetchJsonWithAuth<AdminStatusResponse>('/api/admin/status', token);
      setIsAdminAuthorized(Boolean(result.isAdmin));
      setAdminStatusLoaded(true);
      setAdminEmail(result.email || '');
      setAuthMessage(result.isAdmin ? '' : '当前登录账号没有后台权限。');
    } catch (error) {
      console.error('Failed to load admin status:', error);
      setIsAdminAuthorized(false);
      setAdminStatusLoaded(false);
      setAdminStatusError('管理员身份校验失败，请检查网络后重新登录。');
      setAdminEmail('');
    } finally {
      setAuthChecking(false);
    }
  }

  async function fetchCourses(options: { reset?: boolean; query?: string } = {}) {
    if (!accessToken) return;

    const { reset = false, query = '' } = options;

    if (reset) {
      setLoading(true);
      setHasMoreCourses(false);
    } else {
      setIsFetchingMoreCourses(true);
    }

    const page = reset ? 1 : Math.floor(courses.length / ADMIN_PAGE_SIZE) + 1;

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(ADMIN_PAGE_SIZE),
      });
      if (query.trim()) {
        params.set('q', query.trim());
      }

      const result = await fetchJsonWithAuth<AdminCoursesResponse>(
        `/api/admin/courses?${params.toString()}`,
        accessToken,
      );

      const normalizedData = (result.data || []).map((item) => ({
        ...item,
        campus: normalizeCampus(item.campus),
        semester: item.semester || DEFAULT_SEMESTER,
      }));

      setCourses((prev) => {
        const merged = reset ? normalizedData : [...prev, ...normalizedData];
        return Array.from(new Map(merged.map((item) => [item.id, item])).values());
      });
      setHasMoreCourses(Boolean(result.pagination?.hasMore));
      setTotalEntries(result.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to load courses:', error);
      showToast('加载失败', 'error');
    } finally {
      setLoading(false);
      setIsFetchingMoreCourses(false);
    }
  }

  async function fetchFeedbackItems() {
    if (!accessToken) return;

    try {
      setFeedbackLoading(true);
      const result = await fetchJsonWithAuth<{ success: boolean; data: CourseFeedbackSubmissionWithCourse[] }>(
        '/api/course-feedback-submissions/admin/list',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: feedbackStatusFilter,
            submissionType: feedbackTypeFilter,
            query: debouncedFeedbackSearchQuery,
          }),
        },
      );
      setFeedbackItems(result.data || []);
    } catch (error: any) {
      setFeedbackItems([]);
      showToast(error.message || '加载反馈失败', 'error');
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function handleFeedbackReview(submissionId: number, action: 'approve' | 'reject') {
    if (!accessToken) {
      showToast('请先登录后台', 'error');
      return;
    }

    try {
      setProcessingFeedbackIds((prev) => [...prev, submissionId]);
      await fetchJsonWithAuth<{ success: boolean }>(
        '/api/course-feedback-submissions/admin/review',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId,
            action,
            reviewNote: feedbackReviewNotes[submissionId] || '',
          }),
        },
      );

      showToast(action === 'approve' ? '已通过该条反馈' : '已拒绝该条反馈', 'success');
      setFeedbackReviewNotes((prev) => {
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });
      fetchFeedbackItems();
      fetchCourses();
    } catch (error: any) {
      showToast(error.message || '审核失败', 'error');
    } finally {
      setProcessingFeedbackIds((prev) => prev.filter((id) => id !== submissionId));
    }
  }

  function handleLoadMoreCourses() {
    if (loading || isFetchingMoreCourses || !hasMoreCourses || debouncedSearchQuery.trim()) return;
    fetchCourses({ reset: false, query: '' });
  }

  function showToast(message: string, type: 'success' | 'error') {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }

  function appendUploadLog(entry: UploadLogEntry) {
    setUploadLogs((prev) => [entry, ...prev].slice(0, 20));
  }

  function handlePreview() {
    try {
      const parsed = JSON.parse(batchJson);
      const rawItems = Array.isArray(parsed) ? parsed : [parsed];
      
      // Transform Everytime data structure to our schema
      const dataToPreview = rawItems.map(item => {
        // If it's already in our format, return as is
        if (item.course_name && !item.course_info) {
          const { id: _ignoredId, ...rest } = item;
          return {
            ...rest,
            campus: normalizeCampus(item.campus),
            semester: item.semester || DEFAULT_SEMESTER,
          };
        }

        const info = item.course_info || {};
        const stats = item.basic_stats || {};
        
        // Aggregate reviews into pros/cons/advice
        let pros: string[] = item.pros || [];
        let cons: string[] = item.cons || [];
        let advice = item.advice || '';

        if (item.reviews && item.reviews.length > 0 && (!item.pros || item.pros.length === 0)) {
          advice = item.reviews[0].text;
          pros = item.reviews
            .filter((r: any) => parseInt(r.rating) >= 80)
            .slice(0, 3)
            .map((r: any) => r.text.length > 60 ? r.text.substring(0, 60) + '...' : r.text);
          cons = item.reviews
            .filter((r: any) => parseInt(r.rating) <= 40)
            .slice(0, 3)
            .map((r: any) => r.text.length > 60 ? r.text.substring(0, 60) + '...' : r.text);
        }

        return {
          course_code: info['학수번호'] || item.course_code || '',
          course_name: info['교과목명'] || item.course_name || '未知课程',
          professor: info['교강사'] || item.professor || '未知教授',
          campus: normalizeCampus(item.campus || info['캠퍼스'] || info['campus']),
          semester: item.semester || info['학기'] || DEFAULT_SEMESTER,
          course_type: info['이수구분'] || item.course_type || '',
          grade_and_credit: info['학년'] && info['학점'] ? `${info['학년']}学年 / ${info['학점']}学分` : (item.grade_and_credit || '3学分'),
          class_time: info['시간'] || item.class_time || '',
          classroom: info['강의실'] || item.classroom || '',
          overall_score: item.overall_rating || item.overall_score || 0,
          pros: pros,
          cons: cons,
          advice: advice || '',
          assignment: normalizeAssignment(stats.assignment || item.assignment),
          team_project: normalizeTeamProject(stats.team_project || item.team_project),
          grading: normalizeGrading(stats.grading || item.grading),
          attendance: normalizeAttendance(stats.attendance || item.attendance),
          exam_count: normalizeExamCount(stats.exam_count || item.exam_count)
        };
      });

      const preview: PreviewItem[] = dataToPreview.map((newItem: any) => {
        const existing = courses.find((c) => {
          return getCourseIdentityKey(c) === getCourseIdentityKey(newItem);
        });

        if (!existing) return { item: newItem, status: 'new' };
        
        const diff: { field: string; old: any; new: any }[] = [];
        const fieldsToCompare = [
          'campus',
          'semester',
          'course_code',
          'course_name_ko_raw',
          'course_type',
          'grade_and_credit',
          'class_time',
          'classroom',
          'overall_score',
          'advice',
          'pros',
          'cons',
          'assignment',
          'team_project',
          'grading',
          'attendance',
          'exam_count',
          'category_top',
          'category_paths',
          'category_colleges',
          'category_departments',
          'category_leaves',
          'primary_category_path',
        ];
        
        fieldsToCompare.forEach(field => {
          const oldVal = (existing as any)[field];
          let newVal = (newItem as any)[field];
          
          if (field === 'overall_score') newVal = Number(newVal);
          
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            diff.push({ field, old: oldVal, new: newVal });
          }
        });

        if (diff.length === 0) return { item: newItem, status: 'duplicate' };
        
        return { 
          item: { ...newItem, id: existing.id }, // Keep existing ID for update
          status: 'update',
          diff
        };
      });

      setPreviewData(preview);
      setExpandedDiffs([]);
    } catch (err) {
      showToast('JSON 格式错误', 'error');
    }
  }

  async function handleBatchUpload() {
    if (!previewData) return;
    if (!accessToken) {
      showToast('请先登录后台', 'error');
      return;
    }
    
    const newItems = previewData
      .filter(p => p.status === 'new')
      .map((p) => {
        const { id, ...rest } = p.item as any;
        return rest;
      });
    const updateItems = previewData.filter(p => p.status === 'update').map(p => p.item);
    const duplicateSkipped = previewData.filter(p => p.status === 'duplicate').length;
    const total = newItems.length + updateItems.length;

    if (total === 0) {
      showToast('没有新数据或需要更新的数据', 'error');
      return;
    }

    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    let current = 0;
    const failedItems: string[] = [];
    const INSERT_CHUNK_SIZE = 200;

    try {
      setLoading(true);
      setUploadProgress({ current, total });

      // Handle inserts in chunks. If a chunk fails, fallback to row-by-row.
      for (const chunk of chunkArray(newItems, INSERT_CHUNK_SIZE)) {
        try {
          await fetchJsonWithAuth<{ success: boolean }>(
            '/api/publish',
            accessToken,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'course_reviews',
                data: chunk,
                returnData: false,
              }),
            },
          );
          current += chunk.length;
          setUploadProgress({ current, total });
          continue;
        } catch {
          // fallback to single-row retry below
        }

        // fallback: single row upload to avoid one bad row blocking all
        for (const item of chunk) {
          try {
            await fetchJsonWithAuth<{ success: boolean }>(
              '/api/publish',
              accessToken,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  table: 'course_reviews',
                  data: item,
                  returnData: false,
                }),
              },
            );
          } catch (singleError: any) {
            const itemName = `${item.course_name || '未知课程'} (${item.professor || '未知教授'})`;
            failedItems.push(`${itemName}: ${singleError.message || '上传失败'}`);
          }
          current += 1;
          setUploadProgress({ current, total });
        }
      }

      // Handle updates (continue on error; don't stop whole batch)
      for (const item of updateItems) {
        const { id, ...updateData } = item;
        try {
          await fetchJsonWithAuth<{ success: boolean }>(
            '/api/publish',
            accessToken,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'course_reviews',
                data: updateData,
                id,
                returnData: false,
              }),
            },
          );
        } catch (updateError: any) {
          const itemName = `${item.course_name || '未知课程'} (${item.professor || '未知教授'})`;
          failedItems.push(`${itemName}: ${updateError.message || '更新失败'}`);
        }

        current += 1;
        setUploadProgress({ current, total });
      }

      const failedCount = failedItems.length;
      const successCount = Math.max(current - failedCount, 0);
      appendUploadLog({
        id: uploadId,
        createdAt: startedAt,
        newCount: newItems.length,
        updateCount: updateItems.length,
        duplicateSkipped,
        totalPlanned: total,
        processedCount: current,
        successCount,
        failedCount,
        failedItems,
        status: failedCount > 0 ? 'partial' : 'success',
      });

      if (failedItems.length > 0) {
        console.error('Batch upload partial failures:', failedItems);
        showToast(`已处理 ${successCount}/${total} 条，失败 ${failedItems.length} 条（详情见控制台）`, 'error');
      } else {
        showToast(`成功处理 ${newItems.length} 条新增, ${updateItems.length} 条更新`, 'success');
      }
      setBatchJson('');
      setPreviewData(null);
      fetchCourses();
    } catch (err: any) {
      const failedCount = failedItems.length;
      const successCount = Math.max(current - failedCount, 0);
      const errorMessage = err?.message || '同步失败';
      appendUploadLog({
        id: uploadId,
        createdAt: startedAt,
        newCount: newItems.length,
        updateCount: updateItems.length,
        duplicateSkipped,
        totalPlanned: total,
        processedCount: current,
        successCount,
        failedCount,
        failedItems,
        status: 'failed',
        errorMessage,
      });
      console.error('Batch upload error:', err);
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  }

  async function handleAICheckDuplicates() {
    if (!previewData || isAIChecking || !accessToken) return;
    setIsAIChecking(true);

    try {
      const pendingCourses = previewData
        .filter((item) => item.status === 'new')
        .map((item) => item.item);
      const result = await fetchJsonWithAuth<{ success: boolean; data: Array<{ index: number; is_duplicate: boolean; reason: string; confidence: number }> }>(
        '/api/admin/duplicate-check',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            existingCourses: courses,
            pendingCourses,
          }),
        },
      );

      const newData = [...previewData];
      const newItems = newData.filter(p => p.status === 'new');
      
      result.data.forEach((res: any) => {
        if (newItems[res.index]) {
          newItems[res.index].ai_duplicate_check = res;
        }
      });
      
      setPreviewData(newData);
      showToast('AI 重复检查完成', 'success');
    } catch (err) {
      console.error('AI Check Error:', err);
      showToast('AI 检查失败', 'error');
    } finally {
      setIsAIChecking(false);
    }
  }

  function updatePreviewItem(status: 'new' | 'update', index: number, field: string, value: any) {
    if (!previewData) return;
    const newData = [...previewData];
    const items = newData.filter(p => p.status === status);
    if (items[index]) {
      (items[index].item as any)[field] = value;
      // If it's an update, we might need to update the diff as well, but for simplicity we just update the item
      setPreviewData(newData);
    }
  }

  function handleDelete(id: number) {
    if (!accessToken) {
      showToast('请先登录后台', 'error');
      return;
    }
    setConfirmConfig({
      title: '确认删除',
      message: '确定要删除这条记录吗？此操作不可撤销。',
      onConfirm: async () => {
        try {
          await fetchJsonWithAuth<{ success: boolean }>(
            '/api/publish',
            accessToken,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'course_reviews',
                action: 'delete',
                id,
              }),
            },
          );
          
          showToast('删除成功', 'success');
          setSelectedIds(prev => prev.filter(sid => sid !== id));
          fetchCourses();
        } catch (err: any) {
          showToast(err.message || '删除失败', 'error');
        }
        setConfirmConfig(null);
      }
    });
  }

  function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    if (!accessToken) {
      showToast('请先登录后台', 'error');
      return;
    }
    setConfirmConfig({
      title: '批量删除',
      message: `确定要批量删除选中的 ${selectedIds.length} 条记录吗？`,
      onConfirm: async () => {
        try {
          await fetchJsonWithAuth<{ success: boolean }>(
            '/api/publish',
            accessToken,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                table: 'course_reviews',
                action: 'delete',
                ids: selectedIds,
              }),
            },
          );

          showToast(`成功删除 ${selectedIds.length} 条数据`, 'success');
          setSelectedIds([]);
          fetchCourses();
        } catch (err: any) {
          showToast(err.message || '批量删除失败', 'error');
        }
        setConfirmConfig(null);
      }
    });
  }

  function toggleSelectAll() {
    if (selectedIds.length === filteredCourses.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredCourses.map(c => c.id!).filter(id => id !== undefined));
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  }

  async function handleUpdate() {
    if (!editingCourse || !editingCourse.id) return;
    if (!accessToken) {
      showToast('请先登录后台', 'error');
      return;
    }
    
    const courseCode = (editingCourse.course_code || '').trim();

    // Strict type safety for overall_score
    const score = Number(editingCourse.overall_score);
    if (isNaN(score) || score < 0 || score > 5) {
      showToast('评分必须是 0-5 之间的有效数字', 'error');
      return;
    }

    try {
      await fetchJsonWithAuth<{ success: boolean }>(
        '/api/publish',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'course_reviews',
            id: editingCourse.id,
            data: {
              course_code: courseCode,
              course_name: editingCourse.course_name,
              course_name_ko_raw: editingCourse.course_name_ko_raw || null,
              professor: editingCourse.professor,
              campus: normalizeCampus(editingCourse.campus),
              semester: editingCourse.semester || DEFAULT_SEMESTER,
              course_type: editingCourse.course_type || '',
              grade_and_credit: editingCourse.grade_and_credit || '',
              class_time: editingCourse.class_time || '',
              classroom: editingCourse.classroom || '',
              overall_score: score,
              pros: Array.isArray(editingCourse.pros) ? editingCourse.pros : [],
              cons: Array.isArray(editingCourse.cons) ? editingCourse.cons : [],
              advice: editingCourse.advice,
              assignment: editingCourse.assignment || '待补充',
              team_project: editingCourse.team_project || '待补充',
              grading: editingCourse.grading || '待补充',
              attendance: editingCourse.attendance || '待补充',
              exam_count: editingCourse.exam_count || '待补充',
              category_top: editingCourse.category_top || null,
              category_paths: Array.isArray(editingCourse.category_paths) ? editingCourse.category_paths : [],
              category_colleges: Array.isArray(editingCourse.category_colleges) ? editingCourse.category_colleges : [],
              category_departments: Array.isArray(editingCourse.category_departments) ? editingCourse.category_departments : [],
              category_leaves: Array.isArray(editingCourse.category_leaves) ? editingCourse.category_leaves : [],
              primary_category_path: editingCourse.primary_category_path || null,
            }
          }),
        },
      );

      showToast('更新成功', 'success');
      setIsModalOpen(false);
      fetchCourses();
    } catch (err: any) {
      showToast(err.message || '更新失败', 'error');
    }
  }

  const filteredCourses = courses.filter(
    (c) =>
      ((c.course_name || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      (c.course_code || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      (c.professor || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
  );

  // Duplicate detection logic
  const duplicateGroups = courses.reduce((acc, course) => {
    const key = getCourseIdentityKey(course);
    if (!acc[key]) acc[key] = [];
    acc[key].push(course);
    return acc;
  }, {} as Record<string, CourseReview[]>);

  const duplicateIds = Object.keys(duplicateGroups)
    .filter(key => duplicateGroups[key].length > 1)
    .flatMap(key => duplicateGroups[key].map(c => c.id!));

  const displayCourses = showOnlyDuplicates 
    ? filteredCourses.filter(c => duplicateIds.includes(c.id!))
    : filteredCourses;

  // Grouping logic
  const groupedData = displayCourses.reduce((acc, course) => {
    const groupKey = getCourseDisplayGroupKey(course);
    
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(course);
    return acc;
  }, {} as Record<string, CourseReview[]>);

  // Logic for counting unique courses by the same identity used for dedupe/matching.
  const uniqueCoursesCount = React.useMemo(() => {
    const uniqueCodes = new Set<string>();
    courses.forEach(c => {
      uniqueCodes.add(getCourseDisplayGroupKey(c));
    });
    return uniqueCodes.size;
  }, [courses]);

  const totalUniqueSubjects = uniqueCoursesCount;
  const feedbackTypeLabels: Record<FeedbackSubmissionType, string> = {
    review: '写评价',
    supplement: '补充信息',
    correction: '更正信息',
  };

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  async function handleSignInWithPassword() {
    if (!supabaseAuth) {
      showToast('Supabase Auth 尚未配置', 'error');
      return;
    }

    const email = emailInput.trim().toLowerCase();
    const password = passwordInput;
    if (!email) {
      showToast('请输入管理员邮箱', 'error');
      return;
    }
    if (!password) {
      showToast('请输入管理员密码', 'error');
      return;
    }

    try {
      setAuthChecking(true);
      setAuthMessage('');
      setAdminStatusError('');
      const { error } = await supabaseAuth.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      setAuthMessage(`已使用 ${email} 登录，正在校验管理员权限。`);
    } catch (error: any) {
      console.error('Failed to sign in with password:', error);
      setAuthMessage(error.message || '登录失败，请检查邮箱和密码');
    } finally {
      setAuthChecking(false);
    }
  }

  async function handleSignOut() {
    if (!supabaseAuth) return;

    await supabaseAuth.auth.signOut();
    setSession(null);
    setIsAdminAuthorized(false);
    setAdminStatusLoaded(false);
    setAdminStatusError('');
    setAdminEmail('');
    setPasswordInput('');
    setAuthMessage('');
    setCourses([]);
    setFeedbackItems([]);
    setTotalEntries(0);
  }

  if (!authReady || authChecking) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans safe-top">
        <div className="max-w-xl mx-auto pt-16">
          <div className="rounded-[2rem] border border-gray-200 bg-white p-8 shadow-sm">
            <div className="flex items-center gap-3 text-gray-900">
              <Loader2 size={20} className="animate-spin text-indigo-600" />
              <span className="text-sm font-bold">正在校验后台登录状态...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session || !isAdminAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans safe-top">
        <div className="max-w-xl mx-auto pt-10 space-y-6">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 shadow-sm transition-all active:scale-95"
          >
            <ArrowLeft size={18} />
            返回前端
          </button>

          <div className="rounded-[2rem] border border-gray-200 bg-white p-8 shadow-sm space-y-6">
            <div className="space-y-2">
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">CMS 后台登录</h1>
              <p className="text-sm font-medium text-gray-500">
                使用管理员邮箱和密码登录。登录成功后，后台接口会再检查邮箱白名单授权。
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="管理员邮箱"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="管理员密码"
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500/20"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSignInWithPassword();
                  }
                }}
              />
              <button
                onClick={handleSignInWithPassword}
                disabled={authChecking || !isSupabaseAuthConfigured}
                className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white transition-all disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                登录后台
              </button>
            </div>

            {session && adminStatusLoaded && !isAdminAuthorized ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
                当前登录账号 {adminEmail || session.user.email || '未知邮箱'} 没有后台权限。
              </div>
            ) : null}

            {authMessage ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                {authMessage}
              </div>
            ) : null}

            {adminStatusError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {adminStatusError}
              </div>
            ) : null}

            {session ? (
              <button
                onClick={handleSignOut}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700"
              >
                退出当前登录
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans safe-top">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/')}
              className="p-3 bg-white hover:bg-gray-100 text-gray-600 rounded-2xl shadow-sm border border-gray-200 transition-all active:scale-95"
              title="返回前端"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">CMS 后台管理</h1>
              <p className="text-gray-500 font-medium">管理你的选课数据库内容</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700">
              {adminEmail || session.user.email || '已登录'}
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl shadow-sm border border-gray-200">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-gray-700">数据库已连接</span>
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700"
            >
              退出登录
            </button>
          </div>
        </header>

        {/* Stats Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">总数据量 (Entries)</p>
            <h3 className="text-3xl font-black text-indigo-600">{totalEntries}</h3>
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">唯一开课记录 (Sections)</p>
            <h3 className="text-3xl font-black text-emerald-600">{totalUniqueSubjects}</h3>
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">今日更新</p>
            <h3 className="text-3xl font-black text-amber-600">
              {courses.filter(c => {
                const today = new Date().toISOString().split('T')[0];
                return c.created_at?.startsWith(today);
              }).length}
            </h3>
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">待补充项</p>
            <h3 className="text-3xl font-black text-rose-600">
              {courses.filter(c => c.advice === '待补充' || c.attendance === '待补充').length}
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Batch Upload */}
          <section className="lg:col-span-1 space-y-4">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-indigo-600 font-bold">
                  <Upload size={20} />
                  <h2>极速批量上传</h2>
                </div>
                {previewData && (
                  <button 
                    onClick={() => setPreviewData(null)}
                    className="text-xs text-gray-400 hover:text-gray-600 font-bold"
                  >
                    重置
                  </button>
                )}
              </div>

              {!previewData ? (
                <>
                  <textarea
                    className="w-full h-64 p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-mono text-sm"
                    placeholder='粘贴 JSON 对象或数组...'
                    value={batchJson}
                    onChange={(e) => setBatchJson(e.target.value)}
                  />
                  <button
                    onClick={handlePreview}
                    className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 active:scale-[0.98]"
                  >
                    <Search size={20} />
                    比对并预览
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="max-h-[500px] overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                    {/* AI Check Button */}
                    {previewData.some(p => p.status === 'new') && (
                      <button
                        onClick={handleAICheckDuplicates}
                        disabled={isAIChecking}
                        className="w-full mb-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-indigo-100 transition-all"
                      >
                        {isAIChecking ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        AI 智能查重 (Gemini 3.1 Flash Lite)
                      </button>
                    )}

                    {/* New Items Section */}
                    {previewData.some(p => p.status === 'new') && (
                      <div className="space-y-2">
                        <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest px-1">完全新增 ({previewData.filter(p => p.status === 'new').length})</h3>
                        {previewData.filter(p => p.status === 'new').map((p, idx) => (
                          <div key={`new-${idx}`} className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <input 
                                  className="text-sm font-bold bg-transparent border-none p-0 focus:ring-0 w-full"
                                  value={p.item.course_name}
                                  onChange={(e) => updatePreviewItem('new', idx, 'course_name', e.target.value)}
                                />
                                <input 
                                  className="text-xs text-gray-500 bg-transparent border-none p-0 focus:ring-0 w-full"
                                  value={p.item.professor}
                                  onChange={(e) => updatePreviewItem('new', idx, 'professor', e.target.value)}
                                />
                                <p className="text-[10px] text-gray-400 font-medium">
                                  {p.item.campus === 's' ? '首尔' : 'ERICA'} · {p.item.semester}
                                </p>
                              </div>
                              <span className="bg-emerald-100 text-emerald-600 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0">新增</span>
                            </div>
                            {p.ai_duplicate_check && (
                              <div className={cn(
                                "p-2 rounded-lg text-[10px] font-bold flex items-center gap-2",
                                p.ai_duplicate_check.is_duplicate ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
                              )}>
                                {p.ai_duplicate_check.is_duplicate ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
                                <span>AI 判定: {p.ai_duplicate_check.is_duplicate ? '疑似重复' : '唯一课程'} ({Math.round(p.ai_duplicate_check.confidence * 100)}%)</span>
                                {p.ai_duplicate_check.is_duplicate && <p className="text-[9px] opacity-70 ml-auto">{p.ai_duplicate_check.reason}</p>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Updated Items Section */}
                    {previewData.some(p => p.status === 'update') && (
                      <div className="space-y-2">
                        <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest px-1">有更新内容 ({previewData.filter(p => p.status === 'update').length})</h3>
                        {previewData.filter(p => p.status === 'update').map((p, idx) => {
                          const isExpanded = expandedDiffs.includes(idx);
                          return (
                            <div key={`update-${idx}`} className="bg-amber-50/50 rounded-xl border border-amber-100 overflow-hidden">
                              <div 
                                className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-100/30 transition-colors"
                                onClick={() => setExpandedDiffs(prev => isExpanded ? prev.filter(i => i !== idx) : [...prev, idx])}
                              >
                                <div className="min-w-0 flex-1">
                                  <input 
                                    className="text-sm font-bold bg-transparent border-none p-0 focus:ring-0 w-full"
                                    value={p.item.course_name}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updatePreviewItem('update', idx, 'course_name', e.target.value)}
                                  />
                                  <input 
                                    className="text-xs text-gray-500 bg-transparent border-none p-0 focus:ring-0 w-full"
                                    value={p.item.professor}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => updatePreviewItem('update', idx, 'professor', e.target.value)}
                                  />
                                  <p className="text-[10px] text-gray-400 font-medium">
                                    {p.item.campus === 's' ? '首尔' : 'ERICA'} · {p.item.semester}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="bg-amber-100 text-amber-600 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">更新</span>
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </div>
                              </div>
                              {isExpanded && p.diff && (
                                <div className="px-3 pb-3 pt-1 space-y-2 border-t border-amber-100/50">
                                  {p.diff.map((d, dIdx) => (
                                    <div key={dIdx} className="text-[11px] space-y-1">
                                      <p className="font-black text-amber-700 uppercase tracking-tighter">{d.field}</p>
                                      <div className="grid grid-cols-1 gap-2">
                                        <div className="p-1.5 bg-rose-50 rounded border border-rose-100 text-rose-600" title={String(d.old)}>
                                          <span className="opacity-50 mr-2">旧:</span>{String(d.old)}
                                        </div>
                                        <textarea 
                                          className="w-full p-1.5 bg-emerald-50 rounded border border-emerald-100 text-emerald-600 outline-none focus:ring-1 focus:ring-emerald-500"
                                          value={String((p.item as any)[d.field])}
                                          onChange={(e) => updatePreviewItem('update', idx, d.field, e.target.value)}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Duplicates Section */}
                    {previewData.some(p => p.status === 'duplicate') && (
                      <div className="space-y-2">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">重复数据 ({previewData.filter(p => p.status === 'duplicate').length})</h3>
                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                          <p className="text-xs text-gray-400 font-medium">已自动过滤重复项</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {uploadProgress && (
                    <div className="space-y-2 px-1">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-indigo-600">
                        <span>同步进度 Syncing...</span>
                        <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-indigo-600"
                          initial={{ width: 0 }}
                          animate={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-gray-400 font-bold text-center">
                        正在处理 {uploadProgress.current} / {uploadProgress.total} 条数据
                      </p>
                    </div>
                  )}
                  <button
                    onClick={handleBatchUpload}
                    disabled={loading || !previewData.some(p => p.status !== 'duplicate')}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    确认并同步
                  </button>
                </div>
              )}

              {uploadLogs.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">上传日志</h3>
                    <button
                      onClick={() => setUploadLogs([])}
                      className="text-[10px] font-bold text-gray-400 hover:text-gray-600"
                    >
                      清空日志
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-hide">
                    {uploadLogs.map((log) => (
                      <div key={log.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50/80 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-black text-gray-500">
                            {new Date(log.createdAt).toLocaleString('zh-CN', { hour12: false })}
                          </p>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest",
                              log.status === 'success' && "bg-emerald-100 text-emerald-600",
                              log.status === 'partial' && "bg-amber-100 text-amber-700",
                              log.status === 'failed' && "bg-rose-100 text-rose-600"
                            )}
                          >
                            {log.status === 'success' ? '成功' : log.status === 'partial' ? '部分失败' : '失败'}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold text-gray-700">
                          计划 {log.totalPlanned} 条（新增 {log.newCount} / 更新 {log.updateCount} / 跳过重复 {log.duplicateSkipped}）
                        </p>
                        <p className="text-[11px] text-gray-500 font-medium">
                          已处理 {log.processedCount}，成功 {log.successCount}，失败 {log.failedCount}
                        </p>
                        {log.errorMessage && (
                          <p className="text-[10px] text-rose-600 font-medium">错误：{log.errorMessage}</p>
                        )}
                        {log.failedItems.length > 0 && (
                          <div className="pt-1 space-y-1">
                            {log.failedItems.slice(0, 5).map((item, idx) => (
                              <p key={`${log.id}-failed-${idx}`} className="text-[10px] text-rose-600 break-words">
                                - {item}
                              </p>
                            ))}
                            {log.failedItems.length > 5 && (
                              <p className="text-[10px] text-gray-400">还有 {log.failedItems.length - 5} 条失败详情未展开</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Right: Data Management */}
          <section className="lg:col-span-2 space-y-4">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-200 h-[70vh] min-h-[560px] max-h-[920px] flex flex-col">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2 text-gray-900 font-bold">
                  <Edit3 size={20} />
                  <h2>数据管理区</h2>
                  {duplicateIds.length > 0 && (
                    <button
                      onClick={() => {
                        setShowOnlyDuplicates(!showOnlyDuplicates);
                        if (!showOnlyDuplicates) {
                          // Expand groups that have duplicates
                          const groupsWithDupes = displayCourses
                            .filter(c => duplicateIds.includes(c.id!))
                            .map(c => getCourseIdentityKey(c));
                          setExpandedGroups(Array.from(new Set([...expandedGroups, ...groupsWithDupes])));
                        }
                      }}
                      className={cn(
                        "ml-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1",
                        showOnlyDuplicates 
                          ? "bg-rose-600 text-white shadow-lg shadow-rose-200" 
                          : "bg-rose-100 text-rose-600 hover:bg-rose-200"
                      )}
                    >
                      <AlertCircle size={12} />
                      发现 {duplicateIds.length} 条重复录入
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="搜索课程或教授..."
                    className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none w-full md:w-64"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex-1 flex items-center justify-center py-20">
                  <Loader2 className="animate-spin text-indigo-600" size={32} />
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4 scrollbar-hide">
                  {Object.entries(groupedData).map(([groupKey, data]) => {
                    const professorCourses = data as CourseReview[];
                    const isExpanded = expandedGroups.includes(groupKey);
                    const groupSelectedCount = professorCourses.filter(c => selectedIds.includes(c.id!)).length;
                    const isAllGroupSelected = groupSelectedCount === professorCourses.length;
                    
                    const representativeCourse = professorCourses[0];
                    const actualCourseName = representativeCourse.course_name || groupKey;
                    const split = splitCourseName(actualCourseName);
                    const original = split.original;
                    const translation = split.translation;
                    const displayName = translation ? `${original} (${translation})` : original;

                    return (
                      <div key={groupKey} className="bg-gray-50/50 rounded-[1.5rem] border border-gray-100 overflow-hidden">
                        <div 
                          className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-gray-100/50 transition-colors"
                          onClick={() => toggleGroup(groupKey)}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              checked={isAllGroupSelected}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => {
                                const ids = professorCourses.map(c => c.id!);
                                if (isAllGroupSelected) {
                                  setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
                                } else {
                                  setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
                                }
                              }}
                            />
                            <div className="min-w-0">
                              <h3 className="text-lg font-black text-gray-900 truncate">{displayName}</h3>
                              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                                {professorCourses.length} 条记录
                              </p>
                              <p className="text-[10px] text-gray-400 font-medium">
                                {representativeCourse.campus === 's' ? '首尔校区' : 'ERICA 校区'} · {representativeCourse.semester}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {groupSelectedCount > 0 && (
                              <span className="bg-indigo-100 text-indigo-600 px-2 py-1 rounded-lg text-[10px] font-black">
                                已选 {groupSelectedCount}
                              </span>
                            )}
                            {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                          </div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-gray-100 bg-white"
                            >
                              <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                  <thead className="bg-gray-50/30">
                                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                      <th className="px-6 py-3 w-10"></th>
                                      <th className="px-6 py-3">代码/教授</th>
                                      <th className="px-6 py-3">类型/学分</th>
                                      <th className="px-6 py-3">评分</th>
                                      <th className="px-6 py-3">出勤/考试</th>
                                      <th className="px-6 py-3 text-right">操作</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                    {professorCourses.map((course) => (
                                      <tr key={course.id} className={cn(
                                        "hover:bg-gray-50/50 transition-colors group",
                                        selectedIds.includes(course.id!) && "bg-indigo-50/20",
                                        duplicateIds.includes(course.id!) && "border-l-4 border-l-rose-500"
                                      )}>
                                        <td className="px-6 py-4">
                                          <input 
                                            type="checkbox" 
                                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            checked={selectedIds.includes(course.id!)}
                                            onChange={() => toggleSelect(course.id!)}
                                          />
                                        </td>
                                        <td className="px-6 py-4">
                                          <p className="font-bold text-gray-900 whitespace-nowrap">{course.professor}</p>
                                          <p className="text-[10px] text-gray-400 font-mono">{course.course_code || '无代码'}</p>
                                          <p className="text-[10px] text-gray-400 font-medium">
                                            {course.campus === 's' ? '首尔' : 'ERICA'} · {course.semester}
                                          </p>
                                        </td>
                                        <td className="px-6 py-4">
                                          <p className="text-xs font-bold text-gray-700">{course.course_type || '未知'}</p>
                                          <p className="text-[10px] text-gray-400">{course.grade_and_credit || '3学分'}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                          <span className="bg-gray-100 px-2 py-1 rounded-lg font-mono font-bold text-indigo-600 text-xs">
                                            {course.overall_score}
                                          </span>
                                        </td>
                                        <td className="px-6 py-4">
                                          <div className="flex flex-col gap-1">
                                            <span className="text-[10px] text-gray-500 font-medium">出勤: {course.attendance}</span>
                                            <span className="text-[10px] text-gray-500 font-medium">考试: {course.exam_count}</span>
                                          </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                          <div className="flex items-center justify-end gap-1">
                                            <button
                                              onClick={() => {
                                                setEditingCourse({
                                                  ...course,
                                                  campus: normalizeCampus(course.campus),
                                                  semester: course.semester || DEFAULT_SEMESTER,
                                                  assignment: normalizeAssignment(course.assignment),
                                                  team_project: normalizeTeamProject(course.team_project),
                                                  grading: normalizeGrading(course.grading),
                                                  attendance: normalizeAttendance(course.attendance),
                                                  exam_count: normalizeExamCount(course.exam_count)
                                                });
                                                setIsModalOpen(true);
                                              }}
                                              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                            >
                                              <Edit3 size={16} />
                                            </button>
                                            <button
                                              onClick={() => handleDelete(course.id!)}
                                              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                  
                  {filteredCourses.length === 0 && (
                    <div className="text-center py-20 text-gray-400">
                      <Search size={48} className="mx-auto mb-4 opacity-20" />
                      <p className="font-bold">暂无匹配数据</p>
                    </div>
                  )}

                  {!debouncedSearchQuery.trim() && hasMoreCourses && (
                    <div className="flex justify-center pt-2 pb-2">
                      <button
                        onClick={handleLoadMoreCourses}
                        disabled={loading || isFetchingMoreCourses}
                        className="px-5 py-2.5 bg-gray-900 text-white rounded-2xl font-bold text-sm disabled:opacity-50"
                      >
                        {isFetchingMoreCourses ? '加载中...' : '加载更多课程'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2 text-gray-900 font-bold">
                  <MessageSquare size={20} />
                  <h2>用户反馈审核</h2>
                  <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest">
                    {feedbackItems.length} 条
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="搜索课程 / 教授 / 课号"
                      className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none w-full sm:w-60"
                      value={feedbackSearchQuery}
                      onChange={(e) => setFeedbackSearchQuery(e.target.value)}
                    />
                  </div>
                  <select
                    value={feedbackStatusFilter}
                    onChange={(e) => setFeedbackStatusFilter(e.target.value as 'all' | FeedbackStatus)}
                    className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none"
                  >
                    <option value="all">全部状态</option>
                    {FEEDBACK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status === 'pending' ? '待审核' : status === 'approved' ? '已通过' : '已拒绝'}
                      </option>
                    ))}
                  </select>
                  <select
                    value={feedbackTypeFilter}
                    onChange={(e) => setFeedbackTypeFilter(e.target.value as 'all' | FeedbackSubmissionType)}
                    className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none"
                  >
                    <option value="all">全部类型</option>
                    {FEEDBACK_SUBMISSION_TYPES.map((type) => (
                      <option key={type} value={type}>{feedbackTypeLabels[type]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {feedbackLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="animate-spin text-indigo-600" size={28} />
                </div>
              ) : feedbackItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                  <p className="text-sm font-bold text-gray-700">当前没有匹配的反馈记录。</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {feedbackItems.map((item) => {
                    const course = item.course_reviews;
                    const isProcessing = processingFeedbackIds.includes(Number(item.id));
                    const currentField = item.field_name ? FEEDBACK_FIELD_LABELS[item.field_name] : null;

                    return (
                      <div key={item.id} className="rounded-[1.5rem] border border-gray-100 bg-gray-50/70 p-4 sm:p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-black text-gray-900">{course?.course_name || '未知课程'}</h3>
                              <span className="px-2 py-1 rounded-full bg-white border border-gray-200 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                                {feedbackTypeLabels[item.submission_type]}
                              </span>
                              <span className={cn(
                                'px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest',
                                item.status === 'pending' && 'bg-amber-100 text-amber-700',
                                item.status === 'approved' && 'bg-emerald-100 text-emerald-600',
                                item.status === 'rejected' && 'bg-rose-100 text-rose-600',
                              )}>
                                {item.status === 'pending' ? '待审核' : item.status === 'approved' ? '已通过' : '已拒绝'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                              {course?.professor || '未知教授'} · {course?.campus === 's' ? '首尔' : 'ERICA'} · {course?.semester || DEFAULT_SEMESTER}
                            </p>
                            <p className="text-[11px] font-mono text-gray-400 mt-1">{course?.course_code || '无代码'}</p>
                          </div>
                          <p className="text-[11px] font-bold text-gray-400 shrink-0">
                            {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', { hour12: false }) : ''}
                          </p>
                        </div>

                        {item.submission_type === 'review' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                              {item.rating ? (
                                <div>
                                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">评分</p>
                                  <p className="text-sm font-bold text-gray-900">{item.rating} / 5</p>
                                </div>
                              ) : null}
                              {item.pros && item.pros.length > 0 ? (
                                <div>
                                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">优点</p>
                                  <div className="mt-1 space-y-1">
                                    {item.pros.map((pro, index) => (
                                      <p key={`${item.id}-pro-${index}`} className="text-sm text-gray-700">- {pro}</p>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              {item.cons && item.cons.length > 0 ? (
                                <div>
                                  <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">缺点</p>
                                  <div className="mt-1 space-y-1">
                                    {item.cons.map((con, index) => (
                                      <p key={`${item.id}-con-${index}`} className="text-sm text-gray-700">- {con}</p>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            <div className="space-y-3">
                              {item.advice ? (
                                <div>
                                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">建议</p>
                                  <p className="text-sm text-gray-700 mt-1 leading-relaxed">{item.advice}</p>
                                </div>
                              ) : null}
                              <div className="grid grid-cols-2 gap-3">
                                {(['assignment', 'team_project', 'grading', 'attendance', 'exam_count'] as const).map((field) => (
                                  item[field] ? (
                                    <div key={`${item.id}-${field}`} className="rounded-xl border border-gray-200 bg-white p-3">
                                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{FEEDBACK_FIELD_LABELS[field]}</p>
                                      <p className="text-sm font-bold text-gray-800 mt-1">{item[field]}</p>
                                    </div>
                                  ) : null
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{currentField || item.field_name}</p>
                            <p className="text-xs text-gray-500">当前值</p>
                            <p className="text-sm font-bold text-gray-700">{item.current_value_snapshot || '缺失 / 待补充'}</p>
                            <p className="text-xs text-gray-500 pt-1">用户提交的新值</p>
                            <p className="text-sm font-bold text-indigo-600">{item.proposed_value}</p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">审核备注（可选）</label>
                          <textarea
                            value={feedbackReviewNotes[Number(item.id)] || ''}
                            onChange={(e) => setFeedbackReviewNotes((prev) => ({ ...prev, [Number(item.id)]: e.target.value }))}
                            rows={2}
                            className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 outline-none resize-none"
                            placeholder="例如：已确认与现有数据一致"
                          />
                        </div>

                        {item.status === 'pending' && (
                          <div className="flex flex-col sm:flex-row gap-3">
                            <button
                              onClick={() => handleFeedbackReview(Number(item.id), 'approve')}
                              disabled={isProcessing}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2"
                            >
                              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                              通过
                            </button>
                            <button
                              onClick={() => handleFeedbackReview(Number(item.id), 'reject')}
                              disabled={isProcessing}
                              className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2"
                            >
                              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <X size={18} />}
                              拒绝
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {isModalOpen && editingCourse && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-2 md:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-t-3xl md:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
            >
              <div className="flex items-center justify-between p-6 md:p-8 border-b border-gray-100 shrink-0">
                <h2 className="text-xl md:text-2xl font-black text-gray-900">编辑课程评价</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 md:p-8 pb-28 md:pb-8 space-y-6 flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">课程代码</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={editingCourse.course_code || ''}
                      onChange={(e) => setEditingCourse({ ...editingCourse, course_code: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">课程名 (韩语)</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={editingCourse.course_name}
                      onChange={(e) => setEditingCourse({ ...editingCourse, course_name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">校区</label>
                    <select
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={editingCourse.campus}
                      onChange={(e) => setEditingCourse({ ...editingCourse, campus: normalizeCampus(e.target.value) })}
                    >
                      <option value="s">首尔校区 (s)</option>
                      <option value="e">ERICA 校区 (e)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">学期</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={editingCourse.semester || DEFAULT_SEMESTER}
                      onChange={(e) => setEditingCourse({ ...editingCourse, semester: e.target.value || DEFAULT_SEMESTER })}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-3xl border border-indigo-100 bg-indigo-50/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">分类路径</p>
                      <p className="mt-1 text-sm font-medium text-gray-600">
                        这里只读显示数据库中的分类事实，避免手工编辑时把学院与学部关系改乱。
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">顶层分类</label>
                      <div className="min-h-[48px] rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm font-semibold text-gray-800">
                        {editingCourse.category_top || '未分类'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">主分类路径</label>
                      <div className="min-h-[48px] rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm font-semibold text-gray-800 break-words">
                        {editingCourse.primary_category_path || '未设置主路径'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">学院</label>
                      <div className="min-h-[52px] rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm text-gray-800">
                        {Array.isArray(editingCourse.category_colleges) && editingCourse.category_colleges.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {editingCourse.category_colleges.map((college) => (
                              <span key={college} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                                {college}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">无</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">学部 / 学科</label>
                      <div className="min-h-[52px] rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm text-gray-800">
                        {Array.isArray(editingCourse.category_departments) && editingCourse.category_departments.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {editingCourse.category_departments.map((department) => (
                              <span key={department} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 border border-gray-200">
                                {department}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">无</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">教养领域</label>
                      <div className="min-h-[52px] rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-sm text-gray-800">
                        {Array.isArray(editingCourse.category_leaves) && editingCourse.category_leaves.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {editingCourse.category_leaves.map((leaf) => (
                              <span key={leaf} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                {leaf}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">无</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">全部分类路径</label>
                    <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3">
                      {Array.isArray(editingCourse.category_paths) && editingCourse.category_paths.length > 0 ? (
                        <div className="space-y-2">
                          {editingCourse.category_paths.map((path) => (
                            <div key={path} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 break-words">
                              {path}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">暂无分类路径</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">修读区分 (如: 专业必修)</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={editingCourse.course_type || ''}
                      onChange={(e) => setEditingCourse({ ...editingCourse, course_type: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">学年与学分 (如: 3学分)</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={editingCourse.grade_and_credit || ''}
                      onChange={(e) => setEditingCourse({ ...editingCourse, grade_and_credit: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">上课时间</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={editingCourse.class_time || ''}
                      onChange={(e) => setEditingCourse({ ...editingCourse, class_time: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">教室</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={editingCourse.classroom || ''}
                      onChange={(e) => setEditingCourse({ ...editingCourse, classroom: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">教授</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={editingCourse.professor}
                      onChange={(e) => setEditingCourse({ ...editingCourse, professor: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">综合评分 (0-5)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="5"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      value={editingCourse.overall_score}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setEditingCourse({ ...editingCourse, overall_score: isNaN(val) ? 0 : val });
                      }}
                    />
                  </div>
                </div>

                {/* 5个关键指标编辑 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-6 rounded-3xl border border-gray-100">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">作业量</label>
                    <select 
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={editingCourse.assignment}
                      onChange={(e) => setEditingCourse({ ...editingCourse, assignment: e.target.value })}
                    >
                      <option value="待补充">待补充</option>
                      <option value="无">无</option>
                      <option value="普通">普通</option>
                      <option value="多">多</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">小组项目</label>
                    <select 
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={editingCourse.team_project}
                      onChange={(e) => setEditingCourse({ ...editingCourse, team_project: e.target.value })}
                    >
                      <option value="待补充">待补充</option>
                      <option value="无">无</option>
                      <option value="普通">普通</option>
                      <option value="多">多</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">给分情况</label>
                    <select 
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={editingCourse.grading}
                      onChange={(e) => setEditingCourse({ ...editingCourse, grading: e.target.value })}
                    >
                      <option value="待补充">待补充</option>
                      <option value="宽容">宽容</option>
                      <option value="普通">普通</option>
                      <option value="严格">严格</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">出勤要求</label>
                    <select 
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={editingCourse.attendance}
                      onChange={(e) => setEditingCourse({ ...editingCourse, attendance: e.target.value })}
                    >
                      <option value="待补充">待补充</option>
                      <option value="呼名点名">呼名点名</option>
                      <option value="电子出勤">电子出勤</option>
                      <option value="指定坐席">指定坐席</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">考试次数</label>
                    <select 
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                      value={editingCourse.exam_count}
                      onChange={(e) => setEditingCourse({ ...editingCourse, exam_count: e.target.value })}
                    >
                      <option value="待补充">待补充</option>
                      <option value="无考试">无考试</option>
                      <option value="一次">一次</option>
                      <option value="两次">两次</option>
                      <option value="三次">三次</option>
                      <option value="四次及以上">四次及以上</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Dynamic Pros List */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-emerald-600 uppercase tracking-widest flex justify-between items-center">
                      <span>优点 Pros</span>
                      <button 
                        onClick={() => setEditingCourse({ ...editingCourse, pros: [...(Array.isArray(editingCourse.pros) ? editingCourse.pros : []), ''] })}
                        className="p-1 hover:bg-emerald-50 rounded-lg transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                      {(Array.isArray(editingCourse.pros) ? editingCourse.pros : []).map((pro, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none"
                            value={pro}
                            onChange={(e) => {
                              const newPros = [...editingCourse.pros];
                              newPros[idx] = e.target.value;
                              setEditingCourse({ ...editingCourse, pros: newPros });
                            }}
                          />
                          <button 
                            onClick={() => setEditingCourse({ ...editingCourse, pros: editingCourse.pros.filter((_, i) => i !== idx) })}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {(!editingCourse.pros || editingCourse.pros.length === 0) && (
                        <p className="text-xs text-gray-400 italic">暂无优点，点击上方 + 添加</p>
                      )}
                    </div>
                  </div>

                  {/* Dynamic Cons List */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-rose-600 uppercase tracking-widest flex justify-between items-center">
                      <span>缺点 Cons</span>
                      <button 
                        onClick={() => setEditingCourse({ ...editingCourse, cons: [...(Array.isArray(editingCourse.cons) ? editingCourse.cons : []), ''] })}
                        className="p-1 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                      {(Array.isArray(editingCourse.cons) ? editingCourse.cons : []).map((con, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-500/20 outline-none"
                            value={con}
                            onChange={(e) => {
                              const newCons = [...editingCourse.cons];
                              newCons[idx] = e.target.value;
                              setEditingCourse({ ...editingCourse, cons: newCons });
                            }}
                          />
                          <button 
                            onClick={() => setEditingCourse({ ...editingCourse, cons: editingCourse.cons.filter((_, i) => i !== idx) })}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {(!editingCourse.cons || editingCourse.cons.length === 0) && (
                        <p className="text-xs text-gray-400 italic">暂无缺点，点击上方 + 添加</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest text-indigo-600">选课建议</label>
                  <textarea
                    className="w-full h-24 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                    value={editingCourse.advice}
                    onChange={(e) => setEditingCourse({ ...editingCourse, advice: e.target.value })}
                  />
                </div>
              </div>

              <div className="sticky bottom-0 z-10 p-4 md:p-8 border-t border-gray-100 shrink-0 bg-white/95 backdrop-blur">
                <button
                  onClick={handleUpdate}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                >
                  <Save size={20} />
                  保存修改
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-6 border border-white/10"
          >
            <span className="text-sm font-bold">已选中 {selectedIds.length} 条数据</span>
            <div className="w-px h-6 bg-white/20" />
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 text-rose-400 hover:text-rose-300 font-bold text-sm transition-colors"
            >
              <Trash2 size={18} />
              批量删除
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-gray-400 hover:text-white text-sm font-bold transition-colors"
            >
              取消
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
      <AnimatePresence>
        {confirmConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmConfig(null)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">{confirmConfig.title}</h3>
              <p className="text-gray-500 text-sm mb-8 leading-relaxed">{confirmConfig.message}</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setConfirmConfig(null)}
                  className="py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-all"
                >
                  取消
                </button>
                <button
                  onClick={confirmConfig.onConfirm}
                  className="py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-rose-200"
                >
                  确认
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toasts */}
      <div className="fixed bottom-8 right-8 z-[60] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={cn(
                "flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border backdrop-blur-md",
                toast.type === 'success' ? "bg-emerald-50/90 border-emerald-200 text-emerald-700" : "bg-rose-50/90 border-rose-200 text-rose-700"
              )}
            >
              {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              <span className="font-bold">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
