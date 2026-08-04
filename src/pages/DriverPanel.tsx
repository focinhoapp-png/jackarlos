import React, { useState, useEffect } from 'react';
import { Package, DollarSign, Truck, Phone, CheckCircle2, Navigation, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { supabase } from '@/src/lib/supabase';

interface PackageItem {
  barcode: string;
  companyName: string;
  companyId: string;
  status: string;
  value: number;
}

export function DriverPanel() {
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [activePackages, setActivePackages] = useState<PackageItem[]>([]);
  const [selectedLoadOpen, setSelectedLoadOpen] = useState(false);
  const [itemStatuses, setItemStatuses] = useState<Record<string, 'ENTREGUE' | 'DEVOLVIDA'>>({});
  
  const [metrics, setMetrics] = useState({
    today: 0,
    week: 0,
    month: 0,
    monthEarnings: 0,
    companiesStats: [] as { name: string, count: number, val: number }[]
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    fetchDriverData();
  }, []);

  const fetchDriverData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: driver } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (driver) {
        setDriverInfo(driver);
        await fetchMetrics(driver.id);
      }
    } catch (err) {
      console.error("Erro ao buscar dados do entregador", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetrics = async (driverId: string) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: pkgs } = await supabase
      .from('packages')
      .select('barcode, status, scanned_at, delivery_value_snapshot, driver_bonus_snapshot, companies(id, name)')
      .eq('driver_id', driverId);

    if (pkgs) {
      const active: PackageItem[] = [];
      let today = 0, week = 0, month = 0, monthEarnings = 0;
      const compStats: Record<string, { count: number, val: number }> = {};

      pkgs.forEach((p: any) => {
        const val = Number(p.delivery_value_snapshot || 0) + Number(p.driver_bonus_snapshot || 0);
        
        if (p.status === 'EM_ROTA') {
          active.push({
            barcode: p.barcode,
            companyName: p.companies?.name || 'Desconhecida',
            companyId: p.companies?.id,
            status: p.status,
            value: val
          });
        }

        const date = new Date(p.scanned_at).toISOString();
        if (date >= startOfMonth && p.status === 'ENTREGUE') {
          month++;
          monthEarnings += val;
          const cName = p.companies?.name || 'Desconhecida';
          if (!compStats[cName]) compStats[cName] = { count: 0, val: 0 };
          compStats[cName].count++;
          compStats[cName].val += val;
        }

        if (date >= startOfWeek && p.status === 'ENTREGUE') week++;
        if (date >= startOfDay && p.status === 'ENTREGUE') today++;
      });

      setActivePackages(active);
      
      const compArr = Object.entries(compStats).map(([name, data]) => ({
        name, count: data.count, val: data.val
      })).sort((a, b) => b.count - a.count);

      setMetrics({ today, week, month, monthEarnings, companiesStats: compArr });
    }
  };

  const handleOpenFinishModal = () => {
    const initialStatuses: Record<string, 'ENTREGUE' | 'DEVOLVIDA'> = {};
    activePackages.forEach(p => {
      initialStatuses[p.barcode] = 'ENTREGUE';
    });
    setItemStatuses(initialStatuses);
    setSelectedLoadOpen(true);
  };

  const handleFinishDelivery = async () => {
    if (!driverInfo) return;
    setIsFinishing(true);

    try {
      const entregues = Object.keys(itemStatuses).filter(k => itemStatuses[k] === 'ENTREGUE');
      const devolvidas = Object.keys(itemStatuses).filter(k => itemStatuses[k] === 'DEVOLVIDA');

      if (entregues.length > 0) {
        await supabase.from('packages').update({ status: 'ENTREGUE' }).in('barcode', entregues);
      }
      if (devolvidas.length > 0) {
        await supabase.from('packages').update({ status: 'DEVOLVIDA' }).in('barcode', devolvidas);
      }

      await fetchMetrics(driverInfo.id);
      setSelectedLoadOpen(false);
    } catch (err) {
      console.error("Erro ao finalizar", err);
      alert("Erro ao finalizar entregas.");
    } finally {
      setIsFinishing(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Carregando seu painel...</div>;
  }

  if (!driverInfo) {
    return <div className="p-8 text-center">Perfil de entregador não encontrado. Contate o administrador.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Meu Painel</h1>
      </div>

      {/* Profile Card */}
      <Card className="bg-card border-primary/20 shadow-lg shadow-primary/5">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="h-32 w-32 rounded-2xl bg-secondary flex items-center justify-center shrink-0 border-4 border-background overflow-hidden relative">
              {driverInfo.photo_url ? (
                <img src={driverInfo.photo_url} alt={driverInfo.name} className="h-full w-full object-cover" />
              ) : (
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${driverInfo.name}&backgroundColor=3b82f6`} alt={driverInfo.name} className="h-full w-full object-cover" />
              )}
              <div className="absolute bottom-1 right-1 h-4 w-4 bg-success border-2 border-background rounded-full"></div>
            </div>
            
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-3xl font-bold mb-2">{driverInfo.name}</h2>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Truck className="h-4 w-4" /> {driverInfo.vehicle_type} ({driverInfo.vehicle_plate || 'Sem placa'})</span>
                <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> {driverInfo.phone || 'Sem telefone'}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Deliveries */}
      {activePackages.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Cargas Ativas</h2>
          <Card className="border-primary/50 overflow-hidden">
            <div className="bg-primary text-primary-foreground px-4 py-2 font-bold text-sm flex items-center gap-2">
              <Navigation className="h-4 w-4" />
              SAIU PARA ENTREGA
            </div>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h3 className="font-bold text-lg mb-1">Carga em Rota</h3>
                  <p className="text-sm text-muted-foreground">
                    {activePackages.length} pacotes carregados
                  </p>
                </div>
                <Button onClick={handleOpenFinishModal}>
                  Finalizar Entregas
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4 grid-cols-2">
        <Card className="bg-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entregas Hoje</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{metrics.today}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Semana</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{metrics.week}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mês</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{metrics.month}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-success/30">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-success">Ganhos Mês</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-success">R$ {metrics.monthEarnings.toFixed(2).replace('.', ',')}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Entregas por Empresa (Mês)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics.companiesStats.length > 0 ? metrics.companiesStats.map(company => (
                <div key={company.name} className="flex items-center justify-between">
                  <span className="font-medium">{company.name}</span>
                  <span className="font-bold bg-secondary px-3 py-1 rounded-full">{company.count}</span>
                </div>
              )) : <div className="text-sm text-muted-foreground">Nenhuma entrega no mês</div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-success" />
              Financeiro Detalhado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics.companiesStats.length > 0 ? (
                <>
                  {metrics.companiesStats.map(company => (
                    <div key={company.name} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <div>
                        <div className="font-medium">{company.name}</div>
                        <div className="text-xs text-muted-foreground">{company.count} entregas concluídas</div>
                      </div>
                      <div className="font-bold text-success">R$ {company.val.toFixed(2).replace('.', ',')}</div>
                    </div>
                  ))}
                  <div className="pt-4 border-t border-border mt-4 flex items-center justify-between">
                    <span className="font-bold text-lg">Total Gerado</span>
                    <span className="font-black text-xl text-success">R$ {metrics.monthEarnings.toFixed(2).replace('.', ',')}</span>
                  </div>
                </>
              ) : <div className="text-sm text-muted-foreground">Sem histórico financeiro no mês</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={selectedLoadOpen} onOpenChange={setSelectedLoadOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Finalizar Entregas</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Marque o status de cada mercadoria. Por padrão, todas estão como entregues.
            </p>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {activePackages.map((item) => (
                <div key={item.barcode} className="flex items-center justify-between p-3 border border-border rounded-lg bg-card">
                  <div>
                    <div className="font-mono font-bold text-sm">{item.barcode}</div>
                    <div className="text-xs text-muted-foreground">{item.companyName}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant={itemStatuses[item.barcode] === 'ENTREGUE' ? 'default' : 'outline'}
                      className={itemStatuses[item.barcode] === 'ENTREGUE' ? 'bg-success hover:bg-success/90' : ''}
                      onClick={() => setItemStatuses({...itemStatuses, [item.barcode]: 'ENTREGUE'})}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" /> Entregue
                    </Button>
                    <Button 
                      size="sm" 
                      variant={itemStatuses[item.barcode] === 'DEVOLVIDA' ? 'destructive' : 'outline'}
                      onClick={() => setItemStatuses({...itemStatuses, [item.barcode]: 'DEVOLVIDA'})}
                    >
                      <AlertCircle className="h-4 w-4 mr-1" /> Devolvida
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLoadOpen(false)}>Cancelar</Button>
            <Button onClick={handleFinishDelivery} disabled={isFinishing}>
              {isFinishing ? 'Finalizando...' : 'Confirmar Finalização'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
