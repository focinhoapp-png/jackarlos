import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testKeyset() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  const { data: drivers } = await supabase.from('drivers').select('id, name, base_location');
  const guapiDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');
  const guapiDriverIds = guapiDrivers.map(d => d.id);

  console.log('--- TESTANDO KEYSET PAGINATION (id > lastId) ---');
  let lastId = null;
  let hasMore = true;
  let page = 0;
  let totalRows = 0;
  const t0 = performance.now();

  while (hasMore) {
    page++;
    const tPage0 = performance.now();
    let query = supabase
      .from('packages')
      .select('id, barcode, driver_id, company_id, base_location, scanned_by')
      .eq('status', 'EM_ROTA')
      .in('driver_id', guapiDriverIds)
      .order('id', { ascending: true })
      .limit(1000);

    if (lastId) {
      query = query.gt('id', lastId);
    }

    const { data, error } = await query;
    const ms = (performance.now() - tPage0).toFixed(0);
    console.log(`Page ${page}: ${data?.length || 0} rows in ${ms}ms (lastId: ${lastId?.slice(0, 8)})`);
    if (error) {
      console.error(error);
      break;
    }
    if (data && data.length > 0) {
      totalRows += data.length;
      lastId = data[data.length - 1].id;
      if (data.length < 1000) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  console.log(`=> Keyset pagination total: ${totalRows} rows in ${(performance.now() - t0).toFixed(0)}ms!`);
}

testKeyset().catch(console.error);
