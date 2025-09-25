export type CampaignStatus = 'draft' | 'in_review' | 'changes_made' | 'sent' | 'failed'
export type UserRole = 'admin' | 'reviewer'
export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface NewsletterCampaign {
  id: string
  date: string
  status: CampaignStatus
  subject_line: string | null
  review_sent_at: string | null
  final_sent_at: string | null
  last_action: 'changes_made' | 'approved' | null
  last_action_at: string | null
  last_action_by: string | null
  status_before_send: CampaignStatus | null
  metrics: Record<string, any>
  created_at: string
  updated_at: string
}

export interface RssFeed {
  id: string
  url: string
  name: string
  active: boolean
  last_processed: string | null
  processing_errors: number
  created_at: string
  updated_at: string
}

export interface RssPost {
  id: string
  feed_id: string
  campaign_id: string
  external_id: string
  title: string
  description: string | null
  content: string | null
  author: string | null
  publication_date: string | null
  source_url: string | null
  image_url: string | null
  processed_at: string
}

export interface PostRating {
  id: string
  post_id: string
  interest_level: number
  local_relevance: number
  community_impact: number
  total_score: number
  ai_reasoning: string | null
  created_at: string
}

export interface Article {
  id: string
  post_id: string
  campaign_id: string
  headline: string
  content: string
  rank: number | null
  is_active: boolean
  skipped: boolean
  fact_check_score: number | null
  fact_check_details: string | null
  word_count: number | null
  review_position: number | null
  final_position: number | null
  created_at: string
  updated_at: string
}

export interface ManualArticle {
  id: string
  campaign_id: string
  title: string
  content: string
  image_url: string | null
  source_url: string | null
  rank: number | null
  is_active: boolean
  review_position: number | null
  final_position: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ArchivedArticle {
  id: string
  original_article_id: string
  post_id: string | null
  campaign_id: string
  headline: string
  content: string
  rank: number | null
  is_active: boolean
  skipped: boolean
  fact_check_score: number | null
  fact_check_details: string | null
  word_count: number | null
  review_position: number | null
  final_position: number | null
  archived_at: string
  archive_reason: string
  campaign_date: string | null
  campaign_status: string | null
  original_created_at: string
  original_updated_at: string
  created_at: string
}

export interface ArchivedRssPost {
  id: string
  original_post_id: string
  feed_id: string
  campaign_id: string
  external_id: string
  title: string
  description: string | null
  content: string | null
  author: string | null
  publication_date: string | null
  source_url: string | null
  image_url: string | null
  processed_at: string
  archived_at: string
  archive_reason: string
  campaign_date: string | null
  created_at: string
}

export interface ArchivedPostRating {
  id: string
  original_rating_id: string
  archived_post_id: string
  interest_level: number
  local_relevance: number
  community_impact: number
  total_score: number
  ai_reasoning: string | null
  archived_at: string
  original_created_at: string
  created_at: string
}

export interface User {
  id: string
  email: string
  name: string | null
  role: UserRole
  last_login: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SystemLog {
  id: string
  level: LogLevel
  message: string
  context: Record<string, any>
  source: string | null
  timestamp: string
}

export interface DuplicateGroup {
  id: string
  campaign_id: string
  primary_post_id: string
  topic_signature: string
  created_at: string
}

export interface DuplicatePost {
  id: string
  group_id: string
  post_id: string
  similarity_score: number
}

export interface EmailMetrics {
  id: string
  campaign_id: string
  mailerlite_campaign_id: string | null
  sent_count: number
  delivered_count: number
  opened_count: number
  clicked_count: number
  bounced_count: number
  unsubscribed_count: number
  open_rate: number | null
  click_rate: number | null
  bounce_rate: number | null
  unsubscribe_rate: number | null
  imported_at: string
}

export interface ArticlePerformance {
  id: string
  article_id: string
  click_count: number
  engagement_score: number | null
  feedback_positive: number
  feedback_negative: number
  created_at: string
}

export interface UserActivity {
  id: string
  user_id: string
  campaign_id: string
  action: string
  details: Record<string, any>
  timestamp: string
}

export interface AppSetting {
  id: string
  key: string
  value: string | null
  description: string | null
  updated_by: string | null
  updated_at: string
}

// Combined types for API responses
export interface ArticleWithPost extends Article {
  rss_post: RssPost & {
    post_rating: PostRating[]
    rss_feed: RssFeed
  }
}

// Local Events types
export interface Event {
  id: string
  external_id: string
  title: string
  description: string | null
  event_summary: string | null
  start_date: string
  end_date: string | null
  venue: string | null
  address: string | null
  url: string | null
  image_url: string | null
  featured: boolean
  active: boolean
  raw_data: any
  created_at: string
  updated_at: string
}

export interface WeatherForecast {
  id: string
  forecast_date: string
  generated_at: string
  weather_data: {
    day: string
    dateLabel: string
    icon: string
    precipitation: number
    high: number
    low: number
    condition: string
  }[]
  html_content: string
  image_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RoadWorkItem {
  road_name: string
  road_range: string
  city_or_township: string
  reason: string
  start_date: string
  expected_reopen: string
  source_url: string
}

export interface RoadWorkData {
  id: string
  campaign_id: string
  generated_at: string
  road_work_data: RoadWorkItem[]
  html_content: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CampaignEvent {
  id: string
  campaign_id: string
  event_id: string
  event_date: string
  is_selected: boolean
  is_featured: boolean
  display_order: number | null
  created_at: string
  event?: Event
}

export interface NewsletterSection {
  id: string
  name: string
  display_order: number
  is_active: boolean
  created_at: string
}

export interface CampaignWithArticles extends NewsletterCampaign {
  articles: ArticleWithPost[]
  manual_articles: ManualArticle[]
  email_metrics: EmailMetrics | null
}

export interface CampaignWithEvents extends CampaignWithArticles {
  campaign_events: CampaignEvent[]
}

// AI Processing types
export interface ContentEvaluation {
  interest_level: number
  local_relevance: number
  community_impact: number
  reasoning: string
}

export interface NewsletterContent {
  headline: string
  content: string
  word_count: number
}

export interface FactCheckResult {
  score: number
  details: string
  passed: boolean
}

export interface SubjectLineGeneration {
  subject_line: string
  character_count: number
}

export interface Wordle {
  id: string
  date: string  // YYYY-MM-DD format
  word: string
  definition: string
  interesting_fact: string
  created_at: string
  updated_at: string
}

export interface VrboListing {
  id: string
  title: string
  main_image_url: string | null
  adjusted_image_url: string | null  // GitHub hosted resized image URL
  city: string | null
  bedrooms: number | null
  bathrooms: number | null
  sleeps: number | null
  link: string  // Tracked affiliate link
  non_tracked_link: string | null  // Original VRBO link
  listing_type: 'Local' | 'Greater'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CampaignVrboSelection {
  id: string
  campaign_id: string
  listing_id: string
  selection_order: number  // 1, 2, 3 for display order
  created_at: string
  listing?: VrboListing
}

export interface VrboSelectionState {
  id: string
  listing_type: 'Local' | 'Greater'
  current_index: number
  shuffle_order: string[]  // Array of listing IDs in shuffled order
  last_updated: string
}

export interface DiningDeal {
  id: string
  business_name: string
  business_address: string | null
  google_profile: string | null  // Google Maps URL
  day_of_week: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
  special_description: string
  special_time: string | null  // e.g., "11AM - 3PM", "All day", etc.
  is_featured: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CampaignDiningSelection {
  id: string
  campaign_id: string
  deal_id: string
  selection_order: number  // 1-8 for display order
  is_featured_in_campaign: boolean  // Whether this deal is featured in this campaign
  created_at: string
  deal?: DiningDeal
}