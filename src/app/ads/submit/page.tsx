'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import RichTextEditor from '@/components/RichTextEditor'
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import type { AdFrequency, AdPricingTier } from '@/types/database'
import { getCroppedImage } from '@/utils/imageCrop'

interface AdFormData {
  title: string
  body: string
  business_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  business_address: string
  business_website: string
  frequency: AdFrequency
  times: number
  preferred_start_date: string
}

export default function SubmitAdPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [pricingTiers, setPricingTiers] = useState<AdPricingTier[]>([])
  const [calculatedPrice, setCalculatedPrice] = useState<number>(0)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const [formData, setFormData] = useState<AdFormData>({
    title: '',
    body: '',
    business_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    business_address: '',
    business_website: '',
    frequency: 'single',
    times: 1,
    preferred_start_date: ''
  })

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

  useEffect(() => {
    loadPricingTiers()
  }, [])

  useEffect(() => {
    calculatePrice()
  }, [formData.frequency, formData.times, pricingTiers])

  const loadPricingTiers = async () => {
    try {
      const response = await fetch('/api/settings/ad-pricing')
      if (response.ok) {
        const data = await response.json()
        setPricingTiers(data.tiers || [])
      }
    } catch (error) {
      console.error('Failed to load pricing:', error)
    }
  }

  const calculatePrice = () => {
    if (!pricingTiers.length) return

    // Find applicable tier based on frequency and quantity
    const applicableTiers = pricingTiers
      .filter(tier => tier.frequency === formData.frequency)
      .filter(tier =>
        formData.times >= tier.min_quantity &&
        (tier.max_quantity === null || formData.times <= tier.max_quantity)
      )
      .sort((a, b) => b.min_quantity - a.min_quantity) // Highest tier first

    if (applicableTiers.length > 0) {
      const tier = applicableTiers[0]
      const totalPrice = tier.price_per_unit * formData.times
      setCalculatedPrice(totalPrice)
    } else {
      setCalculatedPrice(0)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.title || !formData.body) {
      alert('Please fill in title and ad content')
      return
    }

    if (!formData.business_name || !formData.contact_name || !formData.contact_email) {
      alert('Please fill in all business and contact information')
      return
    }

    if (!formData.preferred_start_date) {
      alert('Please select a preferred start date')
      return
    }

    // Check word count
    const text = formData.body.replace(/<[^>]*>/g, '').trim()
    const words = text.split(/\s+/).filter(w => w.length > 0)
    if (words.length > 100) {
      alert('Ad content must be 100 words or less')
      return
    }

    if (words.length === 0) {
      alert('Ad content cannot be empty')
      return
    }

    setLoading(true)

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

      // Create Stripe checkout session
      const response = await fetch('/api/ads/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          image_url: imageUrl,
          word_count: words.length,
          total_amount: calculatedPrice
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create checkout session')
      }

      const data = await response.json()

      if (data.sessionUrl) {
        // Redirect to Stripe checkout
        window.location.href = data.sessionUrl
      } else {
        throw new Error('No checkout URL received')
      }

    } catch (error) {
      console.error('Submission error:', error)
      alert('Failed to process submission. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getFrequencyLabel = (freq: AdFrequency) => {
    switch (freq) {
      case 'single': return 'Single Appearance'
      case 'weekly': return 'Weekly (once per week)'
      case 'monthly': return 'Monthly (once per month)'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Submit Your Business Advertisement
          </h1>
          <p className="text-gray-600 mb-8">
            Get featured in the St. Cloud Scoop newsletter's Community Business Spotlight section.
            Your ad will reach thousands of local subscribers!
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Ad Content Section */}
            <div className="border-b pb-6">
              <h2 className="text-xl font-semibold mb-4">Advertisement Content</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ad Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., New Menu Items at Our Restaurant"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ad Content (Max 100 words) <span className="text-red-500">*</span>
                  </label>
                  <RichTextEditor
                    value={formData.body}
                    onChange={(html) => setFormData({ ...formData, body: html })}
                    maxWords={100}
                    placeholder="Write your advertisement content here. You can use bold, italic, underline, and add links."
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Advertisement Image (Optional)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Upload an image to make your ad stand out! It will be cropped to 5:4 ratio.
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
              </div>
            </div>

            {/* Business Information Section */}
            <div className="border-b pb-6">
              <h2 className="text-xl font-semibold mb-4">Business Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    value={formData.business_website}
                    onChange={(e) => setFormData({ ...formData, business_website: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Address
                  </label>
                  <input
                    type="text"
                    value={formData.business_address}
                    onChange={(e) => setFormData({ ...formData, business_address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="123 Main St, St. Cloud, MN 56301"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information Section */}
            <div className="border-b pb-6">
              <h2 className="text-xl font-semibold mb-4">Contact Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(320) 555-0123"
                  />
                </div>
              </div>
            </div>

            {/* Frequency & Pricing Section */}
            <div className="border-b pb-6">
              <h2 className="text-xl font-semibold mb-4">Advertisement Schedule & Pricing</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Frequency <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as AdFrequency })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="single">Single Appearance</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {getFrequencyLabel(formData.frequency)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Times <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.times}
                    onChange={(e) => setFormData({ ...formData, times: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.frequency === 'single' && 'Total appearances in newsletter'}
                    {formData.frequency === 'weekly' && 'Number of weeks'}
                    {formData.frequency === 'monthly' && 'Number of months'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Preferred Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.preferred_start_date}
                    onChange={(e) => setFormData({ ...formData, preferred_start_date: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your ad will start on the first available newsletter date
                  </p>
                </div>
              </div>

              {calculatedPrice > 0 && (
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-900">Total Price:</span>
                    <span className="text-2xl font-bold text-blue-600">${calculatedPrice.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex justify-center">
              <button
                type="submit"
                disabled={loading || calculatedPrice === 0}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : `Proceed to Payment ($${calculatedPrice.toFixed(2)})`}
              </button>
            </div>
          </form>
        </div>

        {/* Information Section */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">How It Works</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Fill out the form above with your advertisement content and business information</li>
            <li>Choose your preferred frequency and number of appearances</li>
            <li>Complete payment through our secure checkout</li>
            <li>Our team will review your submission (typically within 1 business day)</li>
            <li>Once approved, your ad will appear in upcoming newsletters according to your schedule</li>
            <li>You'll receive usage reports and completion notifications via email</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
