import React, { useState, useEffect } from 'react';
import { Search, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { Button } from '@/src/components/ui/button';
import { supabase } from '@/src/lib/supabase';

interface AuditLog {
  id: string;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_name: string;
  created_at: string;
}

const ITEMS_PER_PAGE = 30;

export function Logs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Paginação Server-side
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Debounce do termo de busca
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reseta a página quando busca muda
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchLogs();
  }, [currentPage, debouncedSearch]);

  const fetchLogs = async () => {
    setIsLoading(true);
    
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' });

    if (debouncedSearch) {
      query = query.or(`admin_email.ilike.%${debouncedSearch}%,action.ilike.%${debouncedSearch}%,entity_type.ilike.%${debouncedSearch}%,entity_name.ilike.%${debouncedSearch}%`);
    }

    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (!error && data) {
      setLogs(data);
      setTotalCount(count || 0);
    }
    setIsLoading(false);
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Logs de Auditoria</h1>
      </div>

      <Card className="bg-card border-border shadow-sm flex flex-col">
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
        <CardContent className="p-0 flex-1 overflow-hidden">
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
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
                        Nenhum log encontrado.
                      </div>
                    </td>
                  </tr>
                ) : logs.map((log) => (
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
              </tbody>
            </table>
          </div>
        </CardContent>
        
        {/* Controles de Paginação */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/10">
            <div className="text-sm text-muted-foreground">
              Mostrando <span className="font-medium text-foreground">{((currentPage - 1) * ITEMS_PER_PAGE) + 1}</span> a <span className="font-medium text-foreground">{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}</span> de <span className="font-medium text-foreground">{totalCount}</span> registros
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <div className="text-sm font-medium px-2">
                Página {currentPage} de {totalPages}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || isLoading}
              >
                Próxima <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
