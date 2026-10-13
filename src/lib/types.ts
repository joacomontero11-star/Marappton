import type { ChallengeRule, Weather } from '../../supabase/functions/_shared/challenges';

export type Visibility = 'public' | 'followers' | 'private';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'finished';

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  bio: string;
  profile_visibility: Visibility;
  default_run_visibility: Visibility;
  hide_route_endpoints: boolean;
  show_raffle_participation: boolean;
  is_admin: boolean;
  gps_consent_at: string | null;
};

export type FeedRun = {
  id: string;
  user_id: string;
  title: string;
  notes: string;
  started_at: string;
  ended_at: string;
  distance_m: number;
  duration_s: number;
  avg_pace_s_per_km: number | null;
  route_public: [number, number][] | null;
  visibility: Visibility;
  weather: Weather | null;
  verified: boolean;
  username: string;
  full_name: string;
  avatar_url: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
};

export type Raffle = {
  id: string;
  title: string;
  description: string;
  prize: string;
  sponsor: string;
  image_url: string | null;
  status: CampaignStatus;
  starts_at: string;
  ends_at: string;
  draw_at: string | null;
  winner_user_id: string | null;
  drawn_at: string | null;
};

export type Challenge = {
  id: string;
  raffle_id: string;
  title: string;
  description: string;
  category: string;
  rule: ChallengeRule;
  status: CampaignStatus;
  starts_at: string;
  ends_at: string;
  max_entries_per_user: number | null;
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  public: 'Todos',
  followers: 'Seguidores',
  private: 'Solo yo',
};

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Borrador',
  active: 'Activo',
  paused: 'Pausado',
  finished: 'Finalizado',
};
