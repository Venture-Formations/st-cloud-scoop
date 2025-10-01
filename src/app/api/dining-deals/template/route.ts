import { NextResponse } from 'next/server'

export async function GET() {
  // CSV headers - google_cid will be converted to google_profile URL
  const headers = [
    'business_name',
    'business_address',
    'google_cid',
    'day_of_week',
    'special_description',
    'special_time',
    'is_featured',
    'paid_placement'
  ]

  // Sample rows with example data (special_description max 65 chars)
  const sampleRows = [
    [
      'The Local Eatery',
      '123 Main St, St. Cloud, MN 56301',
      '1234567890123456789',
      'Monday',
      '$5 Burgers and Fries',
      '11AM - 2PM',
      'FALSE',
      'FALSE'
    ],
    [
      'Downtown Bistro',
      '456 1st Ave S, St. Cloud, MN 56301',
      '9876543210987654321',
      'Tuesday',
      'Half-price appetizers all day',
      'All day',
      'TRUE',
      'FALSE'
    ]
  ]

  // Helper note rows explaining the template
  const noteRows = [
    [''],
    ['NOTES:'],
    ['- day_of_week must be: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, or Sunday'],
    ['- special_description has a 65 character limit'],
    ['- is_featured: Use TRUE or FALSE (checkbox in Excel/Sheets)'],
    ['- paid_placement: Use TRUE or FALSE (checkbox in Excel/Sheets) - guarantees selection'],
    ['- Find Google CIDs at https://cidfinder.com/'],
    ['- All uploaded deals are set to active automatically']
  ]

  // Combine headers and sample rows, then add notes
  const csvContent = [
    // Make headers bold by wrapping in special formatting (works in some CSV readers)
    headers.map(h => `"${h}"`).join(','),
    ...sampleRows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ...noteRows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  // Return CSV file
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="dining_deals_template.csv"'
    }
  })
}
