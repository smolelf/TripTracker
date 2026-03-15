import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, Modal, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler'; 
import { fetchAllTrips, updateTripFareDetails, deleteTrip } from './services/db'; 
import { useTripStore } from './store/useTripStore';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const nightStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] }
];

interface TripPathPoint {
  latitude: number;
  longitude: number;
  speed: number;
  timestamp: number;
}

export interface SavedTrip {
  id: number;
  startTime: number;
  endTime: number;
  distance: number;
  toll: number;
  totalFare: number;
  path: TripPathPoint[]; 
}

export default function HistoryScreen({ onBack }: { onBack: () => void }) {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const { isDarkMode } = useTripStore();
  const [snapTrip, setSnapTrip] = useState<SavedTrip | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const snapRef = useRef<View>(null);
  const snapMapRef = useRef<MapView>(null);

  const [selectedTrip, setSelectedTrip] = useState<SavedTrip | null>(null);
  const [editToll, setEditToll] = useState('');
  const [editPriceKm, setEditPriceKm] = useState('0.25');
  const [editPriceMin, setEditPriceMin] = useState('0.40');

  useEffect(() => { loadTrips(); }, []);

  const loadTrips = async () => {
    const data = await fetchAllTrips();
    const formattedData = data.map(trip => ({
      ...trip,
      path: typeof trip.path === 'string' ? JSON.parse(trip.path) : trip.path
    }));
    setTrips(formattedData);
  };

  const formatDuration = (start: number, end: number) => {
    const diffInMs = end - start;
    const totalSeconds = Math.floor(diffInMs / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  const exportTripImage = async (trip: SavedTrip) => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Error", "Permission needed to save to Gallery.");

    setIsCapturing(true);
    setSnapTrip(trip);
    
    setTimeout(async () => {
      try {
        const uri = await captureRef(snapRef, { format: 'png', quality: 1.0 });
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert("Success", "Trip Poster saved to Gallery!");
      } catch (e) {
        Alert.alert("Error", "Failed to capture map.");
      } finally {
        setIsCapturing(false);
        setSnapTrip(null);
      }
    }, 3000); 
  };

  const handleSaveEdit = async () => {
    if (!selectedTrip) return;
    const toll = parseFloat(editToll) || 0;
    const pKm = parseFloat(editPriceKm) || 0;
    const pMin = parseFloat(editPriceMin) || 0;
    const durationMin = (selectedTrip.endTime - selectedTrip.startTime) / 60000;
    const newTotalFare = (selectedTrip.distance * pKm) + (durationMin * pMin) + toll;

    await updateTripFareDetails(selectedTrip.id, toll, newTotalFare);
    setSelectedTrip(null);
    loadTrips();
    Alert.alert("Updated", "The fare has been recalculated.");
  };

  const handleDelete = (id: number) => {
    Alert.alert("Delete Trip", "Remove this trip permanently?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteTrip(id); loadTrips(); }}
    ]);
  };

  const theme = {
    bg: isDarkMode ? '#121212' : '#f8f9fa',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#333333',
    input: isDarkMode ? '#333' : '#ddd',
    sub: isDarkMode ? '#aaa' : '#666'
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}><Text style={styles.backBtn}>← Back</Text></TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>History</Text>
      </View>

      {/* OFF-SCREEN SNAPSHOT GENERATOR */}
      {isCapturing && snapTrip && (
        <View ref={snapRef} style={styles.snapshotContainer} collapsable={false}>
          <MapView
            ref={snapMapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.snapMap}
            customMapStyle={nightStyle} 
            onMapReady={() => {
              snapMapRef.current?.fitToCoordinates(snapTrip.path, {
                edgePadding: { top: 150, right: 150, bottom: 150, left: 150 },
                animated: false
              });
            }}
          >
            <Polyline coordinates={snapTrip.path} strokeColor="#2ecc71" strokeWidth={12} lineJoin="miter" />

            {snapTrip.path.length > 0 && (
              <Marker coordinate={snapTrip.path[0]} pinColor="green" />
            )}

            {snapTrip.path.length > 1 && (
              <Marker coordinate={snapTrip.path[snapTrip.path.length - 1]} pinColor="red" />
            )}
          </MapView>

          <View style={styles.snapFooter} collapsable={false}>
            <Text style={styles.snapTitle}>Trip Summary</Text>
            
            <View style={styles.snapRow}>
              <View style={styles.snapStat}>
                <Text style={styles.snapLabel}>DISTANCE</Text>
                <Text style={styles.snapValue}>{snapTrip.distance.toFixed(2)} km</Text>
              </View>
              
              {/* FIX: Removed the buggy nested View here */}
              <View style={styles.snapStat}>
                <Text style={styles.snapLabel}>DURATION</Text>
                <Text style={styles.snapValue}>
                  {formatDuration(snapTrip.startTime, snapTrip.endTime)}
                </Text>
                <Text style={styles.snapSubValue}>
                  {new Date(snapTrip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                  {' - '} 
                  {new Date(snapTrip.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>

            <View style={[styles.snapRow, { borderTopWidth: 2, borderTopColor: '#333', paddingTop: 40, marginTop: 20 }]}>
              <View style={styles.snapStat}>
                <Text style={styles.snapLabel}>TOLL FARE</Text>
                <Text style={styles.snapValue}>RM {snapTrip.toll.toFixed(2)}</Text>
              </View>
              <View style={styles.snapStat}>
                <Text style={styles.snapLabel}>TOTAL FARE</Text>
                <Text style={[styles.snapValue, { color: '#2ecc71', fontSize: 55 }]}>
                  RM {snapTrip.totalFare.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Swipeable renderRightActions={() => (
            <TouchableOpacity style={styles.deleteBox} onPress={() => handleDelete(item.id)}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          )}>
            <TouchableOpacity 
              style={[styles.card, { backgroundColor: theme.card }]} 
              onPress={() => {
                Alert.alert(
                  "Trip Options",
                  `Trip on ${new Date(item.startTime).toLocaleDateString()}`,
                  [
                    { text: "📸 Save Trip Poster", onPress: () => exportTripImage(item) },
                    { text: "✏️ Recalculate Fare", onPress: () => {
                      setSelectedTrip(item);
                      setEditToll(item.toll.toString());
                    }},
                    { text: "Cancel", style: "cancel" }
                  ]
                );
              }}
            >            
              <View style={styles.cardHeader}>
                <Text style={[styles.dateText, { color: theme.sub }]}>
                  {new Date(item.startTime).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
                <Text style={styles.fareText}>RM {item.totalFare.toFixed(2)}</Text>
              </View>
              <View style={styles.details}>
                <Text style={[styles.detailItem, { color: theme.text }]}>📍 {item.distance.toFixed(2)} km</Text>
                <Text style={[styles.detailItem, { color: theme.text }]}>⏱️ {formatDuration(item.startTime, item.endTime)}</Text>
                <Text style={[styles.detailItem, { color: theme.text }]}>🛣️ RM {item.toll.toFixed(2)}</Text>
              </View>
            </TouchableOpacity>
          </Swipeable>
        )}
      />

      <Modal visible={!!selectedTrip} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Recalculate Trip</Text>
            <Text style={styles.label}>Toll Fee (RM)</Text>
            <TextInput style={[styles.input, { color: theme.text, borderColor: theme.input }]} value={editToll} onChangeText={setEditToll} keyboardType="numeric" />
            <Text style={styles.label}>Rate per KM</Text>
            <TextInput style={[styles.input, { color: theme.text, borderColor: theme.input }]} value={editPriceKm} onChangeText={setEditPriceKm} keyboardType="numeric" />
            <Text style={styles.label}>Rate per Min</Text>
            <TextInput style={[styles.input, { color: theme.text, borderColor: theme.input }]} value={editPriceMin} onChangeText={setEditPriceMin} keyboardType="numeric" />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setSelectedTrip(null)}><Text style={{padding: 10, color: theme.sub}}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}><Text style={{color: 'white', fontWeight: 'bold'}}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  backBtn: { fontSize: 18, color: '#2196F3', marginRight: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  list: { paddingHorizontal: 20, paddingBottom: 50 },
  card: { borderRadius: 16, padding: 18, marginBottom: 15, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  dateText: { fontSize: 14, fontWeight: 'bold' },
  fareText: { fontSize: 20, fontWeight: 'bold', color: '#2ecc71' },
  details: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.1)', paddingTop: 12 },
  detailItem: { fontSize: 13, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 25 },
  modalContent: { padding: 25, borderRadius: 24 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20 },
  label: { fontSize: 12, color: '#888', marginBottom: 5, marginLeft: 5 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 18, fontSize: 16 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 15 },
  saveBtn: { backgroundColor: '#2ecc71', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  deleteBox: {
    backgroundColor: '#ff4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '85%', 
    borderRadius: 16,
    marginBottom: 15,
  },
  deleteText: { color: 'white', fontWeight: 'bold' },
  
  // --- SNAPSHOT STYLES ---
  snapshotContainer: { position: 'absolute', left: -5000, top: 0, width: 1080, height: 1920, backgroundColor: '#121212', flexDirection: 'column' },
  snapMap: { flex: 1 },
  snapFooter: { height: 650, backgroundColor: '#1E1E1E', padding: 60, justifyContent: 'center' },
  snapTitle: { color: '#FFFFFF', fontSize: 50, fontWeight: 'bold', marginBottom: 50 },
  snapRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  snapStat: { flex: 1 },
  snapLabel: { color: '#888888', fontSize: 22, fontWeight: 'bold', letterSpacing: 2, marginBottom: 15 },
  snapValue: { color: '#FFFFFF', fontSize: 45, fontWeight: 'bold' },
  snapSubValue: { color: '#AAAAAA', fontSize: 20, marginTop: 8, fontWeight: '600', letterSpacing: 1 },
});