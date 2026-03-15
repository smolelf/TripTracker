import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useTripStore } from './store/useTripStore';

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { isDarkMode, pricePerKm, pricePerMin, setPrices } = useTripStore();
  
  // Local state for the inputs so we only update the store when pressing "Save"
  const [kmInput, setKmInput] = useState(pricePerKm.toString());
  const [minInput, setMinInput] = useState(pricePerMin.toString());

  const theme = {
    bg: isDarkMode ? '#121212' : '#f8f9fa',
    card: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#ffffff' : '#333333',
    inputBg: isDarkMode ? '#333333' : '#f0f0f0',
    border: isDarkMode ? '#444' : '#ddd',
    sub: isDarkMode ? '#aaaaaa' : '#666666'
  };

  const handleSave = () => {
    const parsedKm = parseFloat(kmInput);
    const parsedMin = parseFloat(minInput);

    if (isNaN(parsedKm) || isNaN(parsedMin)) {
      Alert.alert("Invalid Input", "Please enter valid numbers for the rates.");
      return;
    }

    setPrices(parsedKm, parsedMin);
    Alert.alert("Saved", "Your fare rates have been updated.");
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
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Fare Configuration</Text>
        
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.sub }]}>Price per Kilometer (RM)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
            keyboardType="numeric"
            value={kmInput}
            onChangeText={setKmInput}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.sub }]}>Price per Minute (RM)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
            keyboardType="numeric"
            value={minInput}
            onChangeText={setMinInput}
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
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 20 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 15, fontSize: 16, fontWeight: '500' },
  saveBtn: { backgroundColor: '#2196F3', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});