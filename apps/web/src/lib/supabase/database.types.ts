export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type InstitutionRole = "owner" | "admin" | "teacher" | "examiner";

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      profiles: {
        Row: { id: string; full_name: string | null; avatar_url: string | null; created_at: string; updated_at: string };
        Insert: { id: string; full_name?: string | null; avatar_url?: string | null };
        Update: { full_name?: string | null; avatar_url?: string | null; updated_at?: string };
        Relationships: [];
      };
      institutions: {
        Row: { id: string; name: string; slug: string; created_by: string; created_at: string; updated_at: string };
        Insert: { name: string; slug: string; created_by: string };
        Update: { name?: string; slug?: string; updated_at?: string };
        Relationships: [];
      };
      institution_members: {
        Row: { id: string; institution_id: string; user_id: string; role: InstitutionRole; created_at: string };
        Insert: { institution_id: string; user_id: string; role?: InstitutionRole };
        Update: { role?: InstitutionRole };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_institution: { Args: { p_name: string; p_slug: string }; Returns: string };
      is_active_member: { Args: { p_institution_id: string }; Returns: boolean };
      has_institution_role: { Args: { p_institution_id: string; p_allowed_roles: InstitutionRole[] }; Returns: boolean };
    };
    Enums: { institution_role: InstitutionRole };
    CompositeTypes: { [_ in never]: never };
  };
};
