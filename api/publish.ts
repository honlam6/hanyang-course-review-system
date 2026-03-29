import { createClient } from '@supabase/supabase-js';
import { requireAdminRequest } from './_auth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const adminContext = await requireAdminRequest(req, res);
  if (!adminContext) return;

  try {
    const { table, data, id } = req.body;
    const shouldReturnData = req.body.returnData !== false;
    const isDelete = req.body.action === 'delete';
    const operation = isDelete ? 'delete' : id ? 'update' : 'insert';
    const requestedCount = isDelete
      ? (id ? 1 : Array.isArray(req.body.ids) ? req.body.ids.length : 0)
      : (Array.isArray(data) ? data.length : data ? 1 : 0);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let result;
    const withOptionalSelect = async (query: any) => {
      return shouldReturnData ? query.select() : query;
    };

    if (isDelete) {
      // Handle deletion
      if (id) {
        result = await withOptionalSelect(supabase.from(table).delete().eq('id', id));
      } else if (Array.isArray(req.body.ids)) {
        result = await withOptionalSelect(supabase.from(table).delete().in('id', req.body.ids));
      } else {
        return res.status(400).json({ error: 'Missing id or ids for deletion' });
      }
    } else if (id) {
      // Update existing record
      result = await withOptionalSelect(supabase.from(table).update(data).eq('id', id));
    } else {
      // Insert new record
      result = await withOptionalSelect(supabase.from(table).insert(data));
    }

    if (result.error) {
      console.error('[Publish API] request failed', {
        operation,
        table,
        requestedCount,
        id: id || null,
        error: result.error.message,
      });
      return res.status(400).json({ error: result.error.message });
    }

    const affectedCount = Array.isArray(result.data) ? result.data.length : requestedCount;
    console.info('[Publish API] request succeeded', {
      operation,
      table,
      requestedCount,
      affectedCount,
      id: id || null,
    });

    return res.status(200).json({ success: true, data: result.data, count: affectedCount });
  } catch (error) {
    console.error('Publish API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
