import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDriverQuerySpeed() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  const { data: drivers } = await supabase.from('drivers').select('id, name, base_location');
  const guapiDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');

  console.log('Testando busca por motorista individual com status=EM_ROTA:');
  const mathias = guapiDrivers.find(d => d.name.includes('MATHIAS'));
  const t0 = performance.now();
  const { data: mathiasPkgs } = await supabase
    .from('packages')
    .select('barcode, driver_id, company_id, base_location, scanned_by')
    .eq('driver_id', mathias.id)
    .eq('status', 'EM_ROTA');
  console.log(`Mathias (${mathiasPkgs?.length} pacotes) em ${(performance.now() - t0).toFixed(0)}ms!`);

  // E se buscarmos em paralelo para grupos de motoristas?
  console.log('\nTestando busca paralela dividindo os 30 motoristas em 3 grupos de 10:');
  const tGroup0 = performance.now();
  const chunks = [
    guapiDrivers.slice(0, 10).map(d => d.id),
    guapiDrivers.slice(10, 20).map(d => d.id),
    guapiDrivers.slice(20, 30).map(d => d.id)
  ];

  const results = await Promise.all(
    chunks.map(chunkIds =>
      supabase
        .from('packages')
        .select('barcode, driver_id, company_id, base_location, scanned_by')
        .eq('status', 'EM_ROTA')
        .in('driver_id', chunkIds)
        .limit(2000)
    )
  );

  const totalPkgs = results.flatMap(r => r.data || []);
  console.log(`Total pacotes dos 3 grupos: ${totalPkgs.length} em ${(performance.now() - tGroup0).toFixed(0)}ms!`);
}

testDriverQuerySpeed().catch(console.error);
