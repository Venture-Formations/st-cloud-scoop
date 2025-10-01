import { NextResponse } from 'next/server'

export async function GET() {
  // CSV headers matching Event interface (excluding auto-generated fields)
  const headers = [
    'external_id',
    'title',
    'description',
    'start_date',
    'end_date',
    'venue',
    'address',
    'url',
    'image_url',
    'featured',
    'active'
  ]

  // Sample rows with example data
  const sampleRows = [
    [
      'event-001',
      'St. Cloud Farmers Market',
      'Fresh local produce, baked goods, and handmade crafts every Saturday morning',
      '2025-10-04 09:00:00',
      '2025-10-04 13:00:00',
      'Downtown Square',
      '123 Main St, St. Cloud, MN 56301',
      'https://www.example.com/farmers-market',
      'https://www.example.com/images/market.jpg',
      'false',
      'true'
    ],
    [
      'event-002',
      'Live Music at The Local',
      'Join us for an evening of acoustic folk music featuring local artists',
      '2025-10-05 19:00:00',
      '2025-10-05 22:00:00',
      'The Local Music Venue',
      '456 2nd Ave N, St. Cloud, MN 56301',
      'https://www.example.com/live-music',
      '',
      'true',
      'true'
    ]
  ]

  // Combine headers and sample rows
  const csvContent = [
    headers.join(','),
    ...sampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  // Return CSV file
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="events_template.csv"'
    }
  })
}
