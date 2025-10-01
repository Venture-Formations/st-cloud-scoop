import { NextResponse } from 'next/server'

export async function GET() {
  // CSV headers with separate date and time fields for easier data entry
  const headers = [
    'external_id',
    'title',
    'description',
    'start_date',
    'start_time',
    'end_date',
    'end_time',
    'venue',
    'address',
    'url',
    'image_url',
    'featured',
    'paid_placement'
  ]

  // Sample rows with example data (separate date and time)
  const sampleRows = [
    [
      'event-001',
      'St. Cloud Farmers Market',
      'Fresh local produce, baked goods, and handmade crafts every Saturday morning',
      '2025-10-04',
      '09:00:00',
      '2025-10-04',
      '13:00:00',
      'Downtown Square',
      '123 Main St, St. Cloud, MN 56301',
      'https://www.example.com/farmers-market',
      'https://www.example.com/images/market.jpg',
      'FALSE',
      'FALSE'
    ],
    [
      'event-002',
      'Live Music at The Local',
      'Join us for an evening of acoustic folk music featuring local artists',
      '2025-10-05',
      '19:00:00',
      '2025-10-05',
      '22:00:00',
      'The Local Music Venue',
      '456 2nd Ave N, St. Cloud, MN 56301',
      'https://www.example.com/live-music',
      '',
      'TRUE',
      'FALSE'
    ]
  ]

  // Helper note rows explaining the template
  const noteRows = [
    [''],
    ['NOTES:'],
    ['- external_id: Unique identifier for the event (any format)'],
    ['- start_date/end_date: Use format YYYY-MM-DD (e.g., 2025-10-04)'],
    ['- start_time/end_time: Use format HH:MM:SS in 24-hour time (e.g., 09:00:00 for 9 AM, 19:00:00 for 7 PM)'],
    ['- featured: Use TRUE or FALSE (checkbox in Excel/Sheets)'],
    ['- paid_placement: Use TRUE or FALSE (checkbox in Excel/Sheets) - guarantees selection'],
    ['- All uploaded events are set to active automatically']
  ]

  // Combine headers and sample rows, then add notes
  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...sampleRows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ...noteRows.map(row => row.map(cell => `"${cell}"`).join(','))
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
