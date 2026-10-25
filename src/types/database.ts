export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string
          id: string
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          description?: string
          id?: string
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_records: {
        Row: {
          activity_id: string
          ai_draft: string
          analysis_json: Json
          created_at: string
          final_text: string | null
          id: string
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          ai_draft: string
          analysis_json: Json
          created_at?: string
          final_text?: string | null
          id?: string
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          ai_draft?: string
          analysis_json?: Json
          created_at?: string
          final_text?: string | null
          id?: string
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_records_activity_teacher_fkey"
            columns: ["activity_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "activity_records_student_teacher_fkey"
            columns: ["student_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "activity_records_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      icwc_draft_history: {
        Row: {
          created_at: string
          draft_text: string
          generation_direction: string
          id: string
          review_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          draft_text: string
          generation_direction: string
          id?: string
          review_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          draft_text?: string
          generation_direction?: string
          id?: string
          review_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "icwc_draft_history_review_teacher_fkey"
            columns: ["review_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "icwc_student_reviews"
            referencedColumns: ["id", "teacher_id"]
          },
        ]
      }
      icwc_final_records: {
        Row: {
          activity_id: string
          created_at: string
          final_text: string
          id: string
          published_at: string | null
          review_id: string
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          final_text: string
          id?: string
          published_at?: string | null
          review_id: string
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          final_text?: string
          id?: string
          published_at?: string | null
          review_id?: string
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "icwc_final_records_review_fkey"
            columns: ["review_id", "teacher_id", "student_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "icwc_student_reviews"
            referencedColumns: ["id", "teacher_id", "student_id", "activity_id"]
          },
        ]
      }
      icwc_student_reviews: {
        Row: {
          activity_id: string
          created_at: string
          draft_focus: string | null
          id: string
          student_id: string
          submission_id: string
          teacher_comment: string
          teacher_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          draft_focus?: string | null
          id?: string
          student_id: string
          submission_id: string
          teacher_comment?: string
          teacher_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          draft_focus?: string | null
          id?: string
          student_id?: string
          submission_id?: string
          teacher_comment?: string
          teacher_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "icwc_student_reviews_submission_fkey"
            columns: [
              "submission_id",
              "teacher_id",
              "student_id",
              "team_id",
              "activity_id",
            ]
            isOneToOne: false
            referencedRelation: "icwc_student_submissions"
            referencedColumns: [
              "id",
              "teacher_id",
              "student_id",
              "team_id",
              "activity_id",
            ]
          },
        ]
      }
      icwc_student_submissions: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          reflection_text: string
          student_id: string
          submitted_at: string | null
          teacher_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          reflection_text?: string
          student_id: string
          submitted_at?: string | null
          teacher_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          reflection_text?: string
          student_id?: string
          submitted_at?: string | null
          teacher_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "icwc_student_submissions_member_fkey"
            columns: ["team_id", "student_id", "teacher_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "icwc_team_members"
            referencedColumns: [
              "team_id",
              "student_id",
              "teacher_id",
              "activity_id",
            ]
          },
        ]
      }
      icwc_team_members: {
        Row: {
          activity_id: string
          created_at: string
          student_id: string
          teacher_id: string
          team_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          student_id: string
          teacher_id: string
          team_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          student_id?: string
          teacher_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "icwc_team_members_student_teacher_fkey"
            columns: ["student_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "icwc_team_members_team_fkey"
            columns: ["team_id", "teacher_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "icwc_teams"
            referencedColumns: ["id", "teacher_id", "activity_id"]
          },
        ]
      }
      icwc_teams: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          report_file_mime_type: string | null
          report_file_name: string | null
          report_file_path: string | null
          report_file_size_bytes: number | null
          report_text: string
          submitted_at: string | null
          teacher_id: string
          team_name: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          report_file_mime_type?: string | null
          report_file_name?: string | null
          report_file_path?: string | null
          report_file_size_bytes?: number | null
          report_text?: string
          submitted_at?: string | null
          teacher_id: string
          team_name: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          report_file_mime_type?: string | null
          report_file_name?: string | null
          report_file_path?: string | null
          report_file_size_bytes?: number | null
          report_text?: string
          submitted_at?: string | null
          teacher_id?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "icwc_teams_activity_teacher_fkey"
            columns: ["activity_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "icwc_teams_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      student_reports: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          report_file_mime_type: string | null
          report_file_name: string | null
          report_file_path: string | null
          report_file_size_bytes: number | null
          report_text: string
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          report_file_mime_type?: string | null
          report_file_name?: string | null
          report_file_path?: string | null
          report_file_size_bytes?: number | null
          report_text?: string
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          report_file_mime_type?: string | null
          report_file_name?: string | null
          report_file_path?: string | null
          report_file_size_bytes?: number | null
          report_text?: string
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_reports_activity_teacher_fkey"
            columns: ["activity_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "student_reports_student_teacher_fkey"
            columns: ["student_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "student_reports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          auth_user_id: string | null
          class_no: number
          created_at: string
          grade: number
          id: string
          name: string
          student_no: number
          teacher_id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          class_no: number
          created_at?: string
          grade: number
          id?: string
          name: string
          student_no: number
          teacher_id: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          class_no?: number
          created_at?: string
          grade?: number
          id?: string
          name?: string
          student_no?: number
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          id: string
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          role?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
