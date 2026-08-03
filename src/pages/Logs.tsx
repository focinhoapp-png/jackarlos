import React, { useState, useEffect } from 'react';
import { Search, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { supabase } from '@/src/lib/supabase';

interface AuditLog {
  id: string;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_name: string;
  created_at: string;
}

export function Logs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setLogs(data);
    }
    setIsLoading(false);
  };

  const filteredLogs = logs.filter(log =>
    log.admin_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.entity_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.entity_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Logs de Auditoria</h1>
      </div>

      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="border-b border-border p-4 bg-muted/20">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por admin, ação, tipo..." 
              className="pl-9 bg-background" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Data / Hora</th>
                  <th className="px-6 py-4 font-medium">Responsável</th>
                  <th className="px-6 py-4 font-medium">Ação</th>
                  <th className="px-6 py-4 font-medium">Categoria</th>
                  <th className="px-6 py-4 font-medium">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">Carregando logs...</td></tr>
                ) : filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">
                      {(log.admin_email || '').split('@')[0] || log.admin_email}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${
                        log.action === 'CRIOU'     ? 'bg-success/20 text-success border-success/20' :
                        log.action === 'DELETOU'   ? 'bg-destructive/20 text-destructive border-destructive/20' :
                        log.action === 'INATIVOU'  ? 'bg-orange-500/20 text-orange-500 border-orange-500/20' :
                        log.action === 'ATIVOU'    ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/20' :
                        log.action === 'CARREGOU'  ? 'bg-purple-500/20 text-purple-500 border-purple-500/20' :
                        'bg-blue-500/20 text-blue-500 border-blue-500/20'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        log.entity_type === 'CARREGAMENTO'
                          ? 'bg-purple-500/10 text-purple-400'
                          : 'text-muted-foreground'
                      }`}>
                        {log.entity_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium max-w-xs">
                      <span title={log.entity_name} className="block truncate">{log.entity_name}</span>
                    </td>
                  </tr>
                ))}
                {!isLoading && filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
                        Nenhum log encontrado.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
