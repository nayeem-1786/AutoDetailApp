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
  public: {
    Tables: {
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
          created_at: string
          customer_id: string
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
          created_at?: string
          customer_id: string
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
          created_at?: string
          customer_id?: string
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
          employee_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string
          employee_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          employee_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_employee_id_fkey"
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
      campaigns: {
        Row: {
          audience_filters: Json
          channel: Database["public"]["Enums"]["campaign_channel"]
          clicked_count: number
          coupon_id: string | null
          created_at: string
          created_by: string | null
          delivered_count: number
          description: string | null
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
          channel?: Database["public"]["Enums"]["campaign_channel"]
          clicked_count?: number
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
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
          channel?: Database["public"]["Enums"]["campaign_channel"]
          clicked_count?: number
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
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
        ]
      }
      coupons: {
        Row: {
          campaign_id: string | null
          code: string
          created_at: string
          customer_id: string | null
          expires_at: string | null
          free_item_id: string | null
          id: string
          is_single_use: boolean
          max_discount: number | null
          max_uses: number | null
          min_purchase: number | null
          status: Database["public"]["Enums"]["coupon_status"]
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          use_count: number
          value: number
        }
        Insert: {
          campaign_id?: string | null
          code: string
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          free_item_id?: string | null
          id?: string
          is_single_use?: boolean
          max_discount?: number | null
          max_uses?: number | null
          min_purchase?: number | null
          status?: Database["public"]["Enums"]["coupon_status"]
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          use_count?: number
          value: number
        }
        Update: {
          campaign_id?: string | null
          code?: string
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          free_item_id?: string | null
          id?: string
          is_single_use?: boolean
          max_discount?: number | null
          max_uses?: number | null
          min_purchase?: number | null
          status?: Database["public"]["Enums"]["coupon_status"]
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          use_count?: number
          value?: number
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
      customers: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          auth_user_id: string | null
          birthday: string | null
          city: string | null
          created_at: string
          email: string | null
          email_consent: boolean
          first_name: string
          first_visit_date: string | null
          id: string
          last_name: string
          last_visit_date: string | null
          lifetime_spend: number
          loyalty_points_balance: number
          notes: string | null
          phone: string | null
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
          birthday?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          email_consent?: boolean
          first_name: string
          first_visit_date?: string | null
          id?: string
          last_name: string
          last_visit_date?: string | null
          lifetime_spend?: number
          loyalty_points_balance?: number
          notes?: string | null
          phone?: string | null
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
          birthday?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          email_consent?: boolean
          first_name?: string
          first_visit_date?: string | null
          id?: string
          last_name?: string
          last_visit_date?: string | null
          lifetime_spend?: number
          loyalty_points_balance?: number
          notes?: string | null
          phone?: string | null
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
          square_employee_id?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
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
      lifecycle_rules: {
        Row: {
          action: Database["public"]["Enums"]["lifecycle_action"]
          chain_order: number
          coupon_expiry_days: number | null
          coupon_type: Database["public"]["Enums"]["coupon_type"] | null
          coupon_value: number | null
          created_at: string
          delay_days: number
          description: string | null
          email_subject: string | null
          email_template: string | null
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
          coupon_type?: Database["public"]["Enums"]["coupon_type"] | null
          coupon_value?: number | null
          created_at?: string
          delay_days?: number
          description?: string | null
          email_subject?: string | null
          email_template?: string | null
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
          coupon_type?: Database["public"]["Enums"]["coupon_type"] | null
          coupon_value?: number | null
          created_at?: string
          delay_days?: number
          description?: string | null
          email_subject?: string | null
          email_template?: string | null
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
            foreignKeyName: "lifecycle_rules_trigger_service_id_fkey"
            columns: ["trigger_service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
      payments: {
        Row: {
          amount: number
          card_brand: string | null
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
      permissions: {
        Row: {
          created_at: string
          employee_id: string | null
          granted: boolean
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          granted?: boolean
          id?: string
          permission_key: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          granted?: boolean
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["user_role"] | null
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
        ]
      }
      photos: {
        Row: {
          appointment_id: string | null
          created_at: string
          customer_id: string
          id: string
          marketing_consent: boolean
          notes: string | null
          storage_path: string
          storage_url: string
          thumbnail_url: string | null
          transaction_id: string | null
          type: Database["public"]["Enums"]["photo_type"]
          uploaded_by: string | null
          vehicle_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          customer_id: string
          id?: string
          marketing_consent?: boolean
          notes?: string | null
          storage_path: string
          storage_url: string
          thumbnail_url?: string | null
          transaction_id?: string | null
          type: Database["public"]["Enums"]["photo_type"]
          uploaded_by?: string | null
          vehicle_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          marketing_consent?: boolean
          notes?: string | null
          storage_path?: string
          storage_url?: string
          thumbnail_url?: string | null
          transaction_id?: string | null
          type?: Database["public"]["Enums"]["photo_type"]
          uploaded_by?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      po_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          total_cost: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number
          total_cost: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_loyalty_eligible: boolean
          is_taxable: boolean
          name: string
          quantity_on_hand: number
          reorder_threshold: number | null
          retail_price: number
          sku: string | null
          square_item_id: string | null
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_loyalty_eligible?: boolean
          is_taxable?: boolean
          name: string
          quantity_on_hand?: number
          reorder_threshold?: number | null
          retail_price?: number
          sku?: string | null
          square_item_id?: string | null
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_loyalty_eligible?: boolean
          is_taxable?: boolean
          name?: string
          quantity_on_hand?: number
          reorder_threshold?: number | null
          retail_price?: number
          sku?: string | null
          square_item_id?: string | null
          updated_at?: string
          vendor_id?: string | null
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
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          expected_at: string | null
          id: string
          notes: string | null
          ordered_at: string | null
          po_number: string
          received_at: string | null
          shipping_cost: number
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          total_amount: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          po_number: string
          received_at?: string | null
          shipping_cost?: number
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          total_amount?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          po_number?: string
          received_at?: string | null
          shipping_cost?: number
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          total_amount?: number
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
      quote_items: {
        Row: {
          created_at: string
          id: string
          item_name: string
          notes: string | null
          product_id: string | null
          quantity: number
          quote_id: string
          service_id: string | null
          tier_name: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_name: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          quote_id: string
          service_id?: string | null
          tier_name?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          item_name?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          quote_id?: string
          service_id?: string | null
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
          converted_appointment_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
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
          converted_appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
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
          converted_appointment_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
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
          id: string
          quantity: number
          refund_id: string
          restock: boolean
          transaction_item_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          quantity?: number
          refund_id: string
          restock?: boolean
          transaction_item_id: string
        }
        Update: {
          amount?: number
          created_at?: string
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
          price: number
          service_id: string
          tier_label: string | null
          tier_name: string
          vehicle_size_sedan_price: number | null
          vehicle_size_suv_van_price: number | null
          vehicle_size_truck_suv_price: number | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_vehicle_size_aware?: boolean
          price: number
          service_id: string
          tier_label?: string | null
          tier_name: string
          vehicle_size_sedan_price?: number | null
          vehicle_size_suv_van_price?: number | null
          vehicle_size_truck_suv_price?: number | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_vehicle_size_aware?: boolean
          price?: number
          service_id?: string
          tier_label?: string | null
          tier_name?: string
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
          is_active: boolean
          is_taxable: boolean
          mobile_eligible: boolean
          name: string
          online_bookable: boolean
          per_unit_label: string | null
          per_unit_max: number | null
          per_unit_price: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"]
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
          is_active?: boolean
          is_taxable?: boolean
          mobile_eligible?: boolean
          name: string
          online_bookable?: boolean
          per_unit_label?: string | null
          per_unit_max?: number | null
          per_unit_price?: number | null
          pricing_model: Database["public"]["Enums"]["pricing_model"]
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
          is_active?: boolean
          is_taxable?: boolean
          mobile_eligible?: boolean
          name?: string
          online_bookable?: boolean
          per_unit_label?: string | null
          per_unit_max?: number | null
          per_unit_price?: number | null
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
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
      transaction_items: {
        Row: {
          created_at: string
          id: string
          is_taxable: boolean
          item_name: string
          item_type: Database["public"]["Enums"]["transaction_item_type"]
          notes: string | null
          package_id: string | null
          product_id: string | null
          quantity: number
          service_id: string | null
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
          is_taxable?: boolean
          item_name: string
          item_type: Database["public"]["Enums"]["transaction_item_type"]
          notes?: string | null
          package_id?: string | null
          product_id?: string | null
          quantity?: number
          service_id?: string | null
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
          is_taxable?: boolean
          item_name?: string
          item_type?: Database["public"]["Enums"]["transaction_item_type"]
          notes?: string | null
          package_id?: string | null
          product_id?: string | null
          quantity?: number
          service_id?: string | null
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
          appointment_id: string | null
          coupon_id: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number
          employee_id: string | null
          id: string
          loyalty_discount: number
          loyalty_points_earned: number
          loyalty_points_redeemed: number
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
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
          appointment_id?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          employee_id?: string | null
          id?: string
          loyalty_discount?: number
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
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
          appointment_id?: string | null
          coupon_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          employee_id?: string | null
          id?: string
          loyalty_discount?: number
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
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
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_loyalty_points: {
        Args: { p_transaction_id: string }
        Returns: number
      }
      get_current_employee_id: { Args: never; Returns: string }
      get_current_employee_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin_or_above: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
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
      coupon_status: "active" | "redeemed" | "expired" | "disabled"
      coupon_type: "flat" | "percentage" | "free_addon" | "free_product"
      employee_status: "active" | "inactive" | "terminated"
      lifecycle_action: "sms" | "email" | "both"
      loyalty_action:
        | "earned"
        | "redeemed"
        | "adjusted"
        | "expired"
        | "welcome_bonus"
      payment_method: "cash" | "card" | "split"
      payment_status:
        | "pending"
        | "partial"
        | "paid"
        | "refunded"
        | "partial_refund"
      photo_type: "before" | "after" | "damage"
      po_status:
        | "draft"
        | "submitted"
        | "shipped"
        | "partial"
        | "received"
        | "cancelled"
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
      user_role: "super_admin" | "admin" | "cashier" | "detailer"
      vehicle_size_class: "sedan" | "truck_suv_2row" | "suv_3row_van"
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
      coupon_status: ["active", "redeemed", "expired", "disabled"],
      coupon_type: ["flat", "percentage", "free_addon", "free_product"],
      employee_status: ["active", "inactive", "terminated"],
      lifecycle_action: ["sms", "email", "both"],
      loyalty_action: [
        "earned",
        "redeemed",
        "adjusted",
        "expired",
        "welcome_bonus",
      ],
      payment_method: ["cash", "card", "split"],
      payment_status: [
        "pending",
        "partial",
        "paid",
        "refunded",
        "partial_refund",
      ],
      photo_type: ["before", "after", "damage"],
      po_status: [
        "draft",
        "submitted",
        "shipped",
        "partial",
        "received",
        "cancelled",
      ],
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
      user_role: ["super_admin", "admin", "cashier", "detailer"],
      vehicle_size_class: ["sedan", "truck_suv_2row", "suv_3row_van"],
      vehicle_type: ["standard", "motorcycle", "rv", "boat", "aircraft"],
    },
  },
} as const
