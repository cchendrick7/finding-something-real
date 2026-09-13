import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { listIntake, listRecordings, assignIntake, coverageGaps } from '@/lib/data';
import { Screen, Display, H3, Body, Small, Tiny, Card, Eyebrow, Rule, Pill, Row, Wrap } from '@/components/ui';
import { space, color, type } from '@/lib/theme';
import type { IntakeQuestion, Profile, Recording } from '@/lib/types';
import { onLoadError } from '@/lib/loadError';

type Row_ = IntakeQuestion & { author?: Profile; recordings: string[] };

/**
 * SPEC §5.4. The season is curated so each co-host's question gets its own
 * moment. That currently lives in someone's head; here it is trackable.
 */
export default function Intake() {
  const [rows, setRows] = useState<Row_[]>([]);
  const [recs, setRecs] = useState<Recording[]>([]);
  const [gaps, setGaps] = useState<Profile[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    (async () => {
      setRows(await listIntake());
      setRecs(await listRecordings(true));
      setGaps(await coverageGaps());
    })().catch(onLoadError);
  }, []);
  useFocusEffect(load);

  const assigned = rows.filter((r) => r.recordings.length).length;

  return (
    <Screen>
      <Eyebrow>From Google Forms and the retreat</Eyebrow>
      <Display>Intake</Display>
      <Rule style={{ marginVertical: space.md }} />

      <Row style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
        <Card style={{ flex: 1, minWidth: 130 }}>
          <Body style={{ fontFamily: type.h1.fontFamily, fontSize: 28 }}>{rows.length}</Body>
          <Eyebrow>Collected</Eyebrow>
        </Card>
        <Card style={{ flex: 1, minWidth: 130 }}>
          <Body style={{ fontFamily: type.h1.fontFamily, fontSize: 28 }}>{assigned}</Body>
          <Eyebrow>Assigned</Eyebrow>
        </Card>
        <Card style={{ flex: 1, minWidth: 130 }}>
          <Body style={{ fontFamily: type.h1.fontFamily, fontSize: 28, color: gaps.length ? color.gold : color.ink }}>
            {gaps.length}
          </Body>
          <Eyebrow>Uncovered</Eyebrow>
        </Card>
      </Row>

      {gaps.length ? (
        <Card tone="gold">
          <Eyebrow tone="#8A6D28">No question answered yet</Eyebrow>
          <Body>{gaps.map((g) => g.display_name).join(', ')}</Body>
          <Tiny style={{ marginTop: 6 }}>
            Every co-host is meant to get her own moment this season. Easy to lose track of by week six.
          </Tiny>
        </Card>
      ) : null}

      <Rule />
      {rows.map((r) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <Small>{r.author?.display_name ?? 'Unknown'}</Small>
            <Pill label={r.kind} tone={r.kind === 'objection' ? 'blue' : 'plain'} />
          </Row>
          <Body>{r.body}</Body>
          <View style={{ marginTop: space.md }}>
            {r.recordings.length ? (
              <Wrap>
                {r.recordings.map((rid) => (
                  <Pill key={rid} tone="sage"
                        label={recs.find((x) => x.id === rid)?.title.slice(0, 26) ?? 'Assigned'} />
                ))}
              </Wrap>
            ) : open === r.id ? (
              <Wrap>
                {recs.map((rec) => (
                  <Tiny key={rec.id} testID={`assign-${r.id}-${rec.id}`}
                    onPress={async () => { await assignIntake(r.id, rec.id); setOpen(null); load(); }}
                    style={{
                      borderWidth: 1, borderColor: color.line, borderRadius: 999,
                      paddingVertical: 6, paddingHorizontal: 12, color: color.ink,
                    }}>{rec.title.slice(0, 30)}</Tiny>
                ))}
              </Wrap>
            ) : (
              <Tiny testID={`open-assign-${r.id}`} onPress={() => setOpen(r.id)}
                style={{
                  borderWidth: 1, borderColor: color.line, borderRadius: 999,
                  paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', color: color.ink,
                }}>Assign to a recording →</Tiny>
            )}
          </View>
        </Card>
      ))}

      <Card tone="wash">
        <Eyebrow>On Trello</Eyebrow>
        <Small>
          The app owns questions → recordings. Trello keeps doing everything else. Worth
          revisiting after a season rather than building a two-way sync nobody is sure they want.
        </Small>
      </Card>
    </Screen>
  );
}
