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
          promo: string | null
          sponsors: boolean | null
          sports: string[]
          status: Database["public"]["Enums"]["job_status"]
          team_photo_type: string | null
          updated_at: string
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
          promo?: string | null
          sponsors?: boolean | null
          sports?: string[]
          status?: Database["public"]["Enums"]["job_status"]
          team_photo_type?: string | null
          updated_at?: string
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
          promo?: string | null
          sponsors?: boolean | null
          sports?: string[]
          status?: Database["public"]["Enums"]["job_status"]
          team_photo_type?: string | null
          updated_at?: string
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
          services: string[]
          team_photo_types: string[]
          updated_at: string
        }
        Insert: {
          company_id: string
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          org_id: string
          services?: string[]
          team_photo_types?: string[]
          updated_at?: string
        }
        Update: {
          company_id?: string
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          org_id?: string
          services?: string[]
          team_photo_types?: string[]
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
    }
    Views: {
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
    }
    Functions: {
      agent_is_paused: {
        Args: { p_company: string; p_key: string }
        Returns: boolean
      }
      integration_secret: {
        Args: { p_company: string; p_integration: string }
        Returns: string
      }
      season_label: { Args: { p_date: string }; Returns: string }
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
        | "planning"
        | "in_production"
        | "at_lab"
        | "delivered"
        | "complete"
        | "archived"
        | "cancelled"
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
        "planning",
        "in_production",
        "at_lab",
        "delivered",
        "complete",
        "archived",
        "cancelled",
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
