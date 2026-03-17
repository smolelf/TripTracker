import * as TaskManager from 'expo-task-manager';
import { useTripStore } from '../store/useTripStore';

export const LOCATION_TASK_NAME = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    console.error("Background Location Error:", error);
    return;
  }
  
  if (data) {
    const { locations } = data as { locations: any[] };

    // 1. THE FIX: Sort locations chronologically (oldest to newest)
    // This stops the OS from flushing the queue backwards!
    const sortedLocations = locations.sort((a, b) => a.timestamp - b.timestamp);

    // 2. Feed them into the store in the exact order they actually happened
    sortedLocations.forEach(location => {
      const newPoint = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed: location.coords.speed || 0,
        timestamp: location.timestamp,
      };
      
      useTripStore.getState().updateLocation(newPoint);
    });
  }
});