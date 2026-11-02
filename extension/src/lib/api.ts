import { supabase } from "./supabase";
import type { Template, Recipient } from "@shared/types";

export async function listTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from("templates")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Template[];
}

export async function listRecipients(): Promise<Recipient[]> {
  const { data, error } = await supabase
    .from("recipients")
    .select("*")
    .order("email", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Recipient[];
}
