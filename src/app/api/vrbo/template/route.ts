import { NextResponse } from 'next/server'

export async function GET() {
  // CSV headers for VRBO listings
  const headers = [
    'title',
    'main_image_url',
    'city',
    'bedrooms',
    'bathrooms',
    'sleeps',
    'link',
    'listing_type'
  ]

  // Sample rows with example data
  const sampleRows = [
    [
      'Cozy Lakefront Cabin - Perfect for Families',
      'https://www.example.com/images/cabin.jpg',
      'St. Cloud',
      '3',
      '2',
      '8',
      'https://www.vrbo.com/12345678',
      'Local'
    ],
    [
      'Modern Downtown Loft with Amazing Views',
      'https://www.example.com/images/loft.jpg',
      'Minneapolis',
      '2',
      '1',
      '4',
      'https://www.vrbo.com/87654321',
      'Greater'
    ],
    [
      'Charming Cottage Near Lake George',
      '',
      'Sartell',
      '2',
      '1.5',
      '6',
      'https://www.vrbo.com/11223344',
      'Local'
    ]
  ]

  // Helper note rows explaining the template
  const noteRows = [
    [''],
    ['NOTES:'],
    ['- title: Name of the property (required)'],
    ['- main_image_url: Direct URL to property main image (optional, will be resized and hosted on GitHub)'],
    ['- city: City where property is located (optional)'],
    ['- bedrooms: Number of bedrooms (numeric, optional - use decimals like 2.5 if needed)'],
    ['- bathrooms: Number of bathrooms (numeric, optional - use decimals like 1.5 if needed)'],
    ['- sleeps: Maximum number of guests (numeric, optional)'],
    ['- link: VRBO listing URL (required - will be converted to tracked affiliate link)'],
    ['- listing_type: Use "Local" or "Greater" (required - determines which section listing appears in)'],
    ['- All uploaded listings are set to active automatically'],
    ['- Images will be automatically resized to newsletter format and hosted on GitHub']
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
      'Content-Disposition': 'attachment; filename="vrbo_template.csv"'
    }
  })
}
