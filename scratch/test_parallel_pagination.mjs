import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nmocuhzyplzgbvbqehim.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tb2N1aHp5cGx6Z2J2YnFlaGltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MDcxNzksImV4cCI6MjEwMDQ4MzE3OX0.9FCC-MB5oJ4KqZyBfrXh9qY88vCz5pslgzLwCeH5xbs';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testParallelPages() {
  await supabase.auth.signInWithPassword({
    email: 'ramon@jackarlo.com',
    password: 'ramon123'
  });

  const { data: drivers } = await supabase.from('drivers').select('id, name, base_location');
  const guapiDrivers = drivers.filter(d => (d.base_location || '').toLowerCase() === 'guapimirim');
  const guapiDriverIds = guapiDrivers.map(d => d.id);

  console.log('--- TESTANDO FETCH PARALELO EM BATCHES DE 2 PÁGINAS ---');
  // Em vez de 1 por 1 sequencial, dispara páginas em lotes ou paralelas
  // Ex: dispara página 1 e 2 simultaneamente:
  const t0 = performance.now();
  let allPkgs = [];
  let from = 0;
  const pageSize = 1000;
  let keepGoing = true;

  while (keepGoing) {
    const tBatch0 = performance.now();
    // Dispara 2 páginas simultâneas (range 0..999 e 1000..1999)
    const [res1, res2] = await Promise.all([
      supabase
        .from('packages')
        .select('barcode, driver_id, company_id, base_location, scanned_by')
        .eq('status', 'EM_ROTA')
        .in('driver_id', guapiDriverIds)
        .range(from, from + pageSize - 1),
      supabase
        .from('packages')
        .select('barcode, driver_id, company_id, base_location, scanned_by')
        .eq('status', 'EM_ROTA')
        .in('driver_id', guapiDriverIds)
        .range(from + pageSize, from + 2 * pageSize - 1)
    ]);

    const batchMs = (performance.now() - tBatch0).toFixed(0);
    const data1 = res1.data || [];
    const data2 = res2.data || [];
    console.log(`Batch (${from}-${from + 2 * pageSize - 1}): P1=${data1.length}, P2=${data2.length} em ${batchMs}ms`);

    allPkgs.push(...data1);
    if (data1.length < pageSize) {
      keepGoing = false;
      break;
    }

    allPkgs.push(...data2);
    if (data2.length < pageSize) {
      keepGoing = false;
      break;
    }

    from += 2 * pageSize;
  }

  console.log(`=> Total obtido: ${allPkgs.length} pacotes em ${(performance.now() - t0).toFixed(0)}ms!`);
}

testParallelPages().catch(console.error);
