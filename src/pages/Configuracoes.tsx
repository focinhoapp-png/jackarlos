import React, { useRef, useState, useEffect } from "react";
import { Settings, Save, User, Lock, Shield, IdCard, Phone, MapPin, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Label } from '@/src/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/src/components/ui/dialog';
import { supabase } from '@/src/lib/supabase';
import Cropper from 'react-easy-crop';
import getCroppedImg from '@/src/lib/cropImage';



export function Configuracoes() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [tempPhotoUrl, setTempPhotoUrl] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    role: '',
    photo: '',
    cpf: '',
    phone: '',
    base: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [bases, setBases] = useState<string[]>([]);

  useEffect(() => {
    loadUserData();
    supabase.from('bases').select('name').eq('status', true).order('name').then(({ data }) => {
      if (data) setBases(data.map((b: any) => b.name));
    });
  }, []);

  const loadUserData = async () => {
    setIsLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData?.session;

    if (session?.user) {
      const userId = session.user.id;
      const userEmail = session.user.email || '';

      const { data: userData } = await supabase
        .from('users')
        .select('name, role, avatar_url')
        .eq('id', userId)
        .single();

      let driverCpf = '';
      let driverPhone = '';
      let driverBase = '';

      if (userData?.role === 'ENTREGADOR') {
        const { data: driverData } = await supabase
          .from('drivers')
          .select('cpf, phone, base_location')
          .eq('user_id', userId)
          .single();
          
        if (driverData) {
          driverCpf = driverData.cpf || '';
          driverPhone = driverData.phone || '';
          driverBase = driverData.base_location || '';
        }
      }

      const username = userEmail.replace('@jackarlo.com', '');

      setFormData(prev => ({
        ...prev,
        name: userData?.name || session.user.user_metadata?.full_name || username,
        username,
        role: userData?.role || 'CONFERENTE',
        photo: userData?.avatar_url || '',
        cpf: driverCpf || '',
        phone: driverPhone || '',
        base: driverBase || ''
      }));
      setUserRole(userData?.role || 'CONFERENTE');
    }
    setIsLoading(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTempPhotoUrl(reader.result as string);
        setIsCropModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleCropConfirm = async () => {
    try {
      const croppedImage = await getCroppedImg(tempPhotoUrl, croppedAreaPixels as any);
      setFormData({ ...formData, photo: croppedImage });
      setIsCropModalOpen(false);
      setTempPhotoUrl('');
    } catch (e) {
      console.error(e);
    }
  };

  const getRoleLabel = (role: string) => {
    const map: Record<string, string> = {
      ADMIN: 'Administrador',
      CONFERENTE: 'Conferente',
      ENTREGADOR: 'Entregador'
    };
    return map[role] || role;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      if (!userId) throw new Error("Sessão inválida.");

      // 1. Atualizar nome e foto em public.users
      const { error: updateError } = await supabase
        .from('users')
        .update({
          name: formData.name,
          avatar_url: formData.photo
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      // 2. Sincronizar dados extras com a tabela drivers se for entregador
      if (userRole === 'ENTREGADOR') {
        await supabase
          .from('drivers')
          .update({
            cpf: formData.cpf || null,
            phone: formData.phone || null,
            base_location: formData.base || null,
            name: formData.name
          })
          .eq('user_id', userId);
      }

      // 2. Alterar senha se preenchida
      if (formData.newPassword) {
        if (formData.newPassword !== formData.confirmPassword) {
          throw new Error("As senhas não conferem.");
        }
        if (formData.newPassword.length < 6) {
          throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
        }

        // Não-admins precisam confirmar a senha atual
        if (userRole !== 'ADMIN') {
          if (!formData.currentPassword) {
            throw new Error("Informe sua senha atual para alterá-la.");
          }
          const userEmail = `${formData.username}@jackarlo.com`;
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: userEmail,
            password: formData.currentPassword
          });
          if (signInError) {
            throw new Error("Senha atual incorreta.");
          }
        }

        const { error: pwError } = await supabase.auth.updateUser({
          password: formData.newPassword
        });
        if (pwError) throw pwError;

      }

      setMessage({ type: 'success', text: 'Informações atualizadas com sucesso!' });
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));

    } catch (err: any) {
      const translateError = (msg: string): string => {
        if (!msg) return 'Erro ao salvar.';
        if (msg.includes('New password should be different from the old password')) return 'A nova senha deve ser diferente da senha atual.';
        if (msg.includes('Password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
        if (msg.includes('Invalid login credentials')) return 'Credenciais inválidas.';
        if (msg.includes('Email not confirmed')) return 'Usuário não confirmado.';
        if (msg.includes('User not found')) return 'Usuário não encontrado.';
        if (msg.includes('Token has expired')) return 'Sessão expirada. Faça login novamente.';
        return msg;
      };
      setMessage({ type: 'error', text: translateError(err.message) });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando seus dados...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Meus Dados</h1>
      </div>

      <Dialog open={isCropModalOpen} onOpenChange={setIsCropModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar Foto</DialogTitle>
          </DialogHeader>
          <div className="relative h-64 w-full bg-black/5 rounded-md overflow-hidden">
            {tempPhotoUrl && (
              <Cropper
                image={tempPhotoUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            )}
          </div>
          <div className="px-2 pt-2">
            <Label className="text-xs text-muted-foreground mb-2 block">Zoom</Label>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCropModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCropConfirm}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="max-w-3xl space-y-6">
        {/* Avatar / Nome card */}
        <Card className="bg-card shadow-sm border-border">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <div className="flex flex-col items-center justify-center mb-4">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center border-4 border-background shadow-md overflow-hidden">
                  {formData.photo ? (
                    <img src={formData.photo} alt="Foto de perfil" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-primary" />
                  )}
                </div>
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity border-4 border-transparent">
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
            </div>
            <h2 className="text-xl font-bold">{formData.name}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1 justify-center mt-1">
              <Shield className="w-4 h-4 text-primary" />
              {getRoleLabel(formData.role)}
            </p>
          </CardContent>
        </Card>

        {/* Form card */}
        <Card className="bg-card shadow-sm border-border">
          <CardHeader className="border-b border-border bg-muted/20">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <IdCard className="h-5 w-5 text-primary" />
              Minhas Informações
            </CardTitle>
            <CardDescription>
              Atualize seus dados pessoais e preferências.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {message && (
              <div className={`mb-4 p-3 rounded-lg text-sm border ${
                message.type === 'success'
                  ? 'bg-success/10 text-success border-success/20'
                  : 'bg-destructive/10 text-destructive border-destructive/20'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="pl-9 bg-background"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Usuário (login)</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="username"
                      type="text"
                      value={formData.username}
                      className="pl-9 bg-muted/40 cursor-not-allowed"
                      disabled
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">O login não pode ser alterado.</p>
                </div>

                {/* CPF */}
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF</Label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="cpf"
                      value={formData.cpf}
                      onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                      className="pl-9 bg-background"
                      placeholder="000.000.000-00"
                    />
                  </div>
                </div>

                {/* Telefone */}
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="pl-9 bg-background"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>

                {/* Base */}
                <div className="space-y-2">
                  <Label htmlFor="base">Base</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                    <Select value={formData.base} onValueChange={(v) => setFormData({ ...formData, base: v })}>
                      <SelectTrigger id="base" className="pl-9 bg-background">
                        <SelectValue placeholder="Selecione sua base" />
                      </SelectTrigger>
                      <SelectContent>
                        {bases.map((b) => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-border">
                <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  Alterar Senha
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Se não quiser alterar, deixe os campos de senha em branco.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {userRole !== 'ADMIN' && (
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="currentPassword">Senha Atual</Label>
                      <Input
                        id="currentPassword"
                        type="password"
                        value={formData.currentPassword}
                        onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                        className="bg-background"
                        placeholder="Digite sua senha atual"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nova Senha</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={formData.newPassword}
                      onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                      className="bg-background"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="bg-background"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex justify-end">
                <Button type="submit" className="gap-2 shadow-lg shadow-primary/20" disabled={isSaving}>
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
