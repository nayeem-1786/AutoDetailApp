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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
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
      ad_creatives: {
        Row: {
          ad_size: string
          alt_text: string | null
          click_count: number
          created_at: string
          ends_at: string | null
          id: string
          image_url: string
          image_url_mobile: string | null
          impression_count: number
          is_active: boolean
          link_url: string | null
          name: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          ad_size: string
          alt_text?: string | null
          click_count?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url: string
          image_url_mobile?: string | null
          impression_count?: number
          is_active?: boolean
          link_url?: string | null
          name: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          ad_size?: string
          alt_text?: string | null
          click_count?: number
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url?: string
          image_url_mobile?: string | null
          impression_count?: number
          is_active?: boolean
          link_url?: string | null
          name?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ad_events: {
        Row: {
          ad_creative_id: string
          ad_placement_id: string | null
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          page_path: string | null
          zone_id: string | null
        }
        Insert: {
          ad_creative_id: string
          ad_placement_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          page_path?: string | null
          zone_id?: string | null
        }
        Update: {
          ad_creative_id?: string
          ad_placement_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          page_path?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_events_ad_creative_id_fkey"
            columns: ["ad_creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_events_ad_placement_id_fkey"
            columns: ["ad_placement_id"]
            isOneToOne: false
            referencedRelation: "ad_placements"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_placements: {
        Row: {
          ad_creative_id: string
          created_at: string
          device: string
          id: string
          is_active: boolean
          page_path: string
          priority: number
          updated_at: string
          zone_id: string
        }
        Insert: {
          ad_creative_id: string
          created_at?: string
          device?: string
          id?: string
          is_active?: boolean
          page_path: string
          priority?: number
          updated_at?: string
          zone_id: string
        }
        Update: {
          ad_creative_id?: string
          created_at?: string
          device?: string
          id?: string
          is_active?: boolean
          page_path?: string
          priority?: number
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_placements_ad_creative_id_fkey"
            columns: ["ad_creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_tickers: {
        Row: {
          bg_color: string | null
          created_at: string
          ends_at: string | null
          font_size: string | null
          id: string
          is_active: boolean
          link_text: string | null
          link_url: string | null
          message: string
          message_gap: number
          placement: string
          scroll_speed: string | null
          scroll_speed_value: number | null
          section_position: string | null
          sort_order: number
          starts_at: string | null
          target_pages: Json | null
          text_color: string | null
          updated_at: string
        }
        Insert: {
          bg_color?: string | null
          created_at?: string
          ends_at?: string | null
          font_size?: string | null
          id?: string
          is_active?: boolean
          link_text?: string | null
          link_url?: string | null
          message: string
          message_gap?: number
          placement?: string
          scroll_speed?: string | null
          scroll_speed_value?: number | null
          section_position?: string | null
          sort_order?: number
          starts_at?: string | null
          target_pages?: Json | null
          text_color?: string | null
          updated_at?: string
        }
        Update: {
          bg_color?: string | null
          created_at?: string
          ends_at?: string | null
          font_size?: string | null
          id?: string
          is_active?: boolean
          link_text?: string | null
          link_url?: string | null
          message?: string
          message_gap?: number
          placement?: string
          scroll_speed?: string | null
          scroll_speed_value?: number | null
          section_position?: string | null
          sort_order?: number
          starts_at?: string | null
          target_pages?: Json | null
          text_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      appointment_services: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          price_at_booking: number
          service_id: string
          tier_name: string | null
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          price_at_booking: number
          service_id: string
          tier_name?: string | null
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          price_at_booking?: number
          service_id?: string
          tier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          actual_end_time: string | null
          actual_start_time: string | null
          cancellation_fee: number | null
          cancellation_reason: string | null
          channel: Database["public"]["Enums"]["appointment_channel"]
          coupon_code: string | null
          coupon_discount: number | null
          created_at: string
          customer_id: string
          deposit_amount: number | null
          discount_amount: number
          employee_id: string | null
          id: string
          internal_notes: string | null
          is_mobile: boolean
          job_notes: string | null
          mobile_address: string | null
          mobile_surcharge: number | null
          mobile_zone_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          payment_type: string | null
          reminder_sent_at: string | null
          scheduled_date: string
          scheduled_end_time: string
          scheduled_start_time: string
          status: Database["public"]["Enums"]["appointment_status"]
          stripe_payment_intent_id: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          channel?: Database["public"]["Enums"]["appointment_channel"]
          coupon_code?: string | null
          coupon_discount?: number | null
          created_at?: string
          customer_id: string
          deposit_amount?: number | null
          discount_amount?: number
          employee_id?: string | null
          id?: string
          internal_notes?: string | null
          is_mobile?: boolean
          job_notes?: string | null
          mobile_address?: string | null
          mobile_surcharge?: number | null
          mobile_zone_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_type?: string | null
          reminder_sent_at?: string | null
          scheduled_date: string
          scheduled_end_time: string
          scheduled_start_time: string
          status?: Database["public"]["Enums"]["appointment_status"]
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          cancellation_fee?: number | null
          cancellation_reason?: string | null
          channel?: Database["public"]["Enums"]["appointment_channel"]
          coupon_code?: string | null
          coupon_discount?: number | null
          created_at?: string
          customer_id?: string
          deposit_amount?: number | null
          discount_amount?: number
          employee_id?: string | null
          id?: string
          internal_notes?: string | null
          is_mobile?: boolean
          job_notes?: string | null
          mobile_address?: string | null
          mobile_surcharge?: number | null
          mobile_zone_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_type?: string | null
          reminder_sent_at?: string | null
          scheduled_date?: string
          scheduled_end_time?: string
          scheduled_start_time?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_mobile_zone_id_fkey"
            columns: ["mobile_zone_id"]
            isOneToOne: false
            referencedRelation: "mobile_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          employee_name: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          ip_address: string | null
          source: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          employee_name?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          source?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          employee_name?: string | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          source?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      blocked_dates: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          employee_id: string | null
          id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          employee_id?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          employee_id?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_dates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_dates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          channel: Database["public"]["Enums"]["campaign_channel"]
          clicked_at: string | null
          coupon_code: string | null
          created_at: string
          customer_id: string
          delivered: boolean
          id: string
          mailgun_message_id: string | null
          opened_at: string | null
          sent_at: string
          variant_id: string | null
        }
        Insert: {
          campaign_id: string
          channel: Database["public"]["Enums"]["campaign_channel"]
          clicked_at?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id: string
          delivered?: boolean
          id?: string
          mailgun_message_id?: string | null
          opened_at?: string | null
          sent_at?: string
          variant_id?: string | null
        }
        Update: {
          campaign_id?: string
          channel?: Database["public"]["Enums"]["campaign_channel"]
          clicked_at?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string
          delivered?: boolean
          id?: string
          mailgun_message_id?: string | null
          opened_at?: string | null
          sent_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "campaign_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_variants: {
        Row: {
          campaign_id: string
          created_at: string | null
          email_subject: string | null
          id: string
          is_winner: boolean | null
          message_body: string
          split_percentage: number
          variant_label: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          email_subject?: string | null
          id?: string
          is_winner?: boolean | null
          message_body: string
          split_percentage?: number
          variant_label?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          email_subject?: string | null
          id?: string
          is_winner?: boolean | null
          message_body?: string
          split_percentage?: number
          variant_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_variants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filters: Json
          auto_select_after_hours: number | null
          auto_select_winner: boolean | null
          channel: Database["public"]["Enums"]["campaign_channel"]
          clicked_count: number
          coupon_id: string | null
          created_at: string
          created_by: string | null
          delivered_count: number
          description: string | null
          email_body_blocks: Json | null
          email_layout_id: string | null
          email_preview_text: string | null
          email_subject: string | null
          email_template: string | null
          id: string
          name: string
          opened_count: number
          recipient_count: number
          redeemed_count: number
          revenue_attributed: number
          scheduled_at: string | null
          sent_at: string | null
          sms_template: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          audience_filters?: Json
          auto_select_after_hours?: number | null
          auto_select_winner?: boolean | null
          channel?: Database["public"]["Enums"]["campaign_channel"]
          clicked_count?: number
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          email_body_blocks?: Json | null
          email_layout_id?: string | null
          email_preview_text?: string | null
          email_subject?: string | null
          email_template?: string | null
          id?: string
          name: string
          opened_count?: number
          recipient_count?: number
          redeemed_count?: number
          revenue_attributed?: number
          scheduled_at?: string | null
          sent_at?: string | null
          sms_template?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          audience_filters?: Json
          auto_select_after_hours?: number | null
          auto_select_winner?: boolean | null
          channel?: Database["public"]["Enums"]["campaign_channel"]
          clicked_count?: number
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          email_body_blocks?: Json | null
          email_layout_id?: string | null
          email_preview_text?: string | null
          email_subject?: string | null
          email_template?: string | null
          id?: string
          name?: string
          opened_count?: number
          recipient_count?: number
          redeemed_count?: number
          revenue_attributed?: number
          scheduled_at?: string | null
          sent_at?: string | null
          sms_template?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_email_layout_id_fkey"
            columns: ["email_layout_id"]
            isOneToOne: false
            referencedRelation: "email_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_drawers: {
        Row: {
          cash_refunds: number | null
          cash_sales: number | null
          cash_tips: number | null
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          created_at: string
          deposit_amount: number | null
          expected_cash: number | null
          id: string
          next_day_float: number | null
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_amount: number
          total_refunds: number | null
          total_revenue: number | null
          total_tax: number | null
          total_tips: number | null
          total_transactions: number | null
          updated_at: string
          variance: number | null
        }
        Insert: {
          cash_refunds?: number | null
          cash_sales?: number | null
          cash_tips?: number | null
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          created_at?: string
          deposit_amount?: number | null
          expected_cash?: number | null
          id?: string
          next_day_float?: number | null
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          total_refunds?: number | null
          total_revenue?: number | null
          total_tax?: number | null
          total_tips?: number | null
          total_transactions?: number | null
          updated_at?: string
          variance?: number | null
        }
        Update: {
          cash_refunds?: number | null
          cash_sales?: number | null
          cash_tips?: number | null
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          created_at?: string
          deposit_amount?: number | null
          expected_cash?: number | null
          id?: string
          next_day_float?: number | null
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_amount?: number
          total_refunds?: number | null
          total_revenue?: number | null
          total_tax?: number | null
          total_tips?: number | null
          total_transactions?: number | null
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawers_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      city_landing_pages: {
        Row: {
          body_content: string | null
          city_name: string
          created_at: string
          distance_miles: number | null
          focus_keywords: string | null
          heading: string | null
          id: string
          intro_text: string | null
          is_active: boolean
          local_landmarks: string | null
          meta_description: string | null
          meta_title: string | null
          service_highlights: Json | null
          slug: string
          sort_order: number
          state: string
          updated_at: string
        }
        Insert: {
          body_content?: string | null
          city_name: string
          created_at?: string
          distance_miles?: number | null
          focus_keywords?: string | null
          heading?: string | null
          id?: string
          intro_text?: string | null
          is_active?: boolean
          local_landmarks?: string | null
          meta_description?: string | null
          meta_title?: string | null
          service_highlights?: Json | null
          slug: string
          sort_order?: number
          state?: string
          updated_at?: string
        }
        Update: {
          body_content?: string | null
          city_name?: string
          created_at?: string
          distance_miles?: number | null
          focus_keywords?: string | null
          heading?: string | null
          id?: string
          intro_text?: string | null
          is_active?: boolean
          local_landmarks?: string | null
          meta_description?: string | null
          meta_title?: string | null
          service_highlights?: Json | null
          slug?: string
          sort_order?: number
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_to: string | null
          created_at: string
          customer_id: string | null
          id: string
          is_ai_enabled: boolean
          last_channel: string
          last_message_at: string | null
          last_message_preview: string | null
          last_notification_at: string | null
          last_notification_type: string | null
          phone_number: string
          status: string
          summary: string | null
          summary_updated_at: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_ai_enabled?: boolean
          last_channel?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_notification_at?: string | null
          last_notification_type?: string | null
          phone_number: string
          status?: string
          summary?: string | null
          summary_updated_at?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_ai_enabled?: boolean
          last_channel?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_notification_at?: string | null
          last_notification_type?: string | null
          phone_number?: string
          status?: string
          summary?: string | null
          summary_updated_at?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_rewards: {
        Row: {
          applies_to: string
          coupon_id: string
          created_at: string
          discount_type: string
          discount_value: number
          id: string
          max_discount: number | null
          target_product_category_id: string | null
          target_product_id: string | null
          target_service_category_id: string | null
          target_service_id: string | null
        }
        Insert: {
          applies_to: string
          coupon_id: string
          created_at?: string
          discount_type: string
          discount_value?: number
          id?: string
          max_discount?: number | null
          target_product_category_id?: string | null
          target_product_id?: string | null
          target_service_category_id?: string | null
          target_service_id?: string | null
        }
        Update: {
          applies_to?: string
          coupon_id?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          max_discount?: number | null
          target_product_category_id?: string | null
          target_product_id?: string | null
          target_service_category_id?: string | null
          target_service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_rewards_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_rewards_target_product_category_id_fkey"
            columns: ["target_product_category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_rewards_target_product_id_fkey"
            columns: ["target_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_rewards_target_service_category_id_fkey"
            columns: ["target_service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_rewards_target_service_id_fkey"
            columns: ["target_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          auto_apply: boolean
          campaign_id: string | null
          code: string
          combinable_with_sales: boolean
          condition_logic: string
          created_at: string
          customer_id: string | null
          customer_tags: string[] | null
          expires_at: string | null
          id: string
          is_single_use: boolean
          max_customer_visits: number | null
          max_uses: number | null
          min_purchase: number | null
          name: string | null
          requires_product_category_ids: string[] | null
          requires_product_ids: string[] | null
          requires_service_category_ids: string[] | null
          requires_service_ids: string[] | null
          status: Database["public"]["Enums"]["coupon_status"]
          summary: string | null
          tag_match_mode: string
          target_customer_type: string | null
          updated_at: string
          use_count: number
        }
        Insert: {
          auto_apply?: boolean
          campaign_id?: string | null
          code: string
          combinable_with_sales?: boolean
          condition_logic?: string
          created_at?: string
          customer_id?: string | null
          customer_tags?: string[] | null
          expires_at?: string | null
          id?: string
          is_single_use?: boolean
          max_customer_visits?: number | null
          max_uses?: number | null
          min_purchase?: number | null
          name?: string | null
          requires_product_category_ids?: string[] | null
          requires_product_ids?: string[] | null
          requires_service_category_ids?: string[] | null
          requires_service_ids?: string[] | null
          status?: Database["public"]["Enums"]["coupon_status"]
          summary?: string | null
          tag_match_mode?: string
          target_customer_type?: string | null
          updated_at?: string
          use_count?: number
        }
        Update: {
          auto_apply?: boolean
          campaign_id?: string | null
          code?: string
          combinable_with_sales?: boolean
          condition_logic?: string
          created_at?: string
          customer_id?: string | null
          customer_tags?: string[] | null
          expires_at?: string | null
          id?: string
          is_single_use?: boolean
          max_customer_visits?: number | null
          max_uses?: number | null
          min_purchase?: number | null
          name?: string | null
          requires_product_category_ids?: string[] | null
          requires_product_ids?: string[] | null
          requires_service_category_ids?: string[] | null
          requires_service_ids?: string[] | null
          status?: Database["public"]["Enums"]["coupon_status"]
          summary?: string | null
          tag_match_mode?: string
          target_customer_type?: string | null
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_coupons_campaign"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_payment_methods: {
        Row: {
          card_brand: string | null
          card_fingerprint: string
          card_last_four: string | null
          created_at: string
          customer_id: string
          id: string
          updated_at: string
        }
        Insert: {
          card_brand?: string | null
          card_fingerprint: string
          card_last_four?: string | null
          created_at?: string
          customer_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          card_brand?: string | null
          card_fingerprint?: string
          card_last_four?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_methods_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          auth_user_id: string | null
          city: string | null
          created_at: string
          customer_type: string | null
          deactivated_auth_user_id: string | null
          deleted_at: string | null
          email: string | null
          email_consent: boolean
          email_prompt_dismissed_at: string | null
          email_verified_at: string | null
          first_name: string
          first_visit_date: string | null
          id: string
          last_name: string
          last_visit_date: string | null
          lifetime_spend: number
          loyalty_points_balance: number
          mobile_2: string | null
          notes: string | null
          notify_loyalty: boolean
          notify_promotions: boolean
          phone: string | null
          qbo_id: string | null
          qbo_synced_at: string | null
          sms_consent: boolean
          square_customer_id: string | null
          square_reference_id: string | null
          state: string | null
          tags: Json
          updated_at: string
          visit_count: number
          zip: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          auth_user_id?: string | null
          city?: string | null
          created_at?: string
          customer_type?: string | null
          deactivated_auth_user_id?: string | null
          deleted_at?: string | null
          email?: string | null
          email_consent?: boolean
          email_prompt_dismissed_at?: string | null
          email_verified_at?: string | null
          first_name: string
          first_visit_date?: string | null
          id?: string
          last_name: string
          last_visit_date?: string | null
          lifetime_spend?: number
          loyalty_points_balance?: number
          mobile_2?: string | null
          notes?: string | null
          notify_loyalty?: boolean
          notify_promotions?: boolean
          phone?: string | null
          qbo_id?: string | null
          qbo_synced_at?: string | null
          sms_consent?: boolean
          square_customer_id?: string | null
          square_reference_id?: string | null
          state?: string | null
          tags?: Json
          updated_at?: string
          visit_count?: number
          zip?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          auth_user_id?: string | null
          city?: string | null
          created_at?: string
          customer_type?: string | null
          deactivated_auth_user_id?: string | null
          deleted_at?: string | null
          email?: string | null
          email_consent?: boolean
          email_prompt_dismissed_at?: string | null
          email_verified_at?: string | null
          first_name?: string
          first_visit_date?: string | null
          id?: string
          last_name?: string
          last_visit_date?: string | null
          lifetime_spend?: number
          loyalty_points_balance?: number
          mobile_2?: string | null
          notes?: string | null
          notify_loyalty?: boolean
          notify_promotions?: boolean
          phone?: string | null
          qbo_id?: string | null
          qbo_synced_at?: string | null
          sms_consent?: boolean
          square_customer_id?: string | null
          square_reference_id?: string | null
          state?: string | null
          tags?: Json
          updated_at?: string
          visit_count?: number
          zip?: string | null
        }
        Relationships: []
      }
      drip_enrollments: {
        Row: {
          created_at: string
          current_step: number
          customer_id: string
          enrolled_at: string
          id: string
          next_send_at: string | null
          nurture_transferred: boolean
          sequence_id: string
          status: string
          stopped_at: string | null
          stopped_reason: string | null
        }
        Insert: {
          created_at?: string
          current_step?: number
          customer_id: string
          enrolled_at?: string
          id?: string
          next_send_at?: string | null
          nurture_transferred?: boolean
          sequence_id: string
          status: string
          stopped_at?: string | null
          stopped_reason?: string | null
        }
        Update: {
          created_at?: string
          current_step?: number
          customer_id?: string
          enrolled_at?: string
          id?: string
          next_send_at?: string | null
          nurture_transferred?: boolean
          sequence_id?: string
          status?: string
          stopped_at?: string | null
          stopped_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drip_enrollments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drip_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "drip_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      drip_send_log: {
        Row: {
          channel: string
          coupon_code: string | null
          enrollment_id: string
          error_message: string | null
          id: string
          mailgun_message_id: string | null
          sent_at: string
          status: string
          step_id: string
          step_order: number
        }
        Insert: {
          channel: string
          coupon_code?: string | null
          enrollment_id: string
          error_message?: string | null
          id?: string
          mailgun_message_id?: string | null
          sent_at?: string
          status: string
          step_id: string
          step_order: number
        }
        Update: {
          channel?: string
          coupon_code?: string | null
          enrollment_id?: string
          error_message?: string | null
          id?: string
          mailgun_message_id?: string | null
          sent_at?: string
          status?: string
          step_id?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "drip_send_log_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "drip_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drip_send_log_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "drip_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      drip_sequences: {
        Row: {
          audience_filters: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          nurture_sequence_id: string | null
          stop_conditions: Json
          trigger_condition: string
          trigger_value: Json | null
          updated_at: string
        }
        Insert: {
          audience_filters?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          nurture_sequence_id?: string | null
          stop_conditions?: Json
          trigger_condition: string
          trigger_value?: Json | null
          updated_at?: string
        }
        Update: {
          audience_filters?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          nurture_sequence_id?: string | null
          stop_conditions?: Json
          trigger_condition?: string
          trigger_value?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drip_sequences_nurture_sequence_id_fkey"
            columns: ["nurture_sequence_id"]
            isOneToOne: false
            referencedRelation: "drip_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      drip_steps: {
        Row: {
          channel: string
          coupon_id: string | null
          created_at: string
          delay_days: number
          delay_hours: number
          exit_action: string | null
          exit_condition: string | null
          exit_sequence_id: string | null
          exit_tag: string | null
          id: string
          is_active: boolean
          sequence_id: string
          sms_template: string | null
          step_order: number
          subject_override: string | null
          template_id: string | null
        }
        Insert: {
          channel: string
          coupon_id?: string | null
          created_at?: string
          delay_days: number
          delay_hours?: number
          exit_action?: string | null
          exit_condition?: string | null
          exit_sequence_id?: string | null
          exit_tag?: string | null
          id?: string
          is_active?: boolean
          sequence_id: string
          sms_template?: string | null
          step_order: number
          subject_override?: string | null
          template_id?: string | null
        }
        Update: {
          channel?: string
          coupon_id?: string | null
          created_at?: string
          delay_days?: number
          delay_hours?: number
          exit_action?: string | null
          exit_condition?: string | null
          exit_sequence_id?: string | null
          exit_tag?: string | null
          id?: string
          is_active?: boolean
          sequence_id?: string
          sms_template?: string | null
          step_order?: number
          subject_override?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drip_steps_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drip_steps_exit_sequence_id_fkey"
            columns: ["exit_sequence_id"]
            isOneToOne: false
            referencedRelation: "drip_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drip_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "drip_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drip_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_log: {
        Row: {
          campaign_id: string | null
          click_url: string | null
          created_at: string | null
          customer_id: string | null
          error_code: string | null
          error_message: string | null
          event: string
          from_email: string
          id: string
          mailgun_message_id: string | null
          subject: string | null
          to_email: string
        }
        Insert: {
          campaign_id?: string | null
          click_url?: string | null
          created_at?: string | null
          customer_id?: string | null
          error_code?: string | null
          error_message?: string | null
          event: string
          from_email: string
          id?: string
          mailgun_message_id?: string | null
          subject?: string | null
          to_email: string
        }
        Update: {
          campaign_id?: string | null
          click_url?: string | null
          created_at?: string | null
          customer_id?: string | null
          error_code?: string | null
          error_message?: string | null
          event?: string
          from_email?: string
          id?: string
          mailgun_message_id?: string | null
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_delivery_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_layouts: {
        Row: {
          color_overrides: Json
          created_at: string
          description: string | null
          footer_config: Json
          header_config: Json
          id: string
          is_default: boolean
          name: string
          slug: string
          structure_html: string
          updated_at: string
        }
        Insert: {
          color_overrides?: Json
          created_at?: string
          description?: string | null
          footer_config?: Json
          header_config?: Json
          id?: string
          is_default?: boolean
          name: string
          slug: string
          structure_html: string
          updated_at?: string
        }
        Update: {
          color_overrides?: Json
          created_at?: string
          description?: string | null
          footer_config?: Json
          header_config?: Json
          id?: string
          is_default?: boolean
          name?: string
          slug?: string
          structure_html?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_template_assignments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          priority: number
          segment_filter: Json | null
          template_id: string
          trigger_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          segment_filter?: Json | null
          template_id: string
          trigger_key: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          segment_filter?: Json | null
          template_id?: string
          trigger_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_template_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_blocks: Json
          body_html: string | null
          category: string
          coupon_id: string | null
          created_at: string
          id: string
          is_customized: boolean
          is_system: boolean
          layout_id: string
          name: string
          preview_text: string
          segment_tag: string | null
          subject: string
          template_key: string | null
          updated_at: string
          updated_by: string | null
          variables: Json
          version: number
        }
        Insert: {
          body_blocks?: Json
          body_html?: string | null
          category: string
          coupon_id?: string | null
          created_at?: string
          id?: string
          is_customized?: boolean
          is_system?: boolean
          layout_id: string
          name: string
          preview_text?: string
          segment_tag?: string | null
          subject: string
          template_key?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: Json
          version?: number
        }
        Update: {
          body_blocks?: Json
          body_html?: string | null
          category?: string
          coupon_id?: string | null
          created_at?: string
          id?: string
          is_customized?: boolean
          is_system?: boolean
          layout_id?: string
          name?: string
          preview_text?: string
          segment_tag?: string | null
          subject?: string
          template_key?: string | null
          updated_at?: string
          updated_by?: string | null
          variables?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "email_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verification_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          customer_id: string
          email: string
          expires_at: string
          id: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          customer_id: string
          email: string
          expires_at: string
          id?: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          customer_id?: string
          email?: string
          expires_at?: string
          id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_verification_codes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_schedules: {
        Row: {
          created_at: string
          day_of_week: number
          employee_id: string
          end_time: string
          id: string
          is_available: boolean
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          employee_id: string
          end_time: string
          id?: string
          is_available?: boolean
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          employee_id?: string
          end_time?: string
          id?: string
          is_available?: boolean
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          bookable_for_appointments: boolean
          created_at: string
          email: string
          first_name: string
          hourly_rate: number | null
          id: string
          last_name: string
          phone: string | null
          pin_code: string | null
          role: Database["public"]["Enums"]["user_role"]
          role_id: string
          square_employee_id: string | null
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          bookable_for_appointments?: boolean
          created_at?: string
          email: string
          first_name: string
          hourly_rate?: number | null
          id?: string
          last_name: string
          phone?: string | null
          pin_code?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          role_id: string
          square_employee_id?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          bookable_for_appointments?: boolean
          created_at?: string
          email?: string
          first_name?: string
          hourly_rate?: number | null
          id?: string
          last_name?: string
          phone?: string | null
          pin_code?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          role_id?: string
          square_employee_id?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_batches: {
        Row: {
          anthropic_batch_id: string
          completed_at: string | null
          created_at: string
          errored: number
          id: string
          status: string
          succeeded: number
          total_requests: number
        }
        Insert: {
          anthropic_batch_id: string
          completed_at?: string | null
          created_at?: string
          errored?: number
          id?: string
          status?: string
          succeeded?: number
          total_requests?: number
        }
        Update: {
          anthropic_batch_id?: string
          completed_at?: string | null
          created_at?: string
          errored?: number
          id?: string
          status?: string
          succeeded?: number
          total_requests?: number
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          category: string | null
          config: Json
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          key: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          config?: Json
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          key?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      footer_bottom_links: {
        Row: {
          created_at: string | null
          id: string
          is_enabled: boolean | null
          label: string
          open_in_new_tab: boolean | null
          sort_order: number | null
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          label: string
          open_in_new_tab?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          label?: string
          open_in_new_tab?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
          url?: string
        }
        Relationships: []
      }
      footer_columns: {
        Row: {
          config: Json | null
          content_type: string
          created_at: string | null
          html_content: string | null
          id: string
          is_enabled: boolean | null
          section_id: string
          sort_order: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          content_type?: string
          created_at?: string | null
          html_content?: string | null
          id?: string
          is_enabled?: boolean | null
          section_id: string
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          content_type?: string
          created_at?: string | null
          html_content?: string | null
          id?: string
          is_enabled?: boolean | null
          section_id?: string
          sort_order?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "footer_columns_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "footer_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      footer_sections: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          label: string
          section_key: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          label: string
          section_key: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          label?: string
          section_key?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      hero_slides: {
        Row: {
          accent_color: string | null
          after_image_url: string | null
          after_label: string | null
          before_image_url: string | null
          before_label: string | null
          content_type: string
          created_at: string
          cta_bg_color: string | null
          cta_text: string | null
          cta_text_color: string | null
          cta_url: string | null
          id: string
          image_alt: string | null
          image_url: string | null
          image_url_mobile: string | null
          is_active: boolean
          overlay_color: string | null
          overlay_opacity: number | null
          sort_order: number
          subtitle: string | null
          subtitle_color: string | null
          text_alignment: string | null
          text_color: string | null
          title: string | null
          updated_at: string
          video_thumbnail_url: string | null
          video_url: string | null
        }
        Insert: {
          accent_color?: string | null
          after_image_url?: string | null
          after_label?: string | null
          before_image_url?: string | null
          before_label?: string | null
          content_type?: string
          created_at?: string
          cta_bg_color?: string | null
          cta_text?: string | null
          cta_text_color?: string | null
          cta_url?: string | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          image_url_mobile?: string | null
          is_active?: boolean
          overlay_color?: string | null
          overlay_opacity?: number | null
          sort_order?: number
          subtitle?: string | null
          subtitle_color?: string | null
          text_alignment?: string | null
          text_color?: string | null
          title?: string | null
          updated_at?: string
          video_thumbnail_url?: string | null
          video_url?: string | null
        }
        Update: {
          accent_color?: string | null
          after_image_url?: string | null
          after_label?: string | null
          before_image_url?: string | null
          before_label?: string | null
          content_type?: string
          created_at?: string
          cta_bg_color?: string | null
          cta_text?: string | null
          cta_text_color?: string | null
          cta_url?: string | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          image_url_mobile?: string | null
          is_active?: boolean
          overlay_color?: string | null
          overlay_opacity?: number | null
          sort_order?: number
          subtitle?: string | null
          subtitle_color?: string | null
          text_alignment?: string | null
          text_color?: string | null
          title?: string | null
          updated_at?: string
          video_thumbnail_url?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string
          key: string
          response: Json
          status_code: number
        }
        Insert: {
          created_at?: string
          key: string
          response: Json
          status_code?: number
        }
        Update: {
          created_at?: string
          key?: string
          response?: Json
          status_code?: number
        }
        Relationships: []
      }
      job_addons: {
        Row: {
          authorization_token: string
          created_at: string
          created_by: string | null
          custom_description: string | null
          customer_notified_via: string[] | null
          discount_amount: number
          expires_at: string | null
          id: string
          issue_description: string | null
          issue_type: string | null
          job_id: string
          message_to_customer: string | null
          photo_ids: string[] | null
          pickup_delay_minutes: number | null
          price: number
          product_id: string | null
          responded_at: string | null
          sent_at: string | null
          service_id: string | null
          status: string
        }
        Insert: {
          authorization_token: string
          created_at?: string
          created_by?: string | null
          custom_description?: string | null
          customer_notified_via?: string[] | null
          discount_amount?: number
          expires_at?: string | null
          id?: string
          issue_description?: string | null
          issue_type?: string | null
          job_id: string
          message_to_customer?: string | null
          photo_ids?: string[] | null
          pickup_delay_minutes?: number | null
          price: number
          product_id?: string | null
          responded_at?: string | null
          sent_at?: string | null
          service_id?: string | null
          status?: string
        }
        Update: {
          authorization_token?: string
          created_at?: string
          created_by?: string | null
          custom_description?: string | null
          customer_notified_via?: string[] | null
          discount_amount?: number
          expires_at?: string | null
          id?: string
          issue_description?: string | null
          issue_type?: string | null
          job_id?: string
          message_to_customer?: string | null
          photo_ids?: string[] | null
          pickup_delay_minutes?: number | null
          price?: number
          product_id?: string | null
          responded_at?: string | null
          sent_at?: string | null
          service_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_addons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_addons_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_addons_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_addons_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          annotation_data: Json | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string
          is_featured: boolean
          is_internal: boolean
          job_id: string
          notes: string | null
          phase: string
          sort_order: number
          storage_path: string
          tags: string[]
          thumbnail_url: string | null
          zone: string
        }
        Insert: {
          annotation_data?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url: string
          is_featured?: boolean
          is_internal?: boolean
          job_id: string
          notes?: string | null
          phase: string
          sort_order?: number
          storage_path: string
          tags?: string[]
          thumbnail_url?: string | null
          zone: string
        }
        Update: {
          annotation_data?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string
          is_featured?: boolean
          is_internal?: boolean
          job_id?: string
          notes?: string | null
          phase?: string
          sort_order?: number
          storage_path?: string
          tags?: string[]
          thumbnail_url?: string | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          actual_pickup_at: string | null
          appointment_id: string | null
          assigned_staff_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          estimated_pickup_at: string | null
          gallery_token: string | null
          id: string
          intake_completed_at: string | null
          intake_notes: string | null
          intake_started_at: string | null
          pickup_notes: string | null
          quote_id: string | null
          services: Json
          status: string
          timer_paused_at: string | null
          timer_seconds: number
          transaction_id: string | null
          updated_at: string
          vehicle_id: string | null
          work_completed_at: string | null
          work_started_at: string | null
        }
        Insert: {
          actual_pickup_at?: string | null
          appointment_id?: string | null
          assigned_staff_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          estimated_pickup_at?: string | null
          gallery_token?: string | null
          id?: string
          intake_completed_at?: string | null
          intake_notes?: string | null
          intake_started_at?: string | null
          pickup_notes?: string | null
          quote_id?: string | null
          services?: Json
          status?: string
          timer_paused_at?: string | null
          timer_seconds?: number
          transaction_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_completed_at?: string | null
          work_started_at?: string | null
        }
        Update: {
          actual_pickup_at?: string | null
          appointment_id?: string | null
          assigned_staff_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          estimated_pickup_at?: string | null
          gallery_token?: string | null
          id?: string
          intake_completed_at?: string | null
          intake_notes?: string | null
          intake_started_at?: string | null
          pickup_notes?: string | null
          quote_id?: string | null
          services?: Json
          status?: string
          timer_paused_at?: string | null
          timer_seconds?: number
          transaction_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
          work_completed_at?: string | null
          work_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_executions: {
        Row: {
          appointment_id: string | null
          created_at: string
          customer_id: string
          error_message: string | null
          executed_at: string | null
          id: string
          job_id: string | null
          lifecycle_rule_id: string
          quote_id: string | null
          scheduled_for: string
          status: string
          transaction_id: string | null
          trigger_event: string
          triggered_at: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          customer_id: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          job_id?: string | null
          lifecycle_rule_id: string
          quote_id?: string | null
          scheduled_for: string
          status?: string
          transaction_id?: string | null
          trigger_event: string
          triggered_at: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          customer_id?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          job_id?: string | null
          lifecycle_rule_id?: string
          quote_id?: string | null
          scheduled_for?: string
          status?: string
          transaction_id?: string | null
          trigger_event?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_executions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_executions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_executions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_executions_lifecycle_rule_id_fkey"
            columns: ["lifecycle_rule_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_executions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_executions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_rules: {
        Row: {
          action: Database["public"]["Enums"]["lifecycle_action"]
          chain_order: number
          coupon_expiry_days: number | null
          coupon_id: string | null
          coupon_type: string | null
          coupon_value: number | null
          created_at: string
          delay_days: number
          delay_minutes: number
          description: string | null
          email_subject: string | null
          email_template: string | null
          email_template_id: string | null
          id: string
          is_active: boolean
          is_vehicle_aware: boolean
          name: string
          sms_template: string | null
          trigger_condition: string
          trigger_service_id: string | null
          updated_at: string
        }
        Insert: {
          action?: Database["public"]["Enums"]["lifecycle_action"]
          chain_order?: number
          coupon_expiry_days?: number | null
          coupon_id?: string | null
          coupon_type?: string | null
          coupon_value?: number | null
          created_at?: string
          delay_days?: number
          delay_minutes?: number
          description?: string | null
          email_subject?: string | null
          email_template?: string | null
          email_template_id?: string | null
          id?: string
          is_active?: boolean
          is_vehicle_aware?: boolean
          name: string
          sms_template?: string | null
          trigger_condition?: string
          trigger_service_id?: string | null
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["lifecycle_action"]
          chain_order?: number
          coupon_expiry_days?: number | null
          coupon_id?: string | null
          coupon_type?: string | null
          coupon_value?: number | null
          created_at?: string
          delay_days?: number
          delay_minutes?: number
          description?: string | null
          email_subject?: string | null
          email_template?: string | null
          email_template_id?: string | null
          id?: string
          is_active?: boolean
          is_vehicle_aware?: boolean
          name?: string
          sms_template?: string | null
          trigger_condition?: string
          trigger_service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_rules_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_rules_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_rules_trigger_service_id_fkey"
            columns: ["trigger_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      link_clicks: {
        Row: {
          campaign_id: string | null
          clicked_at: string | null
          customer_id: string | null
          id: string
          ip_address: string | null
          lifecycle_execution_id: string | null
          original_url: string
          short_code: string
          source: string
          user_agent: string | null
          variant_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          clicked_at?: string | null
          customer_id?: string | null
          id?: string
          ip_address?: string | null
          lifecycle_execution_id?: string | null
          original_url: string
          short_code: string
          source: string
          user_agent?: string | null
          variant_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          clicked_at?: string | null
          customer_id?: string | null
          id?: string
          ip_address?: string | null
          lifecycle_execution_id?: string | null
          original_url?: string
          short_code?: string
          source?: string
          user_agent?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_clicks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_clicks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_clicks_lifecycle_execution_id_fkey"
            columns: ["lifecycle_execution_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_clicks_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "campaign_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          action: Database["public"]["Enums"]["loyalty_action"]
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          id: string
          points_balance: number
          points_change: number
          transaction_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["loyalty_action"]
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          id?: string
          points_balance: number
          points_change: number
          transaction_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["loyalty_action"]
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          points_balance?: number
          points_change?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_consent_log: {
        Row: {
          action: Database["public"]["Enums"]["consent_action"]
          channel: Database["public"]["Enums"]["consent_channel"]
          created_at: string
          customer_id: string
          id: string
          ip_address: string | null
          recorded_by: string | null
          source: Database["public"]["Enums"]["consent_source"]
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["consent_action"]
          channel: Database["public"]["Enums"]["consent_channel"]
          created_at?: string
          customer_id: string
          id?: string
          ip_address?: string | null
          recorded_by?: string | null
          source: Database["public"]["Enums"]["consent_source"]
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["consent_action"]
          channel?: Database["public"]["Enums"]["consent_channel"]
          created_at?: string
          customer_id?: string
          id?: string
          ip_address?: string | null
          recorded_by?: string | null
          source?: Database["public"]["Enums"]["consent_source"]
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_consent_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_consent_log_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          media_url: string | null
          metadata: Json | null
          sender_type: string
          sent_by: string | null
          status: string
          twilio_sid: string | null
          voice_duration_seconds: number | null
        }
        Insert: {
          body: string
          channel?: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          media_url?: string | null
          metadata?: Json | null
          sender_type: string
          sent_by?: string | null
          status?: string
          twilio_sid?: string | null
          voice_duration_seconds?: number | null
        }
        Update: {
          body?: string
          channel?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          media_url?: string | null
          metadata?: Json | null
          sender_type?: string
          sent_by?: string | null
          status?: string
          twilio_sid?: string | null
          voice_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_zones: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_available: boolean
          max_distance_miles: number
          min_distance_miles: number
          name: string
          surcharge: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_available?: boolean
          max_distance_miles: number
          min_distance_miles?: number
          name: string
          surcharge?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_available?: boolean
          max_distance_miles?: number
          min_distance_miles?: number
          name?: string
          surcharge?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_recipients: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          notification_type: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          notification_type: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          notification_type?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          category_slug: string | null
          created_at: string
          discount_amount: number
          id: string
          line_total: number
          order_id: string
          product_id: string | null
          product_image_url: string | null
          product_name: string
          product_slug: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          category_slug?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          line_total: number
          order_id: string
          product_id?: string | null
          product_image_url?: string | null
          product_name: string
          product_slug?: string | null
          quantity: number
          unit_price: number
        }
        Update: {
          category_slug?: string | null
          created_at?: string
          discount_amount?: number
          id?: string
          line_total?: number
          order_id?: string
          product_id?: string | null
          product_image_url?: string | null
          product_name?: string
          product_slug?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          customer_id: string | null
          customer_notes: string | null
          discount_amount: number
          email: string
          first_name: string
          fulfillment_method: string
          fulfillment_status: string
          id: string
          internal_notes: string | null
          label_url: string | null
          last_name: string
          order_number: string | null
          paid_at: string | null
          payment_status: string
          phone: string | null
          shipping_address_line1: string | null
          shipping_address_line2: string | null
          shipping_amount: number
          shipping_carrier: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_label_created_at: string | null
          shipping_service: string | null
          shipping_state: string | null
          shipping_zip: string | null
          shippo_rate_id: string | null
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          tax_amount: number
          total: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_notes?: string | null
          discount_amount?: number
          email: string
          first_name: string
          fulfillment_method?: string
          fulfillment_status?: string
          id?: string
          internal_notes?: string | null
          label_url?: string | null
          last_name: string
          order_number?: string | null
          paid_at?: string | null
          payment_status?: string
          phone?: string | null
          shipping_address_line1?: string | null
          shipping_address_line2?: string | null
          shipping_amount?: number
          shipping_carrier?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_label_created_at?: string | null
          shipping_service?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          shippo_rate_id?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal: number
          tax_amount?: number
          total: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_notes?: string | null
          discount_amount?: number
          email?: string
          first_name?: string
          fulfillment_method?: string
          fulfillment_status?: string
          id?: string
          internal_notes?: string | null
          label_url?: string | null
          last_name?: string
          order_number?: string | null
          paid_at?: string | null
          payment_status?: string
          phone?: string | null
          shipping_address_line1?: string | null
          shipping_address_line2?: string | null
          shipping_amount?: number
          shipping_carrier?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_label_created_at?: string | null
          shipping_service?: string | null
          shipping_state?: string | null
          shipping_zip?: string | null
          shippo_rate_id?: string | null
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_amount?: number
          total?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      package_services: {
        Row: {
          id: string
          package_id: string
          service_id: string
        }
        Insert: {
          id?: string
          package_id: string
          service_id: string
        }
        Update: {
          id?: string
          package_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_services_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      page_block_placements: {
        Row: {
          block_id: string
          created_at: string
          id: string
          page_path: string
          page_type: string
          sort_order: number
        }
        Insert: {
          block_id: string
          created_at?: string
          id?: string
          page_path: string
          page_type?: string
          sort_order?: number
        }
        Update: {
          block_id?: string
          created_at?: string
          id?: string
          page_path?: string
          page_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "page_block_placements_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "page_content_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      page_content_blocks: {
        Row: {
          ai_generated: boolean
          ai_last_generated_at: string | null
          block_type: string
          content: string
          created_at: string
          global_name: string | null
          id: string
          is_active: boolean
          is_global: boolean
          page_path: string
          page_type: string
          sort_order: number
          title: string | null
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          ai_last_generated_at?: string | null
          block_type?: string
          content: string
          created_at?: string
          global_name?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          page_path: string
          page_type: string
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          ai_last_generated_at?: string | null
          block_type?: string
          content?: string
          created_at?: string
          global_name?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          page_path?: string
          page_type?: string
          sort_order?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      page_revisions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          id: string
          page_id: string
          revision_number: number
          snapshot: Json
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          page_id: string
          revision_number: number
          snapshot: Json
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          page_id?: string
          revision_number?: number
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "page_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      page_seo: {
        Row: {
          canonical_url: string | null
          created_at: string
          focus_keyword: string | null
          id: string
          internal_links: Json | null
          is_auto_generated: boolean
          meta_description: string | null
          meta_keywords: string | null
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          page_path: string
          page_type: string | null
          robots_directive: string | null
          seo_title: string | null
          structured_data_overrides: Json | null
          updated_at: string
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string
          focus_keyword?: string | null
          id?: string
          internal_links?: Json | null
          is_auto_generated?: boolean
          meta_description?: string | null
          meta_keywords?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          page_path: string
          page_type?: string | null
          robots_directive?: string | null
          seo_title?: string | null
          structured_data_overrides?: Json | null
          updated_at?: string
        }
        Update: {
          canonical_url?: string | null
          created_at?: string
          focus_keyword?: string | null
          id?: string
          internal_links?: Json | null
          is_auto_generated?: boolean
          meta_description?: string | null
          meta_keywords?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          page_path?: string
          page_type?: string | null
          robots_directive?: string | null
          seo_title?: string | null
          structured_data_overrides?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          card_brand: string | null
          card_fingerprint: string | null
          card_last_four: string | null
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          tip_amount: number
          tip_net: number
          transaction_id: string
        }
        Insert: {
          amount: number
          card_brand?: string | null
          card_fingerprint?: string | null
          card_last_four?: string | null
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          tip_amount?: number
          tip_net?: number
          transaction_id: string
        }
        Update: {
          amount?: number
          card_brand?: string | null
          card_fingerprint?: string | null
          card_last_four?: string | null
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          tip_amount?: number
          tip_net?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_definitions: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      permissions: {
        Row: {
          created_at: string
          employee_id: string | null
          granted: boolean
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["user_role"] | null
          role_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          granted?: boolean
          id?: string
          permission_key: string
          role?: Database["public"]["Enums"]["user_role"] | null
          role_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          granted?: boolean
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          role_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          payload: string | null
          processing_at: string | null
          status: string
          transaction_id: string | null
          type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          payload?: string | null
          processing_at?: string | null
          status?: string
          transaction_id?: string | null
          type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          payload?: string | null
          processing_at?: string | null
          status?: string
          transaction_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_enrichment_drafts: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          product_id: string
          short_description: string | null
          source_url: string | null
          specs: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          product_id: string
          short_description?: string | null
          source_url?: string | null
          specs?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          product_id?: string
          short_description?: string | null
          source_url?: string | null
          specs?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_enrichment_drafts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          image_url: string
          is_primary: boolean
          product_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          dimension_unit: string | null
          height: number | null
          id: string
          image_alt: string | null
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          is_loyalty_eligible: boolean
          is_taxable: boolean
          length: number | null
          min_order_qty: number | null
          name: string
          product_group_id: string | null
          qbo_id: string | null
          quantity_on_hand: number
          reorder_threshold: number | null
          retail_price: number
          sale_ends_at: string | null
          sale_price: number | null
          sale_starts_at: string | null
          show_on_website: boolean
          sku: string | null
          slug: string
          specs: Json | null
          square_item_id: string | null
          updated_at: string
          variant_label: string | null
          vendor_id: string | null
          vendor_product_name: string | null
          vendor_sku: string | null
          website_sort_order: number
          weight: number | null
          weight_unit: string | null
          width: number | null
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          dimension_unit?: string | null
          height?: number | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_loyalty_eligible?: boolean
          is_taxable?: boolean
          length?: number | null
          min_order_qty?: number | null
          name: string
          product_group_id?: string | null
          qbo_id?: string | null
          quantity_on_hand?: number
          reorder_threshold?: number | null
          retail_price?: number
          sale_ends_at?: string | null
          sale_price?: number | null
          sale_starts_at?: string | null
          show_on_website?: boolean
          sku?: string | null
          slug: string
          specs?: Json | null
          square_item_id?: string | null
          updated_at?: string
          variant_label?: string | null
          vendor_id?: string | null
          vendor_product_name?: string | null
          vendor_sku?: string | null
          website_sort_order?: number
          weight?: number | null
          weight_unit?: string | null
          width?: number | null
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          dimension_unit?: string | null
          height?: number | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_loyalty_eligible?: boolean
          is_taxable?: boolean
          length?: number | null
          min_order_qty?: number | null
          name?: string
          product_group_id?: string | null
          qbo_id?: string | null
          quantity_on_hand?: number
          reorder_threshold?: number | null
          retail_price?: number
          sale_ends_at?: string | null
          sale_price?: number | null
          sale_starts_at?: string | null
          show_on_website?: boolean
          sku?: string | null
          slug?: string
          specs?: Json | null
          square_item_id?: string | null
          updated_at?: string
          variant_label?: string | null
          vendor_id?: string | null
          vendor_product_name?: string | null
          vendor_sku?: string | null
          website_sort_order?: number
          weight?: number | null
          weight_unit?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          ordered_at: string | null
          po_number: string
          received_at: string | null
          status: Database["public"]["Enums"]["po_status"]
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          po_number: string
          received_at?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          po_number?: string
          received_at?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      qbo_sync_log: {
        Row: {
          action: string
          created_at: string | null
          duration_ms: number | null
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          qbo_id: string | null
          request_payload: Json | null
          response_payload: Json | null
          source: string | null
          status: string
        }
        Insert: {
          action: string
          created_at?: string | null
          duration_ms?: number | null
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          qbo_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          source?: string | null
          status?: string
        }
        Update: {
          action?: string
          created_at?: string | null
          duration_ms?: number | null
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          qbo_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          source?: string | null
          status?: string
        }
        Relationships: []
      }
      quote_activities: {
        Row: {
          activity_type: string
          created_at: string | null
          employee_id: string | null
          id: string
          notes: string | null
          outcome: string
          quote_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          employee_id?: string | null
          id?: string
          notes?: string | null
          outcome: string
          quote_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          employee_id?: string | null
          id?: string
          notes?: string | null
          outcome?: string
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_activities_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_activities_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_communications: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          message: string | null
          quote_id: string
          sent_by: string | null
          sent_to: string
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string | null
          quote_id: string
          sent_by?: string | null
          sent_to: string
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string | null
          quote_id?: string
          sent_by?: string | null
          sent_to?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_communications_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_communications_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          notes: string | null
          pricing_type: string | null
          product_id: string | null
          quantity: number
          quote_id: string
          service_id: string | null
          standard_price: number | null
          tier_name: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          notes?: string | null
          pricing_type?: string | null
          product_id?: string | null
          quantity?: number
          quote_id: string
          service_id?: string | null
          standard_price?: number | null
          tier_name?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          notes?: string | null
          pricing_type?: string | null
          product_id?: string | null
          quantity?: number
          quote_id?: string
          service_id?: string | null
          standard_price?: number | null
          tier_name?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          access_token: string | null
          converted_appointment_id: string | null
          coupon_code: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          follow_up_status: string | null
          id: string
          last_activity_at: string | null
          notes: string | null
          quote_number: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          valid_until: string | null
          vehicle_id: string | null
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          access_token?: string | null
          converted_appointment_id?: string | null
          coupon_code?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          follow_up_status?: string | null
          id?: string
          last_activity_at?: string | null
          notes?: string | null
          quote_number: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          vehicle_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          access_token?: string | null
          converted_appointment_id?: string | null
          coupon_code?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          follow_up_status?: string | null
          id?: string
          last_activity_at?: string | null
          notes?: string | null
          quote_number?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
          vehicle_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_converted_appointment_id_fkey"
            columns: ["converted_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_items: {
        Row: {
          amount: number
          created_at: string
          disposition: string | null
          id: string
          quantity: number
          refund_id: string
          restock: boolean
          transaction_item_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          disposition?: string | null
          id?: string
          quantity?: number
          refund_id: string
          restock?: boolean
          transaction_item_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          disposition?: string | null
          id?: string
          quantity?: number
          refund_id?: string
          restock?: boolean
          transaction_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_transaction_item_id_fkey"
            columns: ["transaction_item_id"]
            isOneToOne: false
            referencedRelation: "transaction_items"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          points_clawed_back: number | null
          points_restored: number | null
          processed_by: string | null
          reason: string | null
          status: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id: string | null
          transaction_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          points_clawed_back?: number | null
          points_restored?: number | null
          processed_by?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id?: string | null
          transaction_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          points_clawed_back?: number | null
          points_restored?: number | null
          processed_by?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id?: string | null
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          can_access_admin: boolean
          can_access_pos: boolean
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_super: boolean
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          can_access_admin?: boolean
          can_access_pos?: boolean
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_super?: boolean
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          can_access_admin?: boolean
          can_access_pos?: boolean
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_super?: boolean
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      route_access: {
        Row: {
          created_at: string
          id: string
          role_id: string
          route_pattern: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          route_pattern: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          route_pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_access_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_history: {
        Row: {
          created_at: string
          ended_at: string
          ended_by: string | null
          ended_reason: string
          id: string
          pricing_model: string | null
          pricing_snapshot: Json
          product_id: string | null
          sale_ends_at: string | null
          sale_name: string | null
          sale_starts_at: string | null
          service_id: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string
          ended_by?: string | null
          ended_reason?: string
          id?: string
          pricing_model?: string | null
          pricing_snapshot: Json
          product_id?: string | null
          sale_ends_at?: string | null
          sale_name?: string | null
          sale_starts_at?: string | null
          service_id?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string
          ended_by?: string | null
          ended_reason?: string
          id?: string
          pricing_model?: string | null
          pricing_snapshot?: Json
          product_id?: string | null
          sale_ends_at?: string | null
          sale_name?: string | null
          sale_starts_at?: string | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_history_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_history_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_themes: {
        Row: {
          auto_activate: boolean
          body_bg_color: string | null
          color_overrides: Json | null
          created_at: string
          description: string | null
          ends_at: string | null
          gradient_overrides: Json | null
          hero_bg_image_url: string | null
          id: string
          is_active: boolean
          name: string
          particle_color: string | null
          particle_effect: string | null
          particle_intensity: number | null
          slug: string
          starts_at: string | null
          themed_ad_creative_id: string | null
          ticker_bg_color: string | null
          ticker_message: string | null
          ticker_text_color: string | null
          updated_at: string
        }
        Insert: {
          auto_activate?: boolean
          body_bg_color?: string | null
          color_overrides?: Json | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          gradient_overrides?: Json | null
          hero_bg_image_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          particle_color?: string | null
          particle_effect?: string | null
          particle_intensity?: number | null
          slug: string
          starts_at?: string | null
          themed_ad_creative_id?: string | null
          ticker_bg_color?: string | null
          ticker_message?: string | null
          ticker_text_color?: string | null
          updated_at?: string
        }
        Update: {
          auto_activate?: boolean
          body_bg_color?: string | null
          color_overrides?: Json | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          gradient_overrides?: Json | null
          hero_bg_image_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          particle_color?: string | null
          particle_effect?: string | null
          particle_intensity?: number | null
          slug?: string
          starts_at?: string | null
          themed_ad_creative_id?: string | null
          ticker_bg_color?: string | null
          ticker_message?: string | null
          ticker_text_color?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_themes_themed_ad_creative_id_fkey"
            columns: ["themed_ad_creative_id"]
            isOneToOne: false
            referencedRelation: "ad_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      service_addon_suggestions: {
        Row: {
          addon_service_id: string
          auto_suggest: boolean
          combo_price: number | null
          created_at: string
          display_order: number
          id: string
          is_seasonal: boolean
          primary_service_id: string
          seasonal_end: string | null
          seasonal_start: string | null
        }
        Insert: {
          addon_service_id: string
          auto_suggest?: boolean
          combo_price?: number | null
          created_at?: string
          display_order?: number
          id?: string
          is_seasonal?: boolean
          primary_service_id: string
          seasonal_end?: string | null
          seasonal_start?: string | null
        }
        Update: {
          addon_service_id?: string
          auto_suggest?: boolean
          combo_price?: number | null
          created_at?: string
          display_order?: number
          id?: string
          is_seasonal?: boolean
          primary_service_id?: string
          seasonal_end?: string | null
          seasonal_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_addon_suggestions_addon_service_id_fkey"
            columns: ["addon_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_addon_suggestions_primary_service_id_fkey"
            columns: ["primary_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_prerequisites: {
        Row: {
          created_at: string
          enforcement: Database["public"]["Enums"]["prerequisite_enforcement"]
          history_window_days: number | null
          id: string
          prerequisite_service_id: string
          service_id: string
          warning_message: string | null
        }
        Insert: {
          created_at?: string
          enforcement?: Database["public"]["Enums"]["prerequisite_enforcement"]
          history_window_days?: number | null
          id?: string
          prerequisite_service_id: string
          service_id: string
          warning_message?: string | null
        }
        Update: {
          created_at?: string
          enforcement?: Database["public"]["Enums"]["prerequisite_enforcement"]
          history_window_days?: number | null
          id?: string
          prerequisite_service_id?: string
          service_id?: string
          warning_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_prerequisites_prerequisite_service_id_fkey"
            columns: ["prerequisite_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_prerequisites_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_pricing: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_vehicle_size_aware: boolean
          max_qty: number | null
          price: number
          qty_label: string | null
          sale_price: number | null
          service_id: string
          tier_label: string | null
          tier_name: string
          vehicle_size_classic_price: number | null
          vehicle_size_exotic_price: number | null
          vehicle_size_sedan_price: number | null
          vehicle_size_suv_van_price: number | null
          vehicle_size_truck_suv_price: number | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_vehicle_size_aware?: boolean
          max_qty?: number | null
          price: number
          qty_label?: string | null
          sale_price?: number | null
          service_id: string
          tier_label?: string | null
          tier_name: string
          vehicle_size_classic_price?: number | null
          vehicle_size_exotic_price?: number | null
          vehicle_size_sedan_price?: number | null
          vehicle_size_suv_van_price?: number | null
          vehicle_size_truck_suv_price?: number | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_vehicle_size_aware?: boolean
          max_qty?: number | null
          price?: number
          qty_label?: string | null
          sale_price?: number | null
          service_id?: string
          tier_label?: string | null
          tier_name?: string
          vehicle_size_classic_price?: number | null
          vehicle_size_exotic_price?: number | null
          vehicle_size_sedan_price?: number | null
          vehicle_size_suv_van_price?: number | null
          vehicle_size_truck_suv_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_pricing_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          base_duration_minutes: number
          category_id: string | null
          classification: Database["public"]["Enums"]["service_classification"]
          created_at: string
          custom_starting_price: number | null
          description: string | null
          display_order: number
          flat_price: number | null
          id: string
          image_alt: string | null
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          is_taxable: boolean
          mobile_eligible: boolean
          name: string
          online_bookable: boolean
          per_unit_label: string | null
          per_unit_max: number | null
          per_unit_price: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"]
          qbo_id: string | null
          sale_ends_at: string | null
          sale_price: number | null
          sale_starts_at: string | null
          show_on_website: boolean
          slug: string
          special_requirements: string | null
          staff_assessed: boolean
          updated_at: string
          vehicle_compatibility: Json
        }
        Insert: {
          base_duration_minutes?: number
          category_id?: string | null
          classification?: Database["public"]["Enums"]["service_classification"]
          created_at?: string
          custom_starting_price?: number | null
          description?: string | null
          display_order?: number
          flat_price?: number | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_taxable?: boolean
          mobile_eligible?: boolean
          name: string
          online_bookable?: boolean
          per_unit_label?: string | null
          per_unit_max?: number | null
          per_unit_price?: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"]
          qbo_id?: string | null
          sale_ends_at?: string | null
          sale_price?: number | null
          sale_starts_at?: string | null
          show_on_website?: boolean
          slug: string
          special_requirements?: string | null
          staff_assessed?: boolean
          updated_at?: string
          vehicle_compatibility?: Json
        }
        Update: {
          base_duration_minutes?: number
          category_id?: string | null
          classification?: Database["public"]["Enums"]["service_classification"]
          created_at?: string
          custom_starting_price?: number | null
          description?: string | null
          display_order?: number
          flat_price?: number | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          is_taxable?: boolean
          mobile_eligible?: boolean
          name?: string
          online_bookable?: boolean
          per_unit_label?: string | null
          per_unit_max?: number | null
          per_unit_price?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
          qbo_id?: string | null
          sale_ends_at?: string | null
          sale_price?: number | null
          sale_starts_at?: string | null
          show_on_website?: boolean
          slug?: string
          special_requirements?: string | null
          staff_assessed?: boolean
          updated_at?: string
          vehicle_compatibility?: Json
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_settings: {
        Row: {
          created_at: string
          default_parcel_distance_unit: string | null
          default_parcel_height: number | null
          default_parcel_length: number | null
          default_parcel_mass_unit: string | null
          default_parcel_weight: number | null
          default_parcel_width: number | null
          enabled_carriers: Json | null
          enabled_service_levels: Json | null
          flat_rate_amount: number | null
          flat_rate_enabled: boolean | null
          free_shipping_threshold: number | null
          handling_fee_amount: number | null
          handling_fee_type: string | null
          id: string
          local_pickup_address: string | null
          local_pickup_enabled: boolean | null
          local_pickup_instructions: string | null
          offer_free_shipping: boolean | null
          ship_from_city: string
          ship_from_company: string | null
          ship_from_country: string
          ship_from_email: string | null
          ship_from_name: string
          ship_from_phone: string | null
          ship_from_state: string
          ship_from_street1: string
          ship_from_street2: string | null
          ship_from_zip: string
          shippo_api_key_live: string | null
          shippo_api_key_test: string | null
          shippo_mode: string
          show_carrier_logo: boolean | null
          show_estimated_delivery: boolean | null
          sort_rates_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_parcel_distance_unit?: string | null
          default_parcel_height?: number | null
          default_parcel_length?: number | null
          default_parcel_mass_unit?: string | null
          default_parcel_weight?: number | null
          default_parcel_width?: number | null
          enabled_carriers?: Json | null
          enabled_service_levels?: Json | null
          flat_rate_amount?: number | null
          flat_rate_enabled?: boolean | null
          free_shipping_threshold?: number | null
          handling_fee_amount?: number | null
          handling_fee_type?: string | null
          id?: string
          local_pickup_address?: string | null
          local_pickup_enabled?: boolean | null
          local_pickup_instructions?: string | null
          offer_free_shipping?: boolean | null
          ship_from_city?: string
          ship_from_company?: string | null
          ship_from_country?: string
          ship_from_email?: string | null
          ship_from_name?: string
          ship_from_phone?: string | null
          ship_from_state?: string
          ship_from_street1?: string
          ship_from_street2?: string | null
          ship_from_zip?: string
          shippo_api_key_live?: string | null
          shippo_api_key_test?: string | null
          shippo_mode?: string
          show_carrier_logo?: boolean | null
          show_estimated_delivery?: boolean | null
          sort_rates_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_parcel_distance_unit?: string | null
          default_parcel_height?: number | null
          default_parcel_length?: number | null
          default_parcel_mass_unit?: string | null
          default_parcel_weight?: number | null
          default_parcel_width?: number | null
          enabled_carriers?: Json | null
          enabled_service_levels?: Json | null
          flat_rate_amount?: number | null
          flat_rate_enabled?: boolean | null
          free_shipping_threshold?: number | null
          handling_fee_amount?: number | null
          handling_fee_type?: string | null
          id?: string
          local_pickup_address?: string | null
          local_pickup_enabled?: boolean | null
          local_pickup_instructions?: string | null
          offer_free_shipping?: boolean | null
          ship_from_city?: string
          ship_from_company?: string | null
          ship_from_country?: string
          ship_from_email?: string | null
          ship_from_name?: string
          ship_from_phone?: string | null
          ship_from_state?: string
          ship_from_street1?: string
          ship_from_street2?: string | null
          ship_from_zip?: string
          shippo_api_key_live?: string | null
          shippo_api_key_test?: string | null
          shippo_mode?: string
          show_carrier_logo?: boolean | null
          show_estimated_delivery?: boolean | null
          sort_rates_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      short_links: {
        Row: {
          click_count: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          target_url: string
        }
        Insert: {
          click_count?: number
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          target_url: string
        }
        Update: {
          click_count?: number
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          target_url?: string
        }
        Relationships: []
      }
      site_theme_settings: {
        Row: {
          border_card_radius: string | null
          border_radius: string | null
          border_width: string | null
          btn_cta_bg: string | null
          btn_cta_hover_bg: string | null
          btn_cta_radius: string | null
          btn_cta_text: string | null
          btn_primary_bg: string | null
          btn_primary_hover_bg: string | null
          btn_primary_padding: string | null
          btn_primary_radius: string | null
          btn_primary_text: string | null
          btn_secondary_bg: string | null
          btn_secondary_border: string | null
          btn_secondary_radius: string | null
          btn_secondary_text: string | null
          color_accent: string | null
          color_accent_hover: string | null
          color_border: string | null
          color_border_light: string | null
          color_card_bg: string | null
          color_divider: string | null
          color_error: string | null
          color_footer_bg: string | null
          color_header_bg: string | null
          color_link: string | null
          color_link_hover: string | null
          color_page_bg: string | null
          color_primary: string | null
          color_primary_hover: string | null
          color_section_alt_bg: string | null
          color_success: string | null
          color_text_muted: string | null
          color_text_on_primary: string | null
          color_text_primary: string | null
          color_text_secondary: string | null
          color_warning: string | null
          created_at: string
          font_base_size: string | null
          font_body_size: string | null
          font_body_weight: string | null
          font_family: string | null
          font_h1_size: string | null
          font_h2_size: string | null
          font_h3_size: string | null
          font_heading_family: string | null
          font_heading_weight: string | null
          font_line_height: string | null
          font_small_size: string | null
          id: string
          is_active: boolean
          is_default: boolean
          mode: string
          name: string
          spacing_card_padding: string | null
          spacing_header_height: string | null
          spacing_section_padding: string | null
          updated_at: string
        }
        Insert: {
          border_card_radius?: string | null
          border_radius?: string | null
          border_width?: string | null
          btn_cta_bg?: string | null
          btn_cta_hover_bg?: string | null
          btn_cta_radius?: string | null
          btn_cta_text?: string | null
          btn_primary_bg?: string | null
          btn_primary_hover_bg?: string | null
          btn_primary_padding?: string | null
          btn_primary_radius?: string | null
          btn_primary_text?: string | null
          btn_secondary_bg?: string | null
          btn_secondary_border?: string | null
          btn_secondary_radius?: string | null
          btn_secondary_text?: string | null
          color_accent?: string | null
          color_accent_hover?: string | null
          color_border?: string | null
          color_border_light?: string | null
          color_card_bg?: string | null
          color_divider?: string | null
          color_error?: string | null
          color_footer_bg?: string | null
          color_header_bg?: string | null
          color_link?: string | null
          color_link_hover?: string | null
          color_page_bg?: string | null
          color_primary?: string | null
          color_primary_hover?: string | null
          color_section_alt_bg?: string | null
          color_success?: string | null
          color_text_muted?: string | null
          color_text_on_primary?: string | null
          color_text_primary?: string | null
          color_text_secondary?: string | null
          color_warning?: string | null
          created_at?: string
          font_base_size?: string | null
          font_body_size?: string | null
          font_body_weight?: string | null
          font_family?: string | null
          font_h1_size?: string | null
          font_h2_size?: string | null
          font_h3_size?: string | null
          font_heading_family?: string | null
          font_heading_weight?: string | null
          font_line_height?: string | null
          font_small_size?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          mode?: string
          name?: string
          spacing_card_padding?: string | null
          spacing_header_height?: string | null
          spacing_section_padding?: string | null
          updated_at?: string
        }
        Update: {
          border_card_radius?: string | null
          border_radius?: string | null
          border_width?: string | null
          btn_cta_bg?: string | null
          btn_cta_hover_bg?: string | null
          btn_cta_radius?: string | null
          btn_cta_text?: string | null
          btn_primary_bg?: string | null
          btn_primary_hover_bg?: string | null
          btn_primary_padding?: string | null
          btn_primary_radius?: string | null
          btn_primary_text?: string | null
          btn_secondary_bg?: string | null
          btn_secondary_border?: string | null
          btn_secondary_radius?: string | null
          btn_secondary_text?: string | null
          color_accent?: string | null
          color_accent_hover?: string | null
          color_border?: string | null
          color_border_light?: string | null
          color_card_bg?: string | null
          color_divider?: string | null
          color_error?: string | null
          color_footer_bg?: string | null
          color_header_bg?: string | null
          color_link?: string | null
          color_link_hover?: string | null
          color_page_bg?: string | null
          color_primary?: string | null
          color_primary_hover?: string | null
          color_section_alt_bg?: string | null
          color_success?: string | null
          color_text_muted?: string | null
          color_text_on_primary?: string | null
          color_text_primary?: string | null
          color_text_secondary?: string | null
          color_warning?: string | null
          created_at?: string
          font_base_size?: string | null
          font_body_size?: string | null
          font_body_weight?: string | null
          font_family?: string | null
          font_h1_size?: string | null
          font_h2_size?: string | null
          font_h3_size?: string | null
          font_heading_family?: string | null
          font_heading_weight?: string | null
          font_line_height?: string | null
          font_small_size?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          mode?: string
          name?: string
          spacing_card_padding?: string | null
          spacing_header_height?: string | null
          spacing_section_padding?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sms_consent_log: {
        Row: {
          action: string
          created_at: string | null
          customer_id: string
          id: string
          keyword: string
          new_value: boolean
          notes: string | null
          phone: string
          previous_value: boolean | null
          source: string
        }
        Insert: {
          action: string
          created_at?: string | null
          customer_id: string
          id?: string
          keyword: string
          new_value: boolean
          notes?: string | null
          phone: string
          previous_value?: boolean | null
          source: string
        }
        Update: {
          action?: string
          created_at?: string | null
          customer_id?: string
          id?: string
          keyword?: string
          new_value?: boolean
          notes?: string | null
          phone?: string
          previous_value?: boolean | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_consent_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_conversations: {
        Row: {
          created_at: string
          customer_id: string
          direction: string
          id: string
          message: string
          phone_number: string
          read: boolean
          status: string
          twilio_sid: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          direction: string
          id?: string
          message: string
          phone_number: string
          read?: boolean
          status?: string
          twilio_sid?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          direction?: string
          id?: string
          message?: string
          phone_number?: string
          read?: boolean
          status?: string
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_delivery_log: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          customer_id: string | null
          error_code: string | null
          error_message: string | null
          from_phone: string
          id: string
          lifecycle_execution_id: string | null
          message_sid: string
          source: string
          status: string
          to_phone: string
          updated_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          error_code?: string | null
          error_message?: string | null
          from_phone: string
          id?: string
          lifecycle_execution_id?: string | null
          message_sid: string
          source: string
          status: string
          to_phone: string
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          error_code?: string | null
          error_message?: string | null
          from_phone?: string
          id?: string
          lifecycle_execution_id?: string | null
          message_sid?: string
          source?: string
          status?: string
          to_phone?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_delivery_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_delivery_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_delivery_log_lifecycle_execution_id_fkey"
            columns: ["lifecycle_execution_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          body_template: string
          can_silence: boolean
          category: string
          default_body: string
          id: string
          is_active: boolean
          name: string
          optional_variables: Json
          recipient_phones: string[] | null
          recipient_type: string
          required_variables: Json
          slug: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_template: string
          can_silence?: boolean
          category: string
          default_body: string
          id?: string
          is_active?: boolean
          name: string
          optional_variables?: Json
          recipient_phones?: string[] | null
          recipient_type?: string
          required_variables?: Json
          slug: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_template?: string
          can_silence?: boolean
          category?: string
          default_body?: string
          id?: string
          is_active?: boolean
          name?: string
          optional_variables?: Json
          recipient_phones?: string[] | null
          recipient_type?: string
          required_variables?: Json
          slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          adjustment_type: string
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          quantity_after: number
          quantity_before: number
          quantity_change: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          unit_cost: number | null
        }
        Insert: {
          adjustment_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          quantity_after: number
          quantity_before: number
          quantity_change: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
        }
        Update: {
          adjustment_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          quantity_after?: number
          quantity_before?: number
          quantity_change?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alert_log: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          product_id: string
          stock_level: number
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          product_id: string
          stock_level: number
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          product_id?: string
          stock_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_alert_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_items: {
        Row: {
          counted_qty: number
          created_at: string
          created_by: string
          expected_qty: number
          id: string
          last_updated_by: string
          product_id: string
          stock_count_id: string
          updated_at: string
        }
        Insert: {
          counted_qty?: number
          created_at?: string
          created_by: string
          expected_qty: number
          id?: string
          last_updated_by: string
          product_id: string
          stock_count_id: string
          updated_at?: string
        }
        Update: {
          counted_qty?: number
          created_at?: string
          created_by?: string
          expected_qty?: number
          id?: string
          last_updated_by?: string
          product_id?: string
          stock_count_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_stock_count_id_fkey"
            columns: ["stock_count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          committed_at: string | null
          committed_by: string | null
          count_type: string
          created_at: string
          id: string
          notes: string | null
          section_label: string | null
          started_at: string
          started_by: string
          status: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          committed_at?: string | null
          committed_by?: string | null
          count_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          section_label?: string | null
          started_at?: string
          started_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          committed_at?: string | null
          committed_by?: string | null
          count_type?: string
          created_at?: string
          id?: string
          notes?: string | null
          section_label?: string | null
          started_at?: string
          started_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_committed_by_fkey"
            columns: ["committed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_counts_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          bio: string | null
          certifications: Json | null
          created_at: string
          excerpt: string | null
          id: string
          is_active: boolean
          name: string
          photo_url: string | null
          role: string
          slug: string
          sort_order: number
          updated_at: string
          years_of_service: number | null
        }
        Insert: {
          bio?: string | null
          certifications?: Json | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_active?: boolean
          name: string
          photo_url?: string | null
          role: string
          slug: string
          sort_order?: number
          updated_at?: string
          years_of_service?: number | null
        }
        Update: {
          bio?: string | null
          certifications?: Json | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_active?: boolean
          name?: string
          photo_url?: string | null
          role?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          years_of_service?: number | null
        }
        Relationships: []
      }
      time_records: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          edited_by: string | null
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          clock_in: string
          clock_out?: string | null
          created_at?: string
          edited_by?: string | null
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          edited_by?: string | null
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_records_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_links: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          customer_id: string | null
          id: string
          lifecycle_execution_id: string | null
          original_url: string
          short_code: string
          source: string
          variant_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          lifecycle_execution_id?: string | null
          original_url: string
          short_code: string
          source: string
          variant_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          lifecycle_execution_id?: string | null
          original_url?: string
          short_code?: string
          source?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracked_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_links_lifecycle_execution_id_fkey"
            columns: ["lifecycle_execution_id"]
            isOneToOne: false
            referencedRelation: "lifecycle_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_links_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "campaign_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_items: {
        Row: {
          created_at: string
          id: string
          is_addon: boolean | null
          is_taxable: boolean
          item_name: string
          item_type: Database["public"]["Enums"]["transaction_item_type"]
          notes: string | null
          package_id: string | null
          prerequisite_note: string | null
          pricing_type: string | null
          product_id: string | null
          quantity: number
          service_id: string | null
          standard_price: number | null
          tax_amount: number
          tier_name: string | null
          total_price: number
          transaction_id: string
          unit_price: number
          vehicle_size_class:
            | Database["public"]["Enums"]["vehicle_size_class"]
            | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_addon?: boolean | null
          is_taxable?: boolean
          item_name: string
          item_type: Database["public"]["Enums"]["transaction_item_type"]
          notes?: string | null
          package_id?: string | null
          prerequisite_note?: string | null
          pricing_type?: string | null
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          standard_price?: number | null
          tax_amount?: number
          tier_name?: string | null
          total_price: number
          transaction_id: string
          unit_price: number
          vehicle_size_class?:
            | Database["public"]["Enums"]["vehicle_size_class"]
            | null
        }
        Update: {
          created_at?: string
          id?: string
          is_addon?: boolean | null
          is_taxable?: boolean
          item_name?: string
          item_type?: Database["public"]["Enums"]["transaction_item_type"]
          notes?: string | null
          package_id?: string | null
          prerequisite_note?: string | null
          pricing_type?: string | null
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          standard_price?: number | null
          tax_amount?: number
          tier_name?: string | null
          total_price?: number
          transaction_id?: string
          unit_price?: number
          vehicle_size_class?:
            | Database["public"]["Enums"]["vehicle_size_class"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          access_token: string
          appointment_id: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          customer_id: string | null
          deposit_credit: number
          discount_amount: number
          employee_id: string | null
          id: string
          loyalty_discount: number
          loyalty_points_earned: number
          loyalty_points_redeemed: number
          notes: string | null
          offline_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          qbo_id: string | null
          qbo_sync_error: string | null
          qbo_sync_status: string | null
          qbo_synced_at: string | null
          receipt_number: string | null
          square_transaction_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          subtotal: number
          tax_amount: number
          tip_amount: number
          total_amount: number
          transaction_date: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          access_token?: string
          appointment_id?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_id?: string | null
          deposit_credit?: number
          discount_amount?: number
          employee_id?: string | null
          id?: string
          loyalty_discount?: number
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          notes?: string | null
          offline_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          qbo_id?: string | null
          qbo_sync_error?: string | null
          qbo_sync_status?: string | null
          qbo_synced_at?: string | null
          receipt_number?: string | null
          square_transaction_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          subtotal?: number
          tax_amount?: number
          tip_amount?: number
          total_amount?: number
          transaction_date?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          access_token?: string
          appointment_id?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_id?: string | null
          deposit_credit?: number
          discount_amount?: number
          employee_id?: string | null
          id?: string
          loyalty_discount?: number
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          notes?: string | null
          offline_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          qbo_id?: string | null
          qbo_sync_error?: string | null
          qbo_sync_status?: string | null
          qbo_synced_at?: string | null
          receipt_number?: string | null
          square_transaction_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          subtotal?: number
          tax_amount?: number
          tip_amount?: number
          total_amount?: number
          transaction_date?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_transactions_coupon"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_categories: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          display_order: number
          id: string
          image_alt: string | null
          image_url: string | null
          is_active: boolean
          key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          display_order?: number
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_active?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          display_order?: number
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_active?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_makes: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          customer_id: string
          id: string
          is_incomplete: boolean
          license_plate: string | null
          make: string | null
          model: string | null
          notes: string | null
          size_class: Database["public"]["Enums"]["vehicle_size_class"] | null
          size_class_manual_override: boolean
          specialty_tier: string | null
          updated_at: string
          vehicle_category: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          vin: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_incomplete?: boolean
          license_plate?: string | null
          make?: string | null
          model?: string | null
          notes?: string | null
          size_class?: Database["public"]["Enums"]["vehicle_size_class"] | null
          size_class_manual_override?: boolean
          specialty_tier?: string | null
          updated_at?: string
          vehicle_category?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          vin?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_incomplete?: boolean
          license_plate?: string | null
          make?: string | null
          model?: string | null
          notes?: string | null
          size_class?: Database["public"]["Enums"]["vehicle_size_class"] | null
          size_class_manual_override?: boolean
          specialty_tier?: string | null
          updated_at?: string
          vehicle_category?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          lead_time_days: number | null
          min_order_amount: number | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          min_order_amount?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number | null
          min_order_amount?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      voice_call_log: {
        Row: {
          elevenlabs_conversation_id: string
          first_attempted_at: string
          id: string
          last_attempted_at: string | null
          phone: string | null
          processed_at: string
          retry_count: number
          skip_reason: string | null
          source: string
          status: string
        }
        Insert: {
          elevenlabs_conversation_id: string
          first_attempted_at?: string
          id?: string
          last_attempted_at?: string | null
          phone?: string | null
          processed_at?: string
          retry_count?: number
          skip_reason?: string | null
          source: string
          status?: string
        }
        Update: {
          elevenlabs_conversation_id?: string
          first_attempted_at?: string
          id?: string
          last_attempted_at?: string | null
          phone?: string | null
          processed_at?: string
          retry_count?: number
          skip_reason?: string | null
          source?: string
          status?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          notified_at: string | null
          preferred_date: string | null
          preferred_time_end: string | null
          preferred_time_start: string | null
          service_id: string
          status: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          notified_at?: string | null
          preferred_date?: string | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          service_id: string
          status?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          notified_at?: string | null
          preferred_date?: string | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          service_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      website_navigation: {
        Row: {
          created_at: string
          footer_column_id: string | null
          icon: string | null
          id: string
          is_active: boolean
          label: string
          page_id: string | null
          parent_id: string | null
          placement: string
          sort_order: number
          target: string
          url: string
        }
        Insert: {
          created_at?: string
          footer_column_id?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          page_id?: string | null
          parent_id?: string | null
          placement: string
          sort_order?: number
          target?: string
          url?: string
        }
        Update: {
          created_at?: string
          footer_column_id?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          page_id?: string | null
          parent_id?: string | null
          placement?: string
          sort_order?: number
          target?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_navigation_footer_column_id_fkey"
            columns: ["footer_column_id"]
            isOneToOne: false
            referencedRelation: "footer_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_navigation_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_navigation_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "website_navigation"
            referencedColumns: ["id"]
          },
        ]
      }
      website_pages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          is_published: boolean
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          page_template: string
          parent_id: string | null
          preview_token: string | null
          preview_token_expires_at: string | null
          show_in_nav: boolean
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          page_template?: string
          parent_id?: string | null
          preview_token?: string | null
          preview_token_expires_at?: string | null
          show_in_nav?: boolean
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          page_template?: string
          parent_id?: string | null
          preview_token?: string | null
          preview_token_expires_at?: string | null
          show_in_nav?: boolean
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_pages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "website_pages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_close_and_archive_conversations: { Args: never; Returns: undefined }
      calculate_loyalty_points: {
        Args: { p_transaction_id: string }
        Returns: number
      }
      commit_stock_count: {
        Args: { p_count_id: string; p_employee_id: string }
        Returns: Json
      }
      find_duplicate_customers: { Args: never; Returns: Json }
      get_current_customer_id: { Args: never; Returns: string }
      get_current_employee_id: { Args: never; Returns: string }
      get_current_employee_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_transaction_stats: {
        Args: { p_from?: string; p_status?: string; p_to?: string }
        Returns: Json
      }
      increment_short_link_click: {
        Args: { p_code: string }
        Returns: {
          expires_at: string
          target_url: string
        }[]
      }
      is_admin_or_above: { Args: never; Returns: boolean }
      is_employee: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      merge_customers: {
        Args: { keep_id: string; merge_ids: string[] }
        Returns: Json
      }
      revert_stock_count: {
        Args: {
          p_confirmed_drift: boolean
          p_count_id: string
          p_user_id: string
        }
        Returns: Json
      }
      void_transaction: {
        Args: { p_reason?: string; p_transaction_id: string; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      appointment_channel: "online" | "phone" | "walk_in" | "portal"
      appointment_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      campaign_channel: "sms" | "email" | "both"
      campaign_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "sent"
        | "paused"
        | "cancelled"
      consent_action: "opt_in" | "opt_out"
      consent_channel: "sms" | "email"
      consent_source: "pos" | "online" | "portal" | "import" | "manual"
      coupon_status: "draft" | "active" | "redeemed" | "expired" | "disabled"
      employee_status: "active" | "inactive" | "terminated"
      lifecycle_action: "sms" | "email" | "both"
      loyalty_action:
        | "earned"
        | "redeemed"
        | "adjusted"
        | "expired"
        | "welcome_bonus"
      payment_method: "cash" | "card" | "split" | "check"
      payment_status:
        | "pending"
        | "partial"
        | "paid"
        | "refunded"
        | "partial_refund"
      po_status: "draft" | "ordered" | "received" | "cancelled"
      prerequisite_enforcement:
        | "required_same_ticket"
        | "required_history"
        | "recommended"
      pricing_model:
        | "vehicle_size"
        | "scope"
        | "per_unit"
        | "specialty"
        | "flat"
        | "custom"
      quote_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "expired"
        | "converted"
      refund_status: "pending" | "processed" | "failed"
      service_classification: "primary" | "addon_only" | "both"
      transaction_item_type: "product" | "service" | "package" | "custom"
      transaction_status:
        | "open"
        | "completed"
        | "voided"
        | "refunded"
        | "partial_refund"
      user_role: "super_admin" | "admin" | "cashier" | "detailer" | "marketing"
      vehicle_size_class:
        | "sedan"
        | "truck_suv_2row"
        | "suv_3row_van"
        | "exotic"
        | "classic"
      vehicle_type: "standard" | "motorcycle" | "rv" | "boat" | "aircraft"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      appointment_channel: ["online", "phone", "walk_in", "portal"],
      appointment_status: [
        "pending",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      campaign_channel: ["sms", "email", "both"],
      campaign_status: [
        "draft",
        "scheduled",
        "sending",
        "sent",
        "paused",
        "cancelled",
      ],
      consent_action: ["opt_in", "opt_out"],
      consent_channel: ["sms", "email"],
      consent_source: ["pos", "online", "portal", "import", "manual"],
      coupon_status: ["draft", "active", "redeemed", "expired", "disabled"],
      employee_status: ["active", "inactive", "terminated"],
      lifecycle_action: ["sms", "email", "both"],
      loyalty_action: [
        "earned",
        "redeemed",
        "adjusted",
        "expired",
        "welcome_bonus",
      ],
      payment_method: ["cash", "card", "split", "check"],
      payment_status: [
        "pending",
        "partial",
        "paid",
        "refunded",
        "partial_refund",
      ],
      po_status: ["draft", "ordered", "received", "cancelled"],
      prerequisite_enforcement: [
        "required_same_ticket",
        "required_history",
        "recommended",
      ],
      pricing_model: [
        "vehicle_size",
        "scope",
        "per_unit",
        "specialty",
        "flat",
        "custom",
      ],
      quote_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "expired",
        "converted",
      ],
      refund_status: ["pending", "processed", "failed"],
      service_classification: ["primary", "addon_only", "both"],
      transaction_item_type: ["product", "service", "package", "custom"],
      transaction_status: [
        "open",
        "completed",
        "voided",
        "refunded",
        "partial_refund",
      ],
      user_role: ["super_admin", "admin", "cashier", "detailer", "marketing"],
      vehicle_size_class: [
        "sedan",
        "truck_suv_2row",
        "suv_3row_van",
        "exotic",
        "classic",
      ],
      vehicle_type: ["standard", "motorcycle", "rv", "boat", "aircraft"],
    },
  },
} as const
