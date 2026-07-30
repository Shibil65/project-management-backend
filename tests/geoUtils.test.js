const assert = require('assert');
const {
  calculateHaversineDistance,
  toMongoCoordinates,
  toReactCoordinates,
  evaluateGpsAccuracy,
  evaluateBoundary
} = require('../src/utils/geoUtils');

console.log('--- Running GeoUtils Unit Tests ---');

// Test 1: Haversine distance
const distSame = calculateHaversineDistance(12.9716, 77.5946, 12.9716, 77.5946);
assert.strictEqual(distSame, 0, 'Distance between identical points must be 0');

// ~1.1 km difference
const distDiff = calculateHaversineDistance(12.9716, 77.5946, 12.9816, 77.5946);
assert(distDiff > 1000 && distDiff < 1200, `Expected ~1110 meters, got ${distDiff}`);

// Test 2: Coordinate format conversions
const mongoCoords = toMongoCoordinates(12.9716, 77.5946);
assert.deepStrictEqual(mongoCoords, [77.5946, 12.9716], 'MongoDB format must be [longitude, latitude]');

const reactCoords = toReactCoordinates([77.5946, 12.9716]);
assert.deepStrictEqual(reactCoords, [12.9716, 77.5946], 'React/Leaflet format must be [latitude, longitude]');

// Test 3: GPS Accuracy Evaluation
const accExcellent = evaluateGpsAccuracy(15, 60);
assert.strictEqual(accExcellent.valid, true);
assert.strictEqual(accExcellent.level, 'excellent');

const accUncertain = evaluateGpsAccuracy(55, 60);
assert.strictEqual(accUncertain.valid, true);
assert.strictEqual(accUncertain.needsRetry, true);

const accRejected = evaluateGpsAccuracy(80, 60);
assert.strictEqual(accRejected.valid, false);
assert.strictEqual(accRejected.code, 'LOW_LOCATION_ACCURACY');

// Test 4: Boundary Evaluation
const insideBoundary = evaluateBoundary(80, 100, 15);
assert.strictEqual(insideBoundary.inside, true);

const nearBoundary = evaluateBoundary(110, 100, 15);
assert.strictEqual(nearBoundary.inside, false);
assert.strictEqual(nearBoundary.nearBoundary, true);

const outsideBoundary = evaluateBoundary(150, 100, 15);
assert.strictEqual(outsideBoundary.inside, false);
assert.strictEqual(outsideBoundary.nearBoundary, false);

console.log('✅ ALL GEOUTILS TESTS PASSED SUCCESSFULLY!');
