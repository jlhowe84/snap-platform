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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      action_types: {
        Row: {
          autonomy_level: number
          clean_streak: number
          company_id: string
          description: string
          key: string
          kind: Database["public"]["Enums"]["action_kind"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          autonomy_level?: number
          clean_streak?: number
          company_id: string
          description: string
          key: string
          kind: Database["public"]["Enums"]["action_kind"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          autonomy_level?: number
          clean_streak?: number
          company_id?: string
          description?: string
          key?: string
          kind?: Database["public"]["Enums"]["action_kind"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: string
          changes: Json | null
          company_id: string
          id: number
          occurred_at: string
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind: string
          changes?: Json | null
          company_id: string
          id?: never
          occurred_at?: string
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: string
          changes?: Json | null
          company_id?: string
          id?: never
          occurred_at?: string
          row_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_actions: {
        Row: {
          action_type_key: string
          actor_id: string | null
          actor_kind: string
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          draft: Json | null
          error: string | null
          id: string
          input: Json | null
          record_refs: Json | null
          result: Json | null
          run_id: string | null
          status: Database["public"]["Enums"]["action_status"]
        }
        Insert: {
          action_type_key: string
          actor_id?: string | null
          actor_kind: string
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          draft?: Json | null
          error?: string | null
          id?: string
          input?: Json | null
          record_refs?: Json | null
          result?: Json | null
          run_id?: string | null
          status: Database["public"]["Enums"]["action_status"]
        }
        Update: {
          action_type_key?: string
          actor_id?: string | null
          actor_kind?: string
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          draft?: Json | null
          error?: string | null
          id?: string
          input?: Json | null
          record_refs?: Json | null
          result?: Json | null
          run_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_company_id_action_type_key_fkey"
            columns: ["company_id", "action_type_key"]
            isOneToOne: false
            referencedRelation: "action_types"
            referencedColumns: ["company_id", "key"]
          },
          {
            foreignKeyName: "agent_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_events: {
        Row: {
          company_id: string
          id: number
          job_id: string | null
          kind: string
          occurred_at: string
          org_id: string | null
          payload: Json
          processed_at: string | null
          run_id: string | null
        }
        Insert: {
          company_id: string
          id?: never
          job_id?: string | null
          kind: string
          occurred_at?: string
          org_id?: string | null
          payload?: Json
          processed_at?: string | null
          run_id?: string | null
        }
        Update: {
          company_id?: string
          id?: never
          job_id?: string | null
          kind?: string
          occurred_at?: string
          org_id?: string | null
          payload?: Json
          processed_at?: string | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_pauses: {
        Row: {
          action_type_key: string | null
          company_id: string
          id: string
          lifted_at: string | null
          lifted_by: string | null
          paused_at: string
          paused_by: string | null
          reason: string | null
        }
        Insert: {
          action_type_key?: string | null
          company_id: string
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          paused_at?: string
          paused_by?: string | null
          reason?: string | null
        }
        Update: {
          action_type_key?: string | null
          company_id?: string
          id?: string
          lifted_at?: string | null
          lifted_by?: string | null
          paused_at?: string
          paused_by?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_pauses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_pauses_lifted_by_fkey"
            columns: ["lifted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_pauses_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          company_id: string
          cost_usd: number
          error: string | null
          finished_at: string | null
          id: string
          input: Json | null
          input_tokens: number
          model: string | null
          output: Json | null
          output_tokens: number
          started_at: string
          status: string
          tool_calls: number
          trigger: string
        }
        Insert: {
          company_id: string
          cost_usd?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          input_tokens?: number
          model?: string | null
          output?: Json | null
          output_tokens?: number
          started_at?: string
          status?: string
          tool_calls?: number
          trigger: string
        }
        Update: {
          company_id?: string
          cost_usd?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          input_tokens?: number
          model?: string | null
          output?: Json | null
          output_tokens?: number
          started_at?: string
          status?: string
          tool_calls?: number
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_signatures: {
        Row: {
          company_id: string
          id: string
          initials: Json
          ip_address: unknown
          job_id: string
          pdf_path: string | null
          signed_at: string
          signer_email: string
          signer_name: string
          signer_profile_id: string | null
          user_agent: string | null
          version_id: string
        }
        Insert: {
          company_id: string
          id?: string
          initials?: Json
          ip_address?: unknown
          job_id: string
          pdf_path?: string | null
          signed_at?: string
          signer_email: string
          signer_name: string
          signer_profile_id?: string | null
          user_agent?: string | null
          version_id: string
        }
        Update: {
          company_id?: string
          id?: string
          initials?: Json
          ip_address?: unknown
          job_id?: string
          pdf_path?: string | null
          signed_at?: string
          signer_email?: string
          signer_name?: string
          signer_profile_id?: string | null
          user_agent?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agreement_signatures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_signatures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_signatures_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_signatures_signer_profile_id_fkey"
            columns: ["signer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_signatures_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "agreement_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_versions: {
        Row: {
          activated_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          sections: Json
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          sections?: Json
          status?: string
          title: string
          updated_at?: string
          version: number
        }
        Update: {
          activated_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          sections?: Json
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreement_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_log: {
        Row: {
          action_id: string | null
          company_id: string
          created_at: string
          id: string
          job_id: string | null
          key: string
          kind: string
          missing: string[] | null
          outcome: string
          run_on: string
        }
        Insert: {
          action_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          job_id?: string | null
          key: string
          kind: string
          missing?: string[] | null
          outcome: string
          run_on: string
        }
        Update: {
          action_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          job_id?: string | null
          key?: string
          kind?: string
          missing?: string[] | null
          outcome?: string
          run_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_log_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "agent_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          active_state: string | null
          company_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          notion_page_id: string | null
          phone: string | null
          preferred_channel: string | null
          role_title: string | null
          updated_at: string
          years_active: number[]
        }
        Insert: {
          active_state?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          notion_page_id?: string | null
          phone?: string | null
          preferred_channel?: string | null
          role_title?: string | null
          updated_at?: string
          years_active?: number[]
        }
        Update: {
          active_state?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          notion_page_id?: string | null
          phone?: string | null
          preferred_channel?: string | null
          role_title?: string | null
          updated_at?: string
          years_active?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_members: {
        Row: {
          active: boolean
          city: string | null
          company_id: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          level: number | null
          notes: string | null
          notion_page_id: string | null
          phone: string | null
          positions: string[]
          profile_id: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          city?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          level?: number | null
          notes?: string | null
          notion_page_id?: string | null
          phone?: string | null
          positions?: string[]
          profile_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          city?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          level?: number | null
          notes?: string | null
          notion_page_id?: string | null
          phone?: string | null
          positions?: string[]
          profile_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      date_holds: {
        Row: {
          company_id: string
          confirmed_at: string | null
          created_at: string
          expires_on: string
          extended_by: string | null
          held_on: string
          id: string
          job_id: string
          offer_id: string | null
          photo_day_id: string
          released_at: string | null
          released_reason: string | null
          reminder_sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          confirmed_at?: string | null
          created_at?: string
          expires_on: string
          extended_by?: string | null
          held_on?: string
          id?: string
          job_id: string
          offer_id?: string | null
          photo_day_id: string
          released_at?: string | null
          released_reason?: string | null
          reminder_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          confirmed_at?: string | null
          created_at?: string
          expires_on?: string
          extended_by?: string | null
          held_on?: string
          id?: string
          job_id?: string
          offer_id?: string | null
          photo_day_id?: string
          released_at?: string | null
          released_reason?: string | null
          reminder_sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_holds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_holds_extended_by_fkey"
            columns: ["extended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_holds_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_holds_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_holds_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "season_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "date_holds_photo_day_id_fkey"
            columns: ["photo_day_id"]
            isOneToOne: true
            referencedRelation: "photo_day_readiness"
            referencedColumns: ["photo_day_id"]
          },
          {
            foreignKeyName: "date_holds_photo_day_id_fkey"
            columns: ["photo_day_id"]
            isOneToOne: true
            referencedRelation: "photo_days"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_status: {
        Row: {
          company_id: string
          details: Json | null
          enabled: boolean
          integration: string
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          next_run_at: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          details?: Json | null
          enabled?: boolean
          integration: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          next_run_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          details?: Json | null
          enabled?: boolean
          integration?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          next_run_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_status_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_contacts: {
        Row: {
          company_id: string
          contact_id: string
          job_id: string
          role: string
        }
        Insert: {
          company_id: string
          contact_id: string
          job_id: string
          role?: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          job_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_contacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_contacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_coordinators: {
        Row: {
          added_at: string
          company_id: string
          job_id: string
          profile_id: string
        }
        Insert: {
          added_at?: string
          company_id: string
          job_id: string
          profile_id: string
        }
        Update: {
          added_at?: string
          company_id?: string
          job_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_coordinators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_coordinators_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_coordinators_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_coordinators_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_links: {
        Row: {
          captura_gallery_id: number | null
          company_id: string
          drive_folder_url: string | null
          job_id: string
          notion_page_url: string | null
          online_shop_url: string | null
          updated_at: string
        }
        Insert: {
          captura_gallery_id?: number | null
          company_id: string
          drive_folder_url?: string | null
          job_id: string
          notion_page_url?: string | null
          online_shop_url?: string | null
          updated_at?: string
        }
        Update: {
          captura_gallery_id?: number | null
          company_id?: string
          drive_folder_url?: string | null
          job_id?: string
          notion_page_url?: string | null
          online_shop_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_messages: {
        Row: {
          author_id: string | null
          author_kind: string
          body: string
          company_id: string
          created_at: string
          id: string
          internal: boolean
          job_id: string
        }
        Insert: {
          author_id?: string | null
          author_kind: string
          body: string
          company_id: string
          created_at?: string
          id?: string
          internal?: boolean
          job_id: string
        }
        Update: {
          author_id?: string | null
          author_kind?: string
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          internal?: boolean
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          company_id: string
          coupon: string | null
          created_at: string
          delivery_method: Database["public"]["Enums"]["delivery_method"] | null
          expected_subjects: number | null
          expected_teams: number | null
          id: string
          imported_planning_stage: string | null
          job_type: string
          lab: string | null
          name: string
          notes: string | null
          notion_page_id: string | null
          org_id: string | null
          production_stage:
            | Database["public"]["Enums"]["production_stage"]
            | null
          program: string
          promo: string | null
          sale_mode: string
          sponsors: boolean | null
          sports: string[]
          status: Database["public"]["Enums"]["job_status"]
          team_photo_type: string | null
          updated_at: string
          venue: string
        }
        Insert: {
          company_id: string
          coupon?: string | null
          created_at?: string
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          expected_subjects?: number | null
          expected_teams?: number | null
          id?: string
          imported_planning_stage?: string | null
          job_type?: string
          lab?: string | null
          name: string
          notes?: string | null
          notion_page_id?: string | null
          org_id?: string | null
          production_stage?:
            | Database["public"]["Enums"]["production_stage"]
            | null
          program?: string
          promo?: string | null
          sale_mode?: string
          sponsors?: boolean | null
          sports?: string[]
          status?: Database["public"]["Enums"]["job_status"]
          team_photo_type?: string | null
          updated_at?: string
          venue?: string
        }
        Update: {
          company_id?: string
          coupon?: string | null
          created_at?: string
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          expected_subjects?: number | null
          expected_teams?: number | null
          id?: string
          imported_planning_stage?: string | null
          job_type?: string
          lab?: string | null
          name?: string
          notes?: string | null
          notion_page_id?: string | null
          org_id?: string | null
          production_stage?:
            | Database["public"]["Enums"]["production_stage"]
            | null
          program?: string
          promo?: string | null
          sale_mode?: string
          sponsors?: boolean | null
          sports?: string[]
          status?: Database["public"]["Enums"]["job_status"]
          team_photo_type?: string | null
          updated_at?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          heard_from: string | null
          id: string
          notes: string | null
          org_id: string | null
          org_name: string
          participants: number | null
          preferred_dates: string | null
          source: string
          sports: string[]
          status: string
          teams: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          heard_from?: string | null
          id?: string
          notes?: string | null
          org_id?: string | null
          org_name: string
          participants?: number | null
          preferred_dates?: string | null
          source?: string
          sports?: string[]
          status?: string
          teams?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          heard_from?: string | null
          id?: string
          notes?: string | null
          org_id?: string | null
          org_name?: string
          participants?: number | null
          preferred_dates?: string | null
          source?: string
          sports?: string[]
          status?: string
          teams?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      league_notes: {
        Row: {
          author_id: string | null
          body: string
          company_id: string
          created_at: string
          id: string
          kind: string
          org_id: string
          source: string | null
        }
        Insert: {
          author_id?: string | null
          body: string
          company_id: string
          created_at?: string
          id?: string
          kind?: string
          org_id: string
          source?: string | null
        }
        Update: {
          author_id?: string | null
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_contacts: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          ended_on: string | null
          id: string
          is_primary: boolean
          org_id: string
          role: string | null
          started_on: string | null
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          ended_on?: string | null
          id?: string
          is_primary?: boolean
          org_id: string
          role?: string | null
          started_on?: string | null
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          ended_on?: string | null
          id?: string
          is_primary?: boolean
          org_id?: string
          role?: string | null
          started_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_terms: {
        Row: {
          company_id: string
          delivery_method: Database["public"]["Enums"]["delivery_method"] | null
          org_id: string
          other_terms: string | null
          parent_discount: string | null
          rebate: string | null
          services: string[]
          sponsorship: string | null
          team_photo_types: string[]
          terms_updated_by: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          org_id: string
          other_terms?: string | null
          parent_discount?: string | null
          rebate?: string | null
          services?: string[]
          sponsorship?: string | null
          team_photo_types?: string[]
          terms_updated_by?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          org_id?: string
          other_terms?: string | null
          parent_discount?: string | null
          rebate?: string | null
          services?: string[]
          sponsorship?: string | null
          team_photo_types?: string[]
          terms_updated_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_terms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_terms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_terms_terms_updated_by_fkey"
            columns: ["terms_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          email: string | null
          history: string | null
          id: string
          name: string
          notion_page_id: string | null
          org_type: Database["public"]["Enums"]["org_type"]
          phone: string | null
          relationship: string | null
          seasons: string[]
          short_name: string | null
          size_note: string | null
          sports: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          history?: string | null
          id?: string
          name: string
          notion_page_id?: string | null
          org_type?: Database["public"]["Enums"]["org_type"]
          phone?: string | null
          relationship?: string | null
          seasons?: string[]
          short_name?: string | null
          size_note?: string | null
          sports?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          history?: string | null
          id?: string
          name?: string
          notion_page_id?: string | null
          org_type?: Database["public"]["Enums"]["org_type"]
          phone?: string | null
          relationship?: string | null
          seasons?: string[]
          short_name?: string | null
          size_note?: string | null
          sports?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_days: {
        Row: {
          address: string | null
          alt_indoor_location: string | null
          city: string | null
          company_id: string
          created_at: string
          date: string
          end_time: string | null
          id: string
          indoor: boolean | null
          job_id: string
          label: string | null
          location_details: string | null
          location_name: string | null
          notes: string | null
          original_date: string | null
          start_time: string | null
          state: string | null
          stations: number
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          alt_indoor_location?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          indoor?: boolean | null
          job_id: string
          label?: string | null
          location_details?: string | null
          location_name?: string | null
          notes?: string | null
          original_date?: string | null
          start_time?: string | null
          state?: string | null
          stations?: number
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          alt_indoor_location?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          indoor?: boolean | null
          job_id?: string
          label?: string | null
          location_details?: string | null
          location_name?: string | null
          notes?: string | null
          original_date?: string | null
          start_time?: string | null
          state?: string | null
          stations?: number
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photo_days_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_days_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_days_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_forms: {
        Row: {
          answers: Json
          company_id: string
          job_id: string
          sent_at: string | null
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          company_id: string
          job_id: string
          sent_at?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          company_id?: string
          job_id?: string
          sent_at?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_forms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_forms_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_forms_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_forms_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_steps: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          description: string | null
          evidence_rule: Json | null
          id: string
          name: string
          notion_page_id: string | null
          offset_days: number | null
          offset_text: string | null
          owner_hint: string | null
          playbook_id: string
          position: number
          priority: string | null
          stage: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          description?: string | null
          evidence_rule?: Json | null
          id?: string
          name: string
          notion_page_id?: string | null
          offset_days?: number | null
          offset_text?: string | null
          owner_hint?: string | null
          playbook_id: string
          position: number
          priority?: string | null
          stage?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          evidence_rule?: Json | null
          id?: string
          name?: string
          notion_page_id?: string | null
          offset_days?: number | null
          offset_text?: string | null
          owner_hint?: string | null
          playbook_id?: string
          position?: number
          priority?: string | null
          stage?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbook_steps_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbook_steps_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      playbooks: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          key: string
          kind: string
          name: string
          notes: string | null
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          key: string
          kind: string
          name: string
          notes?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          key?: string
          kind?: string
          name?: string
          notes?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_links: {
        Row: {
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          job_id: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          job_id: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          job_id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_roles: {
        Row: {
          company_id: string
          granted_at: string
          granted_by: string | null
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          company_id: string
          granted_at?: string
          granted_by?: string | null
          profile_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          company_id?: string
          granted_at?: string
          granted_by?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profile_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          company_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_files: {
        Row: {
          company_id: string
          file_name: string
          id: string
          job_id: string
          mime_type: string
          size_bytes: number
          source: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          file_name: string
          id?: string
          job_id: string
          mime_type: string
          size_bytes: number
          source?: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          file_name?: string
          id?: string
          job_id?: string
          mime_type?: string
          size_bytes?: number
          source?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_files_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_files_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_versions: {
        Row: {
          captura_subject_count: number | null
          company_id: string
          created_at: string
          csv_path: string | null
          diff: Json | null
          error: string | null
          file_ids: string[]
          id: string
          job_id: string
          questions: Json | null
          status: string
          subject_count: number | null
          team_count: number | null
          updated_at: string
          uploaded_to_captura_at: string | null
          version: number
        }
        Insert: {
          captura_subject_count?: number | null
          company_id: string
          created_at?: string
          csv_path?: string | null
          diff?: Json | null
          error?: string | null
          file_ids?: string[]
          id?: string
          job_id: string
          questions?: Json | null
          status?: string
          subject_count?: number | null
          team_count?: number | null
          updated_at?: string
          uploaded_to_captura_at?: string | null
          version: number
        }
        Update: {
          captura_subject_count?: number | null
          company_id?: string
          created_at?: string
          csv_path?: string | null
          diff?: Json | null
          error?: string | null
          file_ids?: string[]
          id?: string
          job_id?: string
          questions?: Json | null
          status?: string
          subject_count?: number | null
          team_count?: number | null
          updated_at?: string
          uploaded_to_captura_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "roster_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_versions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_versions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slots: {
        Row: {
          company_id: string
          created_at: string
          id: string
          job_id: string
          kind: string
          label: string | null
          minutes: number
          schedule_id: string
          starts_at: string
          station: number
          team_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          job_id: string
          kind?: string
          label?: string | null
          minutes: number
          schedule_id: string
          starts_at: string
          station: number
          team_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          job_id?: string
          kind?: string
          label?: string | null
          minutes?: number
          schedule_id?: string
          starts_at?: string
          station?: number
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_slots_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          company_id: string
          default_block_minutes: number
          id: string
          job_id: string
          link_sent_at: string | null
          photo_day_id: string
          stations: number
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          default_block_minutes?: number
          id?: string
          job_id: string
          link_sent_at?: string | null
          photo_day_id: string
          stations?: number
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          default_block_minutes?: number
          id?: string
          job_id?: string
          link_sent_at?: string | null
          photo_day_id?: string
          stations?: number
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_photo_day_id_fkey"
            columns: ["photo_day_id"]
            isOneToOne: true
            referencedRelation: "photo_day_readiness"
            referencedColumns: ["photo_day_id"]
          },
          {
            foreignKeyName: "schedules_photo_day_id_fkey"
            columns: ["photo_day_id"]
            isOneToOne: true
            referencedRelation: "photo_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      season_offers: {
        Row: {
          company_id: string
          created_at: string
          declined_reason: string | null
          id: string
          last_job_id: string | null
          notes: string | null
          offered_at: string | null
          org_id: string
          priority_basis: Json | null
          priority_rank: number | null
          responded_at: string | null
          season: string
          stage: Database["public"]["Enums"]["offer_stage"]
          tier: string
          touches: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          declined_reason?: string | null
          id?: string
          last_job_id?: string | null
          notes?: string | null
          offered_at?: string | null
          org_id: string
          priority_basis?: Json | null
          priority_rank?: number | null
          responded_at?: string | null
          season: string
          stage?: Database["public"]["Enums"]["offer_stage"]
          tier?: string
          touches?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          declined_reason?: string | null
          id?: string
          last_job_id?: string | null
          notes?: string | null
          offered_at?: string | null
          org_id?: string
          priority_basis?: Json | null
          priority_rank?: number | null
          responded_at?: string | null
          season?: string
          stage?: Database["public"]["Enums"]["offer_stage"]
          tier?: string
          touches?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_offers_last_job_id_fkey"
            columns: ["last_job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_offers_last_job_id_fkey"
            columns: ["last_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_offers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          company_id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          company_id: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          company_id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          company_id: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          roles?: Database["public"]["Enums"]["app_role"][]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          company_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          due_on: string | null
          evidence: Json | null
          id: string
          job_id: string | null
          notes: string | null
          org_id: string | null
          playbook_step_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          evidence?: Json | null
          id?: string
          job_id?: string | null
          notes?: string | null
          org_id?: string | null
          playbook_step_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          due_on?: string | null
          evidence?: Json | null
          id?: string
          job_id?: string | null
          notes?: string | null
          org_id?: string | null
          playbook_step_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_playbook_step_id_fkey"
            columns: ["playbook_step_id"]
            isOneToOne: false
            referencedRelation: "playbook_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          coach_name: string | null
          company_id: string
          created_at: string
          division: string | null
          id: string
          job_id: string
          name: string
          player_count: number | null
          roster_group: string | null
          source: string
          sponsor: string | null
          sport: string | null
          tc_number: string | null
          updated_at: string
        }
        Insert: {
          coach_name?: string | null
          company_id: string
          created_at?: string
          division?: string | null
          id?: string
          job_id: string
          name: string
          player_count?: number | null
          roster_group?: string | null
          source?: string
          sponsor?: string | null
          sport?: string | null
          tc_number?: string | null
          updated_at?: string
        }
        Update: {
          coach_name?: string | null
          company_id?: string
          created_at?: string
          division?: string | null
          id?: string
          job_id?: string
          name?: string
          player_count?: number | null
          roster_group?: string | null
          source?: string
          sponsor?: string | null
          sport?: string | null
          tc_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      touchpoints: {
        Row: {
          actor_id: string | null
          actor_kind: string
          channel: string
          company_id: string
          contact_id: string | null
          created_at: string
          direction: string
          id: string
          job_id: string | null
          occurred_at: string
          offer_id: string | null
          org_id: string | null
          outcome: string | null
          source_ref: Json | null
          summary: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          channel: string
          company_id: string
          contact_id?: string | null
          created_at?: string
          direction: string
          id?: string
          job_id?: string | null
          occurred_at?: string
          offer_id?: string | null
          org_id?: string | null
          outcome?: string | null
          source_ref?: Json | null
          summary: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          channel?: string
          company_id?: string
          contact_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          job_id?: string | null
          occurred_at?: string
          offer_id?: string | null
          org_id?: string | null
          outcome?: string | null
          source_ref?: Json | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "touchpoints_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "touchpoints_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "touchpoints_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "touchpoints_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "touchpoints_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "touchpoints_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "season_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "touchpoints_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      date_capacity: {
        Row: {
          company_id: string | null
          date: string | null
          jobs: number | null
          stations_held: number | null
          stations_used: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photo_days_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_overview: {
        Row: {
          company_id: string | null
          delivery_method: Database["public"]["Enums"]["delivery_method"] | null
          expected_teams: number | null
          first_date: string | null
          id: string | null
          lab: string | null
          last_date: string | null
          name: string | null
          org_id: string | null
          org_name: string | null
          photo_day_count: number | null
          production_stage:
            | Database["public"]["Enums"]["production_stage"]
            | null
          season: string | null
          sports: string[] | null
          status: Database["public"]["Enums"]["job_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_day_readiness: {
        Row: {
          agreement_signed: boolean | null
          captura_gallery: boolean | null
          company_id: string | null
          date: string | null
          job_id: string | null
          job_status: Database["public"]["Enums"]["job_status"] | null
          photo_day_id: string | null
          planning_form: string | null
          roster: string | null
          schedule: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photo_days_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_days_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_days_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      agent_is_paused: {
        Args: { p_company: string; p_key: string }
        Returns: boolean
      }
      ask_snap_begin: { Args: { p_question: string }; Returns: Json }
      ask_snap_finish: {
        Args: {
          p_answer: string
          p_cost_usd: number
          p_error: string
          p_input_tokens: number
          p_model: string
          p_ok: boolean
          p_output_tokens: number
          p_run_id: string
          p_tool_calls: number
        }
        Returns: undefined
      }
      ask_snap_status: { Args: never; Returns: Json }
      build_season_board: { Args: { p_season: string }; Returns: number }
      clock_due: { Args: { p_company: string; p_today: string }; Returns: Json }
      decide_action: {
        Args: {
          p_action_id: string
          p_approve: boolean
          p_draft?: Json
          p_note?: string
        }
        Returns: Database["public"]["Enums"]["action_status"]
      }
      extend_hold: {
        Args: { p_days?: number; p_hold_id: string }
        Returns: string
      }
      hold_date: {
        Args: {
          p_date: string
          p_offer_id: string
          p_override?: boolean
          p_stations?: number
        }
        Returns: string
      }
      import_standard_roster: {
        Args: {
          p_csv_path: string
          p_job_id: string
          p_subject_count: number
          p_teams: Json
        }
        Returns: Json
      }
      integration_secret: {
        Args: { p_company: string; p_integration: string }
        Returns: string
      }
      open_schedule: { Args: { p_photo_day_id: string }; Returns: string }
      planning_due: {
        Args: { p_job_id: string }
        Returns: {
          deadline_days: number
          weeks_due: number
        }[]
      }
      portal_admit: {
        Args: { p_link_id: string; p_profile_id: string }
        Returns: string
      }
      portal_link_lookup: {
        Args: { p_token_hash: string }
        Returns: {
          company_id: string
          email: string
          full_name: string
          job_id: string
          link_id: string
          profile_id: string
        }[]
      }
      release_hold: {
        Args: {
          p_hold_id: string
          p_offer_stage?: Database["public"]["Enums"]["offer_stage"]
          p_reason?: string
        }
        Returns: undefined
      }
      save_planning_form: {
        Args: { p_answers: Json; p_job_id: string; p_submit: boolean }
        Returns: string
      }
      schedule_problems: {
        Args: { p_schedule_id: string }
        Returns: {
          detail: string
          problem: string
        }[]
      }
      season_label: { Args: { p_date: string }; Returns: string }
      set_schedule_status: {
        Args: { p_schedule_id: string; p_status: string }
        Returns: string
      }
      sign_agreement: {
        Args: {
          p_initials: Json
          p_ip?: unknown
          p_job_id: string
          p_signer_name: string
          p_user_agent?: string
          p_version_id: string
        }
        Returns: string
      }
      submit_schedule: { Args: { p_schedule_id: string }; Returns: string }
    }
    Enums: {
      action_kind: "read" | "draft" | "propose" | "never"
      action_status:
        | "proposed"
        | "approved"
        | "edited"
        | "sent"
        | "executed"
        | "rejected"
        | "failed"
        | "blocked"
        | "flagged"
      app_role:
        | "owner"
        | "admin"
        | "office"
        | "support"
        | "crew"
        | "coordinator"
      delivery_method: "league_delivery" | "mailer"
      job_status:
        | "held"
        | "planning"
        | "in_production"
        | "at_lab"
        | "delivered"
        | "complete"
        | "archived"
        | "cancelled"
        | "released"
      offer_stage:
        | "not_offered"
        | "offered"
        | "held"
        | "confirmed"
        | "declined"
        | "no_reply"
      org_type:
        | "league"
        | "club"
        | "swim_team"
        | "school"
        | "single_team"
        | "other"
      production_stage:
        | "import"
        | "editing"
        | "upload"
        | "composites"
        | "gallery_prep"
        | "qa_marketing"
        | "complete"
      task_status: "todo" | "in_progress" | "waiting" | "done" | "cancelled"
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
    Enums: {
      action_kind: ["read", "draft", "propose", "never"],
      action_status: [
        "proposed",
        "approved",
        "edited",
        "sent",
        "executed",
        "rejected",
        "failed",
        "blocked",
        "flagged",
      ],
      app_role: ["owner", "admin", "office", "support", "crew", "coordinator"],
      delivery_method: ["league_delivery", "mailer"],
      job_status: [
        "held",
        "planning",
        "in_production",
        "at_lab",
        "delivered",
        "complete",
        "archived",
        "cancelled",
        "released",
      ],
      offer_stage: [
        "not_offered",
        "offered",
        "held",
        "confirmed",
        "declined",
        "no_reply",
      ],
      org_type: [
        "league",
        "club",
        "swim_team",
        "school",
        "single_team",
        "other",
      ],
      production_stage: [
        "import",
        "editing",
        "upload",
        "composites",
        "gallery_prep",
        "qa_marketing",
        "complete",
      ],
      task_status: ["todo", "in_progress", "waiting", "done", "cancelled"],
    },
  },
} as const
