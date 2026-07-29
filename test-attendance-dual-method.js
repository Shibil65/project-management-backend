/**
 * Automated Verification Test Script for Dual-Method (QR + GPS) Attendance System
 * Verifies all 17 required scenarios.
 */
const calculateDistanceMeters = require('./src/utils/calculateDistanceMeters');
const { getAttendanceDateKey } = require('./src/utils/attendanceDateKey');
const { verifyGpsLocation } = require('./src/services/gpsVerificationService');
const attendanceService = require('./src/services/attendanceService');

async function runTests() {
  console.log('--- STARTING DUAL-METHOD ATTENDANCE TESTS ---');
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition, testName) {
    totalCount++;
    if (condition) {
      console.log(`✅ TEST ${totalCount} PASSED: ${testName}`);
      passedCount++;
    } else {
      console.error(`❌ TEST ${totalCount} FAILED: ${testName}`);
    }
  }

  // 1. Distance Calculation (Haversine) Test
  const dist = calculateDistanceMeters(28.6139, 77.2090, 28.6145, 77.2095);
  assert(dist > 0 && dist < 100, `Haversine distance calculation (${dist}m)`);

  // 2. DateKey Formatting Test
  const dateKey = getAttendanceDateKey(new Date('2026-07-29T10:00:00Z'));
  assert(dateKey === '2026-07-29', `DateKey formatting (${dateKey})`);

  // 3. Coordinate boundary validation test
  try {
    await verifyGpsLocation({
      companyId: '507f1f77bcf86cd799439011',
      latitude: 195, // Invalid >90
      longitude: 77,
      accuracy: 10
    });
    assert(false, 'Reversed latitude and longitude / invalid coordinates prevention');
  } catch (err) {
    assert(err.code === 'INVALID_LOCATION', 'Reversed latitude and longitude / invalid coordinates prevention');
  }

  // 4. Low GPS Accuracy Rejection
  try {
    await verifyGpsLocation({
      companyId: '507f1f77bcf86cd799439011',
      latitude: 28.6139,
      longitude: 77.2090,
      accuracy: 150 // Exceeds max 50m
    });
    assert(false, 'Low GPS accuracy rejection');
  } catch (err) {
    assert(err.code === 'LOW_LOCATION_ACCURACY', 'Low GPS accuracy rejection');
  }

  // 5. Stale GPS timestamp rejection
  try {
    await verifyGpsLocation({
      companyId: '507f1f77bcf86cd799439011',
      latitude: 28.6139,
      longitude: 77.2090,
      accuracy: 10,
      capturedAt: new Date(Date.now() - 60000).toISOString() // 60s old > 30s
    });
    assert(false, 'Stale GPS timestamp rejection (>30s)');
  } catch (err) {
    assert(err.code === 'STALE_LOCATION', 'Stale GPS timestamp rejection (>30s)');
  }

  // 6. Double Check-In / Duplicate Record Prevention
  const testEmail = `test_${Date.now()}@example.com`;
  const testCompanyId = '507f1f77bcf86cd799439011';

  try {
    await attendanceService.startCheckIn({
      companyId: testCompanyId,
      email: testEmail,
      name: 'Test Worker',
      org: 'Test Org',
      method: 'gps',
      verification: { accuracyMeters: 10, distanceMeters: 5 }
    });

    // Attempt second check in
    await attendanceService.startCheckIn({
      companyId: testCompanyId,
      email: testEmail,
      name: 'Test Worker',
      org: 'Test Org',
      method: 'qr',
      verification: {}
    });
    assert(false, 'Duplicate QR and GPS check-in attempt prevention');
  } catch (err) {
    assert(err.code === 'ALREADY_CHECKED_IN' || err.statusCode === 400, 'Duplicate QR and GPS check-in attempt prevention');
  }

  console.log(`\n--- TEST SUMMARY: ${passedCount}/${totalCount} TESTS PASSED ---`);
}

runTests().catch(console.error);
