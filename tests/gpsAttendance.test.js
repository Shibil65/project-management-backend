const assert = require('assert');
const { evaluateGpsAccuracy, evaluateBoundary, calculateHaversineDistance } = require('../src/utils/geoUtils');
const radarService = require('../src/services/radarService');

console.log('--- Running GPS Attendance Verification Tests ---');

// Test 1: Radar Service initialization check
assert.strictEqual(typeof radarService.upsertOfficeGeofence, 'function');
assert.strictEqual(typeof radarService.verifyEmployeeLocation, 'function');

// Test 2: Accuracy boundaries
const lowAcc = evaluateGpsAccuracy(120, 60);
assert.strictEqual(lowAcc.valid, false, 'Accuracy > 60m must be rejected');

const validAcc = evaluateGpsAccuracy(20, 60);
assert.strictEqual(validAcc.valid, true, 'Accuracy <= 20m must be valid');

// Test 3: Distance calculation for office geofencing
const officeLat = 12.9716;
const officeLon = 77.5946;
const radius = 100;

// Inside office radius (50m away)
const insideLat = 12.9720;
const insideLon = 77.5946;
const distInside = calculateHaversineDistance(insideLat, insideLon, officeLat, officeLon);
assert(distInside < radius, `Distance ${distInside}m must be within ${radius}m radius`);

// Outside office radius (250m away)
const outsideLat = 12.9740;
const outsideLon = 77.5946;
const distOutside = calculateHaversineDistance(outsideLat, outsideLon, officeLat, officeLon);
assert(distOutside > radius, `Distance ${distOutside}m must be outside ${radius}m radius`);

console.log('✅ ALL GPS ATTENDANCE TESTS PASSED SUCCESSFULLY!');
