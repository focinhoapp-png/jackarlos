import { useState, useEffect } from 'react';
import { Search, Filter, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/src/components/ui/input';
import { Button } from '@/src/components/ui/button';
import { supabase } from '@/src/lib/supabase';

interface HistoryRecord {
  id: string;
  code: string;
  company: string;
  driver: string;
  collaborator: string;
  date: string;
  rawDate: Date;
  status: 'Concluído' | 'Em Rota' | 'Devolvido';
  observation?: string;
}

const ITEMS_PER_PAGE = 30;

export function History() {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [companyFilter, setCompanyFilter] = useState('Todas');
  
  // Advanced filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [debouncedDriverFilter, setDebouncedDriverFilter] = useState('');
  const [entregasFilter, setEntregasFilter] = useState('Todas as entregas');

  const [isEntregador, setIsEntregador] = useState(false);
  const [isConferente, setIsConferente] = useState(false);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setDebouncedDriverFilter(driverFilter);
      setCurrentPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, driverFilter, statusFilter, companyFilter, startDate, endDate, entregasFilter]);

  useEffect(() => {
    loadUserAndFetch();
  }, [currentPage, debouncedSearch, debouncedDriverFilter, statusFilter, companyFilter, startDate, endDate, entregasFilter]);

  const loadUserAndFetch = async () => {
    setIsLoading(true);
    let role = 'ADMIN';
    let userId = null;
    let driverId = null;

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
      if (userData?.role) role = userData.role;

      if (role === 'ENTREGADOR') {
        setIsEntregador(true);
        const { data: driverData } = await supabase.from('drivers').select('id, name').eq('user_id', user.id).single();
        if (driverData) {
          driverId = driverData.id;
          setDriverFilter(driverData.name);
          setDebouncedDriverFilter(driverData.name);
        }
      } else if (role === 'CONFERENTE') {
        setIsConferente(true);
      }
    }

    await fetchHistory(role, userId, driverId);
  };

  const fetchHistory = async (role: string, userId: string | null, driverId: string | null) => {
    let query = supabase
      .from('packages')
      .select(`
        id,
        barcode,
        status,
        scanned_at,
        observation,
        companies!inner ( name ),
        drivers!inner ( name, id ),
        users!inner ( name )
      `, { count: 'exact' }).limit(999999);

    if (role === 'ENTREGADOR' && driverId) {
      query = query.eq('driver_id', driverId);
    } else if (role === 'CONFERENTE' && userId) {
      query = query.eq('scanned_by', userId);
    }

    if (debouncedSearch) {
      query = query.ilike('barcode', `%${debouncedSearch}%`);
    }

    if (statusFilter !== 'Todos') {
      const dbStatus = statusFilter === 'Concluído' ? 'ENTREGUE' : statusFilter === 'Devolvido' ? 'DEVOLVIDA' : 'EM_ROTA';
      query = query.eq('status', dbStatus);
    }

    if (entregasFilter !== 'Todas as entregas') {
      const dbStatus = entregasFilter === 'Entregues' ? 'ENTREGUE' : 'DEVOLVIDA';
      query = query.eq('status', dbStatus);
    }

    if (companyFilter !== 'Todas') {
      query = query.eq('companies.name', companyFilter);
    }

    if (debouncedDriverFilter && role !== 'ENTREGADOR') {
      query = query.ilike('drivers.name', `%${debouncedDriverFilter}%`);
    }

    if (startDate) {
      query = query.gte('scanned_at', new Date(startDate).toISOString());
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.lte('scanned_at', end.toISOString());
    }

    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    query = query.order('scanned_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (!error && data) {
      setHistory(data.map((pkg: any) => ({
        id: pkg.id,
        code: pkg.barcode,
        company: pkg.companies?.name || '-',
        driver: pkg.drivers?.name || '-',
        collaborator: pkg.users?.name || '-',
        date: new Date(pkg.scanned_at).toLocaleString('pt-BR'),
        rawDate: new Date(pkg.scanned_at),
        status: pkg.status === 'ENTREGUE' ? 'Concluído' : pkg.status === 'DEVOLVIDA' ? 'Devolvido' : 'Em Rota',
        observation: pkg.observation
      })));
      setTotalCount(count || 0);
    } else {
      setHistory([]);
      setTotalCount(0);
    }
    
    setIsLoading(false);
  };

  const handleExport = () => {
    // Export limited to current page data for simplicity with pagination
    if (isConferente) {
      const grouped = Object.values(
        history.reduce((acc, record) => {
          const dateStr = record.rawDate.toLocaleDateString('pt-BR');
          const key = `${record.driver}-${dateStr}`;
          if (!acc[key]) {
            acc[key] = { driver: record.driver, date: dateStr, count: 0 };
          }
          acc[key].count += 1;
          return acc;
        }, {} as Record<string, { driver: string; date: string; count: number }>)
      );

      const headers = ['Data', 'Entregador', 'Quantidade de Mercadorias'];
      const csvContent = [headers.join(','), ...grouped.map((r: any) => `"${r.date}","${r.driver}","${r.count}"`)].join('\n');
      downloadCSV(csvContent, 'historico_conferente.csv');
    } else {
      const headers = ['Código', 'Data/Hora', 'Empresa', 'Entregador', 'Conferente', 'Status'];
      const csvContent = [headers.join(','), ...history.map(r => `"${r.code}","${r.date}","${r.company}","${r.driver}","${r.collaborator}","${r.status}"`)].join('\n');
      downloadCSV(csvContent, 'historico_entregas.csv');
    }
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;

  // Render conferente grouping
  const conferenteGroups = isConferente ? Object.values(
    history.reduce((acc, record) => {
      const dateStr = record.rawDate.toLocaleDateString('pt-BR');
      const key = `${record.driver}-${dateStr}`;
      if (!acc[key]) {
        acc[key] = { driver: record.driver, date: dateStr, count: 0 };
      }
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { driver: string; date: string; count: number }>)
  ) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Histórico de Entregas</h1>
        <Button variant="outline" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Exportar Página
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Filters Header */}
        <div className="p-4 border-b border-border flex flex-col space-y-4 bg-muted/20">
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Pesquisar código do pacote..." 
                className="pl-9 bg-background w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button 
                variant={showFilters ? "default" : "outline"} 
                className={`gap-2 ${showFilters ? '' : 'bg-background'}`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
                Filtros
              </Button>
            </div>
          </div>
          
          {/* Expanded Filters */}
          {showFilters && (
            <div className="flex flex-col gap-4 pt-4 border-t border-border/50 animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="Todos">Todos</option>
                    <option value="Concluído">Concluído</option>
                    <option value="Em Rota">Em Rota</option>
                    <option value="Devolvido">Devolvido</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Empresa</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                  >
                    <option value="Todas">Todas</option>
                    <option value="Casas Bahia">Casas Bahia</option>
                    <option value="GFL Logística">GFL Logística</option>
                    <option value="Anjum">Anjum</option>
                    <option value="IMile Logistics">IMile Logistics</option>
                    <option value="Fast">Fast</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Data Início</label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-background"/>
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-background"/>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Entregador</label>
                    <Input
                      placeholder="Nome do Entregador"
                      value={driverFilter}
                      onChange={(e) => setDriverFilter(e.target.value)}
                      className="bg-white"
                      disabled={isEntregador}
                    />
                </div>
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Entregas</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={entregasFilter}
                    onChange={(e) => setEntregasFilter(e.target.value)}
                  >
                    <option value="Todas as entregas">Todas as entregas</option>
                    <option value="Entregues">Entregues</option>
                    <option value="Devolvidas">Devolvidas</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {isConferente ? (
            <div className="overflow-x-auto w-full"><table className="w-full text-sm text-left min-w-[600px]">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Data</th>
                  <th className="px-6 py-4 font-medium">Entregador</th>
                  <th className="px-6 py-4 font-medium">Quantidade de Mercadorias</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                      Carregando histórico...
                    </td>
                  </tr>
                ) : conferenteGroups.map((group: any, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{group.date}</td>
                    <td className="px-6 py-4 font-medium">{group.driver}</td>
                    <td className="px-6 py-4 font-bold text-primary">{group.count} pacotes (na página atual)</td>
                  </tr>
                ))}
                
                {!isLoading && conferenteGroups.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table></div>
          ) : (
            <div className="overflow-x-auto w-full"><table className="w-full text-sm text-left min-w-[800px]">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Código</th>
                  <th className="px-6 py-4 font-medium">Data/Hora</th>
                  <th className="px-6 py-4 font-medium">Empresa</th>
                  <th className="px-6 py-4 font-medium">Entregador</th>
                  <th className="px-6 py-4 font-medium">Conferente</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      Carregando histórico...
                    </td>
                  </tr>
                ) : history.map((record, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium">{record.code}</td>
                    <td className="px-6 py-4 text-muted-foreground">{record.date}</td>
                    <td className="px-6 py-4 font-medium">{record.company}</td>
                    <td className="px-6 py-4">{record.driver}</td>
                    <td className="px-6 py-4 text-muted-foreground">{record.collaborator}</td>
                    <td className="py-4 text-sm text-foreground font-medium">
                      <div className="flex flex-col">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium w-fit ${
                          record.status === 'Concluído' ? 'bg-success/20 text-success' :
                          record.status === 'Em Rota' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-destructive/20 text-destructive-foreground'
                        }`}>
                          {record.status}
                        </span>
                        {record.status === 'Devolvido' && record.observation && (
                          <span className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate" title={record.observation}>
                            Obs: {record.observation}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                
                {!isLoading && history.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table></div>
          )}
        </div>
        
        {/* Pagination Footer */}
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
      </div>
    </div>
  );
}
