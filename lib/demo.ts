/**
 * Demo fixtures.
 *
 * With no Supabase project configured the app runs entirely on these, so the
 * build is clickable before anything is provisioned. The demo layer deliberately
 * reproduces the RLS rules (peers see only 'yes' RSVPs, prayer requests are
 * leadership-only) so what reviewers see matches what the database enforces.
 */
import type {
  Profile, Season, Guest, Recording, Rsvp, FsrEvent, Question, IntakeQuestion,
  QuestionLink, PrayerRequest, Note, Receipt, Episode, Membership, PublicEpisode,
} from './types';

const S1 = 'season-fall-2026';
const S0 = 'season-fall-2025';

export const seasons: Season[] = [
  { id: S1, name: 'Fall 2026', is_current: true, starts_at: '2026-08-23', ends_at: '2027-05-31' },
  { id: S0, name: 'Fall 2025', is_current: false },
];

export const profiles: Profile[] = [
  { id: 'p-janell', display_name: 'Janell', role: 'admin',  timezone: 'America/Los_Angeles', status: 'active', email: 'janell@findingsomethingreal.com' },
  { id: 'p-lauren', display_name: 'Lauren', role: 'admin',  timezone: 'America/Los_Angeles', status: 'active', email: 'lauren@findingsomethingreal.com' },
  { id: 'p-imani',  display_name: 'Imani',  role: 'member', timezone: 'America/Los_Angeles', status: 'active', email: 'imani@example.com' },
  { id: 'p-priya',  display_name: 'Priya',  role: 'member', timezone: 'America/New_York',    status: 'active', email: 'priya@example.com' },
  { id: 'p-maya',   display_name: 'Maya',   role: 'member', timezone: 'America/Los_Angeles', status: 'active', email: 'maya@example.com' },
  { id: 'p-nadia',  display_name: 'Nadia',  role: 'member', timezone: 'Europe/London',       status: 'active', email: 'nadia@example.com' },
  { id: 'p-grace',  display_name: 'Grace',  role: 'member', timezone: 'America/Chicago',     status: 'active', email: 'grace@example.com' },
  { id: 'p-tess',   display_name: 'Tess',   role: 'member', timezone: 'America/Los_Angeles', status: 'active', email: 'tess@example.com' },
  { id: 'p-aaliyah',display_name: 'Aaliyah',role: 'member', timezone: 'America/Los_Angeles', status: 'active', email: 'aaliyah@example.com' },
  { id: 'p-fena',   display_name: 'Fena',   role: 'member', timezone: 'Europe/Amsterdam',    status: 'active', email: 'fena@example.com' },
  { id: 'p-sarah',  display_name: 'Sarah',  role: 'member', timezone: 'America/Los_Angeles', status: 'active', email: 'sarah@example.com' },
];

export const memberships: Membership[] = [
  ...['p-imani','p-priya','p-maya','p-nadia','p-grace','p-tess','p-aaliyah','p-fena']
    .map((profile_id) => ({ profile_id, season_id: S1, kind: 'cohort' as const })),
  { profile_id: 'p-sarah', season_id: S0, kind: 'alum' },
  { profile_id: 'p-janell', season_id: S1, kind: 'cohort' },
  { profile_id: 'p-lauren', season_id: S1, kind: 'cohort' },
];

export const guests: Guest[] = [
  { id: 'g-kwon', name: 'Dr. Rachel Kwon', blurb: 'Philosopher of religion. Spent six years as an atheist before returning to faith through a seminar on suffering.', external_url: 'https://example.com/kwon', returning_override: true, admin_notes: 'Prefers a soft intro. Keep the first ten minutes light.' },
  { id: 'g-ruiz', name: 'Dr. Elena Ruiz', blurb: 'Historian working on the transmission of early Christian texts.', external_url: 'https://example.com/ruiz', returning_override: null, admin_notes: 'Booked via Calendly. Has not been on before.' },
  { id: 'g-webb', name: 'Marcus Webb', blurb: 'Writer. Former atheist; writes about the arguments that actually moved him.', external_url: null, returning_override: false, admin_notes: null },
];

export const recordings: Recording[] = [
  { id: 'r-suffering', season_id: S1, guest_id: 'g-kwon',
    title: 'Why does God allow suffering?',
    topic: 'The problem of evil, honestly',
    questions_covered: 'If God is good, why is there so much pain?\nIs suffering evidence against God, or just hard?\nWhat do you say to someone in the middle of it?',
    scheduled_at: '2026-09-11T01:00:00Z', duration_minutes: 90,
    join_url: 'https://riverside.fm/studio/fsr',
    published_at: '2026-09-01T17:00:00Z', announce_at: '2026-09-01T17:00:00Z',
    announced_at: '2026-09-01T17:00:00Z', source: 'manual' },
  { id: 'r-gospels', season_id: S1, guest_id: 'g-ruiz',
    title: 'Can you trust the gospels?',
    topic: 'Where the text came from',
    questions_covered: 'How did we get the gospels we have?\nWhat do historians outside the church say?\nDoes it matter if details do not line up?',
    scheduled_at: '2026-09-18T01:00:00Z', duration_minutes: 90,
    join_url: 'https://riverside.fm/studio/fsr',
    published_at: null, announce_at: null, announced_at: null,
    source: 'calendly', calendly_event_id: 'cal-evt-8891' },
  { id: 'r-atheism', season_id: S1, guest_id: 'g-webb',
    title: 'From atheism to faith',
    topic: 'What actually changes a mind',
    questions_covered: 'What argument moved you?\nWhat did Christians get wrong when they talked to you?',
    scheduled_at: '2026-09-25T01:00:00Z', duration_minutes: 90,
    join_url: 'https://riverside.fm/studio/fsr',
    published_at: '2026-09-02T17:00:00Z',
    announce_at: '2026-09-15T16:00:00Z', announced_at: null, source: 'manual' },
];

export const rsvps: Rsvp[] = [
  { profile_id: 'p-priya',   recording_id: 'r-suffering', response: 'yes', responded_at: '2026-09-01T17:05:00Z' },
  { profile_id: 'p-grace',   recording_id: 'r-suffering', response: 'yes', responded_at: '2026-09-01T18:20:00Z' },
  { profile_id: 'p-tess',    recording_id: 'r-suffering', response: 'yes', responded_at: '2026-09-02T02:10:00Z' },
  { profile_id: 'p-aaliyah', recording_id: 'r-suffering', response: 'yes', responded_at: '2026-09-02T15:44:00Z' },
  { profile_id: 'p-sarah',   recording_id: 'r-suffering', response: 'yes', responded_at: '2026-09-03T01:02:00Z' },
  { profile_id: 'p-nadia',   recording_id: 'r-suffering', response: 'no',  note: 'It is 2am here — but I would love a question asked.', responded_at: '2026-09-01T19:40:00Z' },
  { profile_id: 'p-fena',    recording_id: 'r-suffering', response: 'no',  responded_at: '2026-09-02T08:15:00Z' },
];

export const events: FsrEvent[] = [
  { id: 'e-retreat', title: 'Fall Retreat', kind: 'retreat',
    starts_at: '2026-08-23T22:00:00Z', ends_at: '2026-08-27T18:00:00Z',
    location: 'Big Bear Lake, CA',
    description: 'Four days together to start the season. Most of you will not know each other yet — that changes fast.',
    published_at: '2026-08-01T17:00:00Z' },
];

export const questions: Question[] = [
  { id: 'q1', profile_id: 'p-nadia', recording_id: 'r-suffering',
    body: 'My cousin died in March and everyone kept telling me God had a plan. I want to know if that is actually what Christians believe or if people just say it.',
    submitted_at: '2026-09-01T19:41:00Z' },
  { id: 'q2', profile_id: 'p-fena', recording_id: 'r-suffering',
    body: 'Does suffering prove God is not good, or just that he is not what we assumed? Those feel like different arguments.',
    submitted_at: '2026-09-02T08:16:00Z' },
];

export const intakeQuestions: IntakeQuestion[] = [
  { id: 'iq1', profile_id: 'p-imani',  season_id: S1, kind: 'question',  source: 'retreat', submitted_at: '2026-08-24T04:00:00Z', body: 'If God is good, why did my cousin die?' },
  { id: 'iq2', profile_id: 'p-nadia',  season_id: S1, kind: 'question',  source: 'form',    submitted_at: '2026-08-18T10:00:00Z', body: 'Everyone said God had a plan when my cousin died. Is that what Christians actually believe?' },
  { id: 'iq3', profile_id: 'p-priya',  season_id: S1, kind: 'objection', source: 'form',    submitted_at: '2026-08-18T11:30:00Z', body: 'The Bible has been translated so many times — how would anyone know what it originally said?' },
  { id: 'iq4', profile_id: 'p-maya',   season_id: S1, kind: 'objection', source: 'retreat', submitted_at: '2026-08-24T05:10:00Z', body: 'I do not understand how anyone smart believes this.' },
  { id: 'iq5', profile_id: 'p-grace',  season_id: S1, kind: 'question',  source: 'form',    submitted_at: '2026-08-19T14:00:00Z', body: 'Why does the church treat women the way it does?' },
  { id: 'iq6', profile_id: 'p-tess',   season_id: S1, kind: 'question',  source: 'retreat', submitted_at: '2026-08-24T05:30:00Z', body: 'Is it still faith if you are mostly just hoping?' },
  { id: 'iq7', profile_id: 'p-aaliyah',season_id: S1, kind: 'objection', source: 'form',    submitted_at: '2026-08-20T09:00:00Z', body: 'Christians I know are the least loving people I know. Why would I want in?' },
  { id: 'iq8', profile_id: 'p-fena',   season_id: S1, kind: 'question',  source: 'form',    submitted_at: '2026-08-20T12:00:00Z', body: 'How do you know which religion is the right one when everyone is so sure?' },
];

export const questionLinks: QuestionLink[] = [
  { intake_question_id: 'iq1', recording_id: 'r-suffering', assigned_at: '2026-08-28T17:00:00Z' },
  { intake_question_id: 'iq2', recording_id: 'r-suffering', assigned_at: '2026-08-28T17:00:00Z' },
  { intake_question_id: 'iq3', recording_id: 'r-gospels',   assigned_at: '2026-08-30T17:00:00Z' },
];

export const prayerRequests: PrayerRequest[] = [
  { id: 'pr1', profile_id: 'p-priya', status: 'open', submitted_at: '2026-09-07T16:00:00Z',
    body: "My mom's surgery is Thursday. I am more scared than I have told anyone." },
  { id: 'pr2', profile_id: 'p-imani', status: 'open', submitted_at: '2026-09-08T03:20:00Z',
    body: 'Honestly just that I would keep showing up. I almost did not come to the retreat.' },
];

export const notes: Note[] = [
  { id: 'n1', title: 'Week one — you made it', audience: 'all', recipient_ids: [],
    author_id: 'p-janell', published_at: '2026-09-09T16:00:00Z',
    link_url: 'https://example.com/ep41', link_label: 'Episode 41 — Is faith just wishful thinking?',
    body: `{first_name} — I have been thinking about the retreat all week. Watching twelve of you who mostly did not know each other end up talking until 1am was the best part of my summer.

Our first remote recording is next Thursday with Dr. Rachel Kwon, and we are building it around a question one of you raised on Saturday night. That was not an accident. Every episode this season comes from something one of you actually asked.

If you cannot make a recording, that is genuinely okay. Send us your question and we will ask it for you.

We are glad you are here.
— Janell` },
  { id: 'n2', title: 'Before the retreat', audience: 'cohort', recipient_ids: [],
    author_id: 'p-janell', published_at: '2026-08-20T16:00:00Z',
    body: 'Packing list is simple: warm layers, a notebook if you like one, and nothing you feel like you have to perform. Come as you are — that is not a slogan here.' },
];

export const receipts: Receipt[] = [
  { id: 'rc1', profile_id: 'p-priya',   target_type: 'note', target_id: 'n1', delivered_at: '2026-09-09T16:00:00Z', opened_at: '2026-09-09T16:05:00Z' },
  { id: 'rc2', profile_id: 'p-grace',   target_type: 'note', target_id: 'n1', delivered_at: '2026-09-09T16:00:00Z', opened_at: '2026-09-09T21:18:00Z' },
  { id: 'rc3', profile_id: 'p-nadia',   target_type: 'note', target_id: 'n1', delivered_at: '2026-09-09T16:00:00Z', opened_at: '2026-09-09T18:40:00Z' },
  { id: 'rc4', profile_id: 'p-tess',    target_type: 'note', target_id: 'n1', delivered_at: '2026-09-09T16:00:00Z', opened_at: '2026-09-10T01:02:00Z' },
  { id: 'rc5', profile_id: 'p-aaliyah', target_type: 'note', target_id: 'n1', delivered_at: '2026-09-09T16:00:00Z', opened_at: null },
  { id: 'rc6', profile_id: 'p-maya',    target_type: 'note', target_id: 'n1', delivered_at: null, opened_at: null },
];

export const episodes: Episode[] = [
  { id: 'ep41', number: 41, title: 'Is faith just wishful thinking?', published_at: '2026-09-09T13:00:00Z', url: 'https://example.com/ep41' },
  { id: 'ep40', number: 40, title: 'What the retreat was like',       published_at: '2026-09-02T13:00:00Z', url: 'https://example.com/ep40' },
  { id: 'ep39', number: 39, title: 'Live at the Ruby Theater',        published_at: '2026-08-26T13:00:00Z', url: 'https://example.com/ep39' },
];

/** Public YouTube content. Real videos from the channel, so demo mode shows
 *  the public screens as a stranger would actually see them. */
export const publicEpisodes: PublicEpisode[] = [
  { id: 'pe1', video_id: '1QV8ndYTZWs', kind: 'episode',
    title: 'Constant Surrender with Ana & Reina', published_at: '2026-09-09T16:00:00Z',
    url: 'https://www.youtube.com/watch?v=1QV8ndYTZWs',
    thumbnail_url: 'https://i.ytimg.com/vi/1QV8ndYTZWs/hqdefault.jpg', blurb: null },
  { id: 'pe2', video_id: 'Rt3f3qEdz7A', kind: 'episode',
    title: 'FSR Season 8 - Group Session', published_at: '2026-09-02T16:00:00Z',
    url: 'https://www.youtube.com/watch?v=Rt3f3qEdz7A',
    thumbnail_url: 'https://i.ytimg.com/vi/Rt3f3qEdz7A/hqdefault.jpg', blurb: null },
  { id: 'pe6', video_id: 'JLlxllJp8do', kind: 'episode',
    title: 'Does "The One" Exist? with Tripp and Megan Almon',
    published_at: '2026-08-26T16:00:00Z',
    url: 'https://www.youtube.com/watch?v=JLlxllJp8do',
    thumbnail_url: 'https://i.ytimg.com/vi/JLlxllJp8do/hqdefault.jpg', blurb: null },
  { id: 'pe3', video_id: 'Ef0s47OjjcI', kind: 'short',
    title: 'Seek Genuine Jesus: Bible Claims are Objectively True',
    published_at: '2026-09-11T16:00:00Z',
    url: 'https://www.youtube.com/watch?v=Ef0s47OjjcI',
    thumbnail_url: 'https://i.ytimg.com/vi/Ef0s47OjjcI/hqdefault.jpg', blurb: null },
  { id: 'pe4', video_id: 'XD-f0flMTUc', kind: 'short',
    title: 'Marriage: A Signpost to Deeper Reality', published_at: '2026-09-10T16:00:00Z',
    url: 'https://www.youtube.com/watch?v=XD-f0flMTUc',
    thumbnail_url: 'https://i.ytimg.com/vi/XD-f0flMTUc/hqdefault.jpg', blurb: null },
  { id: 'pe5', video_id: 'bG2VMxPwO-o', kind: 'short',
    title: "Forgiveness: Christ's Sacrifice & Your New Perspective",
    published_at: '2026-09-09T12:00:00Z',
    url: 'https://www.youtube.com/watch?v=bG2VMxPwO-o',
    thumbnail_url: 'https://i.ytimg.com/vi/bG2VMxPwO-o/hqdefault.jpg', blurb: null },
];

/** Who you're signed in as in demo mode. */
export const DEMO_MEMBER = 'p-imani';
export const DEMO_ADMIN = 'p-lauren';
