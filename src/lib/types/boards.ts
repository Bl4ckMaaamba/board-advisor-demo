// Board system types

export type BoardRole = "owner" | "admin" | "member";
export type InvitationStatus = "pending" | "accepted" | "expired";
export type ParticipantRole = "admin" | "member" | "observer";
export type ParticipantType = "permanent" | "exceptional";
export type ParticipantStatus = "invited" | "confirmed" | "declined";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export type CompanySize = "startup" | "pme" | "eti" | "grande_entreprise";
export type StrategicContext = "croissance" | "pre_exit" | "post_acquisition" | "restructuration" | "stable" | "introduction_bourse";
export type VoteResult = "approved" | "rejected" | "deferred" | "unanimous" | "majority";
export type DecisionStatus = "active" | "superseded" | "revoked";
export type ActionStatus = "todo" | "in_progress" | "done" | "overdue" | "cancelled";
export type ActionPriority = "low" | "medium" | "high" | "critical";
export type EngagementStatus = "pending" | "fulfilled" | "broken" | "expired";
export type SubjectStatus = "discussed" | "deferred" | "resolved";

export interface Competitor {
  name: string;
  description?: string;
}

export interface KeyClient {
  name: string;
  revenue_share?: string;
}

export interface Board {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  // Profil sectoriel
  company_siren?: string | null;
  company_legal_form?: string | null;
  company_headquarters?: string | null;
  company_size?: CompanySize | null;
  company_revenue?: string | null;
  company_employees?: string | null;
  company_geo_zones?: string[] | null;
  company_listed?: boolean;
  company_strategic_context?: StrategicContext | null;
  competitors?: Competitor[];
  key_clients?: KeyClient[];
  tracked_kpis?: string[] | null;
}

export interface BoardWithRole extends Board {
  role: BoardRole;
  joined_at: string;
}

export interface BoardMember {
  id: string;
  board_id: string;
  user_id: string;
  role: BoardRole;
  joined_at: string;
  expertise?: string | null;
  bio?: string | null;
  profile?: Profile;
}

export interface BoardWithMembers extends Board {
  members: BoardMember[];
}

export interface BoardInvitation {
  id: string;
  board_id: string;
  email: string;
  role: BoardRole;
  token: string;
  invited_by: string;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
  inviter_profile?: Profile;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string | null;
  email: string;
  role: ParticipantRole;
  type: ParticipantType;
  status: ParticipantStatus;
  created_at: string;
  profile?: Profile;
}

// ── Meetings ──

export type MeetingType = "in_person" | "visio";
export type RecallBotStatus = "joining" | "in_call" | "recording" | "done" | "error";

export interface Meeting {
  id: string;
  board_id: string;
  title: string;
  description: string | null;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  meeting_type: MeetingType;
  meeting_url: string | null;
  recall_bot_id: string | null;
  recall_bot_status: RecallBotStatus | null;
}

export interface CreateBoardInput {
  name: string;
  description?: string;
  sector?: string;
}

export interface InviteMemberInput {
  board_id: string;
  email: string;
  role?: BoardRole;
}

// ── Mémoire Institutionnelle ──

export interface BoardDecision {
  id: string;
  board_id: string;
  meeting_id: string | null;
  subject: string;
  description: string | null;
  vote_result: VoteResult | null;
  status: DecisionStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  meeting_title?: string;
  actions?: BoardAction[];
}

export interface BoardAction {
  id: string;
  board_id: string;
  decision_id: string | null;
  meeting_id: string | null;
  description: string;
  assignee_id: string | null;
  assignee_name: string | null;
  deadline: string | null;
  status: ActionStatus;
  priority: ActionPriority;
  notes: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  assignee_profile?: Profile;
  decision_subject?: string;
}

export interface BoardEngagement {
  id: string;
  board_id: string;
  meeting_id: string | null;
  speaker_id: string | null;
  speaker_name: string | null;
  description: string;
  context: string | null;
  status: EngagementStatus;
  created_at: string;
  // Joined
  speaker_profile?: Profile;
}

export interface BoardSubject {
  id: string;
  board_id: string;
  meeting_id: string | null;
  title: string;
  summary: string | null;
  duration_minutes: number | null;
  decision_id: string | null;
  status: SubjectStatus;
  created_at: string;
}
