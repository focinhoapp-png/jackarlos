import { useEffect, useState } from 'react';
import { Package, Truck, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/src/lib/supabase';

interface DriverInfo {
  id: number;
  name: string;
  vehicle: string;
  plate: string;
  base?: string;
  totals?: Record<string, number>;
  total?: number;
}

export function TVPanel() {
  const [time, setTime] = useState(new Date());
  const navigate = useNavigate();
  
  const [drivers, setDrivers] = useState<DriverInfo[]>(() => {
    const saved = localStorage.getItem('driverQueueV3');
    if (saved) return JSON.parse(saved);
    return [];
  });
  
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('driverQueueV3');
      if (saved) {
        setDrivers(JSON.parse(saved));
      } else {
        setDrivers([]);
      }
    };

    window.addEventListener('driverQueueUpdated', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('driverQueueUpdated', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    loadActiveDeliveries();
    const activeTimer = setInterval(loadActiveDeliveries, 5000);
    return () => clearInterval(activeTimer);
  }, []);

  const loadActiveDeliveries = async () => {
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;
    let fetchError = null;

    while (hasMore) {
      const { data, error } = await supabase
        .from('packages')
        .select('driver_id, barcode, company_id, scanned_at, drivers(name, vehicle_type, vehicle_plate), companies(name)')
        .eq('status', 'EM_ROTA')
        .range(from, from + step - 1);
        
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
      
    if (!fetchError && allData) {
      const grouped = allData.reduce((acc: any, pkg: any) => {
        if (!acc[pkg.driver_id]) {
          acc[pkg.driver_id] = {
            id: pkg.driver_id,
            driverName: pkg.drivers?.name,
            vehicle: pkg.drivers?.vehicle_type,
            plate: pkg.drivers?.vehicle_plate,
            scannedItems: []
          };
        }
        acc[pkg.driver_id].scannedItems.push({
          code: pkg.barcode,
          company: pkg.companies?.name,
          time: new Date(pkg.scanned_at).toLocaleTimeString()
        });
        return acc;
      }, {});
      setActiveDeliveries(Object.values(grouped));
    }
  };

  // Compute total deliveries for today
  const totalDeliveries = drivers.reduce((sum, d) => sum + (d.total || 0), 0);

  return (
    <div className="fixed inset-0 bg-background flex flex-col z-50 overflow-hidden">
      {/* Top Header */}
      <header className="h-auto py-4 bg-card border-b border-border flex flex-col md:flex-row items-start md:items-center justify-between px-4 lg:px-10 gap-4 md:gap-0">
        <div className="flex items-center gap-2 sm:gap-4 w-full md:w-auto">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} className="mr-2 sm:mr-4 rounded-full h-10 w-10 sm:h-12 sm:w-12 border-border bg-background hover:bg-muted shrink-0">
            <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6 text-foreground" />
          </Button>
          <div className="h-10 w-10 sm:h-14 sm:w-14 bg-primary/5 rounded-xl flex items-center justify-center border border-primary/20 overflow-hidden shrink-0">
            <img src="/logotipo.PNG" alt="Logotipo" className="h-full w-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight truncate">Operações</h1>
            <p className="text-xs sm:text-lg text-muted-foreground truncate">Jackarlos Transportes</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between md:justify-end gap-4 md:gap-12 w-full md:w-auto">
          <div className="text-center md:text-left">
            <div className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">Entregas</div>
            <div className="text-xl sm:text-3xl font-bold text-primary">{totalDeliveries}</div>
          </div>
          <div className="text-center md:text-left">
            <div className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">Fila</div>
            <div className="text-xl sm:text-3xl font-bold text-success">{drivers.length}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl sm:text-4xl font-mono font-bold tracking-tight">{time.toLocaleTimeString()}</div>
            <div className="text-xs sm:text-lg text-muted-foreground">{time.toLocaleDateString()}</div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-4 lg:p-10 bg-background/50 overflow-y-auto">
        {/* Fila Section */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold mb-6 tracking-tight flex items-center gap-2">
            Fila de Carregamento
          </h2>
          
          <div className="grid gap-4 lg:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 content-start">
            {drivers.length === 0 ? (
              <div className="col-span-full h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 py-20">
                <Truck className="h-16 w-16 mb-4" />
                <h2 className="text-2xl font-bold">Nenhum carregamento na fila</h2>
                <p>Adicione entregadores no painel de carregamentos.</p>
              </div>
            ) : (
          drivers.map((driver, idx) => {
            const isFirst = idx === 0;
            return (
              <Card key={driver.id} className={`relative overflow-hidden transition-all duration-500 ${
                isFirst 
                  ? 'border-primary shadow-[0_0_30px_rgba(59,130,246,0.15)] bg-primary/5' 
                  : 'border-border bg-card'
              }`}>
                {isFirst && (
                  <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse"></div>
                )}
                
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-start justify-between mb-4 sm:mb-6 gap-2 sm:gap-0">
                    <div className="w-full sm:w-auto">
                      <h3 className="text-xl sm:text-2xl font-bold mb-1 line-clamp-1" title={driver.name}>{driver.name}</h3>
                      <div className="flex items-center text-muted-foreground gap-2">
                        <Truck className="h-4 w-4" />
                        <span className="font-medium">{driver.vehicle}</span>
                      </div>
                    </div>
                    
                    {isFirst ? (
                      <span className="bg-primary/20 text-primary px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider animate-pulse flex items-center gap-2 self-start">
                        <div className="h-2 w-2 rounded-full bg-primary"></div>
                        Carregando
                      </span>
                    ) : (
                      <span className="bg-secondary text-muted-foreground px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider self-start">
                        Aguardando
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 mb-6">
                    {Object.entries(driver.totals || {}).map(([company, count]) => (
                      <div key={company} className="flex justify-between items-center bg-background/50 rounded-lg px-4 py-2 border border-border/50">
                        <span className="font-medium text-muted-foreground">{company}</span>
                        <span className="text-xl font-bold">{count as number}</span>
                      </div>
                    ))}
                    {(!driver.totals || Object.keys(driver.totals).length === 0) && (
                      <div className="text-center text-muted-foreground text-sm py-2">
                        Sem pacotes lidos
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-border flex items-center justify-between">
                    <span className="text-muted-foreground font-medium uppercase tracking-wider text-sm">Total Geral</span>
                    <span className="text-4xl font-black text-foreground">{driver.total || 0}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
          </div>
        </div>

        {/* Em Rota Section */}
        {activeDeliveries.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-6 pt-6 border-t border-border tracking-tight flex items-center gap-2">
              Em Rota (Saiu para Entrega)
            </h2>
            <div className="grid gap-4 lg:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 content-start">
              {activeDeliveries.map(load => (
                <Card key={load.id} className="bg-card border-border overflow-hidden">
                  <div className="bg-primary/10 text-primary px-4 py-2 text-xs font-bold flex items-center gap-2 uppercase tracking-wider">
                    <Truck className="h-3 w-3" />
                    SAIU PARA ENTREGA
                  </div>
                  <CardContent className="p-4 sm:p-6">
                    <h3 className="text-xl sm:text-2xl font-bold mb-1 line-clamp-1" title={load.driverName}>{load.driverName}</h3>
                    <div className="flex items-center text-muted-foreground gap-2 mb-6">
                      <Truck className="h-4 w-4" />
                      <span className="font-medium">{load.vehicle} - {load.plate}</span>
                    </div>
                    <div className="pt-4 border-t border-border flex items-center justify-between">
                      <span className="text-muted-foreground font-medium uppercase tracking-wider text-sm">Total Geral</span>
                      <span className="text-4xl font-black text-foreground">{load.scannedItems.length}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
