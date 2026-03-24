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
import * as Network from 'expo-network';
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
  const [view, setView] = useState<'auth' | 'main' | 'call' | 'upload' | 'profile' | 'family' | 'notifications'>('auth');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  
  // Auth State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [serverIP, setServerIP] = useState('');
  const [isVoipEligible, setIsVoipEligible] = useState(false);
  
  // Family & Notifications State
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [notificationsBadge, setNotificationsBadge] = useState(false);

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
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

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
    if (!serverIP) return 'http://localhost:3000'; // Fallback
    let sanitizedIP = serverIP.trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    return `http://${sanitizedIP}:3000`;
  };

  const autoDiscoverServer = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setScanProgress(0);
    try {
      const ip = await Network.getIpAddressAsync();
      if (!ip || ip === '0.0.0.0') {
        Alert.alert('Discovery Error', 'Could not get local IP address.');
        setIsScanning(false);
        return;
      }

      const parts = ip.split('.');
      if (parts.length !== 4) {
        setIsScanning(false);
        return;
      }
      
      const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
      const port = 3000;
      let found = false;

      // Scan in batches of 10 to be efficient but not overwhelming
      for (let i = 1; i <= 254; i += 10) {
        if (found) break;
        setScanProgress(Math.floor((i / 254) * 100));
        
        const promises = [];
        for (let j = 0; j < 10 && (i + j) <= 254; j++) {
          const targetIp = `${subnet}.${i + j}`;
          promises.push(
            axios.get(`http://${targetIp}:${port}/api/ping`, { timeout: 500 })
              .then(res => {
                if (res.data?.service === 'mobile-call-server') {
                  setServerIP(targetIp);
                  found = true;
                  return targetIp;
                }
                return null;
              })
              .catch(() => null)
          );
        }
        
        const results = await Promise.all(promises);
        if (results.some(r => r !== null)) break;
      }

      if (!found) {
        Alert.alert('Discovery Finished', 'Server not found automatically. Please enter IP manually.');
      } else {
        Alert.alert('Success', 'Server found and connected!');
      }
    } catch (e) {
      console.error('Discovery error:', e);
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
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
          username: username.trim(),
          password,
        });
        Alert.alert('Success', res.data.message);
        setAuthMode('login');
      } else {
        const res = await axios.post(`${baseUrl}/login`, { username: username.trim(), password });
        const { token, user } = res.data;
        setAuthToken(token);
        setUserProfile(user);
        setIsVoipEligible(user.is_voip_eligible);
        handleJoin(token);
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Request failed');
    }
  };

  useEffect(() => {
    if (authToken && view !== 'auth') {
      fetchProfile();
      fetchNotifications();
    }
  }, [authToken, view]);

  const getAuthHeaders = () => ({
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  const fetchProfile = async () => {
    if (!authToken) return;
    const baseUrl = getBaseUrl();
    try {
      const res = await axios.get(`${baseUrl}/api/profile`, getAuthHeaders());
      setUserProfile(res.data.user);
      setIsVoipEligible(res.data.user.is_voip_eligible);
      if (res.data.user.family_id) {
        fetchFamilyMembers();
      }
    } catch (e) {}
  };

  const fetchNotifications = async () => {
    if (!authToken) return;
    const baseUrl = getBaseUrl();
    try {
      const res = await axios.get(`${baseUrl}/api/notifications`, getAuthHeaders());
      if (res.data.status === 'successful') {
        setPendingInvitations(res.data.notifications);
        setNotificationsBadge(res.data.notifications.length > 0);
      }
    } catch (e) {}
  };

  const fetchFamilyMembers = async () => {
    if (!authToken) return;
    const baseUrl = getBaseUrl();
    try {
      const res = await axios.get(`${baseUrl}/api/family/members`, getAuthHeaders());
      if (res.data.status === 'successful') {
        setFamilyMembers(res.data.members);
      }
    } catch (e) {}
  };

  const handleJoin = (tokenToUse: string | null = authToken) => {
    const socketUrl = getBaseUrl();
    if (socketRef.current) socketRef.current.disconnect();

    socketRef.current = io(socketUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    socketRef.current.on('connect', () => {
      socketRef.current?.emit('join', { token: tokenToUse });
      // Request user list after a short delay as a safety net for race conditions
      // where the other device joins at nearly the same time
      setTimeout(() => {
        socketRef.current?.emit('request-user-list', {});
      }, 1500);
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
      endCall(false);
    });

    socketRef.current.on('end-call', () => endCall(false));
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

  const acceptCall = async () => {
    const data = offerDataRef.current;
    if (!data) return;

    setIsIncomingCall(false);
    setCallStatus('connected');
    remoteSocketIdRef.current = data.from;

    const stream = await startLocalStream(data.isVideo);
    if (!stream) {
      socketRef.current?.emit('call-rejected', { to: data.from });
      endCall(false);
      return;
    }

    setupPeerConnection(data.from, stream);
    try {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socketRef.current?.emit('answer', { to: data.from, answer });
    } catch (e) {
      console.error('Accept call error:', e);
      endCall(true);
    }
  };

  const declineCall = () => {
    if (remoteSocketIdRef.current) {
      socketRef.current?.emit('call-rejected', { to: remoteSocketIdRef.current });
    } else if (offerDataRef.current) {
      socketRef.current?.emit('call-rejected', { to: offerDataRef.current.from });
    }
    endCall(false);
  };

  const endCall = (emitEvent = true) => {
    if (emitEvent && remoteSocketIdRef.current) {
      socketRef.current?.emit('end-call', { to: remoteSocketIdRef.current });
    }
    
    if (peerConnectionRef.current) { 
      peerConnectionRef.current.close(); 
      peerConnectionRef.current = null; 
    }
    if (localStreamRef.current) { 
      localStreamRef.current.getTracks().forEach((t: any) => t.stop()); 
      localStreamRef.current = null; 
    }
    
    remoteSocketIdRef.current = null;
    offerDataRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus('idle');
    setIsIncomingCall(false);
    setView('main');
  };

  // --- RENDERING ---

  // --- VIEW RENDERING HELPERS ---

  const renderNavBar = () => (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={() => setView('main')} style={styles.navItem}>
        <MaterialIcons name="videocam" size={24} color={view === 'main' ? '#2196F3' : '#666'} />
        <Text style={[styles.navText, view === 'main' && styles.navTextActive]}>Calls</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setView('family')} style={styles.navItem}>
        <MaterialIcons name="people" size={24} color={view === 'family' ? '#2196F3' : '#666'} />
        <Text style={[styles.navText, view === 'family' && styles.navTextActive]}>Family</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setView('notifications')} style={styles.navItem}>
        <View>
          <MaterialIcons name="notifications" size={24} color={view === 'notifications' ? '#2196F3' : '#666'} />
          {notificationsBadge && <View style={styles.badgeDot} />}
        </View>
        <Text style={[styles.navText, view === 'notifications' && styles.navTextActive]}>Inbox</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setView('profile')} style={styles.navItem}>
        <MaterialIcons name="person" size={24} color={view === 'profile' ? '#2196F3' : '#666'} />
        <Text style={[styles.navText, view === 'profile' && styles.navTextActive]}>Profile</Text>
      </TouchableOpacity>
    </View>
  );

  if (view === 'auth') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.center}>
          <Text style={styles.title}>MobileCall</Text>
          
          <TextInput
            placeholder="Server IP (e.g. 192.168.1.5)"
            style={styles.input}
            value={serverIP}
            onChangeText={setServerIP}
            keyboardType="numeric"
          />

          <TouchableOpacity 
            style={[styles.button, {backgroundColor: isScanning ? '#404040' : '#10B981', marginBottom: 20}]} 
            onPress={autoDiscoverServer}
            disabled={isScanning}
          >
            <Text style={{color: '#fff', fontWeight: 'bold'}}>
              {isScanning ? `Scanning Subnet (${scanProgress}%)...` : 'Auto-Discover Server'}
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
          
          <TouchableOpacity style={styles.button} onPress={handleAuth}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{authMode.toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            <Text style={{ color: '#C084FC', marginTop: 10 }}>
              {authMode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (view === 'call') {
    return (
      <SafeAreaView style={styles.callContainer}>
        <View style={styles.center}>
          <Text style={{ color: '#fff', fontSize: 24 }}>{isIncomingCall ? 'Incoming Call from' : 'Calling...'}</Text>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: 'bold' }}>{callerName}</Text>
          {callStatus === 'ringing' || isIncomingCall ? (
            <View style={{ flexDirection: 'row', marginTop: 40 }}>
              {isIncomingCall && (
                <TouchableOpacity onPress={acceptCall} style={[styles.roundButton, { backgroundColor: '#10B981' }]}>
                  <MaterialIcons name="call" size={32} color="#fff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={declineCall} style={[styles.roundButton, { backgroundColor: '#EF4444' }]}>
                <MaterialIcons name="call-end" size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1, width: '100%' }}>
              {Platform.OS === 'web' ? (
                <video ref={remoteVideoRef} autoPlay playsInline style={{ ...styles.fullScreenVideo, objectFit: 'contain' } as any} />
              ) : (
                remoteStream && <RTCView streamURL={remoteStream.toURL()} style={styles.fullScreenVideo} objectFit="contain" />
              )}
              <TouchableOpacity onPress={() => endCall(true)} style={[styles.roundButton, { backgroundColor: '#EF4444', position: 'absolute', bottom: 40, alignSelf: 'center' }]}>
                <MaterialIcons name="call-end" size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={{flex: 1}}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.welcome}>{view.toUpperCase()}</Text>
          <TouchableOpacity onPress={() => { setAuthToken(null); setView('auth'); }}>
            <MaterialIcons name="logout" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{flex: 1}}>
          {view === 'main' && (
            <View style={{padding: 20}}>
              <Text style={styles.sectionTitle}>Online Family Members</Text>
              {users.length === 0 ? (
                <Text style={{ textAlign: 'center', marginTop: 50, color: '#A3A3A3' }}>No one else is online in your family.</Text>
              ) : (
                users.map((item) => (
                  <View key={item.id} style={styles.userRow}>
                    <Text style={{ fontSize: 18, fontWeight: '500' }}>{item.name}</Text>
                    <View style={{ flexDirection: 'row' }}>
                      <TouchableOpacity onPress={() => initiateCall(item.id, item.name, false)} style={[styles.callBtn, { backgroundColor: '#10B981' }]}>
                        <MaterialIcons name="call" size={20} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => initiateCall(item.id, item.name, true)} style={[styles.callBtn, { backgroundColor: '#9333EA' }]}>
                        <MaterialIcons name="videocam" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {view === 'profile' && (
            <View style={{padding: 20}}>
              <View style={styles.profileHeader}>
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarText}>{(userProfile?.username || 'U')[0].toUpperCase()}</Text>
                </View>
                <Text style={styles.profileName}>{userProfile?.username}</Text>
                <Text style={{color: '#A3A3A3'}}>{userProfile?.role || 'No Role Set'}</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Update Profile</Text>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Role</Text>
                  <View style={styles.row}>
                    {['caregiver', 'grandparent'].map(r => (
                      <TouchableOpacity key={r} onPress={() => setUserProfile({...userProfile, role: r})} style={[styles.typeBtn, userProfile?.role === r && styles.typeBtnActive]}>
                        <Text style={{color: userProfile?.role === r ? '#fff' : '#A3A3A3'}}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <TouchableOpacity style={styles.button} onPress={async () => {
                   const baseUrl = getBaseUrl();
                   try {
                     await axios.post(`${baseUrl}/api/profile`, { role: userProfile.role, age: userProfile.age }, getAuthHeaders());
                     Alert.alert('Success', 'Profile updated');
                   } catch (e) { Alert.alert('Error', 'Update failed'); }
                }}>
                  <Text style={{color: '#fff'}}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {view === 'family' && (
            <View style={{padding: 20}}>
              {!userProfile?.family_id ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Join a Family</Text>
                  <Text style={{marginBottom: 20, color: '#A3A3A3'}}>You are not in a family yet. Create one or wait for an invite.</Text>
                  <TouchableOpacity style={styles.button} onPress={async () => {
                    const baseUrl = getBaseUrl();
                    try {
                      await axios.post(`${baseUrl}/api/family/create`, {}, getAuthHeaders());
                      fetchProfile();
                    } catch(e) {}
                  }}>
                    <Text style={{color: '#fff'}}>Create New Family</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={[styles.row, {justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}]}>
                    <Text style={styles.sectionTitle}>Family Members</Text>
                    <TouchableOpacity onPress={pickImage} style={{backgroundColor: '#1E1B4B', padding: 8, borderRadius: 10}}>
                      <MaterialIcons name="add-a-photo" size={24} color="#C084FC" />
                    </TouchableOpacity>
                  </View>
                  {familyMembers.map((m, i) => (
                    <View key={i} style={styles.memberRow}>
                       <MaterialIcons name="person" size={24} color="#C084FC" />
                       <View style={{marginLeft: 12, flex: 1}}>
                         <Text style={{fontWeight: 'bold', color: '#FFFFFF'}}>{m.username}</Text>
                         <Text style={{fontSize: 12, color: '#A3A3A3'}}>{m.role}</Text>
                       </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {view === 'notifications' && (
            <View style={{padding: 20}}>
              <Text style={styles.sectionTitle}>Invitations</Text>
              {pendingInvitations.length === 0 ? (
                <Text style={{textAlign: 'center', marginTop: 40, color: '#A3A3A3'}}>No new invitations.</Text>
              ) : (
                pendingInvitations.map((inv, i) => (
                  <View key={i} style={styles.card}>
                    <Text style={{fontWeight: 'bold', color: '#FFFFFF'}}>Family Invite</Text>
                    <Text style={{marginVertical: 8, color: '#A3A3A3'}}>You have been invited to join a family.</Text>
                    <View style={styles.row}>
                      <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#10B981'}]} onPress={async () => {
                        const baseUrl = getBaseUrl();
                        await axios.post(`${baseUrl}/api/family/accept/${inv.id}`, {}, getAuthHeaders());
                        fetchNotifications();
                        fetchProfile();
                      }}>
                        <Text style={{color: '#fff'}}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#EF4444'}]} onPress={async () => {
                        const baseUrl = getBaseUrl();
                        await axios.post(`${baseUrl}/api/family/decline/${inv.id}`, {}, getAuthHeaders());
                        fetchNotifications();
                      }}>
                        <Text style={{color: '#fff'}}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>

        {renderNavBar()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 36, fontWeight: 'bold', marginBottom: 10, color: '#FFFFFF', textAlign: 'center' },
  input: { width: '100%', padding: 16, backgroundColor: '#171717', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#404040', fontSize: 16, color: '#FFFFFF' },
  button: { padding: 16, borderRadius: 12, backgroundColor: '#9333EA', alignItems: 'center', width: '100%', marginVertical: 10, borderWidth: 1, borderColor: '#7E22CE' },
  header: { padding: 20, paddingTop: 40, backgroundColor: '#000000', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#262626' },
  welcome: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', letterSpacing: 0.5 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: '#FFFFFF' },
  userRow: { padding: 16, borderRadius: 16, backgroundColor: '#171717', marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#262626' },
  callBtn: { padding: 12, borderRadius: 12, marginLeft: 10 },
  callContainer: { flex: 1, backgroundColor: '#000000' },
  fullScreenVideo: { flex: 1, backgroundColor: '#000000' },
  navBar: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, backgroundColor: '#0A0A0A', borderTopWidth: 1, borderTopColor: '#262626' },
  navItem: { alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 10, marginTop: 4, color: '#A3A3A3' },
  navTextActive: { color: '#C084FC', fontWeight: 'bold' },
  badgeDot: { position: 'absolute', right: -2, top: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  profileHeader: { alignItems: 'center', marginBottom: 30 },
  avatarLarge: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#9333EA', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  avatarText: { color: '#FFFFFF', fontSize: 40, fontWeight: 'bold' },
  profileName: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  card: { padding: 20, backgroundColor: '#171717', borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#262626' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#FFFFFF' },
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, color: '#A3A3A3', marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#404040', alignItems: 'center', backgroundColor: '#0A0A0A' },
  typeBtnActive: { backgroundColor: '#9333EA', borderColor: '#7E22CE' },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#171717', borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#262626' },
  actionBtn: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  roundButton: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginHorizontal: 20 },
});
