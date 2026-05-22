import { SupabaseClient } from "@supabase/supabase-js";
import type {
  BoardWithRole,
  BoardWithMembers,
  BoardMember,
  BoardInvitation,
  CreateBoardInput,
  Profile,
} from "@/lib/types/boards";

/**
 * Get all boards for the current user (with role).
 */
export async function getMyBoards(supabase: SupabaseClient): Promise<BoardWithRole[]> {
  const { data, error } = await supabase
    .from("my_boards")
    .select("*")
    .order("name");

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Get a board with its members and their profiles.
 */
export async function getBoardWithMembers(
  supabase: SupabaseClient,
  boardId: string
): Promise<BoardWithMembers | null> {
  const { data: board, error: boardError } = await supabase
    .from("boards")
    .select("*")
    .eq("id", boardId)
    .single();

  if (boardError || !board) return null;

  const { data: members, error: membersError } = await supabase
    .from("board_members")
    .select(`
      *,
      profile:profiles(*)
    `)
    .eq("board_id", boardId)
    .order("joined_at");

  if (membersError) throw new Error(membersError.message);

  return {
    ...board,
    members: (members || []).map((m: Record<string, unknown>) => ({
      ...m,
      profile: m.profile as Profile | undefined,
    })) as BoardMember[],
  };
}

/**
 * Create a new board. The SQL trigger auto-adds the creator as owner.
 */
export async function createBoard(
  supabase: SupabaseClient,
  userId: string,
  input: CreateBoardInput
) {
  const { data, error } = await supabase
    .from("boards")
    .insert({
      name: input.name,
      description: input.description || null,
      sector: input.sector || null,
      owner_id: userId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Invite a member to a board by email. Returns the invitation record.
 */
export async function inviteBoardMember(
  supabase: SupabaseClient,
  boardId: string,
  email: string,
  role: string = "member",
  invitedBy: string
): Promise<BoardInvitation> {
  const { data, error } = await supabase
    .from("board_invitations")
    .insert({
      board_id: boardId,
      email,
      role,
      invited_by: invitedBy,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Accept a board invitation via token. Calls the RPC function.
 */
export async function acceptBoardInvitation(
  supabase: SupabaseClient,
  token: string
): Promise<{ success: boolean; board_id?: string; error?: string }> {
  const { data, error } = await supabase.rpc("accept_board_invitation", {
    invitation_token: token,
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Remove a member from a board. Calls the RPC function.
 */
export async function removeBoardMember(
  supabase: SupabaseClient,
  boardId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("remove_board_member", {
    target_board_id: boardId,
    target_user_id: userId,
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Update a board member's role.
 */
export async function updateBoardMemberRole(
  supabase: SupabaseClient,
  boardId: string,
  userId: string,
  newRole: string
) {
  const { error } = await supabase
    .from("board_members")
    .update({ role: newRole })
    .eq("board_id", boardId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}

/**
 * Get pending invitations for a board.
 */
export async function getBoardInvitations(
  supabase: SupabaseClient,
  boardId: string
): Promise<BoardInvitation[]> {
  const { data, error } = await supabase
    .from("board_invitations")
    .select("*")
    .eq("board_id", boardId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Get invitation details by token.
 */
export async function getInvitationByToken(
  supabase: SupabaseClient,
  token: string
): Promise<BoardInvitation | null> {
  const { data, error } = await supabase
    .from("board_invitations")
    .select(`
      *,
      board:boards(id, name, sector),
      inviter_profile:profiles!board_invitations_invited_by_fkey(full_name, email)
    `)
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (error) return null;
  return data;
}

/**
 * Update a board's details.
 */
export async function updateBoard(
  supabase: SupabaseClient,
  boardId: string,
  updates: { name?: string; description?: string; sector?: string }
) {
  const { data, error } = await supabase
    .from("boards")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", boardId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Delete a board (owner only).
 */
export async function deleteBoard(supabase: SupabaseClient, boardId: string) {
  const { error } = await supabase.from("boards").delete().eq("id", boardId);
  if (error) throw new Error(error.message);
}
