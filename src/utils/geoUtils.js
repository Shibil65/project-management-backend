/**
 * Geo calculation & coordinate conversion utilities
 */

/**
 * Calculates Haversine distance between two points in meters
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in meters
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c * 10) / 10; // Round to 1 decimal place
}

/**
 * Converts latitude and longitude to MongoDB / GeoJSON format: [longitude, latitude]
 * CRITICAL RULE: MongoDB & Radar require [longitude, latitude]
 */
function toMongoCoordinates(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(`Invalid coordinates: lat=${latitude}, lon=${longitude}`);
  }
  return [lon, lat];
}

/**
 * Converts GeoJSON/MongoDB [longitude, latitude] to Leaflet/React Map format: [latitude, longitude]
 */
function toReactCoordinates(coords) {
  if (!Array.isArray(coords) || coords.length < 2) {
    return [0, 0];
  }
  // Input: [longitude, latitude] -> Output: [latitude, longitude]
  return [Number(coords[1]), Number(coords[0])];
}

/**
 * Evaluates GPS accuracy level
 * Defaults: <= 25m: excellent, 26-50m: acceptable, 51-60m: retry candidate, > max: rejected
 */
function evaluateGpsAccuracy(accuracy, maxAcceptedAccuracy = 60) {
  const acc = Number(accuracy);
  if (isNaN(acc) || acc <= 0) {
    return { valid: false, code: 'INVALID_LOCATION', message: 'Invalid GPS accuracy value' };
  }
  if (acc > maxAcceptedAccuracy) {
    return { valid: false, code: 'LOW_LOCATION_ACCURACY', message: `Accuracy ${acc}m exceeds maximum accepted limit of ${maxAcceptedAccuracy}m` };
  }
  if (acc >= 51 && acc <= 60) {
    return { valid: true, needsRetry: true, level: 'uncertain', message: 'Accuracy is uncertain (51-60m). Re-collecting reading recommended.' };
  }
  if (acc <= 25) {
    return { valid: true, needsRetry: false, level: 'excellent' };
  }
  return { valid: true, needsRetry: false, level: 'acceptable' };
}

/**
 * Evaluates boundary condition for employee check-in
 * @param {number} distanceMeters 
 * @param {number} radiusMeters 
 * @param {number} accuracyMeters 
 */
function evaluateBoundary(distanceMeters, radiusMeters, accuracyMeters) {
  if (distanceMeters <= radiusMeters) {
    return { inside: true, nearBoundary: false };
  }
  // Check if distance is slightly outside, but within accuracy margin
  const margin = distanceMeters - radiusMeters;
  if (margin <= accuracyMeters) {
    return { inside: false, nearBoundary: true, margin };
  }
  return { inside: false, nearBoundary: false, margin };
}

module.exports = {
  calculateHaversineDistance,
  toMongoCoordinates,
  toReactCoordinates,
  evaluateGpsAccuracy,
  evaluateBoundary
};
