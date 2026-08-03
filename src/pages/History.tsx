import { useState, useEffect } from 'react';
import { Search, Filter, Download, Calendar } from 'lucide-react';
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

export function History() {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [companyFilter, setCompanyFilter] = useState('Todas');
  
  // Advanced filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [collaboratorFilter, setCollaboratorFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('');

  const [isEntregador, setIsEntregador] = useState(false);
  const [isConferente, setIsConferente] = useState(false);
  const [driverId, setDriverId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
        if (userData?.role === 'ENTREGADOR') {
          setIsEntregador(true);
          const { data: driverData } = await supabase.from('drivers').select('id, name').eq('user_id', user.id).single();
          if (driverData) {
            setDriverId(driverData.id);
            setDriverFilter(driverData.name);
          }
        } else if (userData?.role === 'CONFERENTE') {
          setIsConferente(true);
        }
      }
      fetchHistory();
    });
  }, []);

  const fetchHistory = async () => {
    setIsLoading(true);
    let query = supabase
      .from('packages')
      .select(`
        id,
        barcode,
        status,
        scanned_at,
        observation,
        companies ( name ),
        drivers ( name, id ),
        users ( name )
      `)
      .order('scanned_at', { ascending: false });

    // Se estivermos dentro do fetchHistory, ele pode não ter o driverId do state atualizado ainda (por causa da closure/async), 
    // mas vamos pegar do session direto pra garantir se for a primeira chamada.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
      if (userData?.role === 'ENTREGADOR') {
        const { data: driverData } = await supabase.from('drivers').select('id').eq('user_id', user.id).single();
        if (driverData) {
          query = query.eq('driver_id', driverData.id);
        }
      } else if (userData?.role === 'CONFERENTE') {
        query = query.eq('scanned_by', user.id);
      }
    }

    const { data, error } = await query;
    if (!error && data) {
      setHistory(data.map((pkg: any) => ({
        id: pkg.id,
        code: pkg.barcode,
        company: pkg.companies?.name || '-',
        driver: pkg.drivers?.name || '-',
        collaborator: pkg.users?.name || '-',
        date: new Date(pkg.scanned_at).toLocaleString(),
        rawDate: new Date(pkg.scanned_at),
        status: pkg.status === 'ENTREGUE' ? 'Concluído' : pkg.status === 'DEVOLVIDA' ? 'Devolvido' : 'Em Rota',
        observation: pkg.observation
      })));
    }
    setIsLoading(false);
  };

  const filteredHistory = history.filter(record => {
    const matchesSearch = 
      record.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.driver.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.company.toLowerCase().includes(searchTerm.toLowerCase());
      
    let matchesTimeRange = true;

    let matchesStatus = true;
    if (statusFilter !== 'Todos') {
      matchesStatus = record.status === statusFilter;
    }

    let matchesCompany = true;
    if (companyFilter !== 'Todas') {
      matchesCompany = record.company === companyFilter;
    }
    
    let matchesStartDate = true;
    if (startDate) {
       matchesStartDate = record.rawDate >= new Date(startDate);
    }
    
    let matchesEndDate = true;
    if (endDate) {
       const end = new Date(endDate);
       end.setHours(23, 59, 59, 999);
       matchesEndDate = record.rawDate <= end;
    }
    
    let matchesDriver = true;
    if (driverFilter) {
       matchesDriver = record.driver.toLowerCase().includes(driverFilter.toLowerCase());
    }

    let matchesCollaborator = true;
    if (collaboratorFilter) {
       matchesCollaborator = record.collaborator.toLowerCase().includes(collaboratorFilter.toLowerCase());
    }

    let matchesTime = true;
    if (timeFilter) {
       const timeStr = record.rawDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
       matchesTime = timeStr.includes(timeFilter);
    }

    return matchesSearch && matchesTimeRange && matchesStatus && matchesCompany && matchesStartDate && matchesEndDate && matchesDriver && matchesCollaborator && matchesTime;
  });

  const handleExport = () => {
    if (isConferente) {
      const grouped = Object.values(
        filteredHistory.reduce((acc, record) => {
          const dateStr = record.rawDate.toLocaleDateString();
          const key = `${record.driver}-${dateStr}`;
          if (!acc[key]) {
            acc[key] = {
              driver: record.driver,
              date: dateStr,
              count: 0,
            };
          }
          acc[key].count += 1;
          return acc;
        }, {} as Record<string, { driver: string; date: string; count: number }>)
      );

      const headers = ['Data', 'Entregador', 'Quantidade de Mercadorias'];
      const csvContent = [
        headers.join(','),
        ...grouped.map(r => `"${r.date}","${r.driver}","${r.count}"`)
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'historico_conferente.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const headers = ['Código', 'Data/Hora', 'Empresa', 'Entregador', 'Conferente', 'Status'];
      const csvContent = [
        headers.join(','),
        ...filteredHistory.map(r => `"${r.code}","${r.date}","${r.company}","${r.driver}","${r.collaborator}","${r.status}"`)
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'historico_entregas.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Histórico de Entregas</h1>
        <Button variant="outline" className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Filters Header */}
        <div className="p-4 border-b border-border flex flex-col space-y-4 bg-muted/20">
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Pesquisar código, entregador ou empresa..." 
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
                    {/* Em um app real, as empresas viriam do DB. */}
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
                <div className="space-y-1.5 flex-[0.5]">
                  <label className="text-xs font-medium text-muted-foreground">Hora</label>
                  <Input type="time" value={timeFilter} onChange={e => setTimeFilter(e.target.value)} className="bg-background"/>
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
              </div>
              {/* Botão Buscar */}
              <div className="flex justify-end pt-2">
                <Button
                  className="gap-2 px-6"
                  onClick={() => fetchHistory()}
                >
                  <Search className="h-4 w-4" />
                  Buscar
                </Button>
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
                ) : Object.values(
                  filteredHistory.reduce((acc, record) => {
                    const dateStr = record.rawDate.toLocaleDateString();
                    const key = `${record.driver}-${dateStr}`;
                    if (!acc[key]) {
                      acc[key] = {
                        driver: record.driver,
                        date: dateStr,
                        count: 0,
                      };
                    }
                    acc[key].count += 1;
                    return acc;
                  }, {} as Record<string, { driver: string; date: string; count: number }>)
                ).map((group, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{group.date}</td>
                    <td className="px-6 py-4 font-medium">{group.driver}</td>
                    <td className="px-6 py-4 font-bold text-primary">{group.count} pacotes</td>
                  </tr>
                ))}
                
                {!isLoading && filteredHistory.length === 0 && (
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
                ) : filteredHistory.map((record, i) => (
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
                
                {!isLoading && filteredHistory.length === 0 && (
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
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between text-sm text-muted-foreground">
          <div>Mostrando {isConferente 
            ? Object.keys(filteredHistory.reduce((acc, record) => {
                const dateStr = record.rawDate.toLocaleDateString();
                const key = `${record.driver}-${dateStr}`;
                acc[key] = true;
                return acc;
              }, {} as Record<string, boolean>)).length 
            : filteredHistory.length} resultados</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled>Anterior</Button>
            <Button variant="outline" size="sm">Próxima</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
