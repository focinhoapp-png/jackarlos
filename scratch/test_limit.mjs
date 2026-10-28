import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLimit() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  const { data: drivers } = await supabase.from('drivers').select('id, name, base_location');
  const guapiDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');
  const guapiDriverIds = guapiDrivers.map(d => d.id);

  console.log('Testando range(0, 4999) com in(driver_id)...');
  const t0 = performance.now();
  const { data, error } = await supabase
    .from('packages')
    .select('barcode, driver_id, company_id, base_location, scanned_by')
    .eq('status', 'EM_ROTA')
    .in('driver_id', guapiDriverIds)
    .range(0, 4999);

  console.log(`Retornou ${data?.length} itens em ${(performance.now() - t0).toFixed(0)}ms (Erro: ${error?.message || 'nenhum'})`);
}

testLimit().catch(console.error);
