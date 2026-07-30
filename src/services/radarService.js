const https = require('https');
const { URL } = require('url');

/**
 * Radar.io API Integration Service for Backend
 */
class RadarService {
  constructor() {
    this.baseUrl = 'https://api.radar.io/v1';
  }

  getSecretKey() {
    return process.env.RADAR_SECRET_KEY || '';
  }

  getPublishableKey() {
    return process.env.RADAR_PUBLISHABLE_KEY || '';
  }

  isConfigured() {
    return Boolean(this.getSecretKey());
  }

  /**
   * Helper method to perform HTTPS requests to Radar API
   */
  async _request(method, endpoint, bodyData = null) {
    const secretKey = this.getSecretKey();
    if (!secretKey) {
      throw new Error('RADAR_SECRET_KEY is not configured in environment variables.');
    }

    const fullUrl = `${this.baseUrl}${endpoint}`;
    const parsedUrl = new URL(fullUrl);

    const postData = bodyData ? JSON.stringify(bodyData) : null;

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method.toUpperCase(),
      headers: {
        'Authorization': secretKey,
        'Content-Type': 'application/json'
      }
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              const err = new Error(parsed.message || `Radar API returned status ${res.statusCode}`);
              err.statusCode = res.statusCode;
              err.radarResponse = parsed;
              reject(err);
            }
          } catch (e) {
            reject(new Error(`Failed to parse Radar API response: ${responseBody}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Upserts a Circle Geofence on Radar for an office location
   */
  async upsertOfficeGeofence(officeLocation, companyName = 'Company') {
    if (!this.isConfigured()) {
      return { success: false, mode: 'unconfigured', message: 'Radar API keys missing' };
    }

    const officeId = (officeLocation._id || officeLocation.id).toString();
    const companyId = (officeLocation.companyId).toString();
    const tag = officeLocation.radarTag || 'company-office';

    // MongoDB format: [longitude, latitude]
    const coordinates = officeLocation.location?.coordinates || [0, 0];

    const body = {
      description: `${companyName} - ${officeLocation.name}`,
      type: 'circle',
      coordinates: coordinates,
      radius: Number(officeLocation.radiusMeters) || 100,
      enabled: officeLocation.isActive !== false,
      metadata: {
        companyId,
        officeId,
        officeName: officeLocation.name
      }
    };

    const endpoint = `/geofences/${tag}/${officeId}`;
    const result = await this._request('PUT', endpoint, body);

    return {
      success: true,
      geofenceId: result.geofence?._id || result.geofence?.id,
      geofence: result.geofence
    };
  }

  /**
   * Disables or deletes a Geofence on Radar
   */
  async deleteOfficeGeofence(officeId, tag = 'company-office') {
    if (!this.isConfigured()) return { success: false };
    try {
      const endpoint = `/geofences/${tag}/${officeId}`;
      await this._request('DELETE', endpoint);
      return { success: true };
    } catch (err) {
      console.warn(`[RadarService] Failed to delete geofence ${officeId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Calls Radar Track API to verify employee foreground location
   */
  async verifyEmployeeLocation({
    employeeId,
    deviceId,
    latitude,
    longitude,
    accuracy,
    companyId,
    targetOfficeId
  }) {
    if (!this.isConfigured()) {
      throw new Error('RADAR_NOT_CONFIGURED');
    }

    const body = {
      userId: String(employeeId),
      deviceId: String(deviceId || employeeId),
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy: Number(accuracy),
      foreground: true,
      stopped: true,
      deviceType: 'Web',
      metadata: {
        companyId: String(companyId),
        employeeId: String(employeeId)
      }
    };

    const response = await this._request('POST', '/track', body);
    
    // Inspect returned geofences in response
    const geofences = response.user?.geofences || response.geofences || [];
    const matchedGeofence = geofences.find(g => {
      const isTagMatch = g.tag === 'company-office';
      const isExternalIdMatch = String(g.externalId) === String(targetOfficeId);
      const isCompanyMatch = String(g.metadata?.companyId || '') === String(companyId);
      return isTagMatch && (isExternalIdMatch || isCompanyMatch);
    });

    const isInside = Boolean(matchedGeofence);

    return {
      success: true,
      isInside,
      matchedGeofence,
      radarUserId: response.user?._id || response.user?.id,
      eventIds: (response.events || []).map(e => e._id || e.id),
      geofenceId: matchedGeofence?._id || matchedGeofence?.id
    };
  }
}

module.exports = new RadarService();
