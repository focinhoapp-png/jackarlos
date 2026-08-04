/**
 * adminApi.ts
 *
 * Helper para chamar a Edge Function `admin-user-management` no Supabase.
 * Toda operação privilegiada de Auth (criar/editar/deletar usuários) é feita
 * pelo servidor (Deno) usando a service_role_key — nunca exposta ao browser.
 *
 * O frontend usa apenas a ANON KEY (VITE_SUPABASE_ANON_KEY) para autenticar.
 */
import { supabase } from './supabase';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-management`;

interface AdminApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
}

/**
 * Monta os headers com o JWT do usuário logado para a edge function
 * verificar autenticação e permissão de admin.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

/** Chama a edge function com um payload e retorna { data, error }. */
async function callAdminFunction<T = unknown>(
  payload: Record<string, unknown>
): Promise<AdminApiResponse<T>> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok) {
      return { data: null, error: json.error ?? `Erro HTTP ${res.status}` };
    }

    return { data: json as T, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido.';
    return { data: null, error: msg };
  }
}

// ── Funções públicas ──────────────────────────────────────────────────────────

/**
 * Cria um usuário no Supabase Auth via Edge Function (servidor).
 * Não expõe a service_role_key no browser.
 */
export async function adminCreateUser(params: {
  email: string;
  password: string;
  user_metadata?: Record<string, unknown>;
}): Promise<AdminApiResponse<{ user: { id: string; email: string } }>> {
  return callAdminFunction({ action: 'create', ...params });
}

/**
 * Atualiza email e/ou senha de um usuário existente via Edge Function.
 */
export async function adminUpdateUser(params: {
  userId: string;
  email?: string;
  password?: string;
}): Promise<AdminApiResponse<{ user: { id: string } }>> {
  return callAdminFunction({ action: 'update', ...params });
}

/**
 * Deleta um usuário do Supabase Auth via Edge Function.
 */
export async function adminDeleteUser(params: {
  userId: string;
}): Promise<AdminApiResponse<{ success: boolean }>> {
  return callAdminFunction({ action: 'delete', ...params });
}
