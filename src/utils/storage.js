/**
 * storage.js — localStorage wrapper for persisting uploaded CSV data
 * and the activity name registry across browser reloads.
 */

const PREFIX = "actdash_";

export const storage = {
  saveCSV(key, text) {
    try {
      localStorage.setItem(`${PREFIX}csv_${key}`, text);
    } catch (e) {
      console.warn("localStorage save failed:", e);
    }
  },

  loadCSV(key) {
    return localStorage.getItem(`${PREFIX}csv_${key}`) || null;
  },

  clearCSV(key) {
    try {
      localStorage.removeItem(`${PREFIX}csv_${key}`);
    } catch (e) {
      console.warn("localStorage clear failed:", e);
    }
  },

  saveJSON(key, data) {
    try {
      localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(data));
    } catch (e) {
      console.warn("localStorage save failed:", e);
    }
  },

  loadJSON(key) {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  hasAllFiles() {
    return !!(
      this.loadCSV("metadata") &&
      this.loadCSV("schedule")
    );
  },

  clearAll() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  },

  // ── Data page persistent locations ──

  loadStartLocations() {
    return this.loadJSON('data_startLocations') || [];
  },

  saveStartLocations(locations) {
    this.saveJSON('data_startLocations', locations);
  },

  loadFoodLocations() {
    return this.loadJSON('data_foodLocations') || [];
  },

  saveFoodLocations(locations) {
    this.saveJSON('data_foodLocations', locations);
  },
};
