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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_pending_actions: {
        Row: { id: string; owner_id: string; conversation_id: string | null; description: string; tool: string; args: Json; state: string; result: Json | null; created_at: string; expires_at: string }
        Insert: { id?: string; owner_id: string; conversation_id?: string | null; description?: string; tool: string; args: Json; state?: string; result?: Json | null; created_at?: string; expires_at?: string }
        Update: { id?: string; owner_id?: string; tool?: string; args?: Json; state?: string; result?: Json | null; created_at?: string; expires_at?: string }
        Relationships: []
      }
      ai_messages: {
        Row: {
          action_id: string | null
          reply_to: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          action_id?: string | null
          reply_to?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          action_id?: string | null
          reply_to?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      automation_settings: {
        Row: {
          enabled: boolean
          key: string
          params: Json
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          params?: Json
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          params?: Json
          updated_at?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          id: string
          started_at: string
          finished_at: string | null
          status: string
          summary: Json
          error_message: string | null
        }
        Insert: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          summary?: Json
          error_message?: string | null
        }
        Update: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          summary?: Json
          error_message?: string | null
        }
        Relationships: []
      }
      evaluations: {
        Row: {
          performed_on: string | null
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          scheduled_at: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          performed_on?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_at: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          performed_on?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          scheduled_at?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          scheduled_message_id: string | null
          provider_message_id: string | null
          content: string
          id: string
          sent_at: string
          status: string | null
          student_id: string
        }
        Insert: {
          scheduled_message_id?: string | null
          provider_message_id?: string | null
          content: string
          id?: string
          sent_at?: string
          status?: string | null
          student_id: string
        }
        Update: {
          scheduled_message_id?: string | null
          provider_message_id?: string | null
          content?: string
          id?: string
          sent_at?: string
          status?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      predefined_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          expires_at: string | null
          source_scheduled_at: string | null
          source_payment_due_date: string | null
          dispatch_started_at: string | null
          content: string
          created_at: string
          evaluation_id: string | null
          failure_reason: string | null
          id: string
          message_type: string
          recurrence_count: number | null
          recurrence_interval_days: number | null
          recurrence_parent_id: string | null
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          expires_at?: string | null
          source_scheduled_at?: string | null
          source_payment_due_date?: string | null
          dispatch_started_at?: string | null
          content: string
          created_at?: string
          evaluation_id?: string | null
          failure_reason?: string | null
          id?: string
          message_type?: string
          recurrence_count?: number | null
          recurrence_interval_days?: number | null
          recurrence_parent_id?: string | null
          retry_count?: number
          scheduled_for: string
          sent_at?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          expires_at?: string | null
          source_scheduled_at?: string | null
          source_payment_due_date?: string | null
          dispatch_started_at?: string | null
          content?: string
          created_at?: string
          evaluation_id?: string | null
          failure_reason?: string | null
          id?: string
          message_type?: string
          recurrence_count?: number | null
          recurrence_interval_days?: number | null
          recurrence_parent_id?: string | null
          retry_count?: number
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          user_id: string
          role: string
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          role: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          role?: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_plan_history: {
        Row: {
          id: string
          student_id: string
          previous_plan: string | null
          plan: string | null
          previous_due_date: string | null
          payment_due_date: string | null
          created_at: string
          actor_id: string | null
        }
        Insert: {
          id?: string
          student_id: string
          previous_plan?: string | null
          plan?: string | null
          previous_due_date?: string | null
          payment_due_date?: string | null
          created_at?: string
          actor_id?: string | null
        }
        Update: {
          id?: string
          student_id?: string
          previous_plan?: string | null
          plan?: string | null
          previous_due_date?: string | null
          payment_due_date?: string | null
          created_at?: string
          actor_id?: string | null
        }
        Relationships: [{
          foreignKeyName: "student_plan_history_student_id_fkey"
          columns: ["student_id"]
          isOneToOne: false
          referencedRelation: "students"
          referencedColumns: ["id"]
        }]
      }
      students: {
        Row: {
          enrollment_date: string | null
          benefit: string | null
          messages_enabled: boolean
          initial_evaluation_date: string | null
          birth_date: string | null
          city: string | null
          cpf: string | null
          created_at: string
          evaluation_notes: string | null
          had_evaluation: boolean | null
          id: string
          last_evaluation_date: string | null
          name: string
          payment_due_date: string | null
          phone: string
          plan: string | null
          status: string
          updated_at: string
        }
        Insert: {
          enrollment_date?: string | null
          benefit?: string | null
          messages_enabled?: boolean
          initial_evaluation_date?: string | null
          birth_date?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          evaluation_notes?: string | null
          had_evaluation?: boolean | null
          id?: string
          last_evaluation_date?: string | null
          name: string
          payment_due_date?: string | null
          phone: string
          plan?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          enrollment_date?: string | null
          benefit?: string | null
          messages_enabled?: boolean
          initial_evaluation_date?: string | null
          birth_date?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string
          evaluation_notes?: string | null
          had_evaluation?: boolean | null
          id?: string
          last_evaluation_date?: string | null
          name?: string
          payment_due_date?: string | null
          phone?: string
          plan?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
    append_ai_message_tx: { Args: { _id: string; _conversation_id: string; _role: string; _content: string; _action_id?: string | null; _reply_to?: string | null }; Returns: string }
    get_ai_conversation_history: { Args: { _conversation_id: string }; Returns: Json }
    reject_ai_action_tx: { Args: { _id: string; _owner_id: string }; Returns: Json }
    get_workout_dashboard: { Args: Record<PropertyKey, never>; Returns: Json }
      claim_ai_action_tx: { Args: { _id: string; _owner_id: string }; Returns: Json }
      finish_ai_action_tx: { Args: { _id: string; _owner_id: string; _result: Json; _failed?: boolean }; Returns: undefined }
      current_staff_role: { Args: Record<PropertyKey, never>; Returns: string | null }
      has_staff_role: { Args: { _roles: string[] }; Returns: boolean }
      evaluation_schedule_conflicts: {
        Args: { _student_id: string; _scheduled_at: string; _ignore_evaluation_id?: string };
        Returns: Json;
      }
      enqueue_messages_tx: {
        Args: { _request_id: string; _student_ids: string[]; _content: string; _schedule: Json };
        Returns: Json;
      }
      mutate_evaluation_tx: {
        Args: { _action: string; _evaluation_id: string; _student_id?: string; _scheduled_at?: string; _notes?: string | null; _messages?: Json; _allow_conflict?: boolean }
        Returns: Json
      }
      complete_evaluation_on_tx: { Args: { _evaluation_id: string; _performed_on: string; _messages?: Json }; Returns: Json }
      cancel_scheduled_messages_tx: { Args: { _ids: string[]; _whole_series?: boolean }; Returns: Json }
      acquire_whatsapp_delivery_lease: { Args: { _token: string }; Returns: boolean }
      release_whatsapp_delivery_lease: { Args: { _token: string }; Returns: undefined }
      prepare_scheduled_message_dispatch: { Args: { _id: string; _expected_updated_at: string; _lease_token: string }; Returns: Json }
      finish_scheduled_message_dispatch: { Args: { _id: string; _content: string; _provider_message_id: string }; Returns: undefined }
      claim_due_scheduled_messages: {
        Args: { _limit: number }
        Returns: {
          content: string
          created_at: string
          evaluation_id: string | null
          failure_reason: string | null
          id: string
          message_type: string
          recurrence_count: number | null
          recurrence_interval_days: number | null
          recurrence_parent_id: string | null
          retry_count: number
          scheduled_for: string
          sent_at: string | null
          status: string
          student_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "scheduled_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_evaluation_tx: {
        Args: { _evaluation_id: string }
        Returns: undefined
      }
      reset_stuck_scheduled_messages: { Args: never; Returns: number }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
