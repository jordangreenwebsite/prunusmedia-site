/**
 * Authoritative Prunus Media business details for JSON-LD across every route.
 * These are ENQUIRY availability hours, not premises visiting hours.
 * Do not add a LocalBusiness address or openingHoursSpecification without
 * a verified customer-facing location.
 */
export const siteOrigin = 'https://prunusmedia.com';
export const organizationId = siteOrigin + '/#organization';
export const websiteId = siteOrigin + '/#website';

export const officialProfiles = [
  'https://www.facebook.com/people/Prunusmedia/61564233269657/',
  'https://www.instagram.com/prunus.media/'
];

export const serviceAreas = [
  { '@type': 'Country', name: 'United Kingdom' },
  { '@type': 'Place', name: 'Worldwide' }
];

// Schema.org ContactPoint.hoursAvailable / Service.hoursAvailable.
// Sunday is intentionally omitted, as Prunus Media is closed on Sundays.
export function ukEnquiryHours() {
  return [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '06:00',
      closes: '15:00',
      description: 'UK local time (Europe/London)'
    },
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'Saturday',
      opens: '08:00',
      closes: '13:00',
      description: 'UK local time (Europe/London)'
    }
  ];
}

export function contactPointSchema() {
  return {
    '@type': 'ContactPoint',
    email: 'contactprunusmedia@gmail.com',
    contactType: 'customer enquiries',
    availableLanguage: ['en-GB'],
    areaServed: serviceAreas,
    description: 'Enquiries: Monday to Friday 06:00-15:00, Saturday 08:00-13:00, closed Sunday (Europe/London).',
    hoursAvailable: ukEnquiryHours()
  };
}

export function organizationSchema() {
  return {
    '@type': 'Organization',
    '@id': organizationId,
    name: 'Prunus Media',
    url: siteOrigin + '/',
    logo: siteOrigin + '/wp-content/uploads/2024/08/Copy-of-PRUNUS-MEDIA-300x300.png',
    sameAs: officialProfiles,
    areaServed: serviceAreas,
    contactPoint: contactPointSchema()
  };
}

export function websiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': websiteId,
    name: 'Prunus Media',
    url: siteOrigin + '/',
    publisher: { '@id': organizationId }
  };
}

export function webpageSchema({ url, title, description }) {
  const page = {
    '@type': 'WebPage',
    '@id': url + '#webpage',
    url,
    name: title || 'Prunus Media',
    isPartOf: { '@id': websiteId },
    publisher: { '@id': organizationId }
  };
  if (description) page.description = description;
  return page;
}
