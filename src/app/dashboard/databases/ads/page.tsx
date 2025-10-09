'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import RichTextEditor from '@/components/RichTextEditor'
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import type { Advertisement } from '@/types/database'
import { getCroppedImage } from '@/utils/imageCrop'

export default function AdsManagementPage() {
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'review'>('active')
  const [ads, setAds] = useState<Advertisement[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingAd, setEditingAd] = useState<Advertisement | null>(null)

  useEffect(() => {
    fetchAds()
  }, [activeTab])

  const fetchAds = async () => {
    setLoading(true)
    try {
      let status = ''
      if (activeTab === 'active') {
        status = '?status=approved'
      } else if (activeTab === 'completed') {
        status = '?status=completed'
      } else if (activeTab === 'review') {
        status = '?status=pending_review'
      }

      const response = await fetch(`/api/ads${status}`)
      if (response.ok) {
        const data = await response.json()
        setAds(data.ads || [])
      }
    } catch (error) {
      console.error('Failed to fetch ads:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (adId: string) => {
    if (!confirm('Approve this advertisement?')) return

    try {
      const response = await fetch(`/api/ads/${adId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: 'Admin' }) // TODO: Get from session
      })

      if (response.ok) {
        alert('Ad approved successfully!')
        fetchAds()
      } else {
        throw new Error('Failed to approve ad')
      }
    } catch (error) {
      console.error('Approval error:', error)
      alert('Failed to approve ad')
    }
  }

  const handleReject = async (adId: string) => {
    const reason = prompt('Enter rejection reason:')
    if (!reason) return

    try {
      const response = await fetch(`/api/ads/${adId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rejection_reason: reason,
          rejected_by: 'Admin' // TODO: Get from session
        })
      })

      if (response.ok) {
        alert('Ad rejected successfully!')
        fetchAds()
      } else {
        throw new Error('Failed to reject ad')
      }
    } catch (error) {
      console.error('Rejection error:', error)
      alert('Failed to reject ad')
    }
  }

  const handleDelete = async (adId: string) => {
    if (!confirm('Delete this advertisement? This cannot be undone.')) return

    try {
      const response = await fetch(`/api/ads/${adId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('Ad deleted successfully!')
        fetchAds()
      } else {
        throw new Error('Failed to delete ad')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete ad')
    }
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      pending_payment: 'bg-yellow-100 text-yellow-800',
      pending_review: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      rejected: 'bg-red-100 text-red-800'
    }

    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    )
  }

  const getFrequencyLabel = (frequency: string) => {
    return frequency === 'single' ? 'Single' : frequency === 'weekly' ? 'Weekly' : 'Monthly'
  }

  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <nav className="flex mb-4" aria-label="Breadcrumb">
            <ol className="flex items-center space-x-2">
              <li>
                <Link href="/dashboard/databases" className="text-gray-500 hover:text-gray-700">
                  Databases
                </Link>
              </li>
              <li>
                <span className="text-gray-500">/</span>
              </li>
              <li>
                <span className="text-gray-900 font-medium">Advertisements</span>
              </li>
            </ol>
          </nav>

          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Advertisement Management
              </h1>
              <p className="text-gray-600 mt-1">
                {ads.length} {activeTab} {ads.length === 1 ? 'advertisement' : 'advertisements'}
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Add Advertisement
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('active')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'active'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Active Ads
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'review'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Review Submissions
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'completed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Completed
            </button>
          </nav>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Ads List */}
        {!loading && (
          <div className="space-y-4">
            {ads.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg shadow">
                <p className="text-gray-500">No {activeTab} advertisements found.</p>
              </div>
            ) : (
              ads.map(ad => (
                <div key={ad.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{ad.title}</h3>
                        {getStatusBadge(ad.status)}
                      </div>
                      <p className="text-sm text-gray-600">
                        {ad.business_name} • {getFrequencyLabel(ad.frequency)} • {ad.times_used} / {ad.times_paid} used
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {activeTab === 'review' && (
                        <>
                          <button
                            onClick={() => handleApprove(ad.id)}
                            className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-sm"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(ad.id)}
                            className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 text-sm"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setEditingAd(ad)}
                        className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(ad.id)}
                        className="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: ad.body }}
                    />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t text-sm">
                    <div>
                      <span className="font-medium">Contact:</span>
                      <p className="text-gray-600">{ad.contact_name}</p>
                      <p className="text-gray-600">{ad.contact_email}</p>
                    </div>
                    <div>
                      <span className="font-medium">Preferred Start:</span>
                      <p className="text-gray-600">
                        {ad.preferred_start_date ? new Date(ad.preferred_start_date).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium">Last Used:</span>
                      <p className="text-gray-600">
                        {ad.last_used_date ? new Date(ad.last_used_date).toLocaleDateString() : 'Never'}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium">Payment:</span>
                      <p className="text-gray-600">${ad.payment_amount?.toFixed(2) || '0.00'}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Add Advertisement Modal */}
        {showAddModal && (
          <AddAdModal
            onClose={() => setShowAddModal(false)}
            onSuccess={() => {
              setShowAddModal(false)
              fetchAds()
            }}
          />
        )}

        {/* Edit Advertisement Modal */}
        {editingAd && (
          <EditAdModal
            ad={editingAd}
            onClose={() => setEditingAd(null)}
            onSuccess={() => {
              setEditingAd(null)
              fetchAds()
            }}
          />
        )}
      </div>
    </Layout>
  )
}

// Add Advertisement Modal Component
function AddAdModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    business_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    business_address: '',
    business_website: '',
    frequency: 'single' as 'single' | 'weekly' | 'monthly',
    times_paid: 1,
    preferred_start_date: ''
  })
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => {
        setSelectedImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      let imageUrl = null

      // Upload image if present
      if (selectedImage && completedCrop) {
        const croppedBlob = await getCroppedImage(imgRef.current, completedCrop)
        if (croppedBlob) {
          const imageFormData = new FormData()
          imageFormData.append('image', croppedBlob, 'ad-image.jpg')

          const uploadResponse = await fetch('/api/ads/upload-image', {
            method: 'POST',
            body: imageFormData
          })

          if (uploadResponse.ok) {
            const { url } = await uploadResponse.json()
            imageUrl = url
          } else {
            throw new Error('Failed to upload image')
          }
        }
      }

      // Calculate word count
      const text = formData.body.replace(/<[^>]*>/g, '').trim()
      const words = text.split(/\s+/).filter(w => w.length > 0)
      const wordCount = words.length

      const response = await fetch('/api/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          word_count: wordCount,
          image_url: imageUrl,
          payment_amount: 0, // Admin-created ads are free
          payment_status: 'manual',
          status: 'approved' // Auto-approve admin-created ads
        })
      })

      if (response.ok) {
        alert('Advertisement created successfully!')
        onSuccess()
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create advertisement')
      }
    } catch (error) {
      console.error('Create error:', error)
      alert(error instanceof Error ? error.message : 'Failed to create advertisement')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Add Advertisement</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
              ×
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ad Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Enter ad title"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ad Content * (max 100 words)
            </label>
            <RichTextEditor
              value={formData.body}
              onChange={(html) => setFormData({ ...formData, body: html })}
              maxWords={100}
            />
          </div>

          {/* Image Upload and Cropper */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Advertisement Image (Optional)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              Upload an image for your ad. It will be cropped to 5:4 ratio.
            </p>
          </div>

          {/* Image Cropper */}
          {selectedImage && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Crop Image (5:4 ratio)
              </label>
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={5 / 4}
              >
                <img
                  ref={imgRef}
                  src={selectedImage}
                  alt="Crop preview"
                  style={{ maxWidth: '100%' }}
                />
              </ReactCrop>
            </div>
          )}

          {/* Business Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Name *
              </label>
              <input
                type="text"
                required
                value={formData.business_name}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Name *
              </label>
              <input
                type="text"
                required
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Email *
              </label>
              <input
                type="email"
                required
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Phone
              </label>
              <input
                type="tel"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Address
              </label>
              <input
                type="text"
                value={formData.business_address}
                onChange={(e) => setFormData({ ...formData, business_address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Website URL
              </label>
              <input
                type="url"
                value={formData.business_website}
                onChange={(e) => setFormData({ ...formData, business_website: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="https://"
              />
            </div>
          </div>

          {/* Frequency and Quantity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency *
              </label>
              <select
                required
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="single">Single</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Times Paid *
              </label>
              <input
                type="number"
                required
                min="1"
                max="20"
                value={formData.times_paid}
                onChange={(e) => setFormData({ ...formData, times_paid: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preferred Start Date
              </label>
              <input
                type="date"
                value={formData.preferred_start_date}
                onChange={(e) => setFormData({ ...formData, preferred_start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-blue-300"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create Advertisement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit Advertisement Modal Component
function EditAdModal({ ad, onClose, onSuccess }: { ad: Advertisement; onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    title: ad.title,
    body: ad.body,
    business_name: ad.business_name,
    contact_name: ad.contact_name,
    contact_email: ad.contact_email,
    contact_phone: ad.contact_phone || '',
    business_address: ad.business_address || '',
    business_website: ad.business_website || ''
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const response = await fetch(`/api/ads/${ad.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        alert('Advertisement updated successfully!')
        onSuccess()
      } else {
        throw new Error('Failed to update advertisement')
      }
    } catch (error) {
      console.error('Update error:', error)
      alert('Failed to update advertisement')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Edit Advertisement</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
              ×
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ad Title *
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ad Content * (max 100 words)
            </label>
            <RichTextEditor
              value={formData.body}
              onChange={(html) => setFormData({ ...formData, body: html })}
              maxWords={100}
            />
          </div>

          {/* Business Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Name *
              </label>
              <input
                type="text"
                required
                value={formData.business_name}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Name *
              </label>
              <input
                type="text"
                required
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Email *
              </label>
              <input
                type="email"
                required
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Phone
              </label>
              <input
                type="tel"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Address
              </label>
              <input
                type="text"
                value={formData.business_address}
                onChange={(e) => setFormData({ ...formData, business_address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Website URL
              </label>
              <input
                type="url"
                value={formData.business_website}
                onChange={(e) => setFormData({ ...formData, business_website: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="https://"
              />
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-blue-300"
              disabled={submitting}
            >
              {submitting ? 'Updating...' : 'Update Advertisement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
