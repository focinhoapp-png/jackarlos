import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testPerDriverFetch() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  const { data: drivers } = await supabase.from('drivers').select('id, name, base_location');
  const guapiDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');

  console.log(`--- TESTANDO BUSCA CONCORRENTE POR MOTORISTA (${guapiDrivers.length} motoristas) ---`);
  const t0 = performance.now();

  // Executa em lotes de 10 motoristas em paralelo para não sobrecarregar conexões
  const concurrency = 10;
  let allPkgs = [];

  for (let i = 0; i < guapiDrivers.length; i += concurrency) {
    const chunk = guapiDrivers.slice(i, i + concurrency);
    const chunkPromises = chunk.map(d =>
      supabase
        .from('packages')
        .select('barcode, driver_id, company_id, base_location, scanned_by')
        .eq('status', 'EM_ROTA')
        .eq('driver_id', d.id)
    );

    const chunkResults = await Promise.all(chunkPromises);
    chunkResults.forEach(res => {
      if (res.data) allPkgs.push(...res.data);
    });
  }

  const totalMs = (performance.now() - t0).toFixed(0);
  console.log(`=> Busca concorrente por motorista: ${allPkgs.length} pacotes carregados em ${totalMs}ms!`);

  // E se fizermos todos os 30 de uma vez em Promise.all?
  console.log(`\n--- TESTANDO TODOS OS ${guapiDrivers.length} MOTORISTAS EM UM ÚNICO PROMISE.ALL ---`);
  const tAll0 = performance.now();
  const allResults = await Promise.all(
    guapiDrivers.map(d =>
      supabase
        .from('packages')
        .select('barcode, driver_id, company_id, base_location, scanned_by')
        .eq('status', 'EM_ROTA')
        .eq('driver_id', d.id)
    )
  );
  const totalAllPkgs = allResults.flatMap(r => r.data || []);
  const totalAllMs = (performance.now() - tAll0).toFixed(0);
  console.log(`=> Único Promise.all (${guapiDrivers.length} motoristas): ${totalAllPkgs.length} pacotes carregados em ${totalAllMs}ms!`);
}

testPerDriverFetch().catch(console.error);
