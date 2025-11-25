const data = require('../temp_archive.json');

console.log('=== Nov 24 Archive Analysis ===\n');

console.log('Articles with images:',
  data.newsletter.articles.filter(a => a.image_url || (a.rss_post && a.rss_post.image_url)).length,
  '/',
  data.newsletter.articles.length
);

console.log('\nFirst 3 articles:');
data.newsletter.articles.slice(0, 3).forEach((a, i) => {
  console.log(`  ${i+1}. ${a.headline}`);
  console.log(`     - image_url: ${a.image_url || 'NONE'}`);
  console.log(`     - has rss_post: ${!!a.rss_post}`);
  if (a.rss_post) {
    console.log(`     - rss_post.image_url: ${a.rss_post.image_url || 'NONE'}`);
  }
});

console.log('\nSections available:', Object.keys(data.newsletter.sections || {}).join(', ') || 'NONE');

console.log('\nMetadata:');
console.log(JSON.stringify(data.newsletter.metadata, null, 2));
