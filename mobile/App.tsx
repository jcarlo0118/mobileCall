import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  SafeAreaView,
  Platform,
  Switch,
  Image,
  ScrollView,
} from 'react-native';
import { io, Socket } from 'socket.io-client';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';

// --- PLATFORM CONDITIONAL WEBRTC IMPORTS ---
let RTCPeerConnection: any;
let RTCIceCandidate: any;
let RTCSessionDescription: any;
let mediaDevices: any;
let RTCView: any;
let MediaStream: any;

if (Platform.OS === 'web') {
  RTCPeerConnection = window.RTCPeerConnection;
  RTCIceCandidate = window.RTCIceCandidate;
  RTCSessionDescription = window.RTCSessionDescription;
  mediaDevices = navigator.mediaDevices;
} else {
  try {
    const WebRTC = require('react-native-webrtc');
    RTCPeerConnection = WebRTC.RTCPeerConnection;
    RTCIceCandidate = WebRTC.RTCIceCandidate;
    RTCSessionDescription = WebRTC.RTCSessionDescription;
    mediaDevices = WebRTC.mediaDevices;
    RTCView = WebRTC.RTCView;
    MediaStream = WebRTC.MediaStream;
  } catch (e) {
    console.warn('WebRTC native module not found.');
  }
}

const iceServers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

type User = { id: string; name: string; is_voip_eligible?: boolean };

export default function App() {
  const [view, setView] = useState<'auth' | 'main' | 'call' | 'upload'>('auth');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  // Auth State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [householdId, setHouseholdId] = useState('');
  const [isHoH, setIsHoH] = useState(false);
  const [subStatus, setSubStatus] = useState('basic');
  const [serverIP, setServerIP] = useState('');
  const [isVoipEligible, setIsVoipEligible] = useState(false);

  // App State
  const [isJoined, setIsJoined] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'connected'>('idle');
  const [callerName, setCallerName] = useState('');
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);

  // Image Processing State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [faces, setFaces] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [tempImageId, setTempImageId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const remoteSocketIdRef = useRef<string | null>(null);
  const offerDataRef = useRef<any>(null);

  const localVideoRef = useRef<any>(null);
  const remoteVideoRef = useRef<any>(null);

  const getBaseUrl = () => {
    let sanitizedIP = serverIP.trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    return `http://${sanitizedIP}:3000`;
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
      if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream, callStatus]);

  const handleAuth = async () => {
    const baseUrl = getBaseUrl();
    try {
      if (authMode === 'register') {
        const res = await axios.post(`${baseUrl}/register`, {
          username,
          password,
          age: parseInt(age),
          household_id: householdId,
          is_head_of_household: isHoH,
          subscription_status: subStatus,
        });
        Alert.alert('Success', res.data.message);
        setAuthMode('login');
      } else {
        const res = await axios.post(`${baseUrl}/login`, { username, password });
        setIsVoipEligible(res.data.user.is_voip_eligible);
        handleJoin();
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Request failed');
    }
  };

  const handleJoin = () => {
    const socketUrl = getBaseUrl();
    if (socketRef.current) socketRef.current.disconnect();

    socketRef.current = io(socketUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    socketRef.current.on('connect', () => {
      socketRef.current?.emit('join', username.trim());
      setIsJoined(true);
      setView('main');
    });

    socketRef.current.on('user-list', (list: User[]) => {
      setUsers(list.filter((u) => u.id !== socketRef.current?.id));
    });

    socketRef.current.on('offer', async (data) => {
      setCallerName(data.fromName);
      setIsIncomingCall(true);
      setCallStatus('ringing');
      remoteSocketIdRef.current = data.from;
      offerDataRef.current = data;
      setView('call');
    });

    socketRef.current.on('answer', async (data) => {
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        setCallStatus('connected');
      }
    });

    socketRef.current.on('ice-candidate', async (data) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {}
      }
    });

    socketRef.current.on('call-rejected', () => {
      Alert.alert('Rejected', 'Call was declined');
      endCall();
    });

    socketRef.current.on('end-call', endCall);
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
      uploadGroupImage(result.assets[0].uri);
    }
  };

  const uploadGroupImage = async (uri: string) => {
    const baseUrl = getBaseUrl();
    setUploading(true);
    const formData = new FormData();
    // @ts-ignore
    formData.append('image', {
      uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
      name: 'group.jpg',
      type: 'image/jpeg',
    });
    formData.append('username', username);

    try {
      const res = await axios.post(`${baseUrl}/upload-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFaces(res.data.faces);
      setTempImageId(res.data.image_id);
    } catch (e) {
      Alert.alert('Upload Failed', 'Could not detect faces');
    } finally {
      setUploading(false);
    }
  };

  const finalizeFace = async (face: any) => {
    const baseUrl = getBaseUrl();
    try {
      await axios.post(`${baseUrl}/finalize-crop`, {
        username,
        image_id: tempImageId,
        face,
      });
      Alert.alert('Success', 'Profile image updated');
      setView('main');
    } catch (e) {
      Alert.alert('Error', 'Could not finalize face crop');
    }
  };

  const startLocalStream = async (video: boolean) => {
    if (!mediaDevices) return null;
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: video ? { facingMode: 'user' } : false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (e) {
      Alert.alert('Permission Error', 'Cannot access camera or microphone');
      return null;
    }
  };

  const setupPeerConnection = (targetId: string, stream: any) => {
    if (!RTCPeerConnection) return;
    peerConnectionRef.current = new RTCPeerConnection(iceServers);
    stream.getTracks().forEach((track: any) => peerConnectionRef.current.addTrack(track, stream));
    peerConnectionRef.current.onicecandidate = (event: any) => {
      if (event.candidate) socketRef.current?.emit('ice-candidate', { to: targetId, candidate: event.candidate });
    };
    peerConnectionRef.current.ontrack = (event: any) => setRemoteStream(event.streams[0]);
  };

  const initiateCall = async (targetId: string, targetName: string, video: boolean) => {
    if (!isVoipEligible) {
      Alert.alert('Ineligible', 'You are not eligible for VoIP calls.');
      return;
    }
    setCallStatus('calling');
    setCallerName(targetName);
    remoteSocketIdRef.current = targetId;
    setIsVideoEnabled(video);
    setView('call');

    const stream = await startLocalStream(video);
    if (!stream) return;
    setupPeerConnection(targetId, stream);
    const offer = await peerConnectionRef.current.createOffer();
    await peerConnectionRef.current.setLocalDescription(offer);
    socketRef.current?.emit('offer', { to: targetId, offer, isVideo: video });
  };

  const endCall = () => {
    if (remoteSocketIdRef.current) socketRef.current?.emit('end-call', { to: remoteSocketIdRef.current });
    if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t: any) => t.stop()); localStreamRef.current = null; }
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus('idle');
    setIsIncomingCall(false);
    setView('main');
  };

  // --- RENDERING ---

  if (view === 'auth') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.center}>
          <Text style={styles.title}>MobileCall</Text>
          <TextInput style={styles.input} placeholder="Server IP (e.g. 192.168.1.15)" value={serverIP} onChangeText={setServerIP} />
          <TextInput style={styles.input} placeholder="Username" value={username} onChangeText={setUsername} />
          <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
          
          {authMode === 'register' && (
            <>
              <TextInput style={styles.input} placeholder="Age" value={age} onChangeText={setAge} keyboardType="numeric" />
              <TextInput style={styles.input} placeholder="Household ID" value={householdId} onChangeText={setHouseholdId} />
              <View style={styles.row}>
                <Text>Head of Household?</Text>
                <Switch value={isHoH} onValueChange={setIsHoH} />
              </View>
              <View style={styles.row}>
                <Text>Subscription: </Text>
                {['basic', 'premium'].map(s => (
                  <TouchableOpacity key={s} onPress={() => setSubStatus(s)} style={[styles.tab, subStatus === s && styles.tabActive]}>
                    <Text style={{color: subStatus === s ? '#fff' : '#000'}}>{s.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity style={styles.button} onPress={handleAuth}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{authMode.toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            <Text style={{ color: '#2196F3', marginTop: 10 }}>
              {authMode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (view === 'upload') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.subtitle}>Select HoH Face</Text>
          {selectedImage && <Image source={{ uri: selectedImage }} style={{ width: 300, height: 300, borderRadius: 10 }} />}
          {uploading ? <Text>Detecting faces...</Text> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 20 }}>
              {faces.map((f, i) => (
                <TouchableOpacity key={i} onPress={() => finalizeFace(f)} style={styles.faceBox}>
                  <Text>Face {i+1}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity style={[styles.button, {backgroundColor: '#666'}]} onPress={() => setView('main')}>
            <Text style={{color: '#fff'}}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (view === 'main') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.welcome}>Welcome, {username}</Text>
            <Text style={{color: '#fff'}}>VoIP Eligible: {isVoipEligible ? '✅' : '❌'}</Text>
          </View>
          <TouchableOpacity onPress={() => setView('upload')}>
            <MaterialIcons name="add-a-photo" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <View style={styles.userRow}>
              <Text style={{ fontSize: 18 }}>{item.name}</Text>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity onPress={() => initiateCall(item.id, item.name, false)} style={[styles.callBtn, { backgroundColor: '#4CAF50' }]}><Text style={{ color: '#fff' }}>Voice</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => initiateCall(item.id, item.name, true)} style={[styles.callBtn, { backgroundColor: '#2196F3' }]}><Text style={{ color: '#fff' }}>Video</Text></TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 50 }}>No one else is online.</Text>}
        />
        <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
           <Text style={{color: '#fff'}}>Upload Group Photo</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.callContainer}>
      <View style={styles.center}>
        <Text style={{ color: '#fff', fontSize: 24 }}>{isIncomingCall ? 'Incoming Call from' : 'Calling...'}</Text>
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: 'bold' }}>{callerName}</Text>
        {callStatus === 'ringing' || isIncomingCall ? (
          <View style={{ flexDirection: 'row', marginTop: 40 }}>
            {isIncomingCall && (
              <TouchableOpacity onPress={() => {}} style={[styles.roundButton, { backgroundColor: '#4CAF50' }]}>
                <MaterialIcons name="call" size={32} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={endCall} style={[styles.roundButton, { backgroundColor: '#F44336' }]}>
              <MaterialIcons name="call-end" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1, width: '100%' }}>
            {Platform.OS === 'web' ? (
              <video ref={remoteVideoRef} autoPlay playsInline style={styles.fullScreenVideo} />
            ) : (
              remoteStream && <RTCView streamURL={remoteStream.toURL()} style={styles.fullScreenVideo} />
            )}
            <TouchableOpacity onPress={endCall} style={[styles.roundButton, { backgroundColor: '#F44336', position: 'absolute', bottom: 40, alignSelf: 'center' }]}>
              <MaterialIcons name="call-end" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, color: '#2196F3' },
  subtitle: { fontSize: 20, marginBottom: 20 },
  input: { width: '100%', padding: 15, backgroundColor: '#fff', borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#ddd' },
  button: { padding: 15, borderRadius: 10, backgroundColor: '#2196F3', alignItems: 'center', margin: 10, minWidth: 200 },
  header: { padding: 20, backgroundColor: '#2196F3', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  welcome: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  userRow: { padding: 20, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' },
  callBtn: { padding: 10, borderRadius: 5, marginLeft: 10 },
  callContainer: { flex: 1, backgroundColor: '#000' },
  fullScreenVideo: { flex: 1, backgroundColor: '#222' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 15, paddingHorizontal: 10 },
  tab: { padding: 8, borderRadius: 5, borderWidth: 1, borderColor: '#ccc', marginLeft: 5 },
  tabActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  uploadBtn: { position: 'absolute', bottom: 20, selfAlign: 'center', backgroundColor: '#2196F3', padding: 15, borderRadius: 30, width: '80%', left: '10%', alignItems: 'center' },
  faceBox: { padding: 10, borderWidth: 2, borderColor: '#2196F3', margin: 5, borderRadius: 5 },
  roundButton: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginHorizontal: 20 },
});
