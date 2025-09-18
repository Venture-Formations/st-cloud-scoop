'use client'

import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('system')

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Settings
          </h1>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {[
                { id: 'system', name: 'System Status' },
                { id: 'email', name: 'Email' },
                { id: 'rss', name: 'RSS Feeds' },
                { id: 'notifications', name: 'Notifications' },
                { id: 'users', name: 'Users' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-brand-primary text-brand-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'system' && <SystemStatus />}
          {activeTab === 'email' && <EmailSettings />}
          {activeTab === 'rss' && <RSSFeeds />}
          {activeTab === 'notifications' && <Notifications />}
          {activeTab === 'users' && <Users />}
        </div>
      </div>
    </Layout>
  )
}

function SystemStatus() {
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSystemStatus()
  }, [])

  const fetchSystemStatus = async () => {
    try {
      const response = await fetch('/api/health')
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      console.error('Failed to fetch system status:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading system status...</div>
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">System Health</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 border rounded-lg">
            <div className={`text-2xl font-bold mb-1 ${
              status?.status === 'healthy' ? 'text-green-600' : 'text-red-600'
            }`}>
              {status?.status === 'healthy' ? '✓' : '✗'}
            </div>
            <div className="text-sm text-gray-600">Overall Status</div>
            <div className="text-xs text-gray-500 mt-1">
              {status?.status || 'Unknown'}
            </div>
          </div>

          <div className="text-center p-4 border rounded-lg">
            <div className={`text-2xl font-bold mb-1 ${
              status?.checks?.database?.healthy ? 'text-green-600' : 'text-red-600'
            }`}>
              {status?.checks?.database?.healthy ? '✓' : '✗'}
            </div>
            <div className="text-sm text-gray-600">Database</div>
            <div className="text-xs text-gray-500 mt-1">Connection</div>
          </div>

          <div className="text-center p-4 border rounded-lg">
            <div className={`text-2xl font-bold mb-1 ${
              status?.checks?.rssFeeds?.healthy ? 'text-green-600' : 'text-red-600'
            }`}>
              {status?.checks?.rssFeeds?.healthy ? '✓' : '✗'}
            </div>
            <div className="text-sm text-gray-600">RSS Feeds</div>
            <div className="text-xs text-gray-500 mt-1">Processing</div>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          Last checked: {status?.timestamp ? new Date(status.timestamp).toLocaleString() : 'Never'}
        </div>

        <button
          onClick={fetchSystemStatus}
          className="mt-4 bg-brand-primary hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium"
        >
          Refresh Status
        </button>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Cron Jobs</h3>

        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b">
            <div>
              <div className="font-medium">RSS Processing</div>
              <div className="text-sm text-gray-600">Daily at 8:30 PM CT</div>
            </div>
            <span className="text-green-600 text-sm">Active</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <div>
              <div className="font-medium">Final Newsletter Send</div>
              <div className="text-sm text-gray-600">Daily at 4:55 AM CT</div>
            </div>
            <span className="text-green-600 text-sm">Active</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b">
            <div>
              <div className="font-medium">Metrics Import</div>
              <div className="text-sm text-gray-600">Daily at 6:00 AM CT</div>
            </div>
            <span className="text-green-600 text-sm">Active</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <div>
              <div className="font-medium">Health Checks</div>
              <div className="text-sm text-gray-600">Every 15 minutes (8 AM - 10 PM CT)</div>
            </div>
            <span className="text-green-600 text-sm">Active</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function RSSFeeds() {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-900">RSS Feed Configuration</h3>
        <button className="bg-brand-primary hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium">
          Add Feed
        </button>
      </div>

      <div className="text-gray-600 mb-4">
        RSS feed management is currently handled through the database.
        Future versions will include a web interface for managing feeds.
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Current Feeds:</h4>
        <ul className="space-y-1 text-sm">
          <li>• St. Cloud Local News (Active)</li>
          <li className="text-gray-500">• Add more feeds through database or API</li>
        </ul>
      </div>
    </div>
  )
}

function Notifications() {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Settings</h3>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="font-medium">Slack Notifications</div>
            <div className="text-sm text-gray-600">Receive alerts for system errors and status updates</div>
          </div>
          <span className="text-green-600 text-sm">
            {process.env.SLACK_WEBHOOK_URL ? 'Configured' : 'Not Configured'}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <div className="font-medium">Email Notifications</div>
            <div className="text-sm text-gray-600">Newsletter review and delivery confirmations</div>
          </div>
          <span className="text-green-600 text-sm">Active</span>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium mb-2">Notification Types:</h4>
          <ul className="space-y-1 text-sm text-gray-600">
            <li>• RSS processing completion/failure</li>
            <li>• Email campaign delivery status</li>
            <li>• System health alerts</li>
            <li>• Error monitoring</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function EmailSettings() {
  const [settings, setSettings] = useState({
    // MailerLite Settings
    reviewGroupId: '',
    mainGroupId: '',
    fromEmail: 'scoop@stcscoop.com',
    senderName: 'St. Cloud Scoop',

    // Review Schedule Settings (Central Time)
    reviewScheduleEnabled: true,
    rssProcessingTime: '20:30',  // 8:30 PM
    campaignCreationTime: '20:50',  // 8:50 PM
    scheduledSendTime: '21:00',  // 9:00 PM

    // Daily Newsletter Settings (Central Time)
    dailyScheduleEnabled: false,
    dailyCampaignCreationTime: '04:30',  // 4:30 AM
    dailyScheduledSendTime: '04:55'  // 4:55 AM
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/settings/email')
      if (response.ok) {
        const data = await response.json()
        // Convert string boolean values back to actual booleans
        const processedData = {
          ...data,
          reviewScheduleEnabled: data.reviewScheduleEnabled === 'true',
          dailyScheduleEnabled: data.dailyScheduleEnabled === 'true'
        }
        setSettings(prev => ({ ...prev, ...processedData }))
      }
    } catch (error) {
      console.error('Failed to load email settings:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage('')

    try {
      const response = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })

      if (response.ok) {
        setMessage('Settings saved successfully!')
        setTimeout(() => setMessage(''), 3000)
      } else {
        throw new Error('Failed to save settings')
      }
    } catch (error) {
      setMessage('Failed to save settings. Please try again.')
      console.error('Save error:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (field: string, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      {/* MailerLite Configuration */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">MailerLite Configuration</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Review Group ID
            </label>
            <input
              type="text"
              value={settings.reviewGroupId}
              onChange={(e) => handleChange('reviewGroupId', e.target.value)}
              placeholder="Group ID for review emails"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Main Group ID
            </label>
            <input
              type="text"
              value={settings.mainGroupId}
              onChange={(e) => handleChange('mainGroupId', e.target.value)}
              placeholder="Group ID for main newsletter"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From Email
            </label>
            <input
              type="email"
              value={settings.fromEmail}
              onChange={(e) => handleChange('fromEmail', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sender Name
            </label>
            <input
              type="text"
              value={settings.senderName}
              onChange={(e) => handleChange('senderName', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
        </div>
      </div>

      {/* Automated Newsletter Review Schedule */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Automated Newsletter Review Schedule</h3>
          <div className="flex items-center">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.reviewScheduleEnabled}
                onChange={(e) => handleChange('reviewScheduleEnabled', e.target.checked)}
                className="sr-only"
              />
              <div className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.reviewScheduleEnabled ? 'bg-brand-primary' : 'bg-gray-300'
              }`}>
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.reviewScheduleEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}></div>
              </div>
              <span className="ml-3 text-sm font-medium text-gray-700">
                {settings.reviewScheduleEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Configure the automated review workflow times (Central Time Zone).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              RSS Processing Time
            </label>
            <input
              type="time"
              value={settings.rssProcessingTime}
              onChange={(e) => handleChange('rssProcessingTime', e.target.value)}
              disabled={!settings.reviewScheduleEnabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">Daily RSS feed processing and article rating</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Campaign Creation Time
            </label>
            <input
              type="time"
              value={settings.campaignCreationTime}
              onChange={(e) => handleChange('campaignCreationTime', e.target.value)}
              disabled={!settings.reviewScheduleEnabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">Newsletter campaign setup and review</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scheduled Send Time
            </label>
            <input
              type="time"
              value={settings.scheduledSendTime}
              onChange={(e) => handleChange('scheduledSendTime', e.target.value)}
              disabled={!settings.reviewScheduleEnabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">Review newsletter delivery</p>
          </div>
        </div>

        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">Review Workflow Overview</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <div>1. <strong>{settings.rssProcessingTime}</strong> - Create tomorrow's campaign and process RSS feeds</div>
            <div>2. <strong>+15 min</strong> - Generate AI subject line from top article (automatic)</div>
            <div>3. <strong>{settings.campaignCreationTime}</strong> - Create review campaign, schedule for 9pm</div>
            <div>4. <strong>{settings.scheduledSendTime}</strong> - MailerLite sends review to review group only</div>
          </div>
        </div>
      </div>

      {/* Automated Daily Newsletter Schedule */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Automated Daily Newsletter Schedule</h3>
          <div className="flex items-center">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.dailyScheduleEnabled}
                onChange={(e) => handleChange('dailyScheduleEnabled', e.target.checked)}
                className="sr-only"
              />
              <div className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.dailyScheduleEnabled ? 'bg-brand-primary' : 'bg-gray-300'
              }`}>
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.dailyScheduleEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}></div>
              </div>
              <span className="ml-3 text-sm font-medium text-gray-700">
                {settings.dailyScheduleEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Configure the automated daily newsletter delivery times (Central Time Zone).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Campaign Creation Time
            </label>
            <input
              type="time"
              value={settings.dailyCampaignCreationTime}
              onChange={(e) => handleChange('dailyCampaignCreationTime', e.target.value)}
              disabled={!settings.dailyScheduleEnabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">Final newsletter campaign creation with any review changes</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Scheduled Send Time
            </label>
            <input
              type="time"
              value={settings.dailyScheduledSendTime}
              onChange={(e) => handleChange('dailyScheduledSendTime', e.target.value)}
              disabled={!settings.dailyScheduleEnabled}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:bg-gray-100"
            />
            <p className="text-xs text-gray-500 mt-1">Final newsletter delivery to main subscriber group</p>
          </div>
        </div>

        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h4 className="font-medium text-green-900 mb-2">Daily Newsletter Workflow</h4>
          <div className="text-sm text-green-800 space-y-1">
            <div>1. <strong>{settings.dailyCampaignCreationTime}</strong> - Create final newsletter with any changes made during review</div>
            <div>2. <strong>{settings.dailyScheduledSendTime}</strong> - Send final newsletter to main subscriber group</div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-primary hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-md font-medium"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {message && (
        <div className={`mt-4 p-4 rounded-md ${
          message.includes('successfully')
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message}
        </div>
      )}
    </div>
  )
}

function Users() {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">User Management</h3>

      <div className="text-gray-600 mb-4">
        User access is managed through Google OAuth. All users with valid Google accounts
        can access the system. Role-based permissions will be added in future versions.
      </div>

      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">Current Access:</h4>
        <ul className="space-y-1 text-sm text-gray-600">
          <li>• All team members can review and modify newsletters</li>
          <li>• Authentication handled via Google OAuth</li>
          <li>• User activity is logged for audit purposes</li>
        </ul>
      </div>
    </div>
  )
}