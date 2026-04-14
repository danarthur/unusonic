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
      aion_insights: {
        Row: {
          context: Json | null
          created_at: string
          dismissed_at: string | null
          entity_id: string
          entity_type: string
          expires_at: string | null
          id: string
          priority: number | null
          resolved_at: string | null
          status: string
          surfaced_at: string | null
          title: string
          trigger_type: string
          workspace_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          dismissed_at?: string | null
          entity_id: string
          entity_type: string
          expires_at?: string | null
          id?: string
          priority?: number | null
          resolved_at?: string | null
          status?: string
          surfaced_at?: string | null
          title: string
          trigger_type: string
          workspace_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          dismissed_at?: string | null
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          id?: string
          priority?: number | null
          resolved_at?: string | null
          status?: string
          surfaced_at?: string | null
          title?: string
          trigger_type?: string
          workspace_id?: string
        }
        Relationships: []
      }
      aion_memory: {
        Row: {
          confidence: number | null
          created_at: string
          entity_id: string | null
          expires_at: string | null
          fact: string
          id: string
          scope: string
          source: string | null
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          expires_at?: string | null
          fact: string
          id?: string
          scope: string
          source?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          entity_id?: string | null
          expires_at?: string | null
          fact?: string
          id?: string
          scope?: string
          source?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      aion_messages: {
        Row: {
          content: string
          created_at: string
          expires_at: string | null
          id: string
          role: string
          session_id: string
          structured_content: Json | null
        }
        Insert: {
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          role: string
          session_id: string
          structured_content?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          role?: string
          session_id?: string
          structured_content?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "aion_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "aion_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      aion_sessions: {
        Row: {
          conversation_summary: string | null
          created_at: string
          feedback: Json | null
          id: string
          preview: string | null
          summarized_up_to: string | null
          title: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          conversation_summary?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          preview?: string | null
          summarized_up_to?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          conversation_summary?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          preview?: string | null
          summarized_up_to?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      memory: {
        Row: {
          content_header: string | null
          content_text: string
          created_at: string
          embedding: string
          entity_ids: string[] | null
          id: string
          metadata: Json | null
          source_id: string
          source_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_header?: string | null
          content_text: string
          created_at?: string
          embedding: string
          entity_ids?: string[] | null
          id?: string
          metadata?: Json | null
          source_id: string
          source_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_header?: string | null
          content_text?: string
          created_at?: string
          embedding?: string
          entity_ids?: string[] | null
          id?: string
          metadata?: Json | null
          source_id?: string
          source_type?: string
          updated_at?: string
          workspace_id?: string
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
      create_aion_session: {
        Args: {
          p_id?: string
          p_preview?: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      delete_aion_session: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: boolean
      }
      delete_memory_embedding: {
        Args: { p_source_id: string; p_source_type: string }
        Returns: boolean
      }
      dismiss_aion_insight: { Args: { p_insight_id: string }; Returns: boolean }
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
      match_memory: {
        Args: {
          p_entity_ids?: string[]
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
          p_source_types?: string[]
          p_workspace_id: string
        }
        Returns: {
          content_header: string
          content_text: string
          id: string
          metadata: Json
          similarity: number
          source_id: string
          source_type: string
        }[]
      }
      resolve_aion_insight: {
        Args: { p_entity_id: string; p_trigger_type: string }
        Returns: boolean
      }
      save_aion_memory: {
        Args: {
          p_fact: string
          p_scope: string
          p_source?: string
          p_user_id?: string
          p_workspace_id: string
        }
        Returns: string
      }
      save_aion_message: {
        Args: {
          p_content: string
          p_role: string
          p_session_id: string
          p_structured_content?: Json
        }
        Returns: string
      }
      update_aion_session_summary: {
        Args: {
          p_session_id: string
          p_summarized_up_to: string
          p_summary: string
        }
        Returns: undefined
      }
      upsert_aion_insight: {
        Args: {
          p_context?: Json
          p_entity_id: string
          p_entity_type: string
          p_expires_at?: string
          p_priority?: number
          p_title: string
          p_trigger_type: string
          p_workspace_id: string
        }
        Returns: string
      }
      upsert_memory_embedding: {
        Args: {
          p_content_header?: string
          p_content_text: string
          p_embedding?: string
          p_entity_ids?: string[]
          p_metadata?: Json
          p_source_id: string
          p_source_type: string
          p_workspace_id: string
        }
        Returns: string
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
          legacy_entity_id: string | null
          legacy_org_id: string | null
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
          legacy_entity_id?: string | null
          legacy_org_id?: string | null
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
          legacy_entity_id?: string | null
          legacy_org_id?: string | null
          owner_workspace_id?: string | null
          search_vector?: unknown
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      entity_documents: {
        Row: {
          created_at: string
          display_name: string
          document_type: string
          entity_id: string
          expires_at: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          status: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          document_type?: string
          entity_id: string
          expires_at?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          document_type?: string
          entity_id?: string
          expires_at?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_documents_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
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
      bill_payments: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          currency: string
          id: string
          method: string
          notes: string | null
          paid_at: string
          qbo_bill_payment_id: string | null
          qbo_sync_status: string
          reference: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string
          currency?: string
          id?: string
          method: string
          notes?: string | null
          paid_at?: string
          qbo_bill_payment_id?: string | null
          qbo_sync_status?: string
          reference?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          currency?: string
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          qbo_bill_payment_id?: string | null
          qbo_sync_status?: string
          reference?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          bill_date: string | null
          bill_kind: string
          bill_number: string
          created_at: string
          currency: string
          due_date: string | null
          event_id: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          paid_amount: number
          pay_to_entity_id: string
          pay_to_snapshot: Json
          project_id: string | null
          qbo_bill_id: string | null
          qbo_sync_status: string
          qbo_sync_token: string | null
          status: string
          total_amount: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bill_date?: string | null
          bill_kind?: string
          bill_number: string
          created_at?: string
          currency?: string
          due_date?: string | null
          event_id?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          paid_amount?: number
          pay_to_entity_id: string
          pay_to_snapshot?: Json
          project_id?: string | null
          qbo_bill_id?: string | null
          qbo_sync_status?: string
          qbo_sync_token?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bill_date?: string | null
          bill_kind?: string
          bill_number?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          event_id?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          paid_amount?: number
          pay_to_entity_id?: string
          pay_to_snapshot?: Json
          project_id?: string | null
          qbo_bill_id?: string | null
          qbo_sync_status?: string
          qbo_sync_token?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          amount: number
          cost: number | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          is_taxable: boolean
          item_kind: string
          position: number
          qbo_item_id: string | null
          qbo_tax_code_id: string | null
          quantity: number
          source_package_id: string | null
          source_proposal_item_id: string | null
          unit_price: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          cost?: number | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          is_taxable?: boolean
          item_kind?: string
          position?: number
          qbo_item_id?: string | null
          qbo_tax_code_id?: string | null
          quantity?: number
          source_package_id?: string | null
          source_proposal_item_id?: string | null
          unit_price?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          cost?: number | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          is_taxable?: boolean
          item_kind?: string
          position?: number
          qbo_item_id?: string | null
          qbo_tax_code_id?: string | null
          quantity?: number
          source_package_id?: string | null
          source_proposal_item_id?: string | null
          unit_price?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_balances"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_number_sequences: {
        Row: {
          created_at: string
          next_value: number
          pad_width: number
          prefix: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          next_value?: number
          pad_width?: number
          prefix?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          next_value?: number
          pad_width?: number
          prefix?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          bill_to_entity_id: string
          bill_to_snapshot: Json
          billing_email: string | null
          created_at: string
          created_by_user_id: string | null
          currency: string
          deal_id: string | null
          discount_amount: number
          dispute_note: string | null
          due_date: string | null
          event_id: string | null
          from_snapshot: Json
          id: string
          internal_notes: string | null
          invoice_kind: string
          invoice_number: string
          is_disputed: boolean
          issue_date: string | null
          issued_at: string | null
          notes_to_client: string | null
          paid_amount: number
          paid_at: string | null
          parent_invoice_id: string | null
          pdf_last_generated_at: string | null
          pdf_version: number
          po_number: string | null
          project_id: string | null
          proposal_id: string | null
          public_token: string
          qbo_doc_number: string | null
          qbo_invoice_id: string | null
          qbo_last_error: string | null
          qbo_last_sync_at: string | null
          qbo_sync_status: string
          qbo_sync_token: string | null
          sent_at: string | null
          sent_by_user_id: string | null
          status: string
          stripe_payment_link_id: string | null
          subtotal_amount: number
          tax_amount: number
          tax_rate_snapshot: number | null
          terms: string | null
          total_amount: number
          updated_at: string
          viewed_at: string | null
          voided_at: string | null
          workspace_id: string
        }
        Insert: {
          bill_to_entity_id: string
          bill_to_snapshot?: Json
          billing_email?: string | null
          created_at?: string
          created_by_user_id?: string | null
          currency?: string
          deal_id?: string | null
          discount_amount?: number
          dispute_note?: string | null
          due_date?: string | null
          event_id?: string | null
          from_snapshot?: Json
          id?: string
          internal_notes?: string | null
          invoice_kind?: string
          invoice_number: string
          is_disputed?: boolean
          issue_date?: string | null
          issued_at?: string | null
          notes_to_client?: string | null
          paid_amount?: number
          paid_at?: string | null
          parent_invoice_id?: string | null
          pdf_last_generated_at?: string | null
          pdf_version?: number
          po_number?: string | null
          project_id?: string | null
          proposal_id?: string | null
          public_token?: string
          qbo_doc_number?: string | null
          qbo_invoice_id?: string | null
          qbo_last_error?: string | null
          qbo_last_sync_at?: string | null
          qbo_sync_status?: string
          qbo_sync_token?: string | null
          sent_at?: string | null
          sent_by_user_id?: string | null
          status?: string
          stripe_payment_link_id?: string | null
          subtotal_amount?: number
          tax_amount?: number
          tax_rate_snapshot?: number | null
          terms?: string | null
          total_amount?: number
          updated_at?: string
          viewed_at?: string | null
          voided_at?: string | null
          workspace_id: string
        }
        Update: {
          bill_to_entity_id?: string
          bill_to_snapshot?: Json
          billing_email?: string | null
          created_at?: string
          created_by_user_id?: string | null
          currency?: string
          deal_id?: string | null
          discount_amount?: number
          dispute_note?: string | null
          due_date?: string | null
          event_id?: string | null
          from_snapshot?: Json
          id?: string
          internal_notes?: string | null
          invoice_kind?: string
          invoice_number?: string
          is_disputed?: boolean
          issue_date?: string | null
          issued_at?: string | null
          notes_to_client?: string | null
          paid_amount?: number
          paid_at?: string | null
          parent_invoice_id?: string | null
          pdf_last_generated_at?: string | null
          pdf_version?: number
          po_number?: string | null
          project_id?: string | null
          proposal_id?: string | null
          public_token?: string
          qbo_doc_number?: string | null
          qbo_invoice_id?: string | null
          qbo_last_error?: string | null
          qbo_last_sync_at?: string | null
          qbo_sync_status?: string
          qbo_sync_token?: string | null
          sent_at?: string | null
          sent_by_user_id?: string | null
          status?: string
          stripe_payment_link_id?: string | null
          subtotal_amount?: number
          tax_amount?: number
          tax_rate_snapshot?: number | null
          terms?: string | null
          total_amount?: number
          updated_at?: string
          viewed_at?: string | null
          voided_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_balances"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          attachment_storage_path: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          invoice_id: string
          method: string
          notes: string | null
          parent_payment_id: string | null
          qbo_last_error: string | null
          qbo_last_sync_at: string | null
          qbo_payment_id: string | null
          qbo_sync_status: string
          qbo_sync_token: string | null
          received_at: string
          recorded_by_user_id: string | null
          reference: string | null
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount: number
          attachment_storage_path?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id: string
          method: string
          notes?: string | null
          parent_payment_id?: string | null
          qbo_last_error?: string | null
          qbo_last_sync_at?: string | null
          qbo_payment_id?: string | null
          qbo_sync_status?: string
          qbo_sync_token?: string | null
          received_at?: string
          recorded_by_user_id?: string | null
          reference?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          attachment_storage_path?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          method?: string
          notes?: string | null
          parent_payment_id?: string | null
          qbo_last_error?: string | null
          qbo_last_sync_at?: string | null
          qbo_payment_id?: string | null
          qbo_sync_status?: string
          qbo_sync_token?: string | null
          received_at?: string
          recorded_by_user_id?: string | null
          reference?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_balances"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_connections: {
        Row: {
          access_token_expires_at: string
          access_token_secret_id: string
          connected_at: string
          connected_by_user_id: string | null
          created_at: string
          default_deposit_account_id: string | null
          default_income_account_id: string | null
          default_item_ids: Json
          default_tax_code_id: string | null
          environment: string
          id: string
          last_refreshed_at: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          realm_id: string
          refresh_token_expires_at: string
          refresh_token_secret_id: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token_expires_at: string
          access_token_secret_id: string
          connected_at?: string
          connected_by_user_id?: string | null
          created_at?: string
          default_deposit_account_id?: string | null
          default_income_account_id?: string | null
          default_item_ids?: Json
          default_tax_code_id?: string | null
          environment?: string
          id?: string
          last_refreshed_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          realm_id: string
          refresh_token_expires_at: string
          refresh_token_secret_id: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token_expires_at?: string
          access_token_secret_id?: string
          connected_at?: string
          connected_by_user_id?: string | null
          created_at?: string
          default_deposit_account_id?: string | null
          default_income_account_id?: string | null
          default_item_ids?: Json
          default_tax_code_id?: string | null
          environment?: string
          id?: string
          last_refreshed_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          realm_id?: string
          refresh_token_expires_at?: string
          refresh_token_secret_id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      qbo_entity_map: {
        Row: {
          created_at: string
          id: string
          last_error: string | null
          last_hash: string | null
          last_synced_at: string
          local_id: string
          local_type: string
          qbo_id: string
          qbo_sync_token: string
          qbo_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_error?: string | null
          last_hash?: string | null
          last_synced_at?: string
          local_id: string
          local_type: string
          qbo_id: string
          qbo_sync_token: string
          qbo_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_error?: string | null
          last_hash?: string | null
          last_synced_at?: string
          local_id?: string
          local_type?: string
          qbo_id?: string
          qbo_sync_token?: string
          qbo_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      qbo_sync_log: {
        Row: {
          attempt_number: number
          completed_at: string | null
          direction: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string
          local_id: string
          local_type: string
          operation: string
          qbo_id: string | null
          qbo_response_body: Json | null
          qbo_response_status: number | null
          qbo_type: string | null
          request_id: string
          started_at: string
          workspace_id: string
        }
        Insert: {
          attempt_number?: number
          completed_at?: string | null
          direction?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          local_id: string
          local_type: string
          operation: string
          qbo_id?: string | null
          qbo_response_body?: Json | null
          qbo_response_status?: number | null
          qbo_type?: string | null
          request_id: string
          started_at?: string
          workspace_id: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          direction?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          local_id?: string
          local_type?: string
          operation?: string
          qbo_id?: string | null
          qbo_response_body?: Json | null
          qbo_response_status?: number | null
          qbo_type?: string | null
          request_id?: string
          started_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          event_type: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
          source: string
          stripe_event_id: string
          workspace_id: string | null
        }
        Insert: {
          event_type: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          source: string
          stripe_event_id: string
          workspace_id?: string | null
        }
        Update: {
          event_type?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
          source?: string
          stripe_event_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          attempt_number: number
          created_at: string
          depends_on_job_id: string | null
          id: string
          job_kind: string
          last_error: string | null
          leased_by: string | null
          leased_until: string | null
          local_id: string
          next_attempt_at: string
          request_id: string | null
          state: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          depends_on_job_id?: string | null
          id?: string
          job_kind: string
          last_error?: string | null
          leased_by?: string | null
          leased_until?: string | null
          local_id: string
          next_attempt_at?: string
          request_id?: string | null
          state?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          depends_on_job_id?: string | null
          id?: string
          job_kind?: string
          last_error?: string | null
          leased_by?: string | null
          leased_until?: string | null
          local_id?: string
          next_attempt_at?: string
          request_id?: string | null
          state?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_depends_on_job_id_fkey"
            columns: ["depends_on_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          is_default: boolean
          jurisdiction: string | null
          name: string
          qbo_tax_code_id: string | null
          rate: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_default?: boolean
          jurisdiction?: string | null
          name: string
          qbo_tax_code_id?: string | null
          rate: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          is_default?: boolean
          jurisdiction?: string | null
          name?: string
          qbo_tax_code_id?: string | null
          rate?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      invoice_balances: {
        Row: {
          balance_due: number | null
          days_overdue: number | null
          invoice_id: string | null
          paid_amount: number | null
          total_amount: number | null
          workspace_id: string | null
        }
        Insert: {
          balance_due?: never
          days_overdue?: never
          invoice_id?: string | null
          paid_amount?: number | null
          total_amount?: number | null
          workspace_id?: string | null
        }
        Update: {
          balance_due?: never
          days_overdue?: never
          invoice_id?: string | null
          paid_amount?: number | null
          total_amount?: number | null
          workspace_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _metric_assert_membership: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      _metric_resolve_tz: {
        Args: { p_tz: string; p_workspace_id: string }
        Returns: string
      }
      get_fresh_qbo_token: {
        Args: { p_workspace_id: string }
        Returns: {
          access_token: string
          realm_id: string
        }[]
      }
      get_public_invoice: {
        Args: { p_token: string }
        Returns: {
          bill_to_snapshot: Json
          currency: string
          discount_amount: number
          due_date: string
          from_snapshot: Json
          invoice_id: string
          invoice_kind: string
          invoice_number: string
          issue_date: string
          issued_at: string
          line_items: Json
          notes_to_client: string
          paid_amount: number
          po_number: string
          status: string
          subtotal_amount: number
          tax_amount: number
          terms: string
          total_amount: number
        }[]
      }
      metric_1099_worksheet: {
        Args: { p_workspace_id: string; p_year: number }
        Returns: {
          bill_count: number
          meets_1099_threshold: boolean
          total_paid: number
          vendor_id: string
          vendor_name: string
        }[]
      }
      metric_ar_aged_60plus: {
        Args: { p_workspace_id: string }
        Returns: {
          comparison_label: string
          comparison_value: number
          primary_value: number
          secondary_text: string
          sparkline_values: number[]
        }[]
      }
      metric_invoice_variance: {
        Args: { p_workspace_id: string }
        Returns: {
          delta: number
          invoice_id: string
          invoice_number: string
          local_total: number
          qbo_last_error: string
          qbo_last_sync_at: string
          qbo_sync_status: string
          qbo_total: number
          status: string
        }[]
      }
      metric_qbo_sync_health: {
        Args: { p_workspace_id: string }
        Returns: {
          comparison_label: string
          comparison_value: number
          primary_value: number
          secondary_text: string
          sparkline_values: number[]
        }[]
      }
      metric_qbo_variance: {
        Args: { p_workspace_id: string }
        Returns: {
          comparison_label: string
          comparison_value: number
          primary_value: number
          secondary_text: string
          sparkline_values: number[]
        }[]
      }
      metric_revenue_collected: {
        Args: {
          p_compare?: boolean
          p_period_end: string
          p_period_start: string
          p_tz?: string
          p_workspace_id: string
        }
        Returns: {
          comparison_label: string
          comparison_value: number
          primary_value: number
          secondary_text: string
          sparkline_values: number[]
        }[]
      }
      metric_sales_tax_worksheet: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_tz?: string
          p_workspace_id: string
        }
        Returns: {
          invoice_count: number
          jurisdiction: string
          tax_code: string
          tax_collected: number
          taxable_amount: number
        }[]
      }
      metric_unreconciled_payments: {
        Args: { p_workspace_id: string }
        Returns: {
          amount: number
          invoice_id: string
          invoice_number: string
          method: string
          payment_id: string
          qbo_last_error: string
          qbo_sync_status: string
          received_at: string
        }[]
      }
      next_invoice_number: { Args: { p_workspace_id: string }; Returns: string }
      persist_refreshed_qbo_tokens: {
        Args: {
          p_access_expires_in_seconds: number
          p_new_access_token: string
          p_new_refresh_token: string
          p_refresh_expires_in_seconds?: number
          p_workspace_id: string
        }
        Returns: undefined
      }
      recompute_invoice_paid: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      record_payment: {
        Args: {
          p_amount: number
          p_attachment_storage_path?: string
          p_invoice_id: string
          p_method: string
          p_notes?: string
          p_parent_payment_id?: string
          p_received_at?: string
          p_recorded_by_user_id?: string
          p_reference?: string
          p_status?: string
          p_stripe_charge_id?: string
          p_stripe_payment_intent_id?: string
        }
        Returns: string
      }
      spawn_invoices_from_proposal: {
        Args: { p_proposal_id: string }
        Returns: {
          invoice_id: string
          invoice_kind: string
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
      crew_assignments: {
        Row: {
          assignee_name: string | null
          bonus: number | null
          booking_type: string
          call_time_override: string | null
          call_time_slot_id: string | null
          created_at: string
          entity_id: string | null
          event_id: string
          id: string
          kit_fee: number | null
          overtime_hours: number | null
          overtime_rate: number | null
          pay_rate: number | null
          pay_rate_type: string | null
          payment_date: string | null
          payment_status: string | null
          per_diem: number | null
          quantity_index: number
          role: string
          scheduled_hours: number | null
          sort_order: number
          source_package_id: string | null
          status: string
          status_updated_at: string | null
          status_updated_by: string | null
          travel_stipend: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_name?: string | null
          bonus?: number | null
          booking_type?: string
          call_time_override?: string | null
          call_time_slot_id?: string | null
          created_at?: string
          entity_id?: string | null
          event_id: string
          id?: string
          kit_fee?: number | null
          overtime_hours?: number | null
          overtime_rate?: number | null
          pay_rate?: number | null
          pay_rate_type?: string | null
          payment_date?: string | null
          payment_status?: string | null
          per_diem?: number | null
          quantity_index?: number
          role?: string
          scheduled_hours?: number | null
          sort_order?: number
          source_package_id?: string | null
          status?: string
          status_updated_at?: string | null
          status_updated_by?: string | null
          travel_stipend?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee_name?: string | null
          bonus?: number | null
          booking_type?: string
          call_time_override?: string | null
          call_time_slot_id?: string | null
          created_at?: string
          entity_id?: string | null
          event_id?: string
          id?: string
          kit_fee?: number | null
          overtime_hours?: number | null
          overtime_rate?: number | null
          pay_rate?: number | null
          pay_rate_type?: string | null
          payment_date?: string | null
          payment_status?: string | null
          per_diem?: number | null
          quantity_index?: number
          role?: string
          scheduled_hours?: number | null
          sort_order?: number
          source_package_id?: string | null
          status?: string
          status_updated_at?: string | null
          status_updated_by?: string | null
          travel_stipend?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_confirmation_tokens: {
        Row: {
          action_taken: string | null
          assignment_id: string | null
          created_at: string
          crew_index: number | null
          email: string
          entity_id: string | null
          event_id: string
          expires_at: string
          id: string
          role: string
          token: string
          used_at: string | null
        }
        Insert: {
          action_taken?: string | null
          assignment_id?: string | null
          created_at?: string
          crew_index?: number | null
          email: string
          entity_id?: string | null
          event_id: string
          expires_at?: string
          id?: string
          role: string
          token?: string
          used_at?: string | null
        }
        Update: {
          action_taken?: string | null
          assignment_id?: string | null
          created_at?: string
          crew_index?: number | null
          email?: string
          entity_id?: string | null
          event_id?: string
          expires_at?: string
          id?: string
          role?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_confirmation_tokens_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "crew_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_confirmation_tokens_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "entity_crew_schedule"
            referencedColumns: ["assignment_id"]
          },
        ]
      }
      crew_equipment: {
        Row: {
          catalog_item_id: string | null
          category: string
          created_at: string
          entity_id: string
          id: string
          name: string
          notes: string | null
          photo_url: string | null
          quantity: number
          rejection_reason: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
          workspace_id: string
        }
        Insert: {
          catalog_item_id?: string | null
          category: string
          created_at?: string
          entity_id: string
          id?: string
          name: string
          notes?: string | null
          photo_url?: string | null
          quantity?: number
          rejection_reason?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          workspace_id: string
        }
        Update: {
          catalog_item_id?: string | null
          category?: string
          created_at?: string
          entity_id?: string
          id?: string
          name?: string
          notes?: string | null
          photo_url?: string | null
          quantity?: number
          rejection_reason?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      crew_skills: {
        Row: {
          created_at: string
          entity_id: string
          hourly_rate: number | null
          id: string
          notes: string | null
          proficiency: Database["public"]["Enums"]["skill_level"] | null
          skill_tag: string
          updated_at: string
          verified: boolean
          workspace_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          proficiency?: Database["public"]["Enums"]["skill_level"] | null
          skill_tag: string
          updated_at?: string
          verified?: boolean
          workspace_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          proficiency?: Database["public"]["Enums"]["skill_level"] | null
          skill_tag?: string
          updated_at?: string
          verified?: boolean
          workspace_id?: string
        }
        Relationships: []
      }
      day_sheet_tokens: {
        Row: {
          created_at: string
          deal_crew_id: string | null
          email: string | null
          entity_id: string | null
          event_id: string
          expires_at: string
          token: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deal_crew_id?: string | null
          email?: string | null
          entity_id?: string | null
          event_id: string
          expires_at: string
          token?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          deal_crew_id?: string | null
          email?: string | null
          entity_id?: string | null
          event_id?: string
          expires_at?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_sheet_tokens_deal_crew_id_fkey"
            columns: ["deal_crew_id"]
            isOneToOne: false
            referencedRelation: "deal_crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_sheet_tokens_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_crew: {
        Row: {
          acknowledged_at: string | null
          arrival_location: string | null
          brings_own_gear: boolean
          call_time: string | null
          call_time_slot_id: string | null
          catalog_item_id: string | null
          confirmed_at: string | null
          created_at: string
          day_rate: number | null
          deal_id: string
          declined_at: string | null
          department: string | null
          dispatch_status: string | null
          entity_id: string | null
          gear_notes: string | null
          id: string
          kit_fee: number | null
          notes: string | null
          payment_date: string | null
          payment_status: string | null
          per_diem: number | null
          role_note: string | null
          source: string
          travel_stipend: number | null
          workspace_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          arrival_location?: string | null
          brings_own_gear?: boolean
          call_time?: string | null
          call_time_slot_id?: string | null
          catalog_item_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          day_rate?: number | null
          deal_id: string
          declined_at?: string | null
          department?: string | null
          dispatch_status?: string | null
          entity_id?: string | null
          gear_notes?: string | null
          id?: string
          kit_fee?: number | null
          notes?: string | null
          payment_date?: string | null
          payment_status?: string | null
          per_diem?: number | null
          role_note?: string | null
          source: string
          travel_stipend?: number | null
          workspace_id: string
        }
        Update: {
          acknowledged_at?: string | null
          arrival_location?: string | null
          brings_own_gear?: boolean
          call_time?: string | null
          call_time_slot_id?: string | null
          catalog_item_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          day_rate?: number | null
          deal_id?: string
          declined_at?: string | null
          department?: string | null
          dispatch_status?: string | null
          entity_id?: string | null
          gear_notes?: string | null
          id?: string
          kit_fee?: number | null
          notes?: string | null
          payment_date?: string | null
          payment_status?: string | null
          per_diem?: number | null
          role_note?: string | null
          source?: string
          travel_stipend?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      deal_notes: {
        Row: {
          attachments: Json | null
          author_user_id: string
          content: string
          created_at: string
          deal_id: string
          id: string
          phase_tag: string | null
          pinned_at: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          attachments?: Json | null
          author_user_id: string
          content: string
          created_at?: string
          deal_id: string
          id?: string
          phase_tag?: string | null
          pinned_at?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          attachments?: Json | null
          author_user_id?: string
          content?: string
          created_at?: string
          deal_id?: string
          id?: string
          phase_tag?: string | null
          pinned_at?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: []
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
        Relationships: []
      }
      domain_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          payload: Json
          type: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          payload?: Json
          type: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          payload?: Json
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_capabilities: {
        Row: {
          capability: string
          created_at: string
          entity_id: string
          id: string
          workspace_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          entity_id: string
          id?: string
          workspace_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          entity_id?: string
          id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      event_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          event_id: string
          id: string
          label: string
          note: string | null
          paid_at: string | null
          payment_type: string
          qbo_account_id: string | null
          qbo_purchase_id: string | null
          qbo_synced_at: string | null
          updated_at: string
          vendor_entity_id: string | null
          workspace_id: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          event_id: string
          id?: string
          label: string
          note?: string | null
          paid_at?: string | null
          payment_type?: string
          qbo_account_id?: string | null
          qbo_purchase_id?: string | null
          qbo_synced_at?: string | null
          updated_at?: string
          vendor_entity_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          event_id?: string
          id?: string
          label?: string
          note?: string | null
          paid_at?: string | null
          payment_type?: string
          qbo_account_id?: string | null
          qbo_purchase_id?: string | null
          qbo_synced_at?: string | null
          updated_at?: string
          vendor_entity_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_gear_items: {
        Row: {
          catalog_package_id: string | null
          created_at: string
          department: string | null
          event_id: string
          history: Json | null
          id: string
          is_sub_rental: boolean
          kit_fee: number | null
          name: string
          operator_entity_id: string | null
          quantity: number
          sort_order: number
          source: string
          status: string
          status_updated_at: string | null
          status_updated_by: string | null
          sub_rental_supplier_id: string | null
          supplied_by_entity_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          catalog_package_id?: string | null
          created_at?: string
          department?: string | null
          event_id: string
          history?: Json | null
          id?: string
          is_sub_rental?: boolean
          kit_fee?: number | null
          name: string
          operator_entity_id?: string | null
          quantity?: number
          sort_order?: number
          source?: string
          status?: string
          status_updated_at?: string | null
          status_updated_by?: string | null
          sub_rental_supplier_id?: string | null
          supplied_by_entity_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          catalog_package_id?: string | null
          created_at?: string
          department?: string | null
          event_id?: string
          history?: Json | null
          id?: string
          is_sub_rental?: boolean
          kit_fee?: number | null
          name?: string
          operator_entity_id?: string | null
          quantity?: number
          sort_order?: number
          source?: string
          status?: string
          status_updated_at?: string | null
          status_updated_by?: string | null
          sub_rental_supplier_id?: string | null
          supplied_by_entity_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_gear_items_event_id_fkey"
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
          advancing_checklist: Json | null
          archived_at: string | null
          client_entity_id: string | null
          client_portal_token: string | null
          compliance_docs: Json | null
          confidentiality_level: string | null
          created_at: string | null
          crm_estimated_value: number | null
          crm_probability: number | null
          dates_load_in: string | null
          dates_load_out: string | null
          deal_id: string | null
          ends_at: string
          event_archetype: string | null
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
          project_id: string | null
          ros_execution_state: Json | null
          run_of_show_data: Json | null
          show_day_contacts: Json | null
          show_ended_at: string | null
          show_started_at: string | null
          slug: string | null
          starts_at: string
          status: string
          tech_requirements: Json | null
          timezone: string
          title: string
          updated_at: string | null
          venue_address: string | null
          venue_entity_id: string | null
          venue_google_maps_id: string | null
          venue_name: string | null
          workspace_id: string | null
          wrap_report: Json | null
        }
        Insert: {
          actor?: string | null
          advancing_checklist?: Json | null
          archived_at?: string | null
          client_entity_id?: string | null
          client_portal_token?: string | null
          compliance_docs?: Json | null
          confidentiality_level?: string | null
          created_at?: string | null
          crm_estimated_value?: number | null
          crm_probability?: number | null
          dates_load_in?: string | null
          dates_load_out?: string | null
          deal_id?: string | null
          ends_at: string
          event_archetype?: string | null
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
          project_id?: string | null
          ros_execution_state?: Json | null
          run_of_show_data?: Json | null
          show_day_contacts?: Json | null
          show_ended_at?: string | null
          show_started_at?: string | null
          slug?: string | null
          starts_at: string
          status?: string
          tech_requirements?: Json | null
          timezone?: string
          title: string
          updated_at?: string | null
          venue_address?: string | null
          venue_entity_id?: string | null
          venue_google_maps_id?: string | null
          venue_name?: string | null
          workspace_id?: string | null
          wrap_report?: Json | null
        }
        Update: {
          actor?: string | null
          advancing_checklist?: Json | null
          archived_at?: string | null
          client_entity_id?: string | null
          client_portal_token?: string | null
          compliance_docs?: Json | null
          confidentiality_level?: string | null
          created_at?: string | null
          crm_estimated_value?: number | null
          crm_probability?: number | null
          dates_load_in?: string | null
          dates_load_out?: string | null
          deal_id?: string | null
          ends_at?: string
          event_archetype?: string | null
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
          project_id?: string | null
          ros_execution_state?: Json | null
          run_of_show_data?: Json | null
          show_day_contacts?: Json | null
          show_ended_at?: string | null
          show_started_at?: string | null
          slug?: string | null
          starts_at?: string
          status?: string
          tech_requirements?: Json | null
          timezone?: string
          title?: string
          updated_at?: string | null
          venue_address?: string | null
          venue_entity_id?: string | null
          venue_google_maps_id?: string | null
          venue_name?: string | null
          workspace_id?: string | null
          wrap_report?: Json | null
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
      follow_up_log: {
        Row: {
          action_type: string
          actor_user_id: string | null
          channel: string | null
          content: string | null
          created_at: string
          deal_id: string
          draft_original: string | null
          edit_classification: string | null
          edit_distance: number | null
          id: string
          queue_item_id: string | null
          summary: string | null
          workspace_id: string
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          channel?: string | null
          content?: string | null
          created_at?: string
          deal_id: string
          draft_original?: string | null
          edit_classification?: string | null
          edit_distance?: number | null
          id?: string
          queue_item_id?: string | null
          summary?: string | null
          workspace_id: string
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          channel?: string | null
          content?: string | null
          created_at?: string
          deal_id?: string
          draft_original?: string | null
          edit_classification?: string | null
          edit_distance?: number | null
          id?: string
          queue_item_id?: string | null
          summary?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      follow_up_queue: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          context_snapshot: Json | null
          created_at: string
          deal_id: string
          follow_up_category: string
          id: string
          priority_score: number
          reason: string
          reason_type: string
          snoozed_until: string | null
          status: string
          suggested_action: string | null
          suggested_channel: string | null
          workspace_id: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          context_snapshot?: Json | null
          created_at?: string
          deal_id: string
          follow_up_category?: string
          id?: string
          priority_score?: number
          reason: string
          reason_type: string
          snoozed_until?: string | null
          status?: string
          suggested_action?: string | null
          suggested_channel?: string | null
          workspace_id: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          context_snapshot?: Json | null
          created_at?: string
          deal_id?: string
          follow_up_category?: string
          id?: string
          priority_score?: number
          reason?: string
          reason_type?: string
          snoozed_until?: string | null
          status?: string
          suggested_action?: string | null
          suggested_channel?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      kit_templates: {
        Row: {
          created_at: string
          id: string
          items: Json
          name: string
          role_tag: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items?: Json
          name: string
          role_tag: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          name?: string
          role_tag?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
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
      workspace_call_time_rules: {
        Row: {
          action_type: string
          apply_only_when_unset: boolean
          created_at: string
          entity_ids: string[]
          event_archetypes: string[]
          id: string
          name: string
          offset_minutes: number | null
          priority: number
          role_patterns: string[]
          slot_label: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          action_type?: string
          apply_only_when_unset?: boolean
          created_at?: string
          entity_ids?: string[]
          event_archetypes?: string[]
          id?: string
          name: string
          offset_minutes?: number | null
          priority?: number
          role_patterns?: string[]
          slot_label?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          action_type?: string
          apply_only_when_unset?: boolean
          created_at?: string
          entity_ids?: string[]
          event_archetypes?: string[]
          id?: string
          name?: string
          offset_minutes?: number | null
          priority?: number
          role_patterns?: string[]
          slot_label?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_capability_presets: {
        Row: {
          capability: string
          created_at: string
          id: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          id?: string
          sort_order?: number
          workspace_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          id?: string
          sort_order?: number
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_industry_tags: {
        Row: {
          created_at: string
          id: string
          label: string
          sort_order: number
          tag: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          tag: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          tag?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_job_titles: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          title: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order?: number
          title: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          title?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_lead_sources: {
        Row: {
          archived_at: string | null
          category: string
          created_at: string
          id: string
          is_referral: boolean
          label: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          category: string
          created_at?: string
          id?: string
          is_referral?: boolean
          label: string
          sort_order?: number
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          created_at?: string
          id?: string
          is_referral?: boolean
          label?: string
          sort_order?: number
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
      workspace_ros_templates: {
        Row: {
          created_at: string
          cues: Json
          description: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          cues?: Json
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          cues?: Json
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_skill_presets: {
        Row: {
          created_at: string
          id: string
          skill_tag: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          skill_tag: string
          sort_order?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          skill_tag?: string
          sort_order?: number
          workspace_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      entity_crew_schedule: {
        Row: {
          assignee_name: string | null
          assignment_id: string | null
          bonus: number | null
          call_time_override: string | null
          call_time_slot_id: string | null
          deal_id: string | null
          ends_at: string | null
          entity_id: string | null
          event_archetype: string | null
          event_id: string | null
          event_title: string | null
          kit_fee: number | null
          location_address: string | null
          overtime_hours: number | null
          overtime_rate: number | null
          pay_rate: number | null
          pay_rate_type: string | null
          payment_date: string | null
          payment_status: string | null
          per_diem: number | null
          role: string | null
          scheduled_hours: number | null
          starts_at: string | null
          status: string | null
          travel_stipend: number | null
          venue_address: string | null
          venue_name: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crew_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      event_status_pair_valid: {
        Args: { p_lifecycle: string; p_status: string }
        Returns: boolean
      }
      patch_event_ros_data: {
        Args: { p_event_id: string; p_patch: Json }
        Returns: undefined
      }
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
      bridge_device_tokens: {
        Row: {
          created_at: string | null
          device_name: string
          id: string
          last_sync_at: string | null
          local_session_nonce: string | null
          local_session_updated_at: string | null
          person_entity_id: string
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_name?: string
          id?: string
          last_sync_at?: string | null
          local_session_nonce?: string | null
          local_session_updated_at?: string | null
          person_entity_id: string
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_name?: string
          id?: string
          last_sync_at?: string | null
          local_session_nonce?: string | null
          local_session_updated_at?: string | null
          person_entity_id?: string
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      bridge_pair_attempts: {
        Row: {
          attempted_at: string
          client_ip: unknown
          id: number
        }
        Insert: {
          attempted_at?: string
          client_ip: unknown
          id?: number
        }
        Update: {
          attempted_at?: string
          client_ip?: unknown
          id?: number
        }
        Relationships: []
      }
      bridge_pairing_codes: {
        Row: {
          code: string
          consumed_at: string | null
          created_at: string | null
          expires_at: string
          id: string
          person_entity_id: string
          user_id: string
        }
        Insert: {
          code: string
          consumed_at?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          person_entity_id: string
          user_id: string
        }
        Update: {
          code?: string
          consumed_at?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          person_entity_id?: string
          user_id?: string
        }
        Relationships: []
      }
      bridge_sync_status: {
        Row: {
          bridge_version: string | null
          device_token_id: string
          event_id: string
          id: string
          matched_count: number
          synced_at: string
          total_count: number
          unmatched_songs: Json
        }
        Insert: {
          bridge_version?: string | null
          device_token_id: string
          event_id: string
          id?: string
          matched_count?: number
          synced_at?: string
          total_count?: number
          unmatched_songs?: Json
        }
        Update: {
          bridge_version?: string | null
          device_token_id?: string
          event_id?: string
          id?: string
          matched_count?: number
          synced_at?: string
          total_count?: number
          unmatched_songs?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bridge_sync_status_device_token_id_fkey"
            columns: ["device_token_id"]
            isOneToOne: false
            referencedRelation: "bridge_device_tokens"
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
      client_portal_access_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_kind: string
          auth_method: string | null
          created_at: string
          entity_id: string
          id: number
          ip: unknown
          metadata: Json
          outcome: string
          request_id: string | null
          resource_id: string | null
          resource_type: string
          session_id: string | null
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_kind: string
          auth_method?: string | null
          created_at?: string
          entity_id: string
          id?: number
          ip?: unknown
          metadata?: Json
          outcome: string
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          session_id?: string | null
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_kind?: string
          auth_method?: string | null
          created_at?: string
          entity_id?: string
          id?: number
          ip?: unknown
          metadata?: Json
          outcome?: string
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          session_id?: string | null
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      client_portal_otp_challenges: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          created_ip: unknown
          email: string
          entity_id: string
          expires_at: string
          id: string
          purpose: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          created_ip?: unknown
          email: string
          entity_id: string
          expires_at: string
          id?: string
          purpose: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          created_ip?: unknown
          email?: string
          entity_id?: string
          expires_at?: string
          id?: string
          purpose?: string
        }
        Relationships: []
      }
      client_portal_rate_limits: {
        Row: {
          action_at: string
          id: number
          key: string
          scope: string
        }
        Insert: {
          action_at?: string
          id?: number
          key: string
          scope: string
        }
        Update: {
          action_at?: string
          id?: number
          key?: string
          scope?: string
        }
        Relationships: []
      }
      client_portal_tokens: {
        Row: {
          created_at: string
          created_ip: unknown
          device_id_hash: string | null
          entity_id: string
          expires_at: string
          id: string
          last_used_at: string | null
          last_used_ip: unknown
          last_used_ua: string | null
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          source_id: string | null
          source_kind: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_ip?: unknown
          device_id_hash?: string | null
          entity_id: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          last_used_ip?: unknown
          last_used_ua?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          source_id?: string | null
          source_kind: string
          token_hash: string
        }
        Update: {
          created_at?: string
          created_ip?: unknown
          device_id_hash?: string | null
          entity_id?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          last_used_ip?: unknown
          last_used_ua?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          source_id?: string | null
          source_kind?: string
          token_hash?: string
        }
        Relationships: []
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
      contracts: {
        Row: {
          created_at: string
          event_id: string
          id: string
          pdf_url: string | null
          signed_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          pdf_url?: string | null
          signed_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          pdf_url?: string | null
          signed_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          archived_at: string | null
          budget_estimated: number | null
          created_at: string
          event_archetype: string | null
          event_end_time: string | null
          event_id: string | null
          event_start_time: string | null
          id: string
          lead_source: string | null
          lead_source_detail: string | null
          lead_source_id: string | null
          lost_at: string | null
          lost_reason: string | null
          lost_to_competitor_name: string | null
          main_contact_id: string | null
          notes: string | null
          organization_id: string | null
          owner_entity_id: string | null
          owner_user_id: string | null
          preferred_crew: Json | null
          proposed_date: string
          proposed_end_time: string | null
          proposed_start_time: string | null
          referrer_entity_id: string | null
          show_health: Json | null
          status: string
          title: string | null
          updated_at: string
          venue_id: string | null
          venue_name: string | null
          won_at: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          budget_estimated?: number | null
          created_at?: string
          event_archetype?: string | null
          event_end_time?: string | null
          event_id?: string | null
          event_start_time?: string | null
          id?: string
          lead_source?: string | null
          lead_source_detail?: string | null
          lead_source_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          lost_to_competitor_name?: string | null
          main_contact_id?: string | null
          notes?: string | null
          organization_id?: string | null
          owner_entity_id?: string | null
          owner_user_id?: string | null
          preferred_crew?: Json | null
          proposed_date: string
          proposed_end_time?: string | null
          proposed_start_time?: string | null
          referrer_entity_id?: string | null
          show_health?: Json | null
          status?: string
          title?: string | null
          updated_at?: string
          venue_id?: string | null
          venue_name?: string | null
          won_at?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          budget_estimated?: number | null
          created_at?: string
          event_archetype?: string | null
          event_end_time?: string | null
          event_id?: string | null
          event_start_time?: string | null
          id?: string
          lead_source?: string | null
          lead_source_detail?: string | null
          lead_source_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          lost_to_competitor_name?: string | null
          main_contact_id?: string | null
          notes?: string | null
          organization_id?: string | null
          owner_entity_id?: string | null
          owner_user_id?: string | null
          preferred_crew?: Json | null
          proposed_date?: string
          proposed_end_time?: string | null
          proposed_start_time?: string | null
          referrer_entity_id?: string | null
          show_health?: Json | null
          status?: string
          title?: string | null
          updated_at?: string
          venue_id?: string | null
          venue_name?: string | null
          won_at?: string | null
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
      invitations: {
        Row: {
          created_at: string
          created_by_org_id: string | null
          email: string
          expires_at: string
          id: string
          organization_id: string
          payload: Json | null
          status: string
          target_org_id: string | null
          token: string
          type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_org_id?: string | null
          email: string
          expires_at: string
          id?: string
          organization_id: string
          payload?: Json | null
          status?: string
          target_org_id?: string | null
          token: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_org_id?: string | null
          email?: string
          expires_at?: string
          id?: string
          organization_id?: string
          payload?: Json | null
          status?: string
          target_org_id?: string | null
          token?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: []
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
          is_draft: boolean
          is_sub_rental: boolean
          is_taxable: boolean
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
          is_draft?: boolean
          is_sub_rental?: boolean
          is_taxable?: boolean
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
          is_draft?: boolean
          is_sub_rental?: boolean
          is_taxable?: boolean
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
          friendly_name: string | null
          id: string
          public_key: string
          transports: string[] | null
          user_id: string
        }
        Insert: {
          counter?: number | null
          created_at?: string | null
          credential_id: string
          friendly_name?: string | null
          id?: string
          public_key: string
          transports?: string[] | null
          user_id: string
        }
        Update: {
          counter?: number | null
          created_at?: string | null
          credential_id?: string
          friendly_name?: string | null
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
          ical_token: string | null
          id: string
          onboarding_completed: boolean | null
          onboarding_persona_completed: boolean | null
          onboarding_step: number | null
          onboarding_summary: string | null
          persona: Database["public"]["Enums"]["user_persona"] | null
          recovery_setup_at: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          has_recovery_kit?: boolean | null
          ical_token?: string | null
          id: string
          onboarding_completed?: boolean | null
          onboarding_persona_completed?: boolean | null
          onboarding_step?: number | null
          onboarding_summary?: string | null
          persona?: Database["public"]["Enums"]["user_persona"] | null
          recovery_setup_at?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          has_recovery_kit?: boolean | null
          ical_token?: string | null
          id?: string
          onboarding_completed?: boolean | null
          onboarding_persona_completed?: boolean | null
          onboarding_step?: number | null
          onboarding_summary?: string | null
          persona?: Database["public"]["Enums"]["user_persona"] | null
          recovery_setup_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      proposal_client_selections: {
        Row: {
          item_id: string
          proposal_id: string
          selected: boolean
          updated_at: string
        }
        Insert: {
          item_id: string
          proposal_id: string
          selected?: boolean
          updated_at?: string
        }
        Update: {
          item_id?: string
          proposal_id?: string
          selected?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_client_selections_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_client_selections_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          actual_cost: number | null
          created_at: string
          definition_snapshot: Json | null
          description: string | null
          display_group_name: string | null
          id: string
          internal_notes: string | null
          is_client_visible: boolean
          is_optional: boolean
          is_package_header: boolean
          name: string
          origin_package_id: string | null
          original_base_price: number | null
          override_price: number | null
          package_id: string | null
          package_instance_id: string | null
          proposal_id: string
          quantity: number
          show_times_on_proposal: boolean
          sort_order: number
          time_end: string | null
          time_start: string | null
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
          internal_notes?: string | null
          is_client_visible?: boolean
          is_optional?: boolean
          is_package_header?: boolean
          name: string
          origin_package_id?: string | null
          original_base_price?: number | null
          override_price?: number | null
          package_id?: string | null
          package_instance_id?: string | null
          proposal_id: string
          quantity?: number
          show_times_on_proposal?: boolean
          sort_order?: number
          time_end?: string | null
          time_start?: string | null
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
          internal_notes?: string | null
          is_client_visible?: boolean
          is_optional?: boolean
          is_package_header?: boolean
          name?: string
          origin_package_id?: string | null
          original_base_price?: number | null
          override_price?: number | null
          package_id?: string | null
          package_instance_id?: string | null
          proposal_id?: string
          quantity?: number
          show_times_on_proposal?: boolean
          sort_order?: number
          time_end?: string | null
          time_start?: string | null
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
          client_selections_locked_at: string | null
          created_at: string
          deal_id: string
          deposit_deadline_days: number | null
          deposit_paid_at: string | null
          deposit_percent: number | null
          docuseal_embed_src: string | null
          docuseal_submission_id: string | null
          email_bounced_at: string | null
          email_delivered_at: string | null
          expires_at: string | null
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          payment_due_days: number | null
          payment_notes: string | null
          public_token: string
          reminder_sent_at: string | null
          resend_message_id: string | null
          scope_notes: string | null
          signed_at: string | null
          signed_ip: string | null
          signed_pdf_path: string | null
          signer_name: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          stripe_payment_intent_id: string | null
          terms_and_conditions: string | null
          updated_at: string
          view_count: number
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          client_selections_locked_at?: string | null
          created_at?: string
          deal_id: string
          deposit_deadline_days?: number | null
          deposit_paid_at?: string | null
          deposit_percent?: number | null
          docuseal_embed_src?: string | null
          docuseal_submission_id?: string | null
          email_bounced_at?: string | null
          email_delivered_at?: string | null
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          payment_due_days?: number | null
          payment_notes?: string | null
          public_token?: string
          reminder_sent_at?: string | null
          resend_message_id?: string | null
          scope_notes?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_pdf_path?: string | null
          signer_name?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          stripe_payment_intent_id?: string | null
          terms_and_conditions?: string | null
          updated_at?: string
          view_count?: number
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          client_selections_locked_at?: string | null
          created_at?: string
          deal_id?: string
          deposit_deadline_days?: number | null
          deposit_paid_at?: string | null
          deposit_percent?: number | null
          docuseal_embed_src?: string | null
          docuseal_submission_id?: string | null
          email_bounced_at?: string | null
          email_delivered_at?: string | null
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          payment_due_days?: number | null
          payment_notes?: string | null
          public_token?: string
          reminder_sent_at?: string | null
          resend_message_id?: string | null
          scope_notes?: string | null
          signed_at?: string | null
          signed_ip?: string | null
          signed_pdf_path?: string | null
          signer_name?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          stripe_payment_intent_id?: string | null
          terms_and_conditions?: string | null
          updated_at?: string
          view_count?: number
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
      run_of_show_cues: {
        Row: {
          assigned_crew: Json
          assigned_gear: Json
          created_at: string
          duration_minutes: number
          event_id: string
          id: string
          is_pre_show: boolean
          label: string | null
          notes: string | null
          section_id: string | null
          sort_order: number
          start_time: string | null
          title: string | null
          type: Database["public"]["Enums"]["cue_type"]
          updated_at: string
        }
        Insert: {
          assigned_crew?: Json
          assigned_gear?: Json
          created_at?: string
          duration_minutes?: number
          event_id: string
          id?: string
          is_pre_show?: boolean
          label?: string | null
          notes?: string | null
          section_id?: string | null
          sort_order?: number
          start_time?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["cue_type"]
          updated_at?: string
        }
        Update: {
          assigned_crew?: Json
          assigned_gear?: Json
          created_at?: string
          duration_minutes?: number
          event_id?: string
          id?: string
          is_pre_show?: boolean
          label?: string | null
          notes?: string | null
          section_id?: string | null
          sort_order?: number
          start_time?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["cue_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_of_show_cues_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "run_of_show_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      run_of_show_sections: {
        Row: {
          color: string | null
          created_at: string
          event_id: string
          id: string
          notes: string | null
          sort_order: number
          start_time: string | null
          title: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          event_id: string
          id?: string
          notes?: string | null
          sort_order?: number
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          event_id?: string
          id?: string
          notes?: string | null
          sort_order?: number
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          created_at: string
          event_kind: string
          from_state: Json | null
          id: string
          stripe_event_id: string | null
          to_state: Json | null
          triggered_by_user_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_kind: string
          from_state?: Json | null
          id?: string
          stripe_event_id?: string | null
          to_state?: Json | null
          triggered_by_user_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_kind?: string
          from_state?: Json | null
          id?: string
          stripe_event_id?: string | null
          to_state?: Json | null
          triggered_by_user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount_due: number | null
          amount_paid: number | null
          created_at: string
          currency: string | null
          hosted_invoice_url: string | null
          invoice_pdf_url: string | null
          period_end: string | null
          period_start: string | null
          status: string | null
          stripe_invoice_id: string
          workspace_id: string
        }
        Insert: {
          amount_due?: number | null
          amount_paid?: number | null
          created_at?: string
          currency?: string | null
          hosted_invoice_url?: string | null
          invoice_pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          stripe_invoice_id: string
          workspace_id: string
        }
        Update: {
          amount_due?: number | null
          amount_paid?: number | null
          created_at?: string
          currency?: string | null
          hosted_invoice_url?: string | null
          invoice_pdf_url?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string | null
          stripe_invoice_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tier_config: {
        Row: {
          aion_mode: string
          aion_monthly_actions: number | null
          base_price_cents: number
          billing_interval: string
          extra_seat_price_cents: number
          included_seats: number
          label: string
          max_active_shows: number | null
          stripe_extra_seat_price_id: string | null
          stripe_price_id: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
        }
        Insert: {
          aion_mode?: string
          aion_monthly_actions?: number | null
          base_price_cents: number
          billing_interval?: string
          extra_seat_price_cents: number
          included_seats: number
          label: string
          max_active_shows?: number | null
          stripe_extra_seat_price_id?: string | null
          stripe_price_id?: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
        }
        Update: {
          aion_mode?: string
          aion_monthly_actions?: number | null
          base_price_cents?: number
          billing_interval?: string
          extra_seat_price_cents?: number
          included_seats?: number
          label?: string
          max_active_shows?: number | null
          stripe_extra_seat_price_id?: string | null
          stripe_price_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
        }
        Relationships: []
      }
      user_lobby_layout: {
        Row: {
          card_ids: string[]
          role_slug: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          card_ids: string[]
          role_slug: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          card_ids?: string[]
          role_slug?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_lobby_layout_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          aion_actions_reset_at: string | null
          aion_actions_used: number
          aion_config: Json
          autonomous_addon_enabled: boolean
          autonomous_resolution_count: number | null
          billing_status: string
          cancel_at_period_end: boolean
          created_at: string | null
          current_period_end: string | null
          default_balance_due_days_before_event: number
          default_deposit_deadline_days: number
          default_deposit_percent: number
          default_tax_rate: number
          dmarc_status: string | null
          extra_seats: number
          feature_flags: Json
          grace_period_ends_at: string | null
          id: string
          last_payment_failed_at: string | null
          logo_url: string | null
          name: string
          payment_due_days: number
          portal_theme_config: Json
          portal_theme_preset: string
          require_equipment_verification: boolean
          resend_domain_id: string | null
          sending_domain: string | null
          sending_domain_status: string | null
          sending_from_localpart: string | null
          sending_from_name: string | null
          signalpay_enabled: boolean | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_tier:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          timezone: string
          trial_ends_at: string | null
        }
        Insert: {
          aion_actions_reset_at?: string | null
          aion_actions_used?: number
          aion_config?: Json
          autonomous_addon_enabled?: boolean
          autonomous_resolution_count?: number | null
          billing_status?: string
          cancel_at_period_end?: boolean
          created_at?: string | null
          current_period_end?: string | null
          default_balance_due_days_before_event?: number
          default_deposit_deadline_days?: number
          default_deposit_percent?: number
          default_tax_rate?: number
          dmarc_status?: string | null
          extra_seats?: number
          feature_flags?: Json
          grace_period_ends_at?: string | null
          id?: string
          last_payment_failed_at?: string | null
          logo_url?: string | null
          name: string
          payment_due_days?: number
          portal_theme_config?: Json
          portal_theme_preset?: string
          require_equipment_verification?: boolean
          resend_domain_id?: string | null
          sending_domain?: string | null
          sending_domain_status?: string | null
          sending_from_localpart?: string | null
          sending_from_name?: string | null
          signalpay_enabled?: boolean | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_tier?:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          timezone?: string
          trial_ends_at?: string | null
        }
        Update: {
          aion_actions_reset_at?: string | null
          aion_actions_used?: number
          aion_config?: Json
          autonomous_addon_enabled?: boolean
          autonomous_resolution_count?: number | null
          billing_status?: string
          cancel_at_period_end?: boolean
          created_at?: string | null
          current_period_end?: string | null
          default_balance_due_days_before_event?: number
          default_deposit_deadline_days?: number
          default_deposit_percent?: number
          default_tax_rate?: number
          dmarc_status?: string | null
          extra_seats?: number
          feature_flags?: Json
          grace_period_ends_at?: string | null
          id?: string
          last_payment_failed_at?: string | null
          logo_url?: string | null
          name?: string
          payment_due_days?: number
          portal_theme_config?: Json
          portal_theme_preset?: string
          require_equipment_verification?: boolean
          resend_domain_id?: string | null
          sending_domain?: string | null
          sending_domain_status?: string | null
          sending_from_localpart?: string | null
          sending_from_name?: string | null
          signalpay_enabled?: boolean | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_tier?:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          timezone?: string
          trial_ends_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_catalog_item_assignee: {
        Args: {
          p_entity_id: string
          p_package_id: string
          p_role_note?: string
        }
        Returns: string
      }
      add_catalog_role_assignee: {
        Args: { p_package_id: string; p_role_note: string }
        Returns: string
      }
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
      add_roster_member: {
        Args: {
          p_context_data?: Json
          p_org_entity_id: string
          p_person_entity_id: string
        }
        Returns: string
      }
      bulk_approve_pending_equipment: {
        Args: { p_workspace_id: string }
        Returns: number
      }
      check_bridge_pair_rate_limit: {
        Args: { p_client_ip: unknown }
        Returns: boolean
      }
      claim_ghost_entities_for_user: { Args: never; Returns: number }
      claim_ghost_entity_workspace: {
        Args: { p_entity_id: string; p_workspace_id: string }
        Returns: undefined
      }
      cleanup_webauthn_challenges: { Args: never; Returns: number }
      client_check_rate_limit: {
        Args: {
          p_key: string
          p_limit: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          retry_after_seconds: number
        }[]
      }
      client_claim_entity: {
        Args: { p_auth_user_id: string; p_entity_id: string }
        Returns: {
          claimed_at: string
          ok: boolean
          reason: string
        }[]
      }
      client_is_workspace_client: {
        Args: { p_entity_id: string; p_workspace_id: string }
        Returns: boolean
      }
      client_issue_otp_challenge: {
        Args: {
          p_email: string
          p_entity_id: string
          p_ip?: unknown
          p_purpose: string
        }
        Returns: {
          challenge_id: string
          code_raw: string
          expires_at: string
        }[]
      }
      client_log_access: {
        Args: {
          p_action: string
          p_actor_id?: string
          p_actor_kind: string
          p_auth_method?: string
          p_entity_id: string
          p_ip?: unknown
          p_metadata?: Json
          p_outcome: string
          p_request_id?: string
          p_resource_id?: string
          p_resource_type: string
          p_session_id?: string
          p_user_agent?: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      client_lookup_entity_by_email: {
        Args: { p_email_lower: string; p_workspace_hint?: string }
        Returns: {
          entity_id: string
          is_claimed: boolean
          workspace_id: string
        }[]
      }
      client_mint_session_token: {
        Args: {
          p_device_id_hash?: string
          p_entity_id: string
          p_ip?: unknown
          p_source_id: string
          p_source_kind: string
        }
        Returns: {
          expires_at: string
          token_id: string
          token_raw: string
        }[]
      }
      client_portal_rate_limit_prune: { Args: never; Returns: number }
      client_resolve_proposal_entity: {
        Args: { p_public_token: string }
        Returns: {
          client_entity_id: string
          deal_id: string
          event_id: string
          proposal_id: string
          proposal_status: string
          workspace_id: string
        }[]
      }
      client_revoke_all_for_entity: {
        Args: {
          p_entity_id: string
          p_reason?: string
          p_revoked_by: string
          p_workspace_id: string
        }
        Returns: number
      }
      client_revoke_session_token: {
        Args: { p_reason?: string; p_token_hash: string }
        Returns: boolean
      }
      client_revoke_session_token_device: {
        Args: {
          p_entity_id: string
          p_reason?: string
          p_revoked_by: string
          p_session_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      client_rotate_session_token: {
        Args: { p_ip?: unknown; p_token_hash: string; p_user_agent?: string }
        Returns: {
          entity_id: string
          expires_at: string
          ok: boolean
          reason: string
        }[]
      }
      client_songs_add_request: {
        Args: {
          p_apple_music_id?: string
          p_artist: string
          p_artwork_url?: string
          p_duration_ms?: number
          p_entity_id: string
          p_event_id: string
          p_isrc?: string
          p_notes?: string
          p_preview_url?: string
          p_requested_by_label?: string
          p_special_moment_label?: string
          p_spotify_id?: string
          p_tier: string
          p_title: string
        }
        Returns: {
          entry_id: string
          ok: boolean
          reason: string
          requested_at: string
        }[]
      }
      client_songs_delete_request: {
        Args: { p_entity_id: string; p_entry_id: string; p_event_id: string }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      client_songs_update_request: {
        Args: {
          p_entity_id: string
          p_entry_id: string
          p_event_id: string
          p_notes?: string
          p_requested_by_label?: string
          p_special_moment_label?: string
          p_tier?: string
        }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      client_verify_otp: {
        Args: { p_challenge_id: string; p_code: string; p_ip?: unknown }
        Returns: {
          already_claimed: boolean
          email: string
          entity_id: string
          ok: boolean
          purpose: string
          reason: string
        }[]
      }
      complete_onboarding: { Args: never; Returns: boolean }
      compute_client_session_expiry: {
        Args: { p_entity_id: string }
        Returns: string
      }
      count_active_shows: { Args: { p_workspace_id: string }; Returns: number }
      count_team_seats: { Args: { p_workspace_id: string }; Returns: number }
      create_deal_complete: {
        Args: {
          p_client_entity: Json
          p_deal: Json
          p_note?: Json
          p_stakeholder_extras?: Json
          p_venue_entity: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      create_default_location: {
        Args: { p_location_name?: string; p_workspace_id: string }
        Returns: string
      }
      current_entity_id: { Args: never; Returns: string }
      generate_bridge_pairing_code: {
        Args: { p_person_entity_id: string; p_user_id: string }
        Returns: string
      }
      get_active_workspace_id: { Args: never; Returns: string }
      get_catalog_availability: {
        Args: {
          p_date_end: string
          p_date_start: string
          p_workspace_id: string
        }
        Returns: {
          catalog_package_id: string
          deal_id: string
          deal_status: string
          deal_title: string
          proposed_date: string
          quantity_allocated: number
          stock_quantity: number
        }[]
      }
      get_catalog_item_assignees: {
        Args: { p_package_id: string }
        Returns: {
          created_at: string
          entity_id: string
          id: string
          package_id: string
          role_note: string
        }[]
      }
      get_current_org_id: { Args: never; Returns: string }
      get_deal_crew_enriched: {
        Args: { p_deal_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_ghost_entity_by_email: { Args: { p_email: string }; Returns: string }
      get_member_permissions: {
        Args: { p_user_id?: string; p_workspace_id: string }
        Returns: Json
      }
      get_member_role_slug: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      get_my_client_entity_ids: { Args: never; Returns: string[] }
      get_my_entity_id: { Args: never; Returns: string }
      get_my_organization_ids: { Args: never; Returns: string[] }
      get_my_workspace_ids: { Args: never; Returns: string[] }
      get_user_id_by_email: { Args: { user_email: string }; Returns: string }
      get_user_workspace_ids: { Args: never; Returns: string[] }
      get_workspace_seat_limit: {
        Args: { p_workspace_id: string }
        Returns: number
      }
      increment_proposal_view: {
        Args: {
          p_now: string
          p_proposal_id: string
          p_set_first: boolean
          p_was_sent: boolean
        }
        Returns: undefined
      }
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
      merge_industry_tags: {
        Args: { p_from_tag: string; p_to_tag: string; p_workspace_id: string }
        Returns: undefined
      }
      my_org_ids_admin_member: { Args: never; Returns: string[] }
      ops_songs_acknowledge_client_request: {
        Args: {
          p_entry_id: string
          p_event_id: string
          p_moment_label?: string
        }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      ops_songs_promote_client_request: {
        Args: {
          p_assigned_moment_id?: string
          p_entry_id: string
          p_event_id: string
          p_tier: string
        }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      patch_entity_attributes: {
        Args: { p_attributes: Json; p_entity_id: string }
        Returns: undefined
      }
      patch_relationship_context: {
        Args: {
          p_patch: Json
          p_relationship_type: string
          p_source_entity_id: string
          p_target_entity_id: string
        }
        Returns: boolean
      }
      regenerate_invite_code: {
        Args: { p_workspace_id: string }
        Returns: string
      }
      remove_catalog_item_assignee: {
        Args: { p_assignee_id: string }
        Returns: undefined
      }
      remove_relationship: {
        Args: {
          p_relationship_type: string
          p_source_entity_id: string
          p_target_entity_id: string
        }
        Returns: undefined
      }
      review_crew_equipment: {
        Args: {
          p_crew_equipment_id: string
          p_decision: string
          p_rejection_reason?: string
        }
        Returns: undefined
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
      seed_workspace_lead_sources: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      strip_industry_tag: {
        Args: { p_tag: string; p_workspace_id: string }
        Returns: undefined
      }
      unusonic_current_entity_email: { Args: never; Returns: string }
      unusonic_current_entity_id: { Args: never; Returns: string }
      unusonic_org_ids_can_affiliate: { Args: never; Returns: string[] }
      unusonic_org_ids_for_entity: { Args: never; Returns: string[] }
      unusonic_org_ids_where_admin: { Args: never; Returns: string[] }
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
      upsert_relationship: {
        Args: {
          p_context_data?: Json
          p_source_entity_id: string
          p_target_entity_id: string
          p_type: string
        }
        Returns: string
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
      subscription_tier: "foundation" | "growth" | "studio"
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
      subscription_tier: ["foundation", "growth", "studio"],
      task_status: ["inbox", "next", "doing", "waiting", "done", "dropped"],
      user_persona: ["solo_professional", "agency_team", "venue_brand"],
    },
  },
} as const

// =============================================================================
// Convenience aliases — auto-appended by scripts/gen-db-types.js.
// If you regenerate manually via `supabase gen types ...`, the aliases will
// be missing. Use `npm run db:types` to ensure they're present.
//
// These stay in `public` schema because the backing tables are grandfathered
// in public per the CLAUDE.md Legacy & Grandfathered Tables section. They
// will migrate to `finance` in a future project.
// =============================================================================

export type Proposal = Database['public']['Tables']['proposals']['Row'];
export type ProposalItem = Database['public']['Tables']['proposal_items']['Row'];
export type Package = Database['public']['Tables']['packages']['Row'];
export type CueType = Database['public']['Enums']['cue_type'];
export type PaymentMethod = Database['public']['Enums']['payment_method'];
