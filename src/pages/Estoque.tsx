import React, { useState, useEffect } from 'react';
import { PackageSearch, AlertCircle, CheckCircle, Package, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { supabase } from '@/src/lib/supabase';

export function Estoque() {
  const [estoque, setEstoque] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchEstoque();
  }, []);

  const fetchEstoque = async () => {
    setIsLoading(true);
    // Busca pacotes que não estão em rota
    const { data, error } = await supabase
      .from('packages')
      .select(`
        id,
        barcode,
        status,
        scanned_at,
        driver_id,
        base_location,
        drivers ( name, vehicle_plate ),
        companies ( name ),
        users ( name )
      `)
      .in('status', ['ENTREGUE', 'DEVOLVIDA'])
      .order('scanned_at', { ascending: false });

    if (error) {
      console.error('Error fetching estoque:', error);
    } else if (data) {
      // Agrupa por motorista e data (simulando uma carga/rota)
      const grouped: Record<string, any> = {};
      
      data.forEach((pkg: any) => {
        const dateStr = new Date(pkg.scanned_at).toLocaleDateString();
        const groupId = `${pkg.driver_id}-${dateStr}`;
        
        if (!grouped[groupId]) {
          grouped[groupId] = {
            id: groupId,
            driverName: pkg.drivers?.name || 'Desconhecido',
            plate: pkg.drivers?.vehicle_plate || 'Sem Placa',
            conferente: pkg.users?.name || 'Desconhecido',
            endTime: pkg.scanned_at,
            items: []
          };
        }
        
        grouped[groupId].items.push({
          code: pkg.barcode,
          company: pkg.companies?.name,
          time: new Date(pkg.scanned_at).toLocaleTimeString(),
          rota: pkg.base_location || '-',
          finalStatus: pkg.status === 'ENTREGUE' ? 'Entregue' : 'Devolvida'
        });
      });
      
      setEstoque(Object.values(grouped));
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estoque e Devoluções</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Conferência de mercadorias entregues e devolvidas pelos entregadores.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <h3 className="text-xl font-bold text-foreground">Carregando estoque...</h3>
          </CardContent>
        </Card>
      ) : estoque.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <PackageSearch className="h-16 w-16 mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-foreground">Nenhuma carga finalizada</h3>
            <p className="max-w-sm mt-2">
              As cargas finalizadas pelos entregadores aparecerão aqui para conferência do estoque e devoluções.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {estoque.map((load) => {
            const entregues = load.items.filter((i: any) => i.finalStatus === 'Entregue').length;
            const devolvidas = load.items.filter((i: any) => i.finalStatus === 'Devolvida').length;

            return (
              <Card key={load.id} className="bg-card border-border shadow-sm">
                <CardHeader className="bg-muted/20 border-b border-border pb-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        Carga / Rota
                        <span className="text-sm font-normal text-muted-foreground bg-background px-2 py-1 rounded border border-border">
                          {load.driverName} ({load.plate})
                        </span>
                      </CardTitle>
                      <div className="text-sm text-muted-foreground mt-2 flex items-center gap-4">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" /> 
                          Data: {new Date(load.endTime).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle className="h-4 w-4" />
                          Finalizado por: <span className="font-medium text-foreground">{load.conferente}</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-success">{entregues}</div>
                        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Entregues</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-destructive">{devolvidas}</div>
                        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Devolvidas</div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground uppercase bg-muted/10 border-b border-border">
                        <tr>
                          <th className="px-6 py-3 font-medium">Código</th>
                          <th className="px-6 py-3 font-medium">Empresa</th>
                          <th className="px-6 py-3 font-medium">Bipado em</th>
                          <th className="px-6 py-3 font-medium">Rota</th>
                          <th className="px-6 py-3 font-medium text-right">Status Final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {load.items.map((item: any, idx: number) => (
                          <tr key={idx} className="border-b border-border/50 hover:bg-muted/5 transition-colors last:border-0">
                            <td className="px-6 py-3">
                              <div className="flex items-center gap-2 font-mono font-medium">
                                <Package className="h-4 w-4 text-muted-foreground" />
                                {item.code}
                              </div>
                            </td>
                            <td className="px-6 py-3">{item.company}</td>
                            <td className="px-6 py-3 text-muted-foreground">{item.time}</td>
                            <td className="px-6 py-3">{item.rota}</td>
                            <td className="px-6 py-3 text-right">
                              {item.finalStatus === 'Entregue' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-success/20 text-success border border-success/20">
                                  <CheckCircle className="w-3 h-3" /> Entregue
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-destructive/20 text-destructive border border-destructive/20">
                                  <AlertCircle className="w-3 h-3" /> Devolvida
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
