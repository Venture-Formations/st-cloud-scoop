'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Layout from '@/components/Layout'
import type { CampaignWithArticles, ArticleWithPost, CampaignEvent, Event } from '@/types/database'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import {
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Events Manager Component
function EventsManager({
  campaign,
  availableEvents,
  campaignEvents,
  onUpdateEvents,
  updating
}: {
  campaign: CampaignWithArticles | null
  availableEvents: Event[]
  campaignEvents: CampaignEvent[]
  onUpdateEvents: (eventDate: string, selectedEvents: string[], featuredEvent?: string) => void
  updating: boolean
}) {
  if (!campaign) return null

  // Calculate 3-day range starting 12 hours from campaign creation in Central Time
  const campaignCreated = new Date(campaign.created_at)

  // Convert to Central Time (-5 hours from UTC)
  const centralTimeOffset = -5 * 60 * 60 * 1000 // -5 hours in milliseconds
  const campaignCreatedCentral = new Date(campaignCreated.getTime() + centralTimeOffset)

  // Add 12 hours to get start time in Central Time
  const startDateTime = new Date(campaignCreatedCentral.getTime() + (12 * 60 * 60 * 1000))

  const dates = []
  for (let i = 0; i <= 2; i++) {
    const date = new Date(startDateTime)
    date.setDate(startDateTime.getDate() + i)
    dates.push(date.toISOString().split('T')[0])
  }

  const getEventsForDate = (date: string) => {
    // Create date range in Central Time (UTC-5)
    const dateStart = new Date(date + 'T00:00:00-05:00')
    const dateEnd = new Date(date + 'T23:59:59-05:00')

    return availableEvents.filter(event => {
      const eventStart = new Date(event.start_date)
      const eventEnd = event.end_date ? new Date(event.end_date) : eventStart

      // Event overlaps with this date
      return (eventStart <= dateEnd && eventEnd >= dateStart)
    })
  }

  const getSelectedEventsForDate = (date: string) => {
    return campaignEvents
      .filter(ce => ce.event_date === date && ce.is_selected)
      .sort((a, b) => (a.display_order || 999) - (b.display_order || 999))
  }

  const getFeaturedEventForDate = (date: string) => {
    const featured = campaignEvents.find(ce => ce.event_date === date && ce.is_featured)
    return featured?.event_id
  }

  const handleEventToggle = (date: string, eventId: string, isSelected: boolean) => {
    const currentSelected = getSelectedEventsForDate(date).map(ce => ce.event_id)
    const currentFeatured = getFeaturedEventForDate(date)

    let newSelected: string[]
    if (isSelected) {
      // Add event if under limit
      if (currentSelected.length < 8) {
        newSelected = [...currentSelected, eventId]
      } else {
        return // Don't add if at limit
      }
    } else {
      // Remove event
      newSelected = currentSelected.filter(id => id !== eventId)
    }

    // Clear featured if we're removing the featured event
    const newFeatured = newSelected.includes(currentFeatured || '') ? currentFeatured : undefined

    onUpdateEvents(date, newSelected, newFeatured)
  }

  const handleFeaturedToggle = (date: string, eventId: string) => {
    const currentSelected = getSelectedEventsForDate(date).map(ce => ce.event_id)
    const currentFeatured = getFeaturedEventForDate(date)

    const newFeatured = currentFeatured === eventId ? undefined : eventId
    onUpdateEvents(date, currentSelected, newFeatured)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatEventTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        Select up to 8 events per day. Mark one event as "featured" to highlight it in the newsletter.
      </div>

      {/* 3-Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {dates.map(date => {
          const dateEvents = getEventsForDate(date)
          const selectedEvents = getSelectedEventsForDate(date)
          const featuredEventId = getFeaturedEventForDate(date)

          return (
            <div key={date} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Date Header */}
              <div className="bg-blue-600 text-white px-4 py-3">
                <h3 className="text-lg font-semibold text-center">
                  {formatDate(date)}
                </h3>
                <div className="text-sm text-blue-100 text-center mt-1">
                  {selectedEvents.length}/8 events selected
                </div>
              </div>

              {/* Events List */}
              <div className="p-4 bg-white min-h-[400px]">
                {dateEvents.length === 0 ? (
                  <div className="text-gray-500 text-sm py-8 text-center">
                    No events available for this date
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dateEvents.map(event => {
                      const isSelected = selectedEvents.some(ce => ce.event_id === event.id)
                      const isFeatured = featuredEventId === event.id

                      return (
                        <div
                          key={event.id}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            isFeatured
                              ? 'border-blue-500 bg-blue-50 shadow-md'
                              : isSelected
                                ? 'border-green-300 bg-green-50'
                                : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {/* Event Header with Checkbox */}
                          <div className="flex items-start justify-between mb-2">
                            <button
                              onClick={() => handleEventToggle(date, event.id, !isSelected)}
                              disabled={updating || (!isSelected && selectedEvents.length >= 8)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                isSelected
                                  ? 'bg-brand-primary border-brand-primary text-white'
                                  : 'border-gray-300 hover:border-gray-400'
                              } ${updating || (!isSelected && selectedEvents.length >= 8) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {isSelected && (
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>

                            {isSelected && (
                              <button
                                onClick={() => handleFeaturedToggle(date, event.id)}
                                disabled={updating}
                                className={`px-2 py-1 text-xs rounded border ${
                                  isFeatured
                                    ? 'bg-blue-500 text-white border-blue-500'
                                    : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                                } ${updating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                {isFeatured ? '⭐ Featured' : 'Feature'}
                              </button>
                            )}
                          </div>


                          {/* Event Details */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-2 leading-tight">
                              {event.title}
                            </h4>
                            <div className="text-xs text-gray-600 space-y-1">
                              <div className="font-medium">{formatEventTime(event.start_date)}</div>
                              {event.venue && <div>{event.venue}</div>}
                              {event.address && <div className="text-gray-500">{event.address}</div>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Sortable Article Component
function SortableArticle({
  article,
  toggleArticle,
  saving,
  getScoreColor
}: {
  article: ArticleWithPost
  toggleArticle: (id: string, currentState: boolean) => void
  saving: boolean
  getScoreColor: (score: number) => string
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: article.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-6 ${isDragging ? 'bg-gray-50' : ''} ${article.is_active ? 'border-l-4 border-blue-500' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-start space-x-3 mb-2">
            <button
              onClick={() => toggleArticle(article.id, article.is_active)}
              disabled={saving}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-1 ${
                article.is_active
                  ? 'bg-brand-primary border-brand-primary text-white'
                  : 'border-gray-300 hover:border-gray-400'
              } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {article.is_active && (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Drag handle for active articles only */}
            {article.is_active && (
              <div
                {...attributes}
                {...listeners}
                className="flex-shrink-0 cursor-move mt-1 p-1 text-gray-400 hover:text-gray-600"
                title="Drag to reorder"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zM6 6h8v2H6V6zm0 4h8v2H6v-2zm0 4h8v2H6v-2z"/>
                </svg>
              </div>
            )}

            {/* Article image thumbnail */}
            {article.rss_post?.image_url && (
              <div className="flex-shrink-0">
                <img
                  src={article.rss_post.image_url}
                  alt=""
                  className="w-16 h-16 object-cover rounded-md border border-gray-200"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  {article.is_active && article.rank && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      #{article.rank}
                    </span>
                  )}
                  <h3 className="text-lg font-medium text-gray-900 pr-2">
                    {article.headline}
                  </h3>
                </div>
                {article.rss_post?.post_rating?.[0] && (
                  <div className="flex space-x-1 text-xs flex-shrink-0">
                    <span className={`font-medium ${getScoreColor(article.rss_post.post_rating[0].total_score)}`}>
                      Score: {article.rss_post.post_rating[0].total_score}/30
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <p className="text-gray-700 mb-3">
            {article.content}
          </p>

          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center space-x-4">
              <span>Source: {article.rss_post?.rss_feed?.name}</span>
              <span>{article.word_count} words</span>
              {article.fact_check_score && (
                <span className={getScoreColor(article.fact_check_score)}>
                  Fact-check: {article.fact_check_score}/30
                </span>
              )}
            </div>
            {article.rss_post?.source_url && (
              <a
                href={article.rss_post.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-primary hover:text-blue-700"
              >
                View Original
              </a>
            )}
          </div>

          {article.rss_post?.post_rating?.[0] && (
            <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-gray-600">Interest:</span>
                <span className="ml-1 font-medium">{article.rss_post.post_rating[0].interest_level}/10</span>
              </div>
              <div>
                <span className="text-gray-600">Relevance:</span>
                <span className="ml-1 font-medium">{article.rss_post.post_rating[0].local_relevance}/10</span>
              </div>
              <div>
                <span className="text-gray-600">Impact:</span>
                <span className="ml-1 font-medium">{article.rss_post.post_rating[0].community_impact}/10</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CampaignDetailPage() {
  const params = useParams()
  const [campaign, setCampaign] = useState<CampaignWithArticles | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [sendingReview, setSendingReview] = useState(false)
  const [generatingSubject, setGeneratingSubject] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Events state
  const [campaignEvents, setCampaignEvents] = useState<CampaignEvent[]>([])
  const [availableEvents, setAvailableEvents] = useState<Event[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [eventsExpanded, setEventsExpanded] = useState(false)
  const [updatingEvents, setUpdatingEvents] = useState(false)
  const [articlesExpanded, setArticlesExpanded] = useState(true)

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    if (params.id) {
      fetchCampaign(params.id as string)
      fetchCampaignEvents(params.id as string)
    }
  }, [params.id])

  const fetchCampaign = async (id: string) => {
    try {
      const response = await fetch(`/api/campaigns/${id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch campaign')
      }
      const data = await response.json()
      setCampaign(data.campaign)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const fetchCampaignEvents = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/events`)
      if (response.ok) {
        const data = await response.json()
        setCampaignEvents(data.campaign_events || [])
      }
    } catch (error) {
      console.error('Failed to fetch campaign events:', error)
    }
  }

  const fetchAvailableEvents = async (startDate: string, endDate: string) => {
    setLoadingEvents(true)
    try {
      const response = await fetch(`/api/events?start_date=${startDate}&end_date=${endDate}&active=true`)
      if (response.ok) {
        const data = await response.json()
        setAvailableEvents(data.events || [])
      }
    } catch (error) {
      console.error('Failed to fetch available events:', error)
    } finally {
      setLoadingEvents(false)
    }
  }

  const toggleArticle = async (articleId: string, currentState: boolean) => {
    if (!campaign) return

    // Prevent selecting a 6th article - simply return without action
    if (!currentState) { // currentState is false means we're trying to activate
      const activeCount = campaign.articles.filter(article => article.is_active).length
      if (activeCount >= 5) {
        return // No action taken, no alert - just prevent the selection
      }
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/articles`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          article_updates: [{
            article_id: articleId,
            is_active: !currentState
          }]
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update article')
      }

      // Update local state
      setCampaign(prev => {
        if (!prev) return prev
        return {
          ...prev,
          articles: prev.articles.map(article =>
            article.id === articleId
              ? { ...article, is_active: !currentState }
              : article
          )
        }
      })

    } catch (error) {
      alert('Failed to update article: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const previewNewsletter = async () => {
    if (!campaign) return

    try {
      console.log('Calling preview API for campaign:', campaign.id)
      const response = await fetch(`/api/campaigns/${campaign.id}/preview`)
      console.log('Preview API response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const errorMessage = errorData?.error || `HTTP ${response.status}: ${response.statusText}`
        console.error('Preview API error:', errorMessage)
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('Preview data received:', !!data.html, 'HTML length:', data.html?.length)
      setPreviewHtml(data.html)
      setShowPreview(true)
    } catch (error) {
      console.error('Preview error:', error)
      alert('Failed to generate preview: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const processRSSFeeds = async () => {
    if (!campaign) return

    setProcessing(true)
    setProcessingStatus('Initializing RSS processing...')

    try {
      // Start the processing
      setProcessingStatus('Fetching RSS feeds...')

      // Start processing in the background
      const processPromise = fetch('/api/rss/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_id: campaign.id
        })
      })

      // Poll for status updates while processing
      const statusInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/rss/status/${campaign.id}`)
          if (statusResponse.ok) {
            const statusData = await statusResponse.json()

            if (statusData.counts.posts > 0) {
              setProcessingStatus(`Found ${statusData.counts.posts} posts, evaluating with AI...`)
            }

            if (statusData.counts.articles > 0) {
              setProcessingStatus(`Generated ${statusData.counts.articles} articles, finalizing...`)
            }
          }
        } catch (error) {
          // Silent fail for status updates
        }
      }, 2000)

      // Wait for processing to complete
      const response = await processPromise
      clearInterval(statusInterval)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to process RSS feeds')
      }

      setProcessingStatus('Processing complete! Refreshing articles...')

      // Refresh the campaign data to show new articles
      await fetchCampaign(campaign.id)

      setProcessingStatus('Done!')
      setTimeout(() => setProcessingStatus(''), 2000)
    } catch (error) {
      setProcessingStatus('')
      alert('Failed to process RSS feeds: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setProcessing(false)
    }
  }

  const sendForReview = async () => {
    if (!campaign) return

    // Check if there are any active articles
    const activeArticles = campaign.articles.filter(article => article.is_active)
    if (activeArticles.length === 0) {
      alert('Please select at least one article before sending for review.')
      return
    }

    setSendingReview(true)
    try {
      // First, generate subject line with AI if not already set
      let subjectLine = campaign.subject_line
      console.log('Current campaign subject line:', subjectLine)

      if (!subjectLine || subjectLine.trim() === '') {
        console.log('Generating AI subject line...')
        const subjectResponse = await fetch(`/api/campaigns/${campaign.id}/generate-subject`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        })

        if (subjectResponse.ok) {
          const subjectData = await subjectResponse.json()
          subjectLine = subjectData.subject_line

          console.log('AI generated subject line:', subjectLine)

          // Update campaign locally with new subject line
          setCampaign(prev => {
            if (!prev) return prev
            return {
              ...prev,
              subject_line: subjectLine
            }
          })
        } else {
          const errorData = await subjectResponse.json().catch(() => null)
          console.error('Failed to generate subject line:', subjectResponse.status, errorData)
          alert(`Warning: Could not generate AI subject line. Error: ${errorData?.error || 'Unknown error'}. Proceeding with default subject.`)
        }
      } else {
        console.log('Skipping AI generation - subject line already exists:', subjectLine)
      }

      // Now send for review - make sure we're using updated subject line
      console.log('About to send for review with subject line:', subjectLine)
      console.log('Campaign object subject_line before send:', campaign.subject_line)

      // Add a small delay to ensure database is updated
      await new Promise(resolve => setTimeout(resolve, 1000))

      const response = await fetch(`/api/campaigns/${campaign.id}/send-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          force_subject_line: subjectLine // Send the generated subject line directly
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send review')
      }

      const data = await response.json()

      // Update campaign status locally
      setCampaign(prev => {
        if (!prev) return prev
        return {
          ...prev,
          status: 'in_review'
        }
      })

      alert('Newsletter sent for review successfully!')

    } catch (error) {
      alert('Failed to send for review: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setSendingReview(false)
    }
  }

  const generateSubjectLine = async () => {
    if (!campaign) return

    // Check if there are any active articles
    const activeArticles = campaign.articles.filter(article => article.is_active)
    if (activeArticles.length === 0) {
      alert('Please select at least one article before generating a subject line.')
      return
    }

    setGeneratingSubject(true)
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/generate-subject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate subject line')
      }

      const data = await response.json()

      // Update campaign locally with new subject line
      setCampaign(prev => {
        if (!prev) return prev
        return {
          ...prev,
          subject_line: data.subject_line
        }
      })

      console.log(`Generated subject line: "${data.subject_line}" (${data.character_count} characters)`)

    } catch (error) {
      alert('Failed to generate subject line: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setGeneratingSubject(false)
    }
  }

  const updateEventSelections = async (eventDate: string, selectedEvents: string[], featuredEvent?: string) => {
    if (!campaign) return

    setUpdatingEvents(true)
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/events`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_date: eventDate,
          selected_events: selectedEvents,
          featured_event: featuredEvent
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update events')
      }

      // Refresh campaign events
      await fetchCampaignEvents(campaign.id)

    } catch (error) {
      alert('Failed to update events: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setUpdatingEvents(false)
    }
  }

  const handleEventsExpand = () => {
    if (!eventsExpanded && campaign) {
      // Calculate 3-day range starting 12 hours from campaign creation
      const campaignCreated = new Date(campaign.created_at)
      const startDateTime = new Date(campaignCreated.getTime() + (12 * 60 * 60 * 1000)) // Add 12 hours
      const startDate = new Date(startDateTime)
      const endDate = new Date(startDateTime)
      endDate.setDate(startDateTime.getDate() + 2)

      const startDateStr = startDate.toISOString().split('T')[0]
      const endDateStr = endDate.toISOString().split('T')[0]

      fetchAvailableEvents(startDateStr, endDateStr)
    }
    setEventsExpanded(!eventsExpanded)
  }

  const getScoreColor = (score: number) => {
    if (score >= 25) return 'text-green-600'
    if (score >= 20) return 'text-yellow-600'
    return 'text-red-600'
  }

  const formatStatus = (status: string) => {
    switch (status) {
      case 'draft': return 'Draft'
      case 'in_review': return 'In Review'
      case 'ready_to_send': return 'Ready to Send'
      case 'sent': return 'Sent'
      case 'failed': return 'Failed'
      default: return status
    }
  }

  const updateCampaignStatus = async (action: 'changes_made' | 'approved') => {
    if (!campaign) return

    setUpdatingStatus(true)
    try {
      const response = await fetch(`/api/campaigns/${campaign.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update campaign status')
      }

      const data = await response.json()

      // Update local campaign state
      setCampaign(prev => {
        if (!prev) return prev
        return {
          ...prev,
          status: 'ready_to_send',
          last_action: action,
          last_action_at: data.campaign.last_action_at,
          last_action_by: data.campaign.last_action_by
        }
      })

      const actionText = action === 'changes_made' ? 'Changes Made' : 'Approved'
      alert(`Campaign marked as "${actionText}" and moved to Ready to Send status.${action === 'changes_made' ? ' Slack notification sent.' : ''}`)

    } catch (error) {
      alert('Failed to update campaign status: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (active.id !== over?.id && campaign) {
      const activeArticles = campaign.articles.filter(article => article.is_active)
      const oldIndex = activeArticles.findIndex(article => article.id === active.id)
      const newIndex = activeArticles.findIndex(article => article.id === over?.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(activeArticles, oldIndex, newIndex)

        // Update local state immediately for UI responsiveness
        setCampaign(prev => {
          if (!prev) return prev
          const updatedArticles = [...prev.articles]
          const activeIds = newOrder.map(article => article.id)

          // Update ranks for active articles based on new order
          updatedArticles.forEach(article => {
            if (article.is_active) {
              const newRank = activeIds.indexOf(article.id) + 1
              article.rank = newRank
            }
          })

          return { ...prev, articles: updatedArticles }
        })

        // Send update to server
        try {
          const articleOrders = newOrder.map((article, index) => ({
            articleId: article.id,
            rank: index + 1
          }))

          await fetch(`/api/campaigns/${campaign.id}/articles/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ articleOrders })
          })
        } catch (error) {
          console.error('Failed to update article order:', error)
          // Optionally refresh the campaign to revert changes
        }
      }
    }
  }

  const formatDate = (dateString: string) => {
    // Parse date as local date to avoid timezone offset issues
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(year, month - 1, day) // month is 0-indexed
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
        </div>
      </Layout>
    )
  }

  if (error || !campaign) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="text-red-600 mb-4">
            {error || 'Campaign not found'}
          </div>
          <a href="/dashboard/campaigns" className="text-brand-primary hover:text-blue-700">
            Back to Campaigns
          </a>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        {/* Campaign Header */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Newsletter for {formatDate(campaign.date)}
              </h1>
              <div className="flex items-center space-x-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  campaign.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                  campaign.status === 'in_review' ? 'bg-yellow-100 text-yellow-800' :
                  campaign.status === 'ready_to_send' ? 'bg-blue-100 text-blue-800' :
                  campaign.status === 'sent' ? 'bg-green-100 text-green-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {formatStatus(campaign.status)}
                </span>
                <span className="text-sm text-gray-500">
                  {campaign.articles.length} articles selected
                </span>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={processRSSFeeds}
                disabled={processing || saving || sendingReview || generatingSubject}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
              >
                {processing ? 'Processing...' : 'Process RSS Feeds'}
              </button>
              <button
                onClick={previewNewsletter}
                disabled={saving || sendingReview || generatingSubject}
                className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-800 px-4 py-2 rounded text-sm font-medium"
              >
                Preview Newsletter
              </button>
              <button
                onClick={sendForReview}
                disabled={saving || sendingReview || generatingSubject || campaign.status === 'sent' || campaign.status === 'ready_to_send'}
                className="bg-brand-primary hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
              >
                {sendingReview ? (generatingSubject ? 'Generating Subject...' : 'Sending...') : 'Send for Review'}
              </button>
            </div>
          </div>

          {processingStatus && (
            <div className="text-sm text-blue-600 font-medium mt-3 text-center">
              {processingStatus}
            </div>
          )}

          {/* Subject Line Section */}
          <div className="mt-4 p-3 bg-gray-50 rounded">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="text-sm text-gray-600 mb-1">Subject Line:</div>
                {campaign.subject_line ? (
                  <div className="font-medium text-gray-900">{campaign.subject_line}</div>
                ) : (
                  <div className="text-gray-500 italic">No subject line generated yet</div>
                )}
              </div>
              <button
                onClick={generateSubjectLine}
                disabled={generatingSubject || processing || sendingReview}
                className="ml-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-3 py-1 rounded text-sm font-medium"
              >
                {generatingSubject ? 'Generating...' : campaign.subject_line ? 'Regenerate' : 'Generate'}
              </button>
            </div>
          </div>

          {/* Campaign Approval Buttons */}
          <div className="mt-4 flex justify-end space-x-3">
            <button
              onClick={() => updateCampaignStatus('changes_made')}
              disabled={updatingStatus}
              className="bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium text-sm flex items-center"
            >
              {updatingStatus ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </>
              ) : (
                'Changes Made'
              )}
            </button>
            <button
              onClick={() => updateCampaignStatus('approved')}
              disabled={updatingStatus}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-md font-medium text-sm flex items-center"
            >
              {updatingStatus ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating...
                </>
              ) : (
                'Approved'
              )}
            </button>
          </div>
        </div>

        {/* Articles Section */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">
                The Local Scoop ({campaign.articles.length})
              </h2>
              <button
                onClick={() => setArticlesExpanded(!articlesExpanded)}
                className="flex items-center space-x-2 text-sm text-brand-primary hover:text-blue-700"
              >
                <span>{articlesExpanded ? 'Minimize' : 'Expand'}</span>
                <svg
                  className={`w-4 h-4 transform transition-transform ${articlesExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-sm text-gray-600">
                Toggle articles on/off for the newsletter. Articles are ranked by AI evaluation.
              </p>
              <div className="text-sm">
                <span className={`font-medium ${campaign.articles.filter(a => a.is_active).length === 5 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {campaign.articles.filter(a => a.is_active).length}/5 selected
                </span>
                <span className="text-gray-500 ml-1">for newsletter</span>
              </div>
            </div>
          </div>

          {articlesExpanded && (
            <div className="divide-y divide-gray-200">
              {campaign.articles.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <p className="mb-4">No articles generated yet. Run RSS processing to generate articles.</p>
                <button
                  onClick={processRSSFeeds}
                  disabled={processing}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium"
                >
                  {processing ? 'Processing...' : 'Process RSS Feeds'}
                </button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                {/* Active articles section - sortable */}
                {(() => {
                  const activeArticles = campaign.articles
                    .filter(article => article.is_active)
                    .sort((a, b) => (a.rank || 999) - (b.rank || 999))

                  const inactiveArticles = campaign.articles
                    .filter(article => !article.is_active)
                    .sort((a, b) => (b.rss_post?.post_rating?.[0]?.total_score || 0) - (a.rss_post?.post_rating?.[0]?.total_score || 0))

                  return (
                    <>
                      {activeArticles.length > 0 && (
                        <>
                          <div className="px-6 py-3 bg-blue-50 border-b">
                            <h3 className="text-sm font-medium text-blue-900">
                              Selected Articles (Drag to reorder)
                            </h3>
                          </div>
                          <SortableContext
                            items={activeArticles.map(article => article.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {activeArticles.map((article) => (
                              <SortableArticle
                                key={article.id}
                                article={article}
                                toggleArticle={toggleArticle}
                                saving={saving}
                                getScoreColor={getScoreColor}
                              />
                            ))}
                          </SortableContext>
                        </>
                      )}

                      {inactiveArticles.length > 0 && (
                        <>
                          <div className="px-6 py-3 bg-gray-50 border-b">
                            <h3 className="text-sm font-medium text-gray-700">
                              Available Articles (Click to add)
                            </h3>
                          </div>
                          {inactiveArticles.map((article) => (
                            <SortableArticle
                              key={article.id}
                              article={article}
                              toggleArticle={toggleArticle}
                              saving={saving}
                              getScoreColor={getScoreColor}
                            />
                          ))}
                        </>
                      )}
                    </>
                  )
                })()}
              </DndContext>
            )}
            </div>
          )}
          {!articlesExpanded && (
            <div className="px-6 pb-4">
              <div className="text-sm text-gray-600">
                The Local Scoop articles configured for this newsletter. Click "Expand" to modify selections.
              </div>
            </div>
          )}
        </div>

        {/* Local Events Section */}
        <div className="bg-white shadow rounded-lg mt-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">
                Local Events
              </h2>
              <button
                onClick={handleEventsExpand}
                className="flex items-center space-x-2 text-sm text-brand-primary hover:text-blue-700"
              >
                <span>{eventsExpanded ? 'Collapse' : 'Manage Events'}</span>
                <svg
                  className={`w-4 h-4 transform transition-transform ${eventsExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {campaignEvents.length > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                {campaignEvents.length} events selected across dates
              </p>
            )}
          </div>

          {eventsExpanded && (
            <div className="p-6">
              {loadingEvents ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                  <span className="ml-3 text-gray-600">Loading events...</span>
                </div>
              ) : (
                <EventsManager
                  campaign={campaign}
                  availableEvents={availableEvents}
                  campaignEvents={campaignEvents}
                  onUpdateEvents={updateEventSelections}
                  updating={updatingEvents}
                />
              )}
            </div>
          )}

          {!eventsExpanded && campaignEvents.length > 0 && (
            <div className="px-6 pb-4">
              <div className="text-sm text-gray-600">
                Events configured for this newsletter. Click "Manage Events" to modify selections.
              </div>
            </div>
          )}
        </div>

        {/* Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex justify-between items-center p-4 border-b">
                <h3 className="text-lg font-medium text-gray-900">
                  Newsletter Preview
                </h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      if (previewHtml) {
                        const blob = new Blob([previewHtml], { type: 'text/html' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `newsletter-${campaign?.date}.html`
                        a.click()
                        URL.revokeObjectURL(url)
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Download HTML
                  </button>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {previewHtml && (
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-full min-h-[600px]"
                    title="Newsletter Preview"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}