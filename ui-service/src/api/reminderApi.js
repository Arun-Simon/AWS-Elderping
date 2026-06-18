import * as client from './apiClient';
import { API_BASE } from './config';

const BASE = API_BASE.reminder;

/**
 * Create a new medication reminder.
 * @param {{ userId, medicationName, dosage, timeOfDay }} payload
 */
export const createReminder = (payload) => client.post(`${BASE}/reminders`, payload);

/**
 * Get all reminders for a user.
 * @param {number} userId
 */
export const getReminders = (userId) => client.get(`${BASE}/reminders/${userId}`);

/**
 * Mark a specific reminder as taken.
 * @param {number} reminderId
 */
export const markTaken = (reminderId) => client.put(`${BASE}/reminders/${reminderId}/take`);
