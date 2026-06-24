// Lightweight ZIP -> state + approximate centroid resolver for the prototype.
// Keyed by the 3-digit ZIP prefix (ZCTA region). A production build would
// replace this with the authoritative HUD/USPS ZIP crosswalk dataset.
interface ZipInfo {
  state: string;
  city: string;
  lat: number;
  lng: number;
}

const ZIP3: Record<string, ZipInfo> = {
  // Florida
  "330": { state: "FL", city: "Miami", lat: 25.78, lng: -80.21 },
  "331": { state: "FL", city: "Miami", lat: 25.78, lng: -80.21 },
  "327": { state: "FL", city: "Orlando", lat: 28.54, lng: -81.38 },
  "336": { state: "FL", city: "Tampa", lat: 27.95, lng: -82.46 },
  // Texas
  "770": { state: "TX", city: "Houston", lat: 29.76, lng: -95.37 },
  "750": { state: "TX", city: "Dallas", lat: 32.78, lng: -96.8 },
  "787": { state: "TX", city: "Austin", lat: 30.27, lng: -97.74 },
  "782": { state: "TX", city: "San Antonio", lat: 29.42, lng: -98.49 },
  // California
  "900": { state: "CA", city: "Los Angeles", lat: 34.05, lng: -118.24 },
  "941": { state: "CA", city: "San Francisco", lat: 37.77, lng: -122.42 },
  "921": { state: "CA", city: "San Diego", lat: 32.72, lng: -117.16 },
  // New York
  "100": { state: "NY", city: "New York", lat: 40.71, lng: -74.0 },
  "112": { state: "NY", city: "Brooklyn", lat: 40.65, lng: -73.95 },
  "142": { state: "NY", city: "Rochester", lat: 43.16, lng: -77.61 },
  // Illinois
  "606": { state: "IL", city: "Chicago", lat: 41.88, lng: -87.63 },
  "627": { state: "IL", city: "Springfield", lat: 39.8, lng: -89.64 },
  // Georgia
  "303": { state: "GA", city: "Atlanta", lat: 33.75, lng: -84.39 },
  "315": { state: "GA", city: "Savannah", lat: 32.08, lng: -81.09 },
  // Arizona
  "850": { state: "AZ", city: "Phoenix", lat: 33.45, lng: -112.07 },
  "857": { state: "AZ", city: "Tucson", lat: 32.22, lng: -110.97 },
  // North Carolina
  "282": { state: "NC", city: "Charlotte", lat: 35.23, lng: -80.84 },
  "276": { state: "NC", city: "Raleigh", lat: 35.78, lng: -78.64 },
  // Pennsylvania
  "191": { state: "PA", city: "Philadelphia", lat: 39.95, lng: -75.17 },
  "152": { state: "PA", city: "Pittsburgh", lat: 40.44, lng: -79.99 },
  // Ohio
  "432": { state: "OH", city: "Columbus", lat: 39.96, lng: -82.99 },
  "441": { state: "OH", city: "Cleveland", lat: 41.5, lng: -81.69 },
};

const DEFAULT: ZipInfo = { state: "FL", city: "Miami", lat: 27.66, lng: -81.52 };

export function resolveZip(zip: string): ZipInfo {
  const prefix = zip.slice(0, 3);
  return ZIP3[prefix] ?? DEFAULT;
}

// All ZIP prefixes, used by the seeder to place agents realistically.
export const ZIP_PREFIXES = Object.keys(ZIP3);
export const ZIP_INFO = ZIP3;

// Haversine distance in miles between two coordinates.
export function distanceMiles(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
