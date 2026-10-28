import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFastQueries() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  const { data: drivers } = await supabase.from('drivers').select('id, name, base_location');
  const guapiDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');
  const guapiDriverIds = guapiDrivers.map(d => d.id);

  console.log('--- TESTE: Consultando com ordenação por driver_id ---');
  for (let p = 0; p < 4; p++) {
    const t0 = performance.now();
    const { data } = await supabase
      .from('packages')
      .select('barcode, driver_id, company_id, base_location, scanned_by')
      .eq('status', 'EM_ROTA')
      .in('driver_id', guapiDriverIds)
      .order('driver_id', { ascending: true })
      .range(p * 1000, p * 1000 + 999);
    console.log(`Page ${p + 1}: ${data?.length} rows in ${(performance.now() - t0).toFixed(0)}ms`);
  }

  console.log('\n--- TESTE: Consultando com ordenação por scanned_at DESC ---');
  for (let p = 0; p < 4; p++) {
    const t0 = performance.now();
    const { data } = await supabase
      .from('packages')
      .select('barcode, driver_id, company_id, base_location, scanned_by')
      .eq('status', 'EM_ROTA')
      .in('driver_id', guapiDriverIds)
      .order('scanned_at', { ascending: false })
      .range(p * 1000, p * 1000 + 999);
    console.log(`Page ${p + 1}: ${data?.length} rows in ${(performance.now() - t0).toFixed(0)}ms`);
  }
}

testFastQueries().catch(console.error);
