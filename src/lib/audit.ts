import { supabase } from './supabase';

export async function logAction(
  adminEmail: string,
  action: 'CRIOU' | 'EDITOU' | 'DELETOU' | 'INATIVOU' | 'ATIVOU' | 'CARREGOU',
  entityType: 'USUÁRIO' | 'ENTREGADOR' | 'CONFERENTE' | 'EMPRESA' | 'BASE' | 'ROTA' | 'CARREGAMENTO',
  entityName: string
) {
  try {
    await supabase.from('audit_logs').insert([{
      admin_email: adminEmail,
      action,
      entity_type: entityType,
      entity_name: entityName
    }]);
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
