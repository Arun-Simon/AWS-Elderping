import * as client from './apiClient';
import { API_BASE } from './config';

const BASE = API_BASE.alert;

/**
 * Log an internal system alert.
 * @param {{ serviceName: string, message: string, severity?: 'info'|'warning'|'critical' }} payload
 */
export const createAlert = (payload) => client.post(`${BASE}/alerts`, payload);

/**
 * Fetch the 50 most recent alerts.
 */
export const getAlerts = () => client.get(`${BASE}/alerts`);
