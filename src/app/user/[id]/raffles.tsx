import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Badge, Card, Empty, Loading } from '../../../components/ui';
import { firstName } from '../../../lib/api';
import { supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { STATUS_LABELS, type CampaignStatus } from '../../../lib/types';

type Row = { raffle_id: string; title: string; prize: string; sponsor: string; status: CampaignStatus; ends_at: string; entries: number };

export default function UserRaffles() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('profiles').select('username, full_name').eq('id', id).single();
      if (p) navigation.setOptions({ title: `Sorteos de ${firstName(p)}` });
      const { data } = await supabase.rpc('user_raffles', { target: id });
      setRows((data ?? []) as Row[]);
    })();
  }, [id, navigation]);

  if (!rows) return <Loading />;
  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.raffle_id}
      contentContainerStyle={{ padding: space(4) }}
      ListEmptyComponent={<Empty text="No hay sorteos para mostrar." />}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/raffle/${item.raffle_id}`)}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.navy, flex: 1 }}>{item.title}</Text>
              <Badge label={STATUS_LABELS[item.status]} color={item.status === 'active' ? '#DDF5EA' : colors.border} textColor={item.status === 'active' ? colors.success : colors.muted} />
            </View>
            <Text style={{ color: colors.text, marginTop: space(1) }}>Premio: {item.prize}</Text>
            <Text style={{ color: colors.muted }}>Aporta: {item.sponsor}</Text>
            <View style={{ marginTop: space(2) }}>
              <Badge label={`${item.entries} ${Number(item.entries) === 1 ? 'participación' : 'participaciones'}`} />
            </View>
          </Card>
        </Pressable>
      )}
    />
  );
}
