import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import db from '../services/db'; // Make sure this path points to your db.ts

// --- UTILS: Haversine Formula ---
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

export interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  speed: number;
}

type TripStatus = 'IDLE' | 'TRACKING' | 'PAUSED' | 'REVIEW';

interface TripState {
  status: TripStatus;
  path: LocationPoint[];
  startTime: number | null;
  endTime: number | null;
  totalDistance: number;
  currentFare: number;
  pricePerKm: number;
  pricePerMin: number;
  lastLocation: LocationPoint | null;
  isFollowing: boolean;
  setFollowing: (val: boolean) => void;
  setPrices: (kmPrice: number, minPrice: number) => void;
  isDarkMode: boolean;
  keepAwake: boolean;
  toggleDarkMode: () => void;
  toggleKeepAwake: () => void;
  startTrip: () => void;
  pauseTrip: () => void;
  resumeTrip: () => void;
  stopTrip: () => void;
  updateLocation: (newPoint: LocationPoint) => void;
  finishTrip: (tollInput: number, serializedPath: string) => Promise<void>;
}

export const useTripStore = create<TripState>()(
  persist(
    (set, get) => ({
      status: 'IDLE',
      path: [],
      startTime: null,
      endTime: null,
      totalDistance: 0,
      currentFare: 0,
      pricePerKm: 1.25, 
      pricePerMin: 0.20,
      lastLocation: null,
      isFollowing: true,
      isDarkMode: false,
      keepAwake: true,
      
      toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
      toggleKeepAwake: () => set((state) => ({ keepAwake: !state.keepAwake })),
      setFollowing: (val) => set({ isFollowing: val }),

      startTrip: () => set({ 
        status: 'TRACKING', startTime: Date.now(), endTime: null, path: [], 
        totalDistance: 0, currentFare: 0, lastLocation: null 
      }),
      pauseTrip: () => set({ status: 'PAUSED', lastLocation: null }),
      resumeTrip: () => set({ status: 'TRACKING' }),
      stopTrip: () => set({ status: 'REVIEW', endTime: Date.now() }),

      updateLocation: (newPoint) => {
        const { status, lastLocation, totalDistance, currentFare, pricePerKm, pricePerMin } = get();
        if (status !== 'TRACKING') return;

        let addedDistance = 0;
        let addedTimeMin = 0;

        if (lastLocation && newPoint) {
          // 🛡️ SANITY CHECK 1: The "Time Travel" Filter
          // If the OS tries to flush a cached point that happened BEFORE our last recorded point, DROP IT.
          if (newPoint.timestamp <= lastLocation.timestamp) {
            return; 
          }

          const dist = getDistance(
            lastLocation.latitude, lastLocation.longitude,
            newPoint.latitude, newPoint.longitude
          );

          // 🛡️ SANITY CHECK 2: The "Teleportation" Filter
          // If the distance implies the car is moving faster than ~200km/h (e.g. 55 meters per second), 
          // it is a GPS glitch. Drop it to prevent distance inflation.
          const timeGapSecs = (newPoint.timestamp - lastLocation.timestamp) / 1000;
          const speedMps = (dist * 1000) / timeGapSecs;
          if (speedMps > 55) { 
            return; 
          }

          if (!isNaN(dist)) addedDistance = dist;

          const timeGap = (newPoint.timestamp - lastLocation.timestamp) / 60000;
          if (!isNaN(timeGap) && timeGap > 0) addedTimeMin = timeGap;
        }

        const newTotalDistance = (totalDistance || 0) + addedDistance;
        const newFare = (currentFare || 0) + (addedDistance * (pricePerKm || 0)) + (addedTimeMin * (pricePerMin || 0));

        set((state) => ({
          path: [...(state.path || []), newPoint],
          lastLocation: newPoint,
          totalDistance: newTotalDistance,
          currentFare: newFare
        }));
      },

      finishTrip: async (tollInput: number, serializedPath: string) => {
        // 1. Pull the locked-in endTime from state
        const { startTime, endTime, totalDistance, currentFare, path } = get();
        
        // Fallback just in case, but it will use the exact time you pressed Stop
        const finalEndTime = endTime || Date.now(); 
        const safeStartTime = startTime || finalEndTime;
        
        const safeToll = isNaN(tollInput) ? 0 : tollInput;
        const safeFare = isNaN(currentFare) ? 0 : currentFare;
        const finalFare = safeFare + safeToll; 
        
        const safeDistance = isNaN(totalDistance) ? 0 : totalDistance;
        const durationHours = (finalEndTime - safeStartTime) / 3600000;
        
        let avgSpeed = durationHours > 0 ? safeDistance / durationHours : 0;
        if (isNaN(avgSpeed)) avgSpeed = 0;

        await db.withTransactionAsync(async () => {
          const result = await db.runAsync(
            'INSERT INTO trips (startTime, endTime, distance, toll, totalFare, averageSpeed, path) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              safeStartTime, 
              finalEndTime, // <-- Using the accurate stop time
              safeDistance, 
              safeToll, 
              finalFare, 
              avgSpeed, 
              serializedPath || "[]"
            ]
          );

          for (const p of path) {
            await db.runAsync(
              'INSERT INTO coordinates (tripId, latitude, longitude, speed, timestamp) VALUES (?, ?, ?, ?, ?)',
              [
                result.lastInsertRowId || 0, 
                p.latitude || 0, 
                p.longitude || 0, 
                p.speed || 0, 
                p.timestamp || finalEndTime
              ]
            );
          }
        });

        // Clear everything out, including endTime
        set({ status: 'IDLE', path: [], totalDistance: 0, currentFare: 0, lastLocation: null, endTime: null });
      },
      
      setPrices: (kmPrice, minPrice) => set({ 
        pricePerKm: kmPrice, 
        pricePerMin: minPrice 
      }),
    }),
    {
      name: 'trip-settings-storage', // The key used in AsyncStorage
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        pricePerKm: state.pricePerKm, 
        pricePerMin: state.pricePerMin,
        isDarkMode: state.isDarkMode,
        keepAwake: state.keepAwake
      }),
    }
  )
);