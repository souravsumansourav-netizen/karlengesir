export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      subjects: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      files: {
        Row: {
          id: string;
          subject_id: string | null;
          file_name: string;
          storage_key: string;
          storage_provider: string;
          mime_type: string | null;
          size_bytes: number;
          description: string | null;
          uploader_name: string;
          download_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          subject_id?: string | null;
          file_name: string;
          storage_key: string;
          storage_provider?: string;
          mime_type?: string | null;
          size_bytes: number;
          description?: string | null;
          uploader_name?: string;
          download_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          subject_id?: string | null;
          file_name?: string;
          storage_key?: string;
          storage_provider?: string;
          mime_type?: string | null;
          size_bytes?: number;
          description?: string | null;
          uploader_name?: string;
          download_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "files_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          }
        ];
      };
      admins: {
        Row: { user_id: string };
        Insert: { user_id: string };
        Update: { user_id?: string };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      increment_download_count: {
        Args: { file_id: string };
        Returns: void;
      };
      get_storage_usage: {
        Args: Record<string, never>;
        Returns: { total_bytes: number; file_count: number }[];
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type FileRow = Database["public"]["Tables"]["files"]["Row"];
export type SubjectRow = Database["public"]["Tables"]["subjects"]["Row"];
