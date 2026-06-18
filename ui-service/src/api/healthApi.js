import * as client from './apiClient';
import { API_BASE } from './config';

const BASE = API_BASE.health;

/**
 * Record an elder check-in.
 * @param {number} userId
 * @param {string} status - e.g. 'feeling_well'
 */
export const checkIn = (userId, status = 'feeling_well') =>
  client.post(`${BASE}/checkin`, { userId, status });

/**
 * Record vitals for an elder.
 * @param {number} userId
 * @param {number} heartRate
 * @param {string} bloodPressure - e.g. '120/80'
 */
export const logVitals = (userId, heartRate, bloodPressure) =>
  client.post(`${BASE}/vitals`, { userId, heartRate, bloodPressure });

/**
 * Fetch recent health logs for a user (up to 10).
 * @param {number} userId
 */
export const getVitals = (userId) => client.get(`${BASE}/vitals/${userId}`);

export const getTimeline = (elderId) => client.get(`${BASE}/timeline/${elderId}`);
export const getElderDashboard = (elderId) => client.get(`${BASE}/dashboard/elder/${elderId}`);
export const getFamilyDashboard = (elderId) => client.get(`${BASE}/dashboard/family/${elderId}`);
export const uploadDocument = (formData) => client.post(`${BASE}/documents/upload`, formData);
export const downloadDocument = (docId) => client.get(`${BASE}/documents/download/${docId}`);
export const deleteDocument = (docId) => client.del(`${BASE}/documents/${docId}`);
