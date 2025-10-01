'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface CartItem {
  id: string
  title: string
  description: string
  start_date: string
  start_hour: string
  start_minute: string
  start_ampm: string
  end_date: string
  end_hour: string
  end_minute: string
  end_ampm: string
  venue_id: string
  venue_name: string
  venue_address: string
  submitter_name: string
  submitter_email: string
  submitter_phone: string
  url: string
  placement_type: 'none' | 'paid' | 'featured'
  original_image_url?: string
  cropped_image_url?: string
}

export default function CheckoutPage() {
  const router = useRouter()
  const [cart, setCart] = useState<CartItem[]>([])
  const [pricing, setPricing] = useState({ paidPlacement: 5, featured: 15 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadCart()
    loadPricing()
  }, [])

  const loadCart = () => {
    const savedCart = sessionStorage.getItem('eventCart')
    if (savedCart) {
      setCart(JSON.parse(savedCart))
    } else {
      router.push('/events/submit')
    }
  }

  const loadPricing = async () => {
    try {
      const response = await fetch('/api/settings/public-events')
      if (response.ok) {
        const data = await response.json()
        setPricing({
          paidPlacement: parseFloat(data.paidPlacementPrice),
          featured: parseFloat(data.featuredEventPrice)
        })
      }
    } catch (error) {
      console.error('Failed to load pricing:', error)
    }
  }

  const calculateItemPrice = (item: CartItem) => {
    if (item.placement_type === 'paid') return pricing.paidPlacement
    if (item.placement_type === 'featured') return pricing.featured
    return 0
  }

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + calculateItemPrice(item), 0)
  }

  const convertTime12to24 = (hour: string, minute: string, ampm: string) => {
    let hour24 = parseInt(hour)
    if (ampm === 'AM' && hour24 === 12) hour24 = 0
    if (ampm === 'PM' && hour24 !== 12) hour24 += 12
    return `${hour24.toString().padStart(2, '0')}:${minute}:00`
  }

  const handleCheckout = async () => {
    setLoading(true)
    setError('')

    try {
      // Convert cart items to database format
      const eventsToSubmit = cart.map(item => {
        const startDateTime = `${item.start_date}T${convertTime12to24(item.start_hour, item.start_minute, item.start_ampm)}`
        const endDateTime = `${item.end_date}T${convertTime12to24(item.end_hour, item.end_minute, item.end_ampm)}`

        return {
          title: item.title,
          description: item.description,
          start_date: new Date(startDateTime).toISOString(),
          end_date: new Date(endDateTime).toISOString(),
          venue: item.venue_name,
          address: item.venue_address,
          url: item.url || null,
          original_image_url: item.original_image_url || null,
          cropped_image_url: item.cropped_image_url || null,
          submitter_name: item.submitter_name,
          submitter_email: item.submitter_email,
          submitter_phone: item.submitter_phone || null,
          paid_placement: item.placement_type === 'paid',
          featured: item.placement_type === 'featured',
          active: true,
          submission_status: 'pending'
        }
      })

      const total = calculateTotal()

      // If total is 0, just submit the events without payment
      if (total === 0) {
        const response = await fetch('/api/events/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: eventsToSubmit })
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to submit events')
        }

        // Clear cart and redirect to success page
        sessionStorage.removeItem('eventCart')
        router.push('/events/success?free=true')
        return
      }

      // Create Stripe Checkout session
      const response = await fetch('/api/events/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: eventsToSubmit,
          total: total
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create checkout session')
      }

      const { checkout_url } = await response.json()

      // Redirect to Stripe Checkout
      window.location.href = checkout_url

    } catch (error) {
      console.error('Checkout failed:', error)
      setError(error instanceof Error ? error.message : 'Checkout failed. Please try again.')
      setLoading(false)
    }
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Your cart is empty</h1>
          <button
            onClick={() => router.push('/events/submit')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md"
          >
            Submit an Event
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Checkout</h1>
          <p className="text-gray-600">Review your events before submitting</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {/* Order Summary */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Order Summary</h2>

          <div className="space-y-4 mb-6">
            {cart.map(item => (
              <div key={item.id} className="border-b border-gray-200 pb-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{item.title}</h3>
                    <p className="text-sm text-gray-600">{item.venue_name}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(item.start_date).toLocaleDateString()} - {new Date(item.end_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {item.placement_type === 'none' && 'Free Listing'}
                      {item.placement_type === 'paid' && 'Paid Placement'}
                      {item.placement_type === 'featured' && 'Featured Event'}
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      ${calculateItemPrice(item).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-6">
              <span className="text-xl font-semibold">Total:</span>
              <span className="text-3xl font-bold text-blue-600">${calculateTotal().toFixed(2)}</span>
            </div>

            {/* Contact Information */}
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <h3 className="font-medium text-gray-900 mb-2">Contact Information</h3>
              <p className="text-sm text-gray-700">Name: {cart[0]?.submitter_name}</p>
              <p className="text-sm text-gray-700">Email: {cart[0]?.submitter_email}</p>
              {cart[0]?.submitter_phone && (
                <p className="text-sm text-gray-700">Phone: {cart[0]?.submitter_phone}</p>
              )}
            </div>

            {/* Buttons */}
            <div className="flex space-x-4">
              <button
                onClick={() => router.push('/events/submit')}
                disabled={loading}
                className="flex-1 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100 text-gray-800 px-6 py-3 rounded-md font-medium"
              >
                Back to Edit
              </button>
              <button
                onClick={handleCheckout}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-md font-medium text-lg"
              >
                {loading ? 'Processing...' : calculateTotal() === 0 ? 'Submit Events' : 'Pay with Stripe'}
              </button>
            </div>
          </div>
        </div>

        {/* Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">What happens next?</h4>
          <ul className="space-y-1 text-sm text-blue-800">
            <li>• {calculateTotal() > 0 ? 'You will be redirected to Stripe for secure payment' : 'Your events will be submitted for review'}</li>
            <li>• {calculateTotal() > 0 ? 'Events activate automatically upon successful payment' : 'Events will be reviewed by our team'}</li>
            <li>• You will receive a confirmation email at {cart[0]?.submitter_email}</li>
            <li>• Our team may contact you if any changes are needed</li>
            <li>• Paid placements and featured events run for 3 days</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
