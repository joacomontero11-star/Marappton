import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { Button, Chips, Field } from '../../../components/ui';
import { dayEnd, dayStart, isDay, toDay, todayPlus } from '../../../lib/dates';
import { supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { STATUS_LABELS, type CampaignStatus } from '../../../lib/types';

const statuses: CampaignStatus[] = ['draft', 'active', 'paused', 'finished'];

export default function EditRaffle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [f, setF] = useState({
    title: '',
    description: '',
    prize: '',
    sponsor: 'Sanatorio Allende',
    status: 'draft' as CampaignStatus,
    starts: todayPlus(0),
    ends: todayPlus(30),
    draw: todayPlus(31),
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    supabase.from('raffles').select('*').eq('id', id).single().then(({ data: r }) => {
      if (r)
        setF({
          title: r.title,
          description: r.description,
          prize: r.prize,
          sponsor: r.sponsor,
          status: r.status,
          starts: toDay(r.starts_at),
          ends: toDay(r.ends_at),
          draw: toDay(r.draw_at),
        });
    });
  }, [id, isNew]);

  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const valid = f.title && f.prize && isDay(f.starts) && isDay(f.ends) && f.ends >= f.starts && (!f.draw || isDay(f.draw));

  const save = async () => {
    setBusy(true);
    const row = {
      title: f.title.trim(),
      description: f.description.trim(),
      prize: f.prize.trim(),
      sponsor: f.sponsor.trim() || 'Sanatorio Allende',
      status: f.status,
      starts_at: dayStart(f.starts),
      ends_at: dayEnd(f.ends),
      draw_at: f.draw ? dayStart(f.draw) : null,
    };
    const { error } = isNew ? await supabase.from('raffles').insert(row) : await supabase.from('raffles').update(row).eq('id', id);
    setBusy(false);
    if (error) return Alert.alert('No se pudo guardar', error.message);
    router.back();
  };

  const remove = () =>
    Alert.alert('¿Borrar el sorteo?', 'Se borran también sus desafíos y participaciones.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => { await supabase.from('raffles').delete().eq('id', id); router.back(); } },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(12) }} keyboardShouldPersistTaps="handled">
      <Field label="Título" value={f.title} onChangeText={set('title')} />
      <Field label="Descripción" value={f.description} onChangeText={set('description')} multiline />
      <Field label="Premio" value={f.prize} onChangeText={set('prize')} />
      <Field label="Aporta (Sanatorio Allende o marca)" value={f.sponsor} onChangeText={set('sponsor')} />
      <Field label="Desde (AAAA-MM-DD)" value={f.starts} onChangeText={set('starts')} />
      <Field label="Hasta (AAAA-MM-DD)" value={f.ends} onChangeText={set('ends')} />
      <Field label="Fecha del sorteo (AAAA-MM-DD, opcional)" value={f.draw} onChangeText={set('draw')} />
      <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: space(2) }}>Estado</Text>
      <Chips<CampaignStatus> value={f.status} onChange={(s) => setF({ ...f, status: s })} options={statuses.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
      <Button label="Guardar" onPress={save} loading={busy} disabled={!valid} style={{ marginTop: space(5) }} />
      {!isNew && <Button label="Borrar sorteo" variant="danger" onPress={remove} style={{ marginTop: space(3) }} />}
    </ScrollView>
  );
}
