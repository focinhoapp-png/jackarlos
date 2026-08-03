import React, { useState, useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { Card, CardContent } from '@/src/components/ui/card';
import { Truck, Package, Clock, Building2 } from 'lucide-react';

export function Entregas() {
  const [groupedPackages, setGroupedPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMyPackages();
  }, []);

  const loadMyPackages = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get the driver ID linked to this user
    const { data: driverData } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (driverData) {
      const { data, error } = await supabase
        .from('packages')
        .select('id, barcode, company_id, scanned_at, companies(name, color_hex, logo_url)')
        .eq('driver_id', driverData.id)
        .eq('status', 'EM_ROTA')
        .order('scanned_at', { ascending: false });
        
      if (!error && data) {
        const grouped = data.reduce((acc: any, pkg: any) => {
          const companyName = pkg.companies?.name || 'Desconhecida';
          if (!acc[companyName]) {
            acc[companyName] = {
              company: companyName,
              count: 0,
              latest: pkg.scanned_at,
              color: pkg.companies?.color_hex || '#3b82f6',
              logo: pkg.companies?.logo_url || null
            };
          }
          acc[companyName].count++;
          if (new Date(pkg.scanned_at) > new Date(acc[companyName].latest)) {
            acc[companyName].latest = pkg.scanned_at;
          }
          return acc;
        }, {});
        
        setGroupedPackages(Object.values(grouped));
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="h-20 sm:h-24 bg-card border-b border-border flex flex-col justify-center px-4 sm:px-8 shrink-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Truck className="h-8 w-8 text-primary" />
          Minhas Entregas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie os pacotes que estão em rota com você.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar bg-background">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : groupedPackages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 py-20">
            <Package className="h-16 w-16 mb-4" />
            <h2 className="text-2xl font-bold">Nenhuma entrega pendente</h2>
            <p>Você não tem pacotes "Em Rota" no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {groupedPackages.map((group) => (
              <Card key={group.company} className="bg-card border-border hover:shadow-md transition-shadow relative overflow-hidden group">
                {/* Indicador de cor da empresa */}
                <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: group.color }}></div>
                
                <CardContent className="p-6 flex flex-col h-full relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                      {group.logo ? (
                        <div className="w-10 h-10 rounded-full bg-background border border-border shadow-sm p-1 flex items-center justify-center shrink-0">
                          <img src={group.logo} alt={group.company} className="max-w-full max-h-full object-contain rounded-full" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted border border-border shadow-sm flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">
                          Empresa
                        </div>
                        <div className="text-lg font-bold leading-tight line-clamp-1" title={group.company}>
                          {group.company}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 flex flex-col items-center justify-center bg-secondary/30 rounded-xl p-6 mb-6">
                    <span className="text-5xl font-black text-foreground mb-2 tracking-tighter" style={{ color: group.color }}>
                      {group.count}
                    </span>
                    <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                      {group.count === 1 ? 'Entrega' : 'Entregas'}
                    </span>
                  </div>

                  <div className="mt-auto">
                    <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded-md border border-border/50">
                      <span className="text-xs text-muted-foreground font-medium">Última carga</span>
                      <span className="text-xs font-bold flex items-center gap-1 text-foreground">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {new Date(group.latest).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
