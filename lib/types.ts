export type Role = 'member' | 'admin';
export type MembershipKind = 'cohort' | 'alum';
export type RsvpResponse = 'yes' | 'no';
export type QuestionKind = 'question' | 'objection';
export type IntakeSource = 'form' | 'retreat' | 'app';
export type NoteAudience = 'all' | 'cohort' | 'alumni' | 'custom';
export type NotifClass = 'broadcast' | 'time_sensitive' | 'internal';
export type RecordingSource = 'manual' | 'calendly';

export interface Profile {
  id: string;
  display_name: string;
  role: Role;
  timezone: string;
  status: string;
  email?: string;
}

export interface Season {
  id: string; name: string; is_current: boolean;
  starts_at?: string | null; ends_at?: string | null;
}

export interface Guest {
  id: string; name: string; photo_url?: string | null; blurb?: string | null;
  external_url?: string | null; returning_override?: boolean | null;
  admin_notes?: string | null;
}

export interface Recording {
  id: string; season_id: string; guest_id: string | null;
  title: string; topic?: string | null; questions_covered?: string | null;
  description?: string | null;
  scheduled_at: string; duration_minutes: number; join_url?: string | null;
  published_at: string | null; announce_at: string | null; announced_at: string | null;
  source: RecordingSource; calendly_event_id?: string | null;
}

export interface Rsvp {
  profile_id: string; recording_id: string;
  response: RsvpResponse; note?: string | null; responded_at: string;
}

export interface FsrEvent {
  id: string; title: string; kind: string; starts_at: string; ends_at?: string | null;
  location?: string | null; description?: string | null; published_at: string | null;
}

export interface Question {
  id: string; profile_id: string; recording_id: string; body: string; submitted_at: string;
}

export interface IntakeQuestion {
  id: string; profile_id: string; season_id: string; body: string;
  kind: QuestionKind; source: IntakeSource; submitted_at: string;
}

export interface QuestionLink {
  intake_question_id: string; recording_id: string; assigned_at: string;
}

export interface PrayerRequest {
  id: string; profile_id: string; body: string; status: string; submitted_at: string;
}

export interface Note {
  id: string; title: string; body: string;
  link_url?: string | null; link_label?: string | null;
  author_id?: string | null; audience: NoteAudience; recipient_ids: string[];
  published_at: string | null;
}

export interface Receipt {
  id: string; profile_id: string; target_type: string; target_id: string;
  delivered_at: string | null; opened_at: string | null;
}

export interface Episode {
  id: string; title: string; url?: string | null; number?: number | null;
  published_at: string | null;
}

export interface Membership {
  profile_id: string; season_id: string; kind: MembershipKind;
}

export interface Invite {
  id: string; email: string; season_id: string; code: string;
  sent_at: string; expires_at: string; redeemed_at: string | null;
}

/** A YouTube upload, synced by amplify/functions/youtube-sync. Public. */
export interface PublicEpisode {
  id: string;
  video_id: string;
  title: string;
  url: string;
  thumbnail_url: string | null;
  published_at: string;
  kind: 'episode' | 'short';
  blurb: string | null;
}
