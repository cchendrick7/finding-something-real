import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { listIntake, listRecordings, assignIntake, coverageStatus } from '@/lib/data';
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
  const [cover, setCover] = useState<{ waiting: Profile[]; neverAsked: Profile[] }>({ waiting: [], neverAsked: [] });
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    (async () => {
      setRows(await listIntake());
      setRecs(await listRecordings(true));
      setCover(await coverageStatus());
    })().catch(onLoadError);
  }, []);
  useFocusEffect(load);

  const assigned = rows.filter((r) => r.recordings.length).length;

  return (
    <Screen>
      <Eyebrow>From Google Forms and the retreat</Eyebrow>
      <Display>Intake</Display>
      <Rule style={{ marginVertical: space.md }} />

      {/* A tester asked what this tab was for. It should not need asking. */}
      <Card tone="wash">
        <Body>
          Every question a co-host has submitted lives here. Assign one to a session and
          she counts as <Small style={{ color: color.ink }}>covered</Small> — her question
          is getting its own moment this season.
        </Body>
        <Tiny style={{ marginTop: 8 }}>
          Collected → assigned to a session → covered. The goal is nobody left out by week six.
        </Tiny>
      </Card>

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
          <Body style={{ fontFamily: type.h1.fontFamily, fontSize: 28, color: cover.waiting.length ? color.gold : color.ink }}>
            {cover.waiting.length}
          </Body>
          <Eyebrow>Waiting</Eyebrow>
        </Card>
      </Row>

      {cover.waiting.length ? (
        <Card tone="gold">
          <Eyebrow tone="#8A6D28">Asked something, not yet on a session</Eyebrow>
          <Body>{cover.waiting.map((g) => g.display_name).join(', ')}</Body>
          <Tiny style={{ marginTop: 6 }}>
            Their questions are in the list below. Assign one to a session to cover them.
          </Tiny>
        </Card>
      ) : null}

      {/* Different problem, different fix — these women have submitted nothing at
          all, so there is no question to assign and no amount of scheduling helps. */}
      {cover.neverAsked.length ? (
        <Card tone="blue">
          <Eyebrow>Haven't submitted anything yet</Eyebrow>
          <Body>{cover.neverAsked.map((g) => g.display_name).join(', ')}</Body>
          <Tiny style={{ marginTop: 6 }}>
            Nothing to assign until they do. This one is a conversation, not a scheduling job.
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
