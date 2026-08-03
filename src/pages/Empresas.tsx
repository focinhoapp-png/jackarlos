import React, { useRef, useState, useEffect } from "react";
import { Building2, Plus, Search, Edit, Trash2, CheckCircle, XCircle, Camera } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { supabase } from '@/src/lib/supabase';
import { logAction } from '@/src/lib/audit';

interface Empresa {
  id: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  value_per_delivery: number;
  color_hex: string;
  status: boolean;
  logo_url?: string;
}

export function Empresas() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    contact_phone: '',
    value_per_delivery: '',
    color_hex: '#3b82f6',
    status: 'Ativo',
    logo_url: ''
  });

  useEffect(() => {
    fetchEmpresas();
  }, []);

  const fetchEmpresas = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('companies').select('*').order('name');
    if (error) {
      console.error('Error fetching companies:', error);
    } else {
      setEmpresas(data || []);
    }
    setIsLoading(false);
  };

  const filteredEmpresas = empresas.filter(empresa => 
    empresa.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openNewModal = () => {
    setEditingId(null);
    setFormData({
      name: '', contact_name: '', contact_phone: '', value_per_delivery: '', color_hex: '#3b82f6', status: 'Ativo', logo_url: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (empresa: Empresa) => {
    setEditingId(empresa.id);
    setFormData({
      name: empresa.name,
      contact_name: empresa.contact_name || '',
      contact_phone: empresa.contact_phone || '',
      value_per_delivery: empresa.value_per_delivery.toString(),
      color_hex: empresa.color_hex || '#3b82f6',
      status: empresa.status ? 'Ativo' : 'Inativo',
      logo_url: empresa.logo_url || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm('Tem certeza que deseja excluir esta empresa?')) {
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) {
        alert('Erro ao excluir: ' + error.message);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          await logAction(user.email, 'DELETOU', 'EMPRESA', name);
        }
        setEmpresas(empresas.filter(e => e.id !== id));
      }
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxSize = 300;
          let { width, height } = img;
          if (width > height) { if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; } }
          else { if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; } }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
          setFormData(prev => ({ ...prev, logo_url: canvas.toDataURL('image/jpeg', 0.8) }));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const companyData = {
      name: formData.name,
      contact_name: formData.contact_name,
      contact_phone: formData.contact_phone,
      value_per_delivery: parseFloat(formData.value_per_delivery) || 0,
      color_hex: formData.color_hex,
      status: formData.status === 'Ativo',
      logo_url: formData.logo_url
    };

    const { data: { user } } = await supabase.auth.getUser();
    const adminEmail = user?.email || 'admin@sistema.com';

    if (editingId) {
      const { error } = await supabase.from('companies').update(companyData).eq('id', editingId);
      if (error) {
        alert('Erro ao atualizar: ' + error.message);
      } else {
        await logAction(adminEmail, 'EDITOU', 'EMPRESA', formData.name);
        fetchEmpresas();
        setIsModalOpen(false);
      }
    } else {
      const { error } = await supabase.from('companies').insert([companyData]);
      if (error) {
        alert('Erro ao criar: ' + error.message);
      } else {
        await logAction(adminEmail, 'CRIOU', 'EMPRESA', formData.name);
        fetchEmpresas();
        setIsModalOpen(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Empresas Parceiras</h1>
        <Button onClick={openNewModal} className="gap-2 shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" />
          Nova Empresa
        </Button>
      </div>

      <Card className="bg-card border-border shadow-sm">
        <CardHeader className="border-b border-border p-4 bg-muted/20">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nome da empresa..." 
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="overflow-x-auto w-full"><table className="w-full text-sm text-left min-w-[800px]">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Empresa</th>
                  <th className="px-6 py-4 font-medium">Contato</th>
                  <th className="px-6 py-4 font-medium">Valor por Entrega</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      Carregando empresas...
                    </td>
                  </tr>
                ) : filteredEmpresas.map((empresa) => (
                  <tr key={empresa.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm overflow-hidden" style={{ backgroundColor: `${empresa.color_hex}20`, border: `1px solid ${empresa.color_hex}40` }}>
                          {empresa.logo_url ? (
                            <img src={empresa.logo_url} alt={empresa.name} className="w-full h-full object-cover" />
                          ) : (
                            <Building2 className="w-5 h-5" style={{ color: empresa.color_hex }} />
                          )}
                        </div>
                        <div className="font-bold text-foreground">{empresa.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-foreground font-medium">{empresa.contact_name || '-'}</div>
                      <div className="text-xs text-muted-foreground">{empresa.contact_phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">R$ {(empresa.value_per_delivery || 0).toFixed(2).replace('.', ',')}</div>
                    </td>
                    <td className="px-6 py-4">
                      {empresa.status ? (
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
                        <Button variant="outline" size="icon" onClick={() => openEditModal(empresa)} className="h-8 w-8 hover:text-primary">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => handleDelete(empresa.id, empresa.name)} className="h-8 w-8 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {!isLoading && filteredEmpresas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      Nenhuma empresa encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table></div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px] border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl">{editingId ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="flex flex-col items-center justify-center mb-6">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-24 h-24 rounded-lg bg-accent flex items-center justify-center border-2 border-dashed border-border overflow-hidden">
                  {formData.logo_url ? (
                    <img src={formData.logo_url} alt="Logo da empresa" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-xs text-white font-medium">Alterar</span>
                </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handlePhotoUpload} 
              />
              <span className="text-xs text-muted-foreground mt-2">Logo da Empresa (Opcional)</span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Empresa *</Label>
                <Input id="name" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-background" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contact_name">Nome do Contato</Label>
                  <Input id="contact_name" value={formData.contact_name} onChange={(e) => setFormData({...formData, contact_name: e.target.value})} className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_phone">Telefone do Contato</Label>
                  <Input id="contact_phone" value={formData.contact_phone} onChange={(e) => setFormData({...formData, contact_phone: e.target.value})} className="bg-background" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="value_per_delivery">Valor por Entrega (R$) *</Label>
                  <Input id="value_per_delivery" type="number" step="0.01" required value={formData.value_per_delivery} onChange={(e) => setFormData({...formData, value_per_delivery: e.target.value})} className="bg-background" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color_hex">Cor da Etiqueta *</Label>
                  <div className="flex gap-2 items-center">
                    <Input id="color_hex" type="color" required value={formData.color_hex} onChange={(e) => setFormData({...formData, color_hex: e.target.value})} className="w-12 h-10 p-1 bg-background cursor-pointer" />
                    <span className="text-sm text-muted-foreground uppercase">{formData.color_hex}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status *</Label>
                <Select value={formData.status} onValueChange={(val) => setFormData({...formData, status: val})}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <DialogFooter className="pt-4 mt-6 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit">{editingId ? 'Salvar Alterações' : 'Cadastrar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
