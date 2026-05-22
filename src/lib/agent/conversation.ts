import { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { SourceRef } from "./types";

export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  boardId?: string,
  title?: string
): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      board_id: boardId ?? null,
      title: title ?? "Nouvelle conversation",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data.id;
}

export async function addMessage(
  supabase: SupabaseClient,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  sources?: SourceRef[],
  toolsUsed?: string[]
): Promise<void> {
  const { error } = await supabase.from("conversation_messages").insert({
    conversation_id: conversationId,
    role,
    content,
    sources: sources ?? [],
    tools_used: toolsUsed ?? [],
  });

  if (error) throw new Error(`Failed to add message: ${error.message}`);

  // Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceRef[];
  tools_used: string[];
  created_at: string;
}

export async function getMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit: number = 40
): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to get messages: ${error.message}`);
  return data ?? [];
}

export interface ConversationSummary {
  id: string;
  board_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export async function listConversations(
  supabase: SupabaseClient,
  boardId?: string
): Promise<ConversationSummary[]> {
  let query = supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (boardId) {
    query = query.eq("board_id", boardId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list conversations: ${error.message}`);
  return data ?? [];
}

export async function updateTitle(
  supabase: SupabaseClient,
  conversationId: string,
  title: string
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ title })
    .eq("id", conversationId);

  if (error) throw new Error(`Failed to update title: ${error.message}`);
}

let anthropicClient: Anthropic | null = null;

export async function generateTitle(firstMessage: string): Promise<string> {
  try {
    if (!anthropicClient) {
      anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    const response = await anthropicClient.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      messages: [
        {
          role: "user",
          content: `Génère un titre court (5-8 mots maximum) pour une conversation qui commence par cette question. Réponds UNIQUEMENT avec le titre, sans guillemets ni ponctuation finale.\n\nQuestion: "${firstMessage}"`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    return text.trim().substring(0, 80) || "Nouvelle conversation";
  } catch {
    // Fallback: use first words of the message
    return firstMessage.substring(0, 50) + (firstMessage.length > 50 ? "..." : "");
  }
}
