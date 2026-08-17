import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis de ambiente do Supabase não encontradas. Verifique o arquivo .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Utilitário para buscar todos os registros de uma query paginada,
 * ignorando o limite máximo (max-rows) imposto pelo Supabase.
 * @param queryFactory Função que retorna a query base do Supabase
 * @param step Tamanho da página (default 1000)
 */
export async function fetchAllPaginated(queryFactory: () => any, step = 1000, signal?: AbortSignal) {
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;
  let fetchError = null;
  const concurrency = 3; // Limite reduzido para evitar estourar o pool de conexões do Supabase (max 15-20)

  while (hasMore) {
    if (signal?.aborted) break;

    const promises = [];
    for (let i = 0; i < concurrency; i++) {
      let query = queryFactory();
      if (signal && typeof query.abortSignal === 'function') {
        query = query.abortSignal(signal);
      }
      promises.push(query.range(from + i * step, from + (i + 1) * step - 1));
    }
    
    try {
      const results = await Promise.all(promises);
      
      for (const res of results) {
        if (signal?.aborted) break;
        if (res.error) {
          if (res.error.message?.includes('aborted')) break;
          fetchError = res.error;
          hasMore = false;
          break;
        }
        if (res.data) {
          allData = allData.concat(res.data);
          if (res.data.length < step) {
            hasMore = false;
            break;
          }
        } else {
          hasMore = false;
          break;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') break;
      fetchError = err;
      break;
    }
    
    if (fetchError || signal?.aborted) break;
    from += step * concurrency;
  }

  return { data: signal?.aborted ? [] : allData, error: fetchError };
}

