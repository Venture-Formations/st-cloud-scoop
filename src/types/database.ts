export type CampaignStatus = 'draft' | 'in_review' | 'ready_to_send' | 'sent' | 'failed'
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
  fact_check_score: number | null
  fact_check_details: string | null
  word_count: number | null
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
  created_by: string | null
  created_at: string
  updated_at: string
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

export interface CampaignWithArticles extends NewsletterCampaign {
  articles: ArticleWithPost[]
  manual_articles: ManualArticle[]
  email_metrics: EmailMetrics | null
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