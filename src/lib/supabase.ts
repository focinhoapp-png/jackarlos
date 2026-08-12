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
export async function fetchAllPaginated(queryFactory: () => any, step = 1000) {
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;
  let fetchError = null;

  while (hasMore) {
    const query = queryFactory();
    const { data, error } = await query.range(from, from + step - 1);
    
    if (error) {
      fetchError = error;
      break;
    }
    
    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < step) {
        hasMore = false;
      } else {
        from += step;
      }
    } else {
      hasMore = false;
    }
  }

  return { data: allData, error: fetchError };
}

