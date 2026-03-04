// Email Template System — Type definitions

// ─── Brand Kit ──────────────────────────────────────────────

export interface BrandKit {
  primary_color: string;
  accent_color: string;
  text_color: string;
  bg_color: string;
  font_family: string;
  logo_url: string;
  logo_width: number;
  social_google: string;
  social_yelp: string;
  social_instagram: string;
  social_facebook: string;
  footer_text: string;
}

// ─── Layouts ────────────────────────────────────────────────

export interface HeaderConfig {
  show_logo: boolean;
  logo_position: 'left' | 'center';
  show_title: boolean;
  title_style?: 'bold' | 'normal';
}

export interface FooterConfig {
  show_social: boolean;
  compact: boolean;
  custom_text?: string;
}

export interface EmailLayout {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  structure_html: string;
  color_overrides: Record<string, string>;
  header_config: HeaderConfig;
  footer_config: FooterConfig;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Content Blocks ─────────────────────────────────────────

export type EmailBlockType =
  | 'text'
  | 'heading'
  | 'button'
  | 'image'
  | 'photo_gallery'
  | 'coupon'
  | 'divider'
  | 'spacer'
  | 'social_links'
  | 'two_column';

export interface TextBlockData {
  content: string;
  align?: 'left' | 'center' | 'right';
}

export interface HeadingBlockData {
  text: string;
  level: 1 | 2 | 3;
  align?: 'left' | 'center' | 'right';
}

export interface ButtonBlockData {
  text: string;
  url: string;
  color: 'primary' | 'accent' | string;
  align?: 'left' | 'center' | 'right';
}

export interface ImageBlockData {
  src: string;
  alt: string;
  width?: number;
  link?: string;
}

export interface PhotoPair {
  before_url: string;
  after_url: string;
  caption?: string;
}

export interface PhotoGalleryBlockData {
  mode: 'manual' | 'dynamic';
  // Manual mode
  pairs?: PhotoPair[];
  // Dynamic mode
  service_match?: boolean;
  zone_filter?: string | null;
  tag_filter?: string[];
  limit?: number;
  // Shared
  gallery_link?: boolean;
}

export interface CouponBlockData {
  heading: string;
  code_variable: string;
  description: string;
  style: 'card' | 'banner' | 'inline';
}

export interface DividerBlockData {
  style: 'solid' | 'dashed' | 'dotted';
  color?: string;
}

export interface SpacerBlockData {
  height: number;
}

export interface SocialLinksBlockData {
  use_brand_kit: boolean;
  custom_links?: Array<{ platform: string; url: string }>;
}

export interface TwoColumnBlockData {
  left: EmailBlock[];
  right: EmailBlock[];
}

export type EmailBlockDataMap = {
  text: TextBlockData;
  heading: HeadingBlockData;
  button: ButtonBlockData;
  image: ImageBlockData;
  photo_gallery: PhotoGalleryBlockData;
  coupon: CouponBlockData;
  divider: DividerBlockData;
  spacer: SpacerBlockData;
  social_links: SocialLinksBlockData;
  two_column: TwoColumnBlockData;
};

export interface EmailBlock<T extends EmailBlockType = EmailBlockType> {
  id: string;
  type: T;
  data: T extends keyof EmailBlockDataMap ? EmailBlockDataMap[T] : Record<string, unknown>;
}

// ─── Templates ──────────────────────────────────────────────

export type EmailTemplateCategory = 'transactional' | 'review' | 'marketing' | 'notification';

export interface EmailTemplate {
  id: string;
  template_key: string | null;
  category: EmailTemplateCategory;
  name: string;
  subject: string;
  preview_text: string;
  layout_id: string;
  body_blocks: EmailBlock[];
  body_html: string | null;
  variables: string[];
  segment_tag: string | null;
  is_system: boolean;
  is_customized: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  // Joined
  layout?: EmailLayout;
}

export interface EmailTemplateAssignment {
  id: string;
  trigger_key: string;
  template_id: string;
  segment_filter: Record<string, unknown> | null;
  priority: number;
  is_active: boolean;
  created_at: string;
  // Joined
  template?: EmailTemplate;
}

// ─── Drip Sequences ─────────────────────────────────────────

export type DripTriggerCondition = 'no_visit_days' | 'after_service' | 'new_customer' | 'manual_enroll' | 'tag_added';
export type DripEnrollmentStatus = 'active' | 'completed' | 'stopped' | 'paused';
export type DripSendStatus = 'sent' | 'failed' | 'skipped';
export type DripStepChannel = 'email' | 'sms' | 'both';

export interface DripStopConditions {
  on_purchase: boolean;
  on_booking: boolean;
  on_reply: boolean;
}

export interface DripSequence {
  id: string;
  name: string;
  description: string | null;
  trigger_condition: DripTriggerCondition;
  trigger_value: Record<string, unknown> | null;
  stop_conditions: DripStopConditions;
  nurture_sequence_id: string | null;
  is_active: boolean;
  audience_filters: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Joined
  steps?: DripStep[];
}

export interface DripStep {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_days: number;
  delay_hours: number;
  channel: DripStepChannel;
  template_id: string | null;
  sms_template: string | null;
  coupon_id: string | null;
  subject_override: string | null;
  exit_condition: string | null;
  exit_action: 'stop' | 'move' | 'tag' | null;
  exit_sequence_id: string | null;
  exit_tag: string | null;
  is_active: boolean;
  created_at: string;
  // Joined
  template?: EmailTemplate;
}

export interface DripEnrollment {
  id: string;
  sequence_id: string;
  customer_id: string;
  current_step: number;
  enrolled_at: string;
  next_send_at: string | null;
  status: DripEnrollmentStatus;
  stopped_reason: string | null;
  stopped_at: string | null;
  nurture_transferred: boolean;
  created_at: string;
}

export interface DripSendLogEntry {
  id: string;
  enrollment_id: string;
  step_id: string;
  step_order: number;
  channel: string;
  status: DripSendStatus;
  mailgun_message_id: string | null;
  coupon_code: string | null;
  sent_at: string;
  error_message: string | null;
}

// ─── Rendering ──────────────────────────────────────────────

export interface ResolvedColors {
  primary_color: string;
  accent_color: string;
  text_color: string;
  bg_color: string;
  font_family: string;
}

export interface RenderOptions {
  isMarketing?: boolean;
  unsubscribeUrl?: string;
  galleryUrl?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
  subject: string;
}

// ─── Customer Attributes (for segment routing) ──────────────

export interface CustomerAttributes {
  vehicle_category?: string;
  tags?: string[];
  customer_type?: string;
  lifetime_spend?: number;
  visit_count?: number;
  [key: string]: unknown;
}
