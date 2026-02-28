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
    PostgrestVersion: "14.1"
  }
  cortex: {
    Tables: {
      memory: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          entity_id: string | null
          fts_vector: unknown
          id: string
          metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          entity_id?: string | null
          fts_vector?: unknown
          id?: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          entity_id?: string | null
          fts_vector?: unknown
          id?: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      relationships: {
        Row: {
          connection_strength: number | null
          context_data: Json | null
          created_at: string | null
          id: string
          relationship_type: string
          source_entity_id: string
          target_entity_id: string
        }
        Insert: {
          connection_strength?: number | null
          context_data?: Json | null
          created_at?: string | null
          id?: string
          relationship_type: string
          source_entity_id: string
          target_entity_id: string
        }
        Update: {
          connection_strength?: number | null
          context_data?: Json | null
          created_at?: string | null
          id?: string
          relationship_type?: string
          source_entity_id?: string
          target_entity_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hybrid_search: {
        Args: {
          full_text_weight?: number
          match_count?: number
          query_embedding: string
          query_text: string
          rrf_k?: number
          semantic_weight?: number
        }
        Returns: {
          content: string
          entity_id: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  directory: {
    Tables: {
      entities: {
        Row: {
          attributes: Json | null
          avatar_url: string | null
          claimed_by_user_id: string | null
          created_at: string | null
          display_name: string
          embedding: string | null
          handle: string | null
          id: string
          owner_workspace_id: string | null
          search_vector: unknown
          type: string
          updated_at: string | null
        }
        Insert: {
          attributes?: Json | null
          avatar_url?: string | null
          claimed_by_user_id?: string | null
          created_at?: string | null
          display_name: string
          embedding?: string | null
          handle?: string | null
          id?: string
          owner_workspace_id?: string | null
          search_vector?: unknown
          type: string
          updated_at?: string | null
        }
        Update: {
          attributes?: Json | null
          avatar_url?: string | null
          claimed_by_user_id?: string | null
          created_at?: string | null
          display_name?: string
          embedding?: string | null
          handle?: string | null
          id?: string
          owner_workspace_id?: string | null
          search_vector?: unknown
          type?: string
          updated_at?: string | null
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
  finance: {
    Tables: {
      invoices: {
        Row: {
          bill_to_entity_id: string
          created_at: string | null
          due_date: string | null
          id: string
          invoice_number: string
          project_id: string | null
          status: string | null
          total_amount: number
          workspace_id: string
        }
        Insert: {
          bill_to_entity_id: string
          created_at?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          project_id?: string | null
          status?: string | null
          total_amount: number
          workspace_id: string
        }
        Update: {
          bill_to_entity_id?: string
          created_at?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          project_id?: string | null
          status?: string | null
          total_amount?: number
          workspace_id?: string
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
  ops: {
    Tables: {
      assignments: {
        Row: {
          agreed_rate: number | null
          entity_id: string
          event_id: string | null
          id: string
          rate_type: string | null
          role: string
          status: string | null
        }
        Insert: {
          agreed_rate?: number | null
          entity_id: string
          event_id?: string | null
          id?: string
          rate_type?: string | null
          role: string
          status?: string | null
        }
        Update: {
          agreed_rate?: number | null
          entity_id?: string
          event_id?: string | null
          id?: string
          rate_type?: string | null
          role?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actor: string | null
          client_id: string | null
          compliance_docs: Json | null
          confidentiality_level: string | null
          created_at: string | null
          crm_estimated_value: number | null
          crm_probability: number | null
          dates_load_in: string | null
          dates_load_out: string | null
          ends_at: string
          guest_count_actual: number | null
          guest_count_expected: number | null
          id: string
          internal_code: string | null
          lead_source: string | null
          lifecycle_status: string | null
          location_address: string | null
          location_name: string | null
          logistics_dock_info: string | null
          logistics_power_info: string | null
          notes: string | null
          pm_id: string | null
          producer_id: string | null
          project_id: string | null
          run_of_show_data: Json | null
          slug: string | null
          starts_at: string
          status: string
          tech_requirements: Json | null
          title: string
          updated_at: string | null
          venue_address: string | null
          venue_entity_id: string | null
          venue_google_maps_id: string | null
          venue_name: string | null
          workspace_id: string | null
        }
        Insert: {
          actor?: string | null
          client_id?: string | null
          compliance_docs?: Json | null
          confidentiality_level?: string | null
          created_at?: string | null
          crm_estimated_value?: number | null
          crm_probability?: number | null
          dates_load_in?: string | null
          dates_load_out?: string | null
          ends_at: string
          guest_count_actual?: number | null
          guest_count_expected?: number | null
          id?: string
          internal_code?: string | null
          lead_source?: string | null
          lifecycle_status?: string | null
          location_address?: string | null
          location_name?: string | null
          logistics_dock_info?: string | null
          logistics_power_info?: string | null
          notes?: string | null
          pm_id?: string | null
          producer_id?: string | null
          project_id?: string | null
          run_of_show_data?: Json | null
          slug?: string | null
          starts_at: string
          status?: string
          tech_requirements?: Json | null
          title: string
          updated_at?: string | null
          venue_address?: string | null
          venue_entity_id?: string | null
          venue_google_maps_id?: string | null
          venue_name?: string | null
          workspace_id?: string | null
        }
        Update: {
          actor?: string | null
          client_id?: string | null
          compliance_docs?: Json | null
          confidentiality_level?: string | null
          created_at?: string | null
          crm_estimated_value?: number | null
          crm_probability?: number | null
          dates_load_in?: string | null
          dates_load_out?: string | null
          ends_at?: string
          guest_count_actual?: number | null
          guest_count_expected?: number | null
          id?: string
          internal_code?: string | null
          lead_source?: string | null
          lifecycle_status?: string | null
          location_address?: string | null
          location_name?: string | null
          logistics_dock_info?: string | null
          logistics_power_info?: string | null
          notes?: string | null
          pm_id?: string | null
          producer_id?: string | null
          project_id?: string | null
          run_of_show_data?: Json | null
          slug?: string | null
          starts_at?: string
          status?: string
          tech_requirements?: Json | null
          title?: string
          updated_at?: string | null
          venue_address?: string | null
          venue_entity_id?: string | null
          venue_google_maps_id?: string | null
          venue_name?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_entity_id: string | null
          created_at: string | null
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string | null
          workspace_id: string
        }
        Insert: {
          client_entity_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string | null
          workspace_id: string
        }
        Update: {
          client_entity_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_permissions: {
        Row: {
          id: string
          key: string
        }
        Insert: {
          id?: string
          key: string
        }
        Update: {
          id?: string
          key?: string
        }
        Relationships: []
      }
      workspace_role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "workspace_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "workspace_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_roles: {
        Row: {
          created_at: string
          id: string
          is_system: boolean
          name: string
          slug: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          slug: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          updated_at?: string
          workspace_id?: string | null
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
  public: {
    Tables: {
      affiliations: {
        Row: {
          access_level: Database["public"]["Enums"]["affiliation_access_level"]
          created_at: string
          entity_id: string
          organization_id: string
          role_label: string | null
          status: string
          updated_at: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["affiliation_access_level"]
          created_at?: string
          entity_id: string
          organization_id: string
          role_label?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["affiliation_access_level"]
          created_at?: string
          entity_id?: string
          organization_id?: string
          role_label?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_configs: {
        Row: {
          agent_mode: string | null
          created_at: string | null
          id: string
          modules_enabled: string[] | null
          organization_id: string | null
          persona: Database["public"]["Enums"]["user_persona"]
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string | null
          workspace_id: string
          xai_reasoning_enabled: boolean | null
        }
        Insert: {
          agent_mode?: string | null
          created_at?: string | null
          id?: string
          modules_enabled?: string[] | null
          organization_id?: string | null
          persona: Database["public"]["Enums"]["user_persona"]
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string | null
          workspace_id: string
          xai_reasoning_enabled?: boolean | null
        }
        Update: {
          agent_mode?: string | null
          created_at?: string | null
          id?: string
          modules_enabled?: string[] | null
          organization_id?: string | null
          persona?: Database["public"]["Enums"]["user_persona"]
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string | null
          workspace_id?: string
          xai_reasoning_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "commercial_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomous_resolutions: {
        Row: {
          agent_name: string
          cost_cents: number | null
          id: string
          reasoning_chain: Json | null
          resolved_at: string | null
          task_type: string
          workspace_id: string
        }
        Insert: {
          agent_name: string
          cost_cents?: number | null
          id?: string
          reasoning_chain?: Json | null
          resolved_at?: string | null
          task_type: string
          workspace_id: string
        }
        Update: {
          agent_name?: string
          cost_cents?: number | null
          id?: string
          reasoning_chain?: Json | null
          resolved_at?: string | null
          task_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomous_resolutions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_embeddings: {
        Row: {
          content_text: string
          embedding: string
          id: string
          package_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_text: string
          embedding: string
          id?: string
          package_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_text?: string
          embedding?: string
          id?: string
          package_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_embeddings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_embeddings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          pms_integration_enabled: boolean | null
          signalpay_enabled: boolean | null
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          pms_integration_enabled?: boolean | null
          signalpay_enabled?: boolean | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          pms_integration_enabled?: boolean | null
          signalpay_enabled?: boolean | null
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_organizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stakeholders: {
        Row: {
          created_at: string
          deal_id: string
          entity_id: string | null
          id: string
          is_primary: boolean
          organization_id: string | null
          role: Database["public"]["Enums"]["deal_stakeholder_role"]
        }
        Insert: {
          created_at?: string
          deal_id: string
          entity_id?: string | null
          id?: string
          is_primary?: boolean
          organization_id?: string | null
          role?: Database["public"]["Enums"]["deal_stakeholder_role"]
        }
        Update: {
          created_at?: string
          deal_id?: string
          entity_id?: string | null
          id?: string
          is_primary?: boolean
          organization_id?: string | null
          role?: Database["public"]["Enums"]["deal_stakeholder_role"]
        }
        Relationships: [
          {
            foreignKeyName: "deal_stakeholders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stakeholders_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stakeholders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          budget_estimated: number | null
          created_at: string
          event_archetype: string | null
          event_id: string | null
          id: string
          main_contact_id: string | null
          notes: string | null
          organization_id: string | null
          proposed_date: string
          status: string
          title: string | null
          updated_at: string
          venue_id: string | null
          workspace_id: string
        }
        Insert: {
          budget_estimated?: number | null
          created_at?: string
          event_archetype?: string | null
          event_id?: string | null
          id?: string
          main_contact_id?: string | null
          notes?: string | null
          organization_id?: string | null
          proposed_date: string
          status?: string
          title?: string | null
          updated_at?: string
          venue_id?: string | null
          workspace_id: string
        }
        Update: {
          budget_estimated?: number | null
          created_at?: string
          event_archetype?: string | null
          event_id?: string | null
          id?: string
          main_contact_id?: string | null
          notes?: string | null
          organization_id?: string | null
          proposed_date?: string
          status?: string
          title?: string | null
          updated_at?: string
          venue_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          auth_id: string | null
          created_at: string
          email: string
          id: string
          is_ghost: boolean
          updated_at: string
        }
        Insert: {
          auth_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_ghost?: boolean
          updated_at?: string
        }
        Update: {
          auth_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_ghost?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      guardians: {
        Row: {
          created_at: string | null
          guardian_email: string
          id: string
          owner_id: string
          status: Database["public"]["Enums"]["guardian_status"] | null
        }
        Insert: {
          created_at?: string | null
          guardian_email: string
          id?: string
          owner_id: string
          status?: Database["public"]["Enums"]["guardian_status"] | null
        }
        Update: {
          created_at?: string | null
          guardian_email?: string
          id?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["guardian_status"] | null
        }
        Relationships: []
      }
      org_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_hourly_rate: number
          employment_status: Database["public"]["Enums"]["employment_status"]
          entity_id: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          org_id: string
          phone: string | null
          profile_id: string | null
          role: Database["public"]["Enums"]["org_member_role"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_hourly_rate?: number
          employment_status?: Database["public"]["Enums"]["employment_status"]
          entity_id?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          org_id: string
          phone?: string | null
          profile_id?: string | null
          role?: Database["public"]["Enums"]["org_member_role"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_hourly_rate?: number
          employment_status?: Database["public"]["Enums"]["employment_status"]
          entity_id?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          org_id?: string
          phone?: string | null
          profile_id?: string | null
          role?: Database["public"]["Enums"]["org_member_role"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      org_relationships: {
        Row: {
          blacklist_reason: string | null
          created_at: string
          deleted_at: string | null
          id: string
          lifecycle_status: string | null
          notes: string | null
          source_org_id: string
          tags: string[] | null
          target_org_id: string
          tier: Database["public"]["Enums"]["org_relationship_tier"]
          type: Database["public"]["Enums"]["relationship_type"]
          workspace_id: string
        }
        Insert: {
          blacklist_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          lifecycle_status?: string | null
          notes?: string | null
          source_org_id: string
          tags?: string[] | null
          target_org_id: string
          tier?: Database["public"]["Enums"]["org_relationship_tier"]
          type?: Database["public"]["Enums"]["relationship_type"]
          workspace_id: string
        }
        Update: {
          blacklist_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          lifecycle_status?: string | null
          notes?: string | null
          source_org_id?: string
          tags?: string[] | null
          target_org_id?: string
          tier?: Database["public"]["Enums"]["org_relationship_tier"]
          type?: Database["public"]["Enums"]["relationship_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_relationships_source_org_id_fkey"
            columns: ["source_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_relationships_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_relationships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "commercial_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: Json | null
          brand_color: string | null
          category: Database["public"]["Enums"]["org_category"] | null
          claimed_at: string | null
          created_at: string | null
          created_by_org_id: string | null
          default_currency: string | null
          default_venue_id: string | null
          description: string | null
          id: string
          is_claimed: boolean
          is_ghost: boolean | null
          logo_url: string | null
          name: string
          operational_settings: Json | null
          owner_id: string | null
          parent_org_id: string | null
          slug: string | null
          social_links: Json | null
          support_email: string | null
          tier: string | null
          updated_at: string | null
          website: string | null
          workspace_id: string
        }
        Insert: {
          address?: Json | null
          brand_color?: string | null
          category?: Database["public"]["Enums"]["org_category"] | null
          claimed_at?: string | null
          created_at?: string | null
          created_by_org_id?: string | null
          default_currency?: string | null
          default_venue_id?: string | null
          description?: string | null
          id?: string
          is_claimed?: boolean
          is_ghost?: boolean | null
          logo_url?: string | null
          name: string
          operational_settings?: Json | null
          owner_id?: string | null
          parent_org_id?: string | null
          slug?: string | null
          social_links?: Json | null
          support_email?: string | null
          tier?: string | null
          updated_at?: string | null
          website?: string | null
          workspace_id: string
        }
        Update: {
          address?: Json | null
          brand_color?: string | null
          category?: Database["public"]["Enums"]["org_category"] | null
          claimed_at?: string | null
          created_at?: string | null
          created_by_org_id?: string | null
          default_currency?: string | null
          default_venue_id?: string | null
          description?: string | null
          id?: string
          is_claimed?: boolean
          is_ghost?: boolean | null
          logo_url?: string | null
          name?: string
          operational_settings?: Json | null
          owner_id?: string | null
          parent_org_id?: string | null
          slug?: string | null
          social_links?: Json | null
          support_email?: string | null
          tier?: string | null
          updated_at?: string | null
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_org_id_fkey"
            columns: ["created_by_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      package_tags: {
        Row: {
          package_id: string
          tag_id: string
        }
        Insert: {
          package_id: string
          tag_id: string
        }
        Update: {
          package_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_tags_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "workspace_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          buffer_days: number
          category: Database["public"]["Enums"]["package_category"]
          created_at: string
          definition: Json | null
          description: string | null
          floor_price: number | null
          id: string
          image_url: string | null
          is_active: boolean
          is_sub_rental: boolean
          name: string
          price: number
          replacement_cost: number | null
          stock_quantity: number
          target_cost: number | null
          unit_multiplier: number
          unit_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          buffer_days?: number
          category?: Database["public"]["Enums"]["package_category"]
          created_at?: string
          definition?: Json | null
          description?: string | null
          floor_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_sub_rental?: boolean
          name: string
          price?: number
          replacement_cost?: number | null
          stock_quantity?: number
          target_cost?: number | null
          unit_multiplier?: number
          unit_type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          buffer_days?: number
          category?: Database["public"]["Enums"]["package_category"]
          created_at?: string
          definition?: Json | null
          description?: string | null
          floor_price?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_sub_rental?: boolean
          name?: string
          price?: number
          replacement_cost?: number | null
          stock_quantity?: number
          target_cost?: number | null
          unit_multiplier?: number
          unit_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      passkeys: {
        Row: {
          counter: number | null
          created_at: string | null
          credential_id: string
          id: string
          public_key: string
          transports: string[] | null
          user_id: string
        }
        Insert: {
          counter?: number | null
          created_at?: string | null
          credential_id: string
          id?: string
          public_key: string
          transports?: string[] | null
          user_id: string
        }
        Update: {
          counter?: number | null
          created_at?: string | null
          credential_id?: string
          id?: string
          public_key?: string
          transports?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          email: string | null
          full_name: string | null
          has_recovery_kit: boolean | null
          id: string
          onboarding_completed: boolean | null
          onboarding_summary: string | null
          recovery_setup_at: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          has_recovery_kit?: boolean | null
          id: string
          onboarding_completed?: boolean | null
          onboarding_summary?: string | null
          recovery_setup_at?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          has_recovery_kit?: boolean | null
          id?: string
          onboarding_completed?: boolean | null
          onboarding_summary?: string | null
          recovery_setup_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      proposal_items: {
        Row: {
          actual_cost: number | null
          created_at: string
          definition_snapshot: Json | null
          description: string | null
          display_group_name: string | null
          id: string
          is_client_visible: boolean
          is_package_header: boolean
          name: string
          origin_package_id: string | null
          original_base_price: number | null
          override_price: number | null
          package_id: string | null
          package_instance_id: string | null
          proposal_id: string
          quantity: number
          sort_order: number
          unit_multiplier: number
          unit_price: number
          unit_type: string
        }
        Insert: {
          actual_cost?: number | null
          created_at?: string
          definition_snapshot?: Json | null
          description?: string | null
          display_group_name?: string | null
          id?: string
          is_client_visible?: boolean
          is_package_header?: boolean
          name: string
          origin_package_id?: string | null
          original_base_price?: number | null
          override_price?: number | null
          package_id?: string | null
          package_instance_id?: string | null
          proposal_id: string
          quantity?: number
          sort_order?: number
          unit_multiplier?: number
          unit_price: number
          unit_type?: string
        }
        Update: {
          actual_cost?: number | null
          created_at?: string
          definition_snapshot?: Json | null
          description?: string | null
          display_group_name?: string | null
          id?: string
          is_client_visible?: boolean
          is_package_header?: boolean
          name?: string
          origin_package_id?: string | null
          original_base_price?: number | null
          override_price?: number | null
          package_id?: string | null
          package_instance_id?: string | null
          proposal_id?: string
          quantity?: number
          sort_order?: number
          unit_multiplier?: number
          unit_price?: number
          unit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accepted_at: string | null
          created_at: string
          deal_id: string
          id: string
          public_token: string
          status: Database["public"]["Enums"]["proposal_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          deal_id: string
          id?: string
          public_token?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          public_token?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_requests: {
        Row: {
          cancel_token_hash: string | null
          created_at: string | null
          id: string
          owner_id: string
          requested_at: string
          status: string
          timelock_until: string
        }
        Insert: {
          cancel_token_hash?: string | null
          created_at?: string | null
          id?: string
          owner_id: string
          requested_at?: string
          status?: string
          timelock_until: string
        }
        Update: {
          cancel_token_hash?: string | null
          created_at?: string | null
          id?: string
          owner_id?: string
          requested_at?: string
          status?: string
          timelock_until?: string
        }
        Relationships: []
      }
      recovery_shards: {
        Row: {
          created_at: string | null
          encrypted_shard: string
          guardian_id: string
          id: string
          owner_id: string
        }
        Insert: {
          created_at?: string | null
          encrypted_shard: string
          guardian_id: string
          id?: string
          owner_id: string
        }
        Update: {
          created_at?: string | null
          encrypted_shard?: string
          guardian_id?: string
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_shards_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          role: string | null
          role_id: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          role?: string | null
          role_id?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          role?: string | null
          role_id?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_tags: {
        Row: {
          color: string
          id: string
          label: string
          workspace_id: string
        }
        Insert: {
          color?: string
          id?: string
          label: string
          workspace_id: string
        }
        Update: {
          color?: string
          id?: string
          label?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          autonomous_resolution_count: number | null
          created_at: string | null
          id: string
          name: string
          signalpay_enabled: boolean | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_tier:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
        }
        Insert: {
          autonomous_resolution_count?: number | null
          created_at?: string | null
          id?: string
          name: string
          signalpay_enabled?: boolean | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_tier?:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
        }
        Update: {
          autonomous_resolution_count?: number | null
          created_at?: string | null
          id?: string
          name?: string
          signalpay_enabled?: boolean | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_tier?:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_contact_to_ghost_org:
        | {
            Args: {
              p_creator_org_id: string
              p_email?: string
              p_first_name: string
              p_ghost_org_id: string
              p_last_name: string
              p_workspace_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_creator_org_id: string
              p_email?: string
              p_first_name: string
              p_ghost_org_id: string
              p_job_title?: string
              p_last_name: string
              p_role?: string
              p_workspace_id: string
            }
            Returns: Json
          }
      add_ghost_member: {
        Args: {
          p_email: string
          p_first_name: string
          p_job_title?: string
          p_last_name: string
          p_org_id: string
          p_role: string
          p_workspace_id: string
        }
        Returns: Json
      }
      cleanup_webauthn_challenges: { Args: never; Returns: number }
      complete_onboarding: { Args: never; Returns: boolean }
      create_default_location: {
        Args: { p_location_name?: string; p_workspace_id: string }
        Returns: string
      }
      create_draft_invoice_from_proposal: {
        Args: { p_proposal_id: string }
        Returns: string
      }
      current_entity_id: { Args: never; Returns: string }
      get_active_workspace_id: { Args: never; Returns: string }
      get_current_org_id: { Args: never; Returns: string }
      get_ghost_entity_by_email: { Args: { p_email: string }; Returns: string }
      get_member_permissions: {
        Args: { p_user_id?: string; p_workspace_id: string }
        Returns: Json
      }
      get_my_entity_id: { Args: never; Returns: string }
      get_my_organization_ids: { Args: never; Returns: string[] }
      get_my_workspace_ids: { Args: never; Returns: string[] }
      get_user_id_by_email: { Args: { user_email: string }; Returns: string }
      get_user_workspace_ids: { Args: never; Returns: string[] }
      insert_ghost_entity: { Args: { p_email: string }; Returns: string }
      is_member_of: { Args: { _workspace_id: string }; Returns: boolean }
      is_workspace_member: { Args: { w_id: string }; Returns: boolean }
      is_workspace_owner: { Args: { w_id: string }; Returns: boolean }
      match_catalog: {
        Args: {
          filter_workspace_id: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content_text: string
          package_id: string
          similarity: number
        }[]
      }
      match_documents: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
          query_text?: string
        }
        Returns: {
          body: string
          id: string
          similarity: number
          summary: string
        }[]
      }
      member_has_capability: {
        Args: { p_permission_key: string; p_workspace_id: string }
        Returns: boolean
      }
      member_has_permission: {
        Args: { p_permission_key: string; p_workspace_id: string }
        Returns: boolean
      }
      my_org_ids_admin_member: { Args: never; Returns: string[] }
      regenerate_invite_code: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      search_spine: {
        Args: {
          filter_workspace_id: string
          match_count: number
          match_threshold: number
          query_embedding: string
          query_text?: string
        }
        Returns: {
          affective_context: Json
          body: string
          id: string
          similarity: number
          title: string
        }[]
      }
      signal_current_entity_email: { Args: never; Returns: string }
      signal_current_entity_id: { Args: never; Returns: string }
      signal_org_ids_can_affiliate: { Args: never; Returns: string[] }
      signal_org_ids_for_entity: { Args: never; Returns: string[] }
      signal_org_ids_where_admin: { Args: never; Returns: string[] }
      update_ghost_member: {
        Args: {
          p_avatar_url?: string
          p_creator_org_id: string
          p_job_title?: string
          p_member_id: string
          p_phone?: string
          p_role?: string
        }
        Returns: Json
      }
      user_has_workspace_role: {
        Args: { p_roles: string[]; p_workspace_id: string }
        Returns: boolean
      }
      workspace_created_by_me: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      workspace_joinable_by_invite: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      affiliation_access_level: "admin" | "member" | "read_only"
      area_status: "active" | "archived"
      confidentiality_level: "public" | "private" | "secret"
      contract_status: "draft" | "sent" | "signed"
      cue_type: "stage" | "audio" | "lighting" | "video" | "logistics"
      deal_stakeholder_role: "bill_to" | "planner" | "venue_contact" | "vendor"
      employment_status: "internal_employee" | "external_contractor"
      event_lifecycle_status:
        | "lead"
        | "tentative"
        | "confirmed"
        | "production"
        | "live"
        | "post"
        | "archived"
        | "cancelled"
      event_status:
        | "planned"
        | "confirmed"
        | "completed"
        | "canceled"
        | "booked"
        | "hold"
        | "cancelled"
      guardian_status: "pending" | "active"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      org_category: "vendor" | "venue" | "coordinator" | "client"
      org_member_role: "owner" | "admin" | "member" | "restricted"
      org_relationship_tier: "standard" | "preferred" | "strategic"
      org_relationship_type: "vendor" | "venue" | "client" | "partner"
      organization_type: "solo" | "agency" | "venue"
      package_category:
        | "service"
        | "rental"
        | "talent"
        | "package"
        | "retail_sale"
        | "fee"
      payment_method: "credit_card" | "wire" | "check" | "cash" | "stripe"
      payment_status: "succeeded" | "pending" | "failed"
      person_relationship:
        | "family"
        | "friend"
        | "client"
        | "vendor"
        | "partner"
        | "lead"
        | "team"
        | "other"
      priority_level: "p0" | "p1" | "p2" | "p3"
      project_status: "active" | "paused" | "completed" | "archived"
      proposal_status: "draft" | "sent" | "viewed" | "accepted" | "rejected"
      qbo_sync_status: "pending" | "processing" | "completed" | "failed"
      relationship_type: "vendor" | "venue" | "client_company" | "partner"
      skill_level: "junior" | "mid" | "senior" | "lead"
      source_type:
        | "manual"
        | "ios_shortcut"
        | "email"
        | "sms"
        | "web"
        | "calendar"
        | "n8n"
        | "notion"
        | "import"
        | "agent"
      spine_item_status:
        | "inbox"
        | "active"
        | "waiting"
        | "scheduled"
        | "someday"
        | "reference"
        | "archived"
        | "deleted"
      spine_item_type:
        | "note"
        | "task"
        | "event"
        | "person"
        | "project"
        | "area"
        | "decision"
        | "idea"
        | "file"
        | "link"
        | "message"
        | "journal"
        | "finance_data"
      subscription_tier: "foundation" | "growth" | "venue_os" | "autonomous"
      task_status: "inbox" | "next" | "doing" | "waiting" | "done" | "dropped"
      user_persona: "solo_professional" | "agency_team" | "venue_brand"
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
  cortex: {
    Enums: {},
  },
  directory: {
    Enums: {},
  },
  finance: {
    Enums: {},
  },
  ops: {
    Enums: {},
  },
  public: {
    Enums: {
      affiliation_access_level: ["admin", "member", "read_only"],
      area_status: ["active", "archived"],
      confidentiality_level: ["public", "private", "secret"],
      contract_status: ["draft", "sent", "signed"],
      cue_type: ["stage", "audio", "lighting", "video", "logistics"],
      deal_stakeholder_role: ["bill_to", "planner", "venue_contact", "vendor"],
      employment_status: ["internal_employee", "external_contractor"],
      event_lifecycle_status: [
        "lead",
        "tentative",
        "confirmed",
        "production",
        "live",
        "post",
        "archived",
        "cancelled",
      ],
      event_status: [
        "planned",
        "confirmed",
        "completed",
        "canceled",
        "booked",
        "hold",
        "cancelled",
      ],
      guardian_status: ["pending", "active"],
      invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      org_category: ["vendor", "venue", "coordinator", "client"],
      org_member_role: ["owner", "admin", "member", "restricted"],
      org_relationship_tier: ["standard", "preferred", "strategic"],
      org_relationship_type: ["vendor", "venue", "client", "partner"],
      organization_type: ["solo", "agency", "venue"],
      package_category: [
        "service",
        "rental",
        "talent",
        "package",
        "retail_sale",
        "fee",
      ],
      payment_method: ["credit_card", "wire", "check", "cash", "stripe"],
      payment_status: ["succeeded", "pending", "failed"],
      person_relationship: [
        "family",
        "friend",
        "client",
        "vendor",
        "partner",
        "lead",
        "team",
        "other",
      ],
      priority_level: ["p0", "p1", "p2", "p3"],
      project_status: ["active", "paused", "completed", "archived"],
      proposal_status: ["draft", "sent", "viewed", "accepted", "rejected"],
      qbo_sync_status: ["pending", "processing", "completed", "failed"],
      relationship_type: ["vendor", "venue", "client_company", "partner"],
      skill_level: ["junior", "mid", "senior", "lead"],
      source_type: [
        "manual",
        "ios_shortcut",
        "email",
        "sms",
        "web",
        "calendar",
        "n8n",
        "notion",
        "import",
        "agent",
      ],
      spine_item_status: [
        "inbox",
        "active",
        "waiting",
        "scheduled",
        "someday",
        "reference",
        "archived",
        "deleted",
      ],
      spine_item_type: [
        "note",
        "task",
        "event",
        "person",
        "project",
        "area",
        "decision",
        "idea",
        "file",
        "link",
        "message",
        "journal",
        "finance_data",
      ],
      subscription_tier: ["foundation", "growth", "venue_os", "autonomous"],
      task_status: ["inbox", "next", "doing", "waiting", "done", "dropped"],
      user_persona: ["solo_professional", "agency_team", "venue_brand"],
    },
  },
} as const
