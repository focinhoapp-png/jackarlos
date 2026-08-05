import React, { useState, useEffect } from 'react';
import { User, CheckCircle2, Truck, GripVertical, Plus, Building2, Package, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Input } from "@/src/components/ui/input";
import { supabase } from '@/src/lib/supabase';
import { logAction } from '@/src/lib/audit';

interface Company {
  id: string;
  name: string;
  value_per_delivery: number;
  logo_url?: string;
}

interface DriverInfo {
  id: string;
  name: string;
  vehicle_type: string;
  vehicle_plate: string;
  base_location: string;
  bonus_per_delivery: number;
}

interface ScannedItem {
  code: string;
  companyId: string;
  companyName: string;
  time: string;
  status: 'success' | 'error';
  value: number;
}

export function ScannerPanel() {
  const [allDrivers, setAllDrivers] = useState<DriverInfo[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [bases, setBases] = useState<string[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [selectedActiveDelivery, setSelectedActiveDelivery] = useState<any | null>(null);
  const [adjustingCompany, setAdjustingCompany] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');

  const [queue, setQueue] = useState<DriverInfo[]>(() => {
    const saved = localStorage.getItem('driverQueueV3');
    if (saved) return JSON.parse(saved);
    return [];
  });

  const [selectedBase, setSelectedBase] = useState<string>('');
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [companyCounts, setCompanyCounts] = useState<Record<string, number>>({});
  
  const [lastScanStatus, setLastScanStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchInitialData();
    loadActiveDeliveries();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id);
        const { data: ud } = await supabase.from('users').select('role').eq('id', user.id).single();
        if (ud?.role) setCurrentUserRole(ud.role);
      }
    });
  }, []);

  const fetchInitialData = async () => {
    const [driversRes, companiesRes, basesRes] = await Promise.all([
      supabase.from('drivers').select('*').eq('status', true),
      supabase.from('companies').select('id, name, value_per_delivery, logo_url').eq('status', true),
      supabase.from('bases').select('name').eq('status', true).order('name')
    ]);
    if (driversRes.data) setAllDrivers(driversRes.data as any[]);
    if (companiesRes.data) {
      setCompanies(companiesRes.data as any[]);
      const initialCounts: Record<string, number> = {};
      companiesRes.data.forEach(c => { initialCounts[c.name] = 0; });
      setCompanyCounts(initialCounts);
    }
    if (basesRes.data) setBases(basesRes.data.map((b: any) => b.name));
  };

  const loadActiveDeliveries = async () => {
    const { data, error } = await supabase
      .from('packages')
      .select('driver_id, barcode, company_id, scanned_at, scanned_by, drivers(name, vehicle_type, vehicle_plate), companies(name)')
      .eq('status', 'EM_ROTA');
      
    if (!error && data) {
      const grouped = data.reduce((acc: any, pkg: any) => {
        if (!acc[pkg.driver_id]) {
          acc[pkg.driver_id] = {
            id: pkg.driver_id,
            driverName: pkg.drivers?.name,
            vehicle: pkg.drivers?.vehicle_type,
            plate: pkg.drivers?.vehicle_plate,
            scannedBy: pkg.scanned_by, // conferente que carregou
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
      const result = Object.values(grouped) as any[];
      setActiveDeliveries(result);
      return result;
    }
    return [];
  };

  useEffect(() => {
    const queueToSave = queue.map(d => {
      if (driver && d.id === driver.id) {
        return {
          ...d,
          totals: companyCounts,
          total: scannedItems.length
        };
      }
      return {
        ...d,
        totals: {},
        total: 0
      };
    });
    localStorage.setItem('driverQueueV3', JSON.stringify(queueToSave));
    window.dispatchEvent(new Event('driverQueueUpdated'));
  }, [queue, driver, companyCounts, scannedItems]);

  // bases agora vêm direto do banco (tabela 'bases'), não dos entregadores

  const handleDragStart = (index: number) => setDraggedItemIndex(index);
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();
  const handleDrop = (index: number) => {
    if (draggedItemIndex === null) return;
    const newQueue = [...queue];
    const draggedItem = newQueue[draggedItemIndex];
    newQueue.splice(draggedItemIndex, 1);
    newQueue.splice(index, 0, draggedItem);
    setQueue(newQueue);
    setDraggedItemIndex(null);
  };

  const addToQueue = (newDriver: DriverInfo) => setQueue(prev => [...prev, newDriver]);
  const removeFromQueue = (driverId: string) => setQueue(prev => prev.filter(d => d.id !== driverId));

  const handlePackageScan = () => {
    // Scanner simulado desativado — contagem manual ativa
  };

  const handleManualCountChange = (companyName: string, newCountStr: string) => {
    const newCount = parseInt(newCountStr, 10);
    if (isNaN(newCount) || newCount < 0) return;
    
    const company = companies.find(c => c.name === companyName);
    if (!company) return;

    const currentCount = companyCounts[companyName] || 0;
    if (newCount === currentCount) return;
    
    if (newCount > currentCount) {
      const diff = newCount - currentCount;
      const newItems: ScannedItem[] = [];
      for (let i = 0; i < diff; i++) {
        newItems.push({
          code: `PKG-${crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()}`,
          companyId: company.id,
          companyName: company.name,
          time: new Date().toLocaleTimeString(),
          status: 'success',
          value: company.value_per_delivery
        });
      }
      setScannedItems(prev => [...newItems, ...prev]);
    } else if (newCount < currentCount) {
      const diff = currentCount - newCount;
      setScannedItems(prev => {
        let removed = 0;
        return prev.filter(item => {
          if (item.companyName === companyName && removed < diff) {
            removed++;
            return false;
          }
          return true;
        });
      });
    }
    
    setCompanyCounts(prev => ({
      ...prev,
      [companyName]: newCount
    }));
  };

  const handleFinishLoading = async () => {
    if (driver && scannedItems.length > 0) {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;

      if (!userId) {
        alert("Erro: Usuário não autenticado!");
        return;
      }

      // Busca nome e email do usuário logado para o log
      const { data: userData } = await supabase
        .from('users')
        .select('name, email, role')
        .eq('id', userId)
        .single();

      // Preparar payload para bulk insert
      const insertPayload = scannedItems.map(item => ({
        barcode: item.code,
        company_id: item.companyId,
        driver_id: driver.id,
        scanned_by: userId,
        status: 'EM_ROTA',
        delivery_value_snapshot: item.value || 0,
        driver_bonus_snapshot: driver.bonus_per_delivery || 0,
        base_location: driver.base_location || 'Guapimirim'
      }));

      const { error } = await supabase.from('packages').insert(insertPayload);

      if (error) {
        alert("Erro ao salvar pacotes: " + error.message);
      } else {
        // Registrar log de carregamento
        if (userData) {
          await logAction(
            userData.email || userData.name || 'Desconhecido',
            'CARREGOU',
            'CARREGAMENTO',
            `${driver.name} — ${scannedItems.length} pacotes por ${userData.name || userData.email}`
          );
        }

        removeFromQueue(driver.id);
        setDriver(null);
        setScannedItems([]);
        const resetCounts: Record<string, number> = {};
        companies.forEach(c => { resetCounts[c.name] = 0; });
        setCompanyCounts(resetCounts);
        loadActiveDeliveries();
      }
    }
  };

  const handleAdjustCompanyCount = async (driverId: string, companyName: string, direction: 'down' | 'up') => {
    setAdjustingCompany(companyName);
    try {
      if (direction === 'down') {
        // Busca 1 pacote EM_ROTA desta empresa/entregador e marca como DEVOLVIDA
        const { data: pkgs } = await supabase
          .from('packages')
          .select('barcode, companies(name)')
          .eq('driver_id', driverId)
          .eq('status', 'EM_ROTA')
          .limit(200);

        const target = pkgs?.find((p: any) => p.companies?.name === companyName);
        if (!target) { setAdjustingCompany(null); return; }

        const { error } = await supabase
          .from('packages')
          .update({ status: 'DEVOLVIDA' })
          .eq('barcode', target.barcode);

        if (error) alert('Erro ao atualizar: ' + error.message);
      } else {
        // Busca 1 pacote DEVOLVIDA desta empresa/entregador e reverte para EM_ROTA
        const { data: pkgs } = await supabase
          .from('packages')
          .select('barcode, companies(name)')
          .eq('driver_id', driverId)
          .eq('status', 'DEVOLVIDA')
          .limit(200);

        const target = pkgs?.find((p: any) => p.companies?.name === companyName);
        if (!target) { setAdjustingCompany(null); return; }

        const { error } = await supabase
          .from('packages')
          .update({ status: 'EM_ROTA' })
          .eq('barcode', target.barcode);

        if (error) alert('Erro ao atualizar: ' + error.message);
      }

      await loadActiveDeliveries().then((freshList) => {
        // Sincroniza o modal com os dados atualizados do entregador
        setSelectedActiveDelivery((prev: any) => {
          if (!prev) return null;
          return freshList.find((d: any) => d.id === prev.id) || null;
        });
      });
    } finally {
      setAdjustingCompany(null);
    }
  };

  const handleFinalizeDelivery = async () => {
    if (!selectedActiveDelivery) return;
    const total = selectedActiveDelivery.scannedItems?.length || 0;
    if (total === 0) return;
    const confirmed = window.confirm(
      `Confirmar que ${selectedActiveDelivery.driverName} finalizou todas as ${total} entregas em rota?`
    );
    if (!confirmed) return;
    setFinalizing(true);
    try {
      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;
      let userName = 'Desconhecido';
      let userEmail = 'Desconhecido';
      if (userId) {
        const { data: ud } = await supabase.from('users').select('name, email').eq('id', userId).single();
        if (ud) {
          userName = ud.name || 'Desconhecido';
          userEmail = ud.email || 'Desconhecido';
        }
      }

      const barcodes = selectedActiveDelivery.scannedItems.map((i: any) => i.code);
      const { error } = await supabase
        .from('packages')
        .update({ status: 'ENTREGUE' })
        .in('barcode', barcodes);
      if (error) {
        alert('Erro ao finalizar entregas: ' + error.message);
      } else {
        let carregouName = 'Desconhecido';
        if (selectedActiveDelivery.scannedBy) {
           const { data: scanUser } = await supabase.from('users').select('name').eq('id', selectedActiveDelivery.scannedBy).single();
           if (scanUser && scanUser.name) carregouName = scanUser.name;
        }

        await logAction(
          userEmail !== 'Desconhecido' ? userEmail : userName,
          'FINALIZOU',
          'CARREGAMENTO',
          `Entregas de ${selectedActiveDelivery.driverName} finalizadas. Carregado por: ${carregouName} | Finalizado por: ${userName}`
        );

        await loadActiveDeliveries();
        setSelectedActiveDelivery(null);
      }
    } finally {
      setFinalizing(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Simulação por ENTER desativada
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [driver, companies]);

  if (!driver) {
    const availableDrivers = allDrivers.filter(d => 
      (d.base_location || 'Guapimirim') === selectedBase && 
      !queue.find(q => q.id === d.id) &&
      !activeDeliveries.find(ad => ad.id === d.id)
    );

    return (
      <div className="flex flex-col space-y-8 pb-8">
        {/* Section: Adicionar à Fila */}
        <div>
          <h2 className="text-xl font-bold tracking-tight mb-1">Adicionar Entregador</h2>
          <p className="text-muted-foreground mb-4">Selecione uma base para visualizar e adicionar os entregadores disponíveis.</p>
          
          <div className="max-w-xs mb-6">
            <Select value={selectedBase} onValueChange={setSelectedBase}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Selecione a Base" />
              </SelectTrigger>
              <SelectContent>
                {bases.map(base => (
                  <SelectItem key={base} value={base}>{base}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedBase && (
            <div>
              {availableDrivers.length === 0 ? (
                <div className="p-4 text-center bg-card border border-border rounded-xl text-muted-foreground text-sm">
                  Todos os entregadores desta base já estão na fila.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {availableDrivers.map((d) => (
                    <Card key={d.id} className="bg-card border-border">
                      <CardContent className="p-4 flex flex-col items-center text-center space-y-3 relative">
                        <div className="h-12 w-12 bg-secondary rounded-full flex items-center justify-center border-2 border-primary/10">
                          <User className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm line-clamp-1" title={d.name}>{d.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                            <Truck className="h-3 w-3"/> {d.vehicle_type || '-'}
                          </p>
                          <p className="text-xs font-mono bg-secondary px-2 py-0.5 rounded mt-1 inline-block">{d.vehicle_plate || 'Sem Placa'}</p>
                        </div>
                        <div className="w-full pt-3 border-t border-border flex justify-center">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full gap-2 border-primary/20 hover:bg-primary/5 hover:text-primary"
                            onClick={() => addToQueue(d)}
                          >
                            <Plus className="h-4 w-4" />
                            Adicionar à Fila
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section: Fila de Carregamento */}
        <div className="pt-6 border-t border-border">
          <h2 className="text-2xl font-bold tracking-tight mb-1">Fila de Carregamento</h2>
          <p className="text-muted-foreground mb-4">Arraste os entregadores para organizar a ordem de carregamento.</p>
          
          {queue.length === 0 ? (
            <div className="p-8 text-center bg-card border border-border rounded-xl text-muted-foreground">
              A fila está vazia. Adicione entregadores abaixo.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {queue.map((d, index) => {
                const isFirst = index === 0;
                return (
                  <div 
                    key={d.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(index)}
                  >
                    <Card 
                      className={`relative overflow-hidden cursor-pointer transition-all hover:shadow-md ${isFirst ? 'border-primary shadow-[0_0_15px_rgba(59,130,246,0.15)] bg-primary/5' : 'bg-card border-border hover:border-primary/50'}`}
                      onClick={() => setDriver(d)}
                    >
                      {isFirst && (
                        <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
                      )}
                      <CardContent className="p-4 flex flex-col items-center text-center space-y-3 relative">
                        <div className="absolute top-2 right-2 text-muted-foreground opacity-50 cursor-grab hover:opacity-100">
                          <GripVertical className="h-5 w-5" />
                        </div>
                        <div className="h-16 w-16 bg-secondary rounded-full flex items-center justify-center border-2 border-primary/20">
                          <User className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm line-clamp-1" title={d.name}>{d.name}</h3>
                          <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                            <Truck className="h-3 w-3"/> {d.vehicle_type || '-'}
                          </p>
                          <p className="text-xs font-mono bg-secondary px-2 py-0.5 rounded mt-1 inline-block">{d.vehicle_plate || 'Sem Placa'}</p>
                        </div>
                        <div className="w-full pt-3 border-t border-border flex justify-between items-center">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 text-xs px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromQueue(d.id);
                            }}
                          >
                            Remover
                          </Button>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${isFirst ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {isFirst ? 'Carregando' : 'Aguardando'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section: Entregadores em Rota */}
        {activeDeliveries.length > 0 && (
          <div className="pt-6 border-t border-border">
            <h2 className="text-xl font-bold tracking-tight mb-1">Em Rota (Saiu para Entrega)</h2>
            <p className="text-muted-foreground mb-4">Entregadores que estão atualmente realizando entregas.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeDeliveries.map((load) => (
                <Card 
                  key={load.id} 
                  className="bg-card border-border cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => setSelectedActiveDelivery(load)}
                >
                  <div className="bg-primary/10 text-primary px-4 py-2 text-xs font-bold flex items-center gap-2 uppercase tracking-wider">
                    <Truck className="h-3 w-3" />
                    SAIU PARA ENTREGA
                  </div>
                  <CardContent className="p-4 flex flex-col space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-secondary rounded-full flex items-center justify-center border border-primary/20">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm line-clamp-1" title={load.driverName}>{load.driverName}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{load.vehicle} • {load.plate}</p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-border flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Mercadorias:</span>
                      <span className="font-bold text-foreground">{load.scannedItems?.length || 0} pacotes</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Dialog open={!!selectedActiveDelivery} onOpenChange={(open) => !open && setSelectedActiveDelivery(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Carga em Rota
              </DialogTitle>
            </DialogHeader>
            {selectedActiveDelivery && (
              <div className="py-4 space-y-4">
                <div className="flex items-center gap-4 bg-muted/20 p-3 rounded-lg border border-border">
                   <div className="h-12 w-12 bg-secondary rounded-full flex items-center justify-center border border-primary/20 shrink-0">
                     <User className="h-6 w-6 text-muted-foreground" />
                   </div>
                   <div>
                     <h3 className="font-bold">{selectedActiveDelivery.driverName}</h3>
                     <p className="text-sm text-muted-foreground">{selectedActiveDelivery.vehicle} • {selectedActiveDelivery.plate}</p>
                   </div>
                </div>
                
                {/* Pacotes por Empresa com controles +/− */}
                {(() => {
                  const companySummary: Record<string, number> = {};
                  selectedActiveDelivery.scannedItems?.forEach((item: any) => {
                    const name = item.company || 'Desconhecida';
                    companySummary[name] = (companySummary[name] || 0) + 1;
                  });
                  const entries = Object.entries(companySummary);
                  const total = entries.reduce((s, [, v]) => s + v, 0);
                  if (entries.length === 0) return (
                    <p className="text-sm text-center text-muted-foreground py-6">Nenhum pacote em rota.</p>
                  );
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Pacotes por Empresa
                        </h4>
                        <span className="text-xs font-bold bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                          Total: {total}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {entries.map(([companyName, count]) => {
                          const isLoading = adjustingCompany === companyName;
                          const companyData = companies.find(c => c.name === companyName);
                          return (
                            <div
                              key={companyName}
                              className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/30 border border-border"
                            >
                              <div className="flex items-center gap-2.5">
                                {companyData?.logo_url ? (
                                  <div className="h-8 w-8 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                                    <img src={companyData.logo_url} alt={companyName} className="max-w-full max-h-full object-contain" />
                                  </div>
                                ) : (
                                  <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                    <Building2 className="h-4 w-4 text-primary" />
                                  </div>
                                )}
                                <span className="text-sm font-medium">{companyName}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                  <>
                                    <button
                                      disabled={isLoading || count <= 0}
                                      onClick={() => handleAdjustCompanyCount(selectedActiveDelivery.id, companyName, 'down')}
                                      className="h-7 w-7 rounded-lg border border-border bg-card flex items-center justify-center text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                      title="Marcar 1 como devolvida"
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </button>
                                    <span className="text-sm font-bold tabular-nums w-8 text-center">
                                      {isLoading ? '…' : count}
                                    </span>
                                    <button
                                      disabled={isLoading}
                                      onClick={() => handleAdjustCompanyCount(selectedActiveDelivery.id, companyName, 'up')}
                                      className="h-7 w-7 rounded-lg border border-border bg-card flex items-center justify-center text-green-600 hover:bg-green-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                      title="Reverter 1 devolvida para em rota"
                                    >
                                      <ChevronUp className="h-4 w-4" />
                                    </button>
                                  </>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            <DialogFooter className="flex items-center justify-between sm:justify-between w-full gap-2">
              <Button variant="outline" onClick={() => setSelectedActiveDelivery(null)}>Fechar</Button>
              {(() => {
                return (
                  <Button
                    onClick={handleFinalizeDelivery}
                    disabled={finalizing || !selectedActiveDelivery?.scannedItems?.length}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {finalizing ? 'Finalizando...' : 'Finalizar Entregas'}
                  </Button>
                );
              })()}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const totalScanned = Object.values(companyCounts).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className={`h-full flex flex-col transition-colors duration-300 ${lastScanStatus === 'success' ? 'bg-success/5' : lastScanStatus === 'error' ? 'bg-destructive/10' : ''}`}>
      
      {/* Driver Info Header */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 bg-secondary rounded-full flex items-center justify-center border-2 border-primary/50">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{driver.name}</h3>
            <div className="flex items-center text-muted-foreground text-sm gap-3 mt-1">
              <span className="flex items-center gap-1"><Truck className="h-4 w-4"/> {driver.vehicle_type || '-'}</span>
              <span className="px-2 py-0.5 bg-secondary rounded-md text-xs font-mono">{driver.vehicle_plate || '-'}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground mb-1">Total Carregado</div>
          <div className="text-4xl font-black text-primary">{totalScanned}</div>
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        
        {/* Companies Summary */}
        <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar">
          {Object.entries(companyCounts).map(([companyName, count]) => {
            const company = companies.find(c => c.name === companyName);
            return (
              <Card key={companyName} className="bg-card border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  {/* Logo da empresa */}
                  {company?.logo_url ? (
                    <div className="h-10 w-10 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                      <img src={company.logo_url} alt={companyName} className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <span className="font-medium flex-1 truncate">{companyName}</span>
                  <div className="w-24 shrink-0">
                    <Input
                      type="number"
                      min="0"
                      value={count === 0 ? '' : count}
                      placeholder="0"
                      className="text-right text-xl font-bold h-12"
                      onChange={(e) => {
                        const val = e.target.value === '' ? '0' : e.target.value;
                        handleManualCountChange(companyName, val);
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="mt-auto pt-4">
            <Button className="w-full h-14 text-lg font-bold" onClick={handleFinishLoading} disabled={scannedItems.length === 0}>
              Finalizar Carregamento
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
