import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { authOptions } from '@/lib/auth'
import { SlackNotificationService } from '@/lib/slack'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action } = await request.json()

    if (!action || !['changes_made', 'approved'].includes(action)) {
      return NextResponse.json({
        error: 'Invalid action. Must be "changes_made" or "approved"'
      }, { status: 400 })
    }

    const { id: campaignId } = await params

    // Get current campaign
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({
        error: 'Campaign not found'
      }, { status: 404 })
    }

    // Update campaign status to ready_to_send and record the action
    const { error: updateError } = await supabaseAdmin
      .from('newsletter_campaigns')
      .update({
        status: 'ready_to_send',
        last_action: action,
        last_action_at: new Date().toISOString(),
        last_action_by: session.user?.email || 'unknown'
      })
      .eq('id', campaignId)

    if (updateError) {
      console.error('Failed to update campaign status:', updateError)
      return NextResponse.json({
        error: 'Failed to update campaign status'
      }, { status: 500 })
    }

    // If changes were made, send Slack notification
    if (action === 'changes_made') {
      try {
        const slack = new SlackNotificationService()
        const campaignName = campaign.subject_line || `Campaign for ${campaign.date}`
        const userName = session.user?.name || session.user?.email || 'Unknown User'

        await slack.sendAlert(
          `Changes to "${campaignName}" made by ${userName}`,
          'info',
          {
            campaign_id: campaignId,
            campaign_date: campaign.date,
            user: userName,
            action: 'changes_made'
          }
        )
      } catch (slackError) {
        console.error('Failed to send Slack notification:', slackError)
        // Don't fail the request if Slack fails
      }
    }

    // Log the action
    try {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', session.user?.email)
        .single()

      if (user) {
        await supabaseAdmin
          .from('user_activities')
          .insert([{
            user_id: user.id,
            action: `campaign_${action}`,
            details: {
              campaign_id: campaignId,
              campaign_date: campaign.date,
              action: action,
              previous_status: campaign.status
            }
          }])
      }
    } catch (logError) {
      console.error('Failed to log user activity:', logError)
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      message: action === 'changes_made'
        ? 'Campaign marked as having changes and moved to ready to send status'
        : 'Campaign approved and moved to ready to send status',
      campaign: {
        id: campaignId,
        status: 'ready_to_send',
        last_action: action,
        last_action_at: new Date().toISOString(),
        last_action_by: session.user?.email
      }
    })

  } catch (error) {
    console.error('Campaign status update failed:', error)
    return NextResponse.json({
      error: 'Failed to update campaign status',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}