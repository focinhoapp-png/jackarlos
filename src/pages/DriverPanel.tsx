import React, { useState, useEffect } from 'react';
import { Package, DollarSign, Truck, Phone, CheckCircle2, Navigation, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';

export function DriverPanel() {
  const [activeDeliveries, setActiveDeliveries] = useState<any[]>([]);
  const [selectedLoad, setSelectedLoad] = useState<any | null>(null);
  const [itemStatuses, setItemStatuses] = useState<Record<string, 'Entregue' | 'Devolvida'>>({});

  useEffect(() => {
    const loadDeliveries = () => {
      const saved = localStorage.getItem('activeDeliveries');
      if (saved) {
        setActiveDeliveries(JSON.parse(saved));
      }
    };
    loadDeliveries();
    window.addEventListener('deliveriesUpdated', loadDeliveries);
    return () => window.removeEventListener('deliveriesUpdated', loadDeliveries);
  }, []);

  const handleOpenFinishModal = (load: any) => {
    setSelectedLoad(load);
    const initialStatuses: Record<string, 'Entregue' | 'Devolvida'> = {};
    load.scannedItems.forEach((item: any) => {
      initialStatuses[item.code] = 'Entregue';
    });
    setItemStatuses(initialStatuses);
  };

  const handleFinishDelivery = () => {
    if (!selectedLoad) return;
    
    // Save to Estoque
    const savedEstoque = localStorage.getItem('estoque');
    const estoque = savedEstoque ? JSON.parse(savedEstoque) : [];
    
    const finishedLoad = {
      ...selectedLoad,
      status: 'FINALIZADO',
      endTime: new Date().toISOString(),
      items: selectedLoad.scannedItems.map((item: any) => ({
        ...item,
        finalStatus: itemStatuses[item.code]
      }))
    };
    
    estoque.push(finishedLoad);
    localStorage.setItem('estoque', JSON.stringify(estoque));
    
    // Remove from active
    const newActive = activeDeliveries.filter(d => d.id !== selectedLoad.id);
    localStorage.setItem('activeDeliveries', JSON.stringify(newActive));
    setActiveDeliveries(newActive);
    
    window.dispatchEvent(new Event('deliveriesUpdated'));
    window.dispatchEvent(new Event('estoqueUpdated'));
    setSelectedLoad(null);
  };

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
              <img 
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Carlos&backgroundColor=3b82f6" 
                alt="Carlos Silva" 
                className="h-full w-full object-cover"
              />
              <div className="absolute bottom-1 right-1 h-4 w-4 bg-success border-2 border-background rounded-full"></div>
            </div>
            
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-3xl font-bold mb-2">Carlos Silva</h2>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Truck className="h-4 w-4" /> Fiat Fiorino (ABC-1234)</span>
                <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> (11) 98765-4321</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Deliveries */}
      {activeDeliveries.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Cargas Ativas</h2>
          {activeDeliveries.map(load => (
            <Card key={load.id} className="border-primary/50 overflow-hidden">
              <div className="bg-primary text-primary-foreground px-4 py-2 font-bold text-sm flex items-center gap-2">
                <Navigation className="h-4 w-4" />
                SAIU PARA ENTREGA
              </div>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <div>
                    <h3 className="font-bold text-lg mb-1">Carga #{load.id.toUpperCase()}</h3>
                    <p className="text-sm text-muted-foreground">
                      {load.scannedItems.length} pacotes carregados
                    </p>
                  </div>
                  <Button onClick={() => handleOpenFinishModal(load)}>
                    Finalizar Entregas
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4 grid-cols-2">
        <Card className="bg-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entregas Hoje</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">42</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Semana</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">184</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mês</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">842</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-success/30">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-medium text-success">Ganhos Mês</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-success">R$ 2.840,50</div>
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
              {[
                { name: 'GFL Logística', count: 52 },
                { name: 'IMile Logistics', count: 31 },
                { name: 'Fast', count: 14 },
                { name: 'Casas Bahia', count: 12 },
              ].map(company => (
                <div key={company.name} className="flex items-center justify-between">
                  <span className="font-medium">{company.name}</span>
                  <span className="font-bold bg-secondary px-3 py-1 rounded-full">{company.count}</span>
                </div>
              ))}
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
              {[
                { name: 'GFL Logística', count: 52, val: 2.80 },
                { name: 'IMile Logistics', count: 31, val: 3.20 },
                { name: 'Fast', count: 14, val: 4.00 },
                { name: 'Casas Bahia', count: 12, val: 3.50 },
              ].map(company => (
                <div key={company.name} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <div>
                    <div className="font-medium">{company.name}</div>
                    <div className="text-xs text-muted-foreground">{company.count} × R$ {company.val.toFixed(2)}</div>
                  </div>
                  <div className="font-bold text-success">R$ {(company.count * company.val).toFixed(2)}</div>
                </div>
              ))}
              <div className="pt-4 border-t border-border mt-4 flex items-center justify-between">
                <span className="font-bold text-lg">Total a Receber</span>
                <span className="font-black text-xl text-success">R$ 346,40</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedLoad} onOpenChange={(open) => !open && setSelectedLoad(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Finalizar Entregas</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Marque o status de cada mercadoria. Por padrão, todas estão como entregues.
            </p>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {selectedLoad?.scannedItems.map((item: any) => (
                <div key={item.code} className="flex items-center justify-between p-3 border border-border rounded-lg bg-card">
                  <div>
                    <div className="font-mono font-bold text-sm">{item.code}</div>
                    <div className="text-xs text-muted-foreground">{item.company}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant={itemStatuses[item.code] === 'Entregue' ? 'default' : 'outline'}
                      className={itemStatuses[item.code] === 'Entregue' ? 'bg-success hover:bg-success/90' : ''}
                      onClick={() => setItemStatuses({...itemStatuses, [item.code]: 'Entregue'})}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" /> Entregue
                    </Button>
                    <Button 
                      size="sm" 
                      variant={itemStatuses[item.code] === 'Devolvida' ? 'destructive' : 'outline'}
                      onClick={() => setItemStatuses({...itemStatuses, [item.code]: 'Devolvida'})}
                    >
                      <AlertCircle className="h-4 w-4 mr-1" /> Devolvida
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLoad(null)}>Cancelar</Button>
            <Button onClick={handleFinishDelivery}>Confirmar Finalização</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
