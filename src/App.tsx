import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, Alert, StatusBar, Platform, BackHandler, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTripStore } from './store/useTripStore';
import HistoryScreen from './HistoryScreen';
import SettingsScreen from './SettingsScreen';
import { initDB } from './services/db';
import * as Location from 'expo-location';
import { LOCATION_TASK_NAME } from './services/locationTask';

const nightStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] }
];

// Helper to calculate direction between two GPS coordinates
const getBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
  const startLatRad = startLat * (Math.PI / 180);
  const startLngRad = startLng * (Math.PI / 180);
  const destLatRad = destLat * (Math.PI / 180);
  const destLngRad = destLng * (Math.PI / 180);

  const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
  const x = Math.cos(startLatRad) * Math.sin(destLatRad) - 
            Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
  
  const brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
};

export default function App() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const lastHeadingRef = useRef(0);
  const [isOverviewMode, setIsOverviewMode] = useState(false);
  
  const [view, setView] = useState<'MAP' | 'HISTORY' | 'SETTINGS'>('MAP');
  const [tollInput, setTollInput] = useState(''); 
  
  const { 
    status, startTrip, stopTrip, pauseTrip, resumeTrip, finishTrip,
    path, totalDistance, currentFare, lastLocation,
    isFollowing, setFollowing, isDarkMode, toggleDarkMode
  } = useTripStore();

  // --- BULLETPROOF KEYBOARD LOGIC ---
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Intercept Android hardware back button
  useEffect(() => {
    const backAction = () => {
      if (view !== 'MAP') {
        setView('MAP');
        return true; 
      }
      return false; 
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove(); 
  }, [view]);

  // Init Database
  useEffect(() => {
    const setup = async () => { try { await initDB(); } catch (e) { console.error(e); } };
    setup();
  }, []);

  // Snap to user location on boot
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const location = await Location.getCurrentPositionAsync({});
      mapRef.current?.animateCamera({
        center: { latitude: location.coords.latitude, longitude: location.coords.longitude },
        pitch: 60, 
        zoom: 18 
      });
    })();
  }, []);

  // Auto-follow camera - dynamically calculates heading
  useEffect(() => {
    if (status === 'TRACKING' && isFollowing && lastLocation && mapRef.current) {
      if (path.length >= 2) {
        const prev = path[path.length - 2];
        const curr = path[path.length - 1];
        
        if (curr.speed > 1) {
           lastHeadingRef.current = getBearing(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
        }
      }

      mapRef.current.animateCamera({
        center: { latitude: lastLocation.latitude, longitude: lastLocation.longitude },
        pitch: 60, 
        zoom: 18,
        heading: lastHeadingRef.current 
      }, { duration: 1000 }); 
    }
  }, [lastLocation, isFollowing, status, path]);

  // Auto-framer for Live Overview Mode
  useEffect(() => {
    if (status === 'TRACKING' && isOverviewMode && path.length > 0 && mapRef.current) {
      mapRef.current.fitToCoordinates(path, {
        edgePadding: { top: 100, right: 100, bottom: 400, left: 100 },
        animated: true, 
      });
    }
  }, [path, isOverviewMode, status]);

  const theme = {
    bg: isDarkMode ? '#121212' : '#FFFFFF',
    text: isDarkMode ? '#FFFFFF' : '#333333',
    card: isDarkMode ? '#1E1E1E' : '#FFFFFF',
    border: isDarkMode ? '#333' : '#eee',
    subtext: isDarkMode ? '#aaa' : '#666'
  };

  const startTracking = async () => {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    
    if (fg !== 'granted' || bg !== 'granted') return Alert.alert("Permission Required", "Please allow 'All the time' location access.");

    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Highest, 
        timeInterval: 1000, 
        distanceInterval: 0, 
        foregroundService: {
          notificationTitle: "Trip Tracker Active",
          notificationBody: "Monitoring your fare...",
          notificationColor: "#2196F3",
        },
      });
      setIsOverviewMode(false);
      startTrip();
    } catch (error) {
      console.error(error);
      Alert.alert("Tracking Error", "Could not start the background task.");
    }
  };

  // --- LIVE TIMER LOGIC ---
  const [elapsedSecs, setElapsedSecs] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'TRACKING') {
      interval = setInterval(() => {
        setElapsedSecs((prev) => prev + 1);
      }, 1000);
    } else if (status === 'IDLE') {
      setElapsedSecs(0); 
    }
    return () => clearInterval(interval);
  }, [status]);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const displayToll = (parseInt(tollInput || '0', 10) / 100).toFixed(2);

  const handleTollChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setTollInput(cleaned);
  };

  const handleFinish = async () => {
    const finalToll = parseInt(tollInput || '0', 10) / 100;
    const serializedPath = JSON.stringify(path); 
    await finishTrip(finalToll, serializedPath); 
    setTollInput('');
    setIsOverviewMode(false);
    Alert.alert("Success", "Trip saved successfully.");
  };

  const showOverview = () => {
    if (path.length > 0 && mapRef.current) {
      setFollowing(false); 
      setIsOverviewMode(true); // <-- Activate live overview tracking
      
      mapRef.current.fitToCoordinates(path, {
        edgePadding: { top: 100, right: 100, bottom: 400, left: 100 },
        animated: true,
      });
    } else {
      Alert.alert("No Data", "Start driving to generate a trip path.");
    }
  };

  if (view === 'HISTORY') return <HistoryScreen onBack={() => setView('MAP')} />;
  if (view === 'SETTINGS') return <SettingsScreen onBack={() => setView('MAP')} />;

  const currentSpeed = (lastLocation?.speed ?? 0) * 3.6;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        customMapStyle={isDarkMode ? nightStyle : []}
        mapPadding={{ top: insets.top, right: 0, left: 0, bottom: 0 }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        showsMapToolbar={false}
        userLocationUpdateInterval={1000} 
        userLocationFastestInterval={500}
        initialCamera={{ center: { latitude: 3.0738, longitude: 101.5183 }, pitch: 45, heading: 0, altitude: 1000, zoom: 15 }} 
      >
        {path.map((point, index) => {
          if (index === 0) return null;
          const color = (point.speed * 3.6) < 40 ? '#F44336' : (point.speed * 3.6) <= 90 ? '#FFC107' : '#4CAF50';
          return <Polyline key={index} coordinates={[path[index-1], point]} strokeColor={color} strokeWidth={6} lineJoin="miter" />;
        })}
      </MapView>

      <View style={[styles.speedometer, { top: insets.top + 15, left: 20, backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.speedText, { color: currentSpeed < 40 ? '#F44336' : currentSpeed <= 90 ? '#FFC107' : '#4CAF50' }]}>
          {currentSpeed.toFixed(0)}
        </Text>
        <Text style={[styles.speedUnit, { color: theme.subtext }]}>km/h</Text>
      </View>

      <View style={[styles.actionBar, { top: insets.top + 15 }]} pointerEvents="box-none">
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: theme.card}]} onPress={toggleDarkMode}>
          <Text style={styles.icon}>{isDarkMode ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: theme.card}]} onPress={() => setView('HISTORY')}><Text style={styles.icon}>📜</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: theme.card}]} onPress={() => setView('SETTINGS')}><Text style={styles.icon}>⚙️</Text></TouchableOpacity>
        <View style={styles.separator} />
        <TouchableOpacity 
          style={[styles.actionBtn, isFollowing ? styles.activeBtn : {backgroundColor: theme.card}]} 
          onPress={() => {
            setFollowing(true);
            setIsOverviewMode(false); // <-- Disable overview when returning to 3D navigation
            
            if (lastLocation) {
              mapRef.current?.animateCamera({ 
                center: { latitude: lastLocation.latitude, longitude: lastLocation.longitude }, 
                pitch: 60, 
                zoom: 18,
                heading: lastHeadingRef.current 
              });
            }
          }}
        >
          <Text style={[styles.icon, isFollowing && { color: 'white' }]}>🎯</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, {backgroundColor: theme.card}]} onPress={showOverview}>
          <Text style={styles.icon}>🗺️</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.controls, { 
        backgroundColor: theme.card,
        position: 'absolute',
        left: 20,
        right: 20,
        bottom: keyboardHeight > 0 ? keyboardHeight + 10 : 30
      }]}>

        {(status === 'TRACKING' || status === 'PAUSED') ? (
          <View style={styles.liveDashboard}>
            <View style={styles.liveStatBox}>
              <Text style={styles.liveLabel}>FARE</Text>
              <Text style={[styles.liveValue, { color: '#2ecc71' }]}>RM {currentFare.toFixed(2)}</Text>
            </View>
            <View style={styles.liveDivider} />
            <View style={styles.liveStatBox}>
              <Text style={styles.liveLabel}>TIME</Text>
              <Text style={[styles.liveValue, { color: theme.text }]}>{formatTime(elapsedSecs)}</Text>
            </View>
            <View style={styles.liveDivider} />
            <View style={styles.liveStatBox}>
              <Text style={styles.liveLabel}>DISTANCE</Text>
              <Text style={[styles.liveValue, { color: theme.text }]}>{totalDistance.toFixed(2)} km</Text>
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.statusText}>{status}</Text>
            <Text style={[styles.fareText, { color: theme.text }]}>RM {currentFare.toFixed(2)}</Text>
          </View>
        )}

        {(status === 'TRACKING' || status === 'PAUSED') && (
          <View style={[styles.row, { marginTop: 10 }]}>
            <TouchableOpacity 
              style={[styles.mainBtn, { flex: 1, backgroundColor: status === 'TRACKING' ? 'orange' : 'green' }]} 
              onPress={status === 'TRACKING' ? pauseTrip : resumeTrip}
            >
              <Text style={styles.mainBtnText}>{status === 'TRACKING' ? 'Pause' : 'Resume'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.mainBtn, { flex: 1, backgroundColor: 'red' }]} 
              onPress={async () => { 
                try {
                  await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); 
                } catch (error) {
                  console.log("Task already stopped or error:", error);
                }
                stopTrip(); 
              }}
            >
              <Text style={styles.mainBtnText}>Stop</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'IDLE' && (
          <TouchableOpacity style={[styles.mainBtn, { marginTop: 10 }]} onPress={startTracking}>
            <Text style={styles.mainBtnText}>Start Trip</Text>
          </TouchableOpacity>
        )}

        {status === 'REVIEW' && (
          <View style={[styles.reviewOverlay, { borderTopColor: theme.border }]}>
            <Text style={[styles.reviewTitle, { color: theme.text }]}>Trip Summary</Text>
            <View style={[styles.summaryBox, { backgroundColor: isDarkMode ? '#2c2c2c' : '#f0f7ff' }]}>
              <Text style={[styles.summaryText, { color: theme.text }]}>Distance: {totalDistance.toFixed(2)} km</Text>
              <Text style={[styles.summaryText, { color: theme.text }]}>Base Fare: RM {currentFare.toFixed(2)}</Text>
            </View>
            
            <Text style={styles.inputLabel}>Toll (RM)</Text>
            <TextInput 
              keyboardType="numeric" 
              style={[styles.input, { color: theme.text, borderColor: theme.border }]} 
              value={displayToll} 
              onChangeText={handleTollChange} 
            />
            <TouchableOpacity style={styles.mainBtn} onPress={handleFinish}>
              <Text style={styles.mainBtnText}>Confirm & Save</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  speedometer: { position: 'absolute', padding: 12, borderRadius: 20, alignItems: 'center', width: 85, height: 85, elevation: 10, borderWidth: 1 },
  speedText: { fontSize: 32, fontWeight: '900', fontFamily: 'monospace' },
  speedUnit: { fontSize: 10, fontWeight: 'bold', marginTop: -5 },
  actionBar: { position: 'absolute', right: 20, width: 55, alignItems: 'center' },
  actionBtn: { width: 50, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center', elevation: 5, marginBottom: 10 },
  activeBtn: { backgroundColor: '#2196F3' },
  icon: { fontSize: 22 },
  separator: { height: 2, width: 30, backgroundColor: 'rgba(128,128,128,0.2)', marginBottom: 10 },
  
  controls: { padding: 20, borderRadius: 20, elevation: 10, marginHorizontal: 20 },
  
  statusText: { fontSize: 10, color: '#aaa', fontWeight: 'bold', textTransform: 'uppercase' },
  fareText: { fontSize: 36, fontWeight: 'bold' },
  row: { flexDirection: 'row', gap: 10 },
  mainBtn: { backgroundColor: '#2196F3', padding: 16, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  mainBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  reviewOverlay: { marginTop: 15, borderTopWidth: 1, paddingTop: 15 },
  reviewTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  summaryBox: { padding: 15, borderRadius: 12, marginBottom: 15 },
  summaryText: { fontSize: 16, fontWeight: '600', marginBottom: 5 },
  inputLabel: { fontSize: 12, color: '#888', marginBottom: 5, marginLeft: 5 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 15, fontSize: 18, fontWeight: 'bold' },
  liveDashboard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, paddingVertical: 12, backgroundColor: 'rgba(128,128,128,0.08)', borderRadius: 12 },
  liveStatBox: { flex: 1, alignItems: 'center' },
  liveDivider: { width: 1, height: 35, backgroundColor: 'rgba(128,128,128,0.2)' },
  liveLabel: { fontSize: 10, color: '#888', fontWeight: 'bold', marginBottom: 4, letterSpacing: 1 },
  liveValue: { fontSize: 18, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});