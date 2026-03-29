import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  buildCategoryClarificationMessage,
  fetchCategoryOptionSnapshot,
  hasCategoryIntent,
  inferCategoryFiltersWithAI,
  matchesResolvedCategoryFilters,
  resolveEffectiveCategoryFilters,
  shouldAskForCategoryClarification,
} from "../src/lib/aiCategoryResolver.js";
import { generateCourseRecommendationText } from "../src/lib/aiCourseRecommendations.js";

export interface CourseChatRequestBody {
  message?: string;
  campus?: string;
  semester?: string;
  selectedCategoryTop?: string | null;
  selectedCategoryCollege?: string | null;
  selectedCategoryDepartment?: string | null;
  selectedCategoryLeaf?: string | null;
}

export interface CourseChatResult {
  status: number;
  payload: Record<string, unknown>;
}

export async function executeCourseChat(body: CourseChatRequestBody): Promise<CourseChatResult> {
  try {
    const {
      message,
      campus,
      semester,
      selectedCategoryTop,
      selectedCategoryCollege,
      selectedCategoryDepartment,
      selectedCategoryLeaf,
    } = body;

    const apiKey = process.env.GEMINI_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
      return { status: 500, payload: { error: 'Missing required environment variables' } };
    }
    if (typeof message !== 'string' || !message.trim()) {
      return { status: 400, payload: { error: 'Invalid message' } };
    }
    if (typeof campus !== 'undefined' && campus !== 's' && campus !== 'e') {
      return { status: 400, payload: { error: 'Invalid campus. Use s or e.' } };
    }

    const resolvedCampus = campus === 's' || campus === 'e' ? campus : 'e';
    const resolvedSemester = typeof semester === 'string' && semester.trim() ? semester.trim() : '2026-1';
    const campusName = resolvedCampus === 's' ? '首尔校区' : 'ERICA 校区';

    const ai = new GoogleGenAI({ apiKey });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const model = "gemini-3.1-flash-lite-preview";

    let effectiveFilters = {
      selectedCategoryTop: selectedCategoryTop || null,
      selectedCategoryCollege: selectedCategoryCollege || null,
      selectedCategoryDepartment: selectedCategoryDepartment || null,
      selectedCategoryLeaf: selectedCategoryLeaf || null,
    };

    if (hasCategoryIntent(message, effectiveFilters)) {
      const categoryOptions = await fetchCategoryOptionSnapshot(supabase, resolvedCampus, resolvedSemester);
      const inferredFilters = await inferCategoryFiltersWithAI(ai, message, categoryOptions);
      effectiveFilters = resolveEffectiveCategoryFilters(effectiveFilters, inferredFilters);

      if (shouldAskForCategoryClarification(message, {
        selectedCategoryTop,
        selectedCategoryCollege,
        selectedCategoryDepartment,
        selectedCategoryLeaf,
      }, inferredFilters, effectiveFilters)) {
        return {
          status: 200,
          payload: {
            text: buildCategoryClarificationMessage(),
            filters: effectiveFilters,
          },
        };
      }
    }

    const embeddingResult = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: message,
      config: { outputDimensionality: 768 },
    });
    const queryEmbedding = embeddingResult.embeddings?.[0]?.values;

    if (!queryEmbedding) {
      return { status: 500, payload: { error: 'Failed to generate query embedding' } };
    }

    const { data: matchedCourses, error: matchError } = await supabase.rpc('match_courses', {
      query_embedding: queryEmbedding,
      match_threshold: 0.2,
      match_count: 16,
      filter_campus: resolvedCampus,
      filter_semester: resolvedSemester,
      filter_category_top: effectiveFilters.selectedCategoryTop,
      filter_category_colleges: effectiveFilters.selectedCategoryCollege ? [effectiveFilters.selectedCategoryCollege] : null,
      filter_category_departments: effectiveFilters.selectedCategoryDepartment ? [effectiveFilters.selectedCategoryDepartment] : null,
      filter_category_leaves: effectiveFilters.selectedCategoryLeaf ? [effectiveFilters.selectedCategoryLeaf] : null,
    });

    if (matchError) {
      const hint = matchError.message.includes('match_courses')
        ? 'match_courses 函数可能还是旧版本，请把新的 supabase_setup.sql 里的函数定义重新执行一次。'
        : 'Failed to retrieve matching courses';
      return { status: 500, payload: { error: hint } };
    }

    const strictlyMatchedCourses = (matchedCourses || []).filter((course: any) =>
      matchesResolvedCategoryFilters(course, effectiveFilters),
    );

    const text = await generateCourseRecommendationText({
      ai,
      model,
      campusName,
      semester: resolvedSemester,
      message,
      filters: effectiveFilters,
      courses: strictlyMatchedCourses,
    });

    return {
      status: 200,
      payload: {
        text,
        filters: effectiveFilters,
      },
    };
  } catch (error) {
    console.error('Course chat error:', error);
    return { status: 500, payload: { error: 'Internal Server Error' } };
  }
}
