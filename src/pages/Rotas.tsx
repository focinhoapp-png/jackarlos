import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, CheckCircle, XCircle, Map, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { supabase } from '@/src/lib/supabase';
import { logAction } from '@/src/lib/audit';

interface BaseRouteItem {
  id: string;
  name: string;
  status: boolean;
}

export function Rotas() {
  const [bases, setBases] = useState<BaseRouteItem[]>([]);
  const [routes, setRoutes] = useState<BaseRouteItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'bases' | 'rotas'>('bases');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    status: 'Ativo'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [basesRes, routesRes] = await Promise.all([
      supabase.from('bases').select('*').order('name'),
      supabase.from('routes').select('*').order('name')
    ]);

    if (basesRes.data) setBases(basesRes.data);
    if (routesRes.data) setRoutes(routesRes.data);
    setIsLoading(false);
  };

  const filteredItems = (activeTab === 'bases' ? bases : routes).filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openNewModal = () => {
    setEditingId(null);
    setFormData({ name: '', status: 'Ativo' });
    setIsModalOpen(true);
  };

  const openEditModal = (item: BaseRouteItem) => {
    setEditingId(item.id);
    setFormData({
      name: item.name,
      status: item.status ? 'Ativo' : 'Inativo'
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir permanentemente esta ${activeTab === 'bases' ? 'Base' : 'Rota'}?`)) {
      const table = activeTab === 'bases' ? 'bases' : 'routes';
      const entityType = activeTab === 'bases' ? 'BASE' : 'ROTA';
      
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) {
        alert('Erro ao excluir: ' + error.message);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          await logAction(user.email, 'DELETOU', entityType, name);
        }
        fetchData();
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const table = activeTab === 'bases' ? 'bases' : 'routes';
      const entityType = activeTab === 'bases' ? 'BASE' : 'ROTA';
      const dataToSave = {
        name: formData.name,
        status: formData.status === 'Ativo'
      };

      const { data: { user } } = await supabase.auth.getUser();
      const adminEmail = user?.email || 'admin@sistema.com';

      if (editingId) {
        await supabase.from(table).update(dataToSave).eq('id', editingId);
        await logAction(adminEmail, 'EDITOU', entityType, formData.name);
      } else {
        await supabase.from(table).insert([dataToSave]);
        await logAction(adminEmail, 'CRIOU', entityType, formData.name);
      }
      
      fetchData();
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Rotas e Bases</h1>
        <Button onClick={openNewModal} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" />
          Nova {activeTab === 'bases' ? 'Base' : 'Rota'}
        </Button>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('bases')}
          className={`px-4 py-2 font-medium text-sm transition-colors relative ${activeTab === 'bases' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Bases
          </div>
          {activeTab === 'bases' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
        </button>
        <button
          onClick={() => setActiveTab('rotas')}
          className={`px-4 py-2 font-medium text-sm transition-colors relative ${activeTab === 'rotas' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4" />
            Rotas
          </div>
          {activeTab === 'rotas' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
        </button>
      </div>

      <Card className="bg-card border-border shadow-sm mt-4">
        <CardHeader className="border-b border-border p-4 bg-muted/20">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder={`Buscar ${activeTab === 'bases' ? 'base' : 'rota'}...`} 
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
                  <th className="px-6 py-4 font-medium">Nome</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">Carregando...</td></tr>
                ) : filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{item.name}</td>
                    <td className="px-6 py-4">
                      {item.status ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-success/20 text-success border border-success/20">
                          <CheckCircle className="w-3 h-3" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-destructive/20 text-destructive border border-destructive/20">
                          <XCircle className="w-3 h-3" /> Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="icon" onClick={() => openEditModal(item)} className="h-8 w-8 hover:text-primary">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => handleDelete(item.id, item.name)} className="h-8 w-8 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && filteredItems.length === 0 && (
                  <tr><td colSpan={3} className="px-6 py-12 text-center text-muted-foreground">Nenhum registro encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px] border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editingId ? 'Editar' : 'Nova'} {activeTab === 'bases' ? 'Base' : 'Rota'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input 
                required 
                value={formData.name} 
                onChange={(e) => setFormData({...formData, name: e.target.value})} 
                className="bg-background" 
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(val) => setFormData({...formData, status: val})}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <DialogFooter className="pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
