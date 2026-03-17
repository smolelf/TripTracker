import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Switch } from 'react-native';
import { useTripStore } from './store/useTripStore';

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { isDarkMode, pricePerKm, pricePerMin, setPrices, keepAwake, toggleKeepAwake } = useTripStore();
  
  // Initialize state by converting the stored floats (1.25) back into raw strings ("125")
  const [kmInput, setKmInput] = useState(Math.round(pricePerKm * 100).toString());
  const [minInput, setMinInput] = useState(Math.round(pricePerMin * 100).toString());

  const theme = {
    bg: isDarkMode ? '#121212' : '#f8f9fa',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#333333',
    inputBg: isDarkMode ? '#333333' : '#f0f0f0',
    border: isDarkMode ? '#444' : '#ddd',
    sub: isDarkMode ? '#aaaaaa' : '#666666'
  };

  // The visual display output (e.g. "0.25")
  const displayKm = (parseInt(kmInput || '0', 10) / 100).toFixed(2);
  const displayMin = (parseInt(minInput || '0', 10) / 100).toFixed(2);

  // Strip non-numbers exactly like the toll input
  const handleKmChange = (text: string) => setKmInput(text.replace(/[^0-9]/g, ''));
  const handleMinChange = (text: string) => setMinInput(text.replace(/[^0-9]/g, ''));

  const handleSave = () => {
    // Convert back to floats before sending to Zustand
    const finalKm = parseInt(kmInput || '0', 10) / 100;
    const finalMin = parseInt(minInput || '0', 10) / 100;

    setPrices(finalKm, finalMin);
    Alert.alert("Saved", "Your settings have been updated.");
    onBack();
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Settings</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        
        {/* KEEP AWAKE TOGGLE */}
        <View style={styles.settingRow}>
          <View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Keep Screen Awake</Text>
            <Text style={[styles.label, { color: theme.sub }]}>Prevent phone from sleeping</Text>
          </View>
          <Switch 
            value={keepAwake} 
            onValueChange={toggleKeepAwake} 
            trackColor={{ false: '#767577', true: '#2ecc71' }}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 20 }]}>Fare Configuration</Text>
        
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.sub }]}>Price per Kilometer (RM)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
            keyboardType="numeric"
            value={displayKm}
            onChangeText={handleKmChange}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.sub }]}>Price per Minute (RM)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
            keyboardType="numeric"
            value={displayMin}
            onChangeText={handleMinChange}
          />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Settings</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 30 },
  backBtn: { fontSize: 18, color: '#2196F3', marginRight: 20 },
  title: { fontSize: 26, fontWeight: 'bold' },
  card: { marginHorizontal: 20, padding: 25, borderRadius: 20, borderWidth: 1, elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  divider: { height: 1, width: '100%', marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 15, fontSize: 16, fontWeight: '500' },
  saveBtn: { backgroundColor: '#2196F3', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});