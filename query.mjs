import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const query = "pefs instructions screen 3?".toLowerCase();
  const cleanQuery = query.replace(/[^\w\s]/g, '').trim();
  const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
  
  let imgSearchQuery = supabase
    .from('documents')
    .select('id, content, metadata')
    .eq('metadata->>type', 'image');

  if (queryWords.length > 0) {
    const orConditions = queryWords.map(w => `metadata->>source.ilike.%${w}%,content.ilike.%${w}%`).join(',');
    imgSearchQuery = imgSearchQuery.or(orConditions);
  }

  const { data, error } = await imgSearchQuery.limit(1);

  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}

run();