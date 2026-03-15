import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { useTripStore } from '../store/useTripStore';

export const LOCATION_TASK_NAME = 'background-trip-tracking';

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }: any) => {
  if (error) {
    console.error("Background Location Error:", error);
    return;
  }
  
  if (data) {
    const { locations } = data;
    
    // Use a loop to process ALL locations in the batch for a smoother path
    locations.forEach((location: any) => {
      if (location) {
        // Accessing state directly is correct for background tasks
        const state = useTripStore.getState();

        if (state.status === 'TRACKING') {
          state.updateLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            speed: location.coords.speed || 0,
            timestamp: location.timestamp,
          });
        }
      }
    });
  }
});