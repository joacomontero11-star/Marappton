import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import {
  CATEGORY_LABELS,
  describeRule,
  RULE_CATEGORY,
  RULE_FIELDS,
  RULE_LABELS,
  type ChallengeRule,
  type RuleType,
} from '../../../../supabase/functions/_shared/challenges';
import { Button, Card, Chips, Field } from '../../../components/ui';
import { dayEnd, dayStart, isDay, toDay, todayPlus } from '../../../lib/dates';
import { supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { STATUS_LABELS, type CampaignStatus } from '../../../lib/types';

const statuses: CampaignStatus[] = ['draft', 'active', 'paused', 'finished'];
const ruleTypes = Object.keys(RULE_LABELS) as RuleType[];
const categories = Object.keys(CATEGORY_LABELS);

const paceToText = (s: unknown) => (typeof s === 'number' ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
function textToPace(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export default function EditChallenge() {
  const { id, raffleId } = useLocalSearchParams<{ id: string; raffleId: string }>();
  const isNew = id === 'new';
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<RuleType>('single_run_distance');
  const [category, setCategory] = useState('distance');
  const [params, setParams] = useState<Record<string, string>>({ min_km: '5' });
  const [starts, setStarts] = useState(todayPlus(0));
  const [ends, setEnds] = useState(todayPlus(30));
  const [maxEntries, setMaxEntries] = useState('');
  const [status, setStatus] = useState<CampaignStatus>('draft');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) {
      supabase.from('raffles').select('starts_at, ends_at').eq('id', raffleId).single().then(({ data }) => {
        if (data) { setStarts(toDay(data.starts_at)); setEnds(toDay(data.ends_at)); }
      });
      return;
    }
    supabase.from('challenges').select('*').eq('id', id).single().then(({ data: c }) => {
      if (!c) return;
      setTitle(c.title);
      setDescription(c.description);
      setType(c.rule.type);
      setCategory(c.category);
      const p: Record<string, string> = {};
      for (const fld of RULE_FIELDS[c.rule.type as RuleType]) {
        const v = c.rule[fld.key];
        p[fld.key] = v == null ? '' : fld.pace ? paceToText(v) : String(v);
      }
      setParams(p);
      setStarts(toDay(c.starts_at));
      setEnds(toDay(c.ends_at));
      setMaxEntries(c.max_entries_per_user ? String(c.max_entries_per_user) : '');
      setStatus(c.status);
    });
  }, [id, isNew, raffleId]);

  const changeType = (t: RuleType) => {
    setType(t);
    setCategory(RULE_CATEGORY[t]);
    setParams({});
  };

  // Build the rule; returns an error message when something is missing.
  const build = (): ChallengeRule | string => {
    const rule: Record<string, unknown> = { type };
    for (const fld of RULE_FIELDS[type]) {
      const raw = (params[fld.key] ?? '').trim().replace(',', '.');
      if (!raw) {
        if (fld.optional) continue;
        return `Completá «${fld.label}»`;
      }
      const v = fld.pace ? textToPace(raw) : Number(raw);
      if (v == null || !Number.isFinite(v)) return `«${fld.label}» no es válido`;
      rule[fld.key] = v;
    }
    if (type === 'pace_range' && (rule.fastest_pace_s as number) > (rule.slowest_pace_s as number)) return 'El ritmo más rápido debe ser menor que el más lento';
    return rule as ChallengeRule;
  };
  const rule = build();

  const save = async () => {
    if (typeof rule === 'string') return Alert.alert('Revisá los requisitos', rule);
    setBusy(true);
    const row = {
      raffle_id: raffleId,
      title: title.trim(),
      description: description.trim(),
      category,
      rule,
      status,
      starts_at: dayStart(starts),
      ends_at: dayEnd(ends),
      max_entries_per_user: maxEntries ? Number(maxEntries) : null,
    };
    const { error } = isNew ? await supabase.from('challenges').insert(row) : await supabase.from('challenges').update(row).eq('id', id);
    setBusy(false);
    if (error) return Alert.alert('No se pudo guardar', error.message);
    router.back();
  };

  const remove = () =>
    Alert.alert('¿Borrar el desafío?', 'Se borran también sus participaciones.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => { await supabase.from('challenges').delete().eq('id', id); router.back(); } },
    ]);

  const label = (t: string) => <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: space(2), marginTop: space(2) }}>{t}</Text>;

  return (
    <ScrollView contentContainerStyle={{ padding: space(4), paddingBottom: space(12) }} keyboardShouldPersistTaps="handled">
      <Field label="Título" value={title} onChangeText={setTitle} />
      <Field label="Descripción (opcional)" value={description} onChangeText={setDescription} multiline />
      {label('Tipo de desafío')}
      <Chips<RuleType> value={type} onChange={changeType} options={ruleTypes.map((t) => ({ value: t, label: RULE_LABELS[t] }))} />
      {label('Categoría')}
      <Chips<string> value={category} onChange={setCategory} options={categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
      {label('Requisitos')}
      {RULE_FIELDS[type].map((fld) => (
        <Field
          key={fld.key}
          label={fld.label + (fld.optional ? ' (opcional)' : '')}
          value={params[fld.key] ?? ''}
          onChangeText={(t) => setParams({ ...params, [fld.key]: t })}
          keyboardType={fld.pace ? 'numbers-and-punctuation' : 'decimal-pad'}
          placeholder={fld.pace ? '5:30' : ''}
        />
      ))}
      <Card style={{ backgroundColor: '#E4F2FA' }}>
        <Text style={{ color: colors.navy }}>{typeof rule === 'string' ? rule : describeRule(rule)}</Text>
      </Card>
      <Field label="Desde (AAAA-MM-DD)" value={starts} onChangeText={setStarts} />
      <Field label="Hasta (AAAA-MM-DD)" value={ends} onChangeText={setEnds} />
      <Field label="Máximo de participaciones por persona (opcional)" value={maxEntries} onChangeText={setMaxEntries} keyboardType="number-pad" />
      {label('Estado')}
      <Chips<CampaignStatus> value={status} onChange={setStatus} options={statuses.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
      <Button
        label="Guardar"
        onPress={save}
        loading={busy}
        disabled={!title || !isDay(starts) || !isDay(ends) || ends < starts || typeof rule === 'string'}
        style={{ marginTop: space(5) }}
      />
      {!isNew && <Button label="Borrar desafío" variant="danger" onPress={remove} style={{ marginTop: space(3) }} />}
    </ScrollView>
  );
}
