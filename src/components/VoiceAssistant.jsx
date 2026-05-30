import { useState, useEffect } from 'react';
import { X, Key, UploadCloud, FileAudio, AlertTriangle, Sparkles, Check, Loader2, Volume2, ArrowRight, Mic, Square, Play, Trash2, Save, User, FileUp } from 'lucide-react';
import { db, storage } from '../firebase';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { renderMarkdown } from '../utils/markdown';

export default function VoiceAssistant({ isOpen, onClose, onApplyNotes, isDemoMode, bookId, books = [], onApplyNotesToBook }) {
  const [apiKey, setApiKey] = useState(() => {
    return import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY || localStorage.getItem('flamingo_gemini_api_key') || '';
  });
  const [saveKey, setSaveKey] = useState(true);
  const [showKeyInput, setShowKeyInput] = useState(() => {
    return !(import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY || localStorage.getItem('flamingo_gemini_api_key'));
  });
  
  // File state
  const [audioFile, setAudioFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  
  // Processing states
  const [status, setStatus] = useState('idle'); // idle, reading, uploading, analyzing, success, error
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Results
  const [analysisResult, setAnalysisResult] = useState(null);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState(null);
  const [expectedSpeakers, setExpectedSpeakers] = useState('auto');
  const [targetBookId, setTargetBookId] = useState('');

  // Raw API Recovery states
  const [rawResponse, setRawResponse] = useState('');
  const [editableRawResponse, setEditableRawResponse] = useState('');
  const [showRawEditor, setShowRawEditor] = useState(false);

  // Speaker mapping states
  const [diarizedTranscript, setDiarizedTranscript] = useState('');
  const [detectedSpeakers, setDetectedSpeakers] = useState([]);
  const [speakerSnippets, setSpeakerSnippets] = useState({});
  const [speakerMapping, setSpeakerMapping] = useState({});

  // Tab view states
  const [activeTab, setActiveTab] = useState('new'); // new, history, members
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState('');
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Speaker registry states
  const [registry, setRegistry] = useState([]);
  const [loadingRegistry, setLoadingRegistry] = useState(false);
  const [savingSpeakerId, setSavingSpeakerId] = useState(null);

  // MediaRecorder states
  const [recordingSpeakerId, setRecordingSpeakerId] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordCountdown, setRecordCountdown] = useState(10);
  const [recordIntervalId, setRecordIntervalId] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);

  // Fetch History
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      if (!isDemoMode) {
        const transcriptionsRef = collection(db, 'transcriptions');
        const q = query(transcriptionsRef, orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const list = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setHistory(list);
      } else {
        const list = JSON.parse(localStorage.getItem('flamingo_transcription_history') || '[]');
        setHistory(list);
      }
    } catch (err) {
      console.error("Error al cargar el historial:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Fetch/Seed Speakers Registry
  const fetchRegistry = async () => {
    setLoadingRegistry(true);
    try {
      let list = [];
      if (!isDemoMode) {
        const querySnapshot = await getDocs(collection(db, 'speakers_registry'));
        list = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } else {
        list = JSON.parse(localStorage.getItem('flamingo_speakers_registry') || '[]');
      }

      // Seed defaults if empty
      if (list.length === 0) {
        const defaults = [
          { id: 'miembro_1', name: 'Jaime', persona: 'Analista de contexto histórico y político', audioUrl: '', audioBase64: '' },
          { id: 'miembro_2', name: 'Almu', persona: 'Lectora emocional, centrada en la psicología de personajes', audioUrl: '', audioBase64: '' },
          { id: 'miembro_3', name: 'Alejandro', persona: 'Crítico literario, enfocado en estructura y ritmo narrativo', audioUrl: '', audioBase64: '' },
          { id: 'miembro_4', name: 'Joaquin', persona: 'Lector escéptica, atento a giros de guión e inconsistencias', audioUrl: '', audioBase64: '' },
          { id: 'miembro_5', name: 'Zepe', persona: 'Bibliófilo apasionado de la metaliteratura y el libro físico', audioUrl: '', audioBase64: '' }
        ];

        if (!isDemoMode) {
          for (const item of defaults) {
            await setDoc(doc(db, 'speakers_registry', item.id), item);
          }
        } else {
          localStorage.setItem('flamingo_speakers_registry', JSON.stringify(defaults));
        }
        list = defaults;
      } else {
        // Auto-migrate old names if they exist in DB/localStorage
        const oldToNew = {
          'Juan': 'Jaime',
          'Sofía': 'Almu',
          'Carlos': 'Alejandro',
          'Elena': 'Joaquin',
          'Diego': 'Zepe'
        };
        let migrated = false;
        list = list.map(item => {
          if (oldToNew[item.name]) {
            item.name = oldToNew[item.name];
            migrated = true;
            if (!isDemoMode) {
              setDoc(doc(db, 'speakers_registry', item.id), item).catch(err => console.error(err));
            }
          }
          return item;
        });
        if (migrated && isDemoMode) {
          localStorage.setItem('flamingo_speakers_registry', JSON.stringify(list));
        }
      }

      list.sort((a, b) => a.id.localeCompare(b.id));
      setRegistry(list);
    } catch (err) {
      console.error("Error al cargar el registro de miembros:", err);
    } finally {
      setLoadingRegistry(false);
    }
  };

  // Update a single speaker metadata in the registry
  const handleUpdateSpeakerMeta = (index, field, value) => {
    setRegistry(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Save speaker profile
  const handleSaveSpeakerProfile = async (index) => {
    const speaker = registry[index];
    setSavingSpeakerId(speaker.id);
    try {
      if (!isDemoMode) {
        await setDoc(doc(db, 'speakers_registry', speaker.id), {
          name: speaker.name,
          persona: speaker.persona,
          audioUrl: speaker.audioUrl || '',
          audioBase64: speaker.audioBase64 || ''
        });
      } else {
        const listCopy = [...registry];
        localStorage.setItem('flamingo_speakers_registry', JSON.stringify(listCopy));
      }
      alert(`Perfil de ${speaker.name} guardado con éxito.`);
    } catch (err) {
      console.error("Error al guardar perfil de miembro:", err);
      alert("Error al guardar: " + err.message);
    } finally {
      setSavingSpeakerId(null);
    }
  };

  // MediaRecorder handlers for Voice Signatures
  const startRecordingVoice = async (speakerId) => {
    if (isRecording) return;
    
    setAudioChunks([]);
    setRecordingSpeakerId(speakerId);
    setRecordCountdown(10);
    setIsRecording(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        // Save
        await handleSaveVoiceprint(speakerId, audioBlob);
      };

      recorder.start();
      setMediaRecorder(recorder);

      // Countdown
      const intervalId = setInterval(() => {
        setRecordCountdown(prev => {
          if (prev <= 1) {
            clearInterval(intervalId);
            if (recorder && recorder.state !== 'inactive') {
              recorder.stop();
            }
            setIsRecording(false);
            setRecordingSpeakerId(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      setRecordIntervalId(intervalId);
    } catch (err) {
      console.error("Error al acceder al micrófono:", err);
      alert("No se pudo acceder al micrófono. Verifica los permisos de tu navegador.");
      setIsRecording(false);
      setRecordingSpeakerId(null);
    }
  };

  const stopRecordingVoice = () => {
    if (!isRecording) return;
    setIsRecording(false);
    if (recordIntervalId) {
      clearInterval(recordIntervalId);
      setRecordIntervalId(null);
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    setRecordingSpeakerId(null);
  };

  const handleUploadVoiceprintFile = async (speakerId, e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const fileNameLower = file.name.toLowerCase();
      const isAudioType = file.type && file.type.startsWith('audio/');
      const hasAudioExt = 
        fileNameLower.endsWith('.mp3') || 
        fileNameLower.endsWith('.wav') || 
        fileNameLower.endsWith('.m4a') || 
        fileNameLower.endsWith('.ogg') ||
        fileNameLower.endsWith('.webm');

      if (!isAudioType && !hasAudioExt) {
        alert("Por favor, selecciona un archivo de audio válido (.mp3, .wav, .m4a, .ogg o .webm).");
        return;
      }
      
      await handleSaveVoiceprint(speakerId, file);
    }
    e.target.value = '';
  };

  const handleSaveVoiceprint = async (speakerId, blob) => {
    setSavingSpeakerId(speakerId);
    try {
      let audioUrl = '';
      let audioBase64 = '';

      // Convert blob to Base64
      const reader = new FileReader();
      const base64Promise = new Promise((resolve) => {
        reader.onloadend = () => {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
      });
      reader.readAsDataURL(blob);
      audioBase64 = await base64Promise;

      if (!isDemoMode) {
        // Upload to Storage
        const storageRef = ref(storage, `voiceprints/${Date.now()}_${speakerId}.webm`);
        const uploadTask = uploadBytesResumable(storageRef, blob);
        await new Promise((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            null,
            (err) => reject(err),
            async () => {
              audioUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve();
            }
          );
        });
      } else {
        audioUrl = URL.createObjectURL(blob);
      }

      // Update local state
      setRegistry(prev => {
        const index = prev.findIndex(s => s.id === speakerId);
        if (index === -1) return prev;
        const copy = [...prev];
        copy[index] = { 
          ...copy[index], 
          audioUrl: audioUrl,
          audioBase64: audioBase64
        };
        
        if (!isDemoMode) {
          setDoc(doc(db, 'speakers_registry', speakerId), copy[index]).catch(e => console.error(e));
        } else {
          localStorage.setItem('flamingo_speakers_registry', JSON.stringify(copy));
        }
        return copy;
      });

      alert("Firma de voz registrada con éxito.");
    } catch (err) {
      console.error("Error al guardar firma de voz:", err);
      alert("Error al registrar firma de voz: " + err.message);
    } finally {
      setSavingSpeakerId(null);
    }
  };

  const handleDeleteVoiceprint = async (speakerId) => {
    if (!window.confirm("¿Estás seguro de que deseas borrar la firma de voz registrada de este miembro?")) return;
    
    setRegistry(prev => {
      const index = prev.findIndex(s => s.id === speakerId);
      if (index === -1) return prev;
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        audioUrl: '',
        audioBase64: ''
      };
      if (!isDemoMode) {
        setDoc(doc(db, 'speakers_registry', speakerId), copy[index]).catch(e => console.error(e));
      } else {
        localStorage.setItem('flamingo_speakers_registry', JSON.stringify(copy));
      }
      return copy;
    });
  };

  // Load history and speaker registry when modal opens or tab changes
  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      fetchRegistry();
    }
  }, [isOpen, activeTab, isDemoMode]);

  if (!isOpen) return null;

  // Key handlers
  const handleKeySave = (e) => {
    e.preventDefault();
    if (saveKey) {
      localStorage.setItem('flamingo_gemini_api_key', apiKey.trim());
    } else {
      localStorage.removeItem('flamingo_gemini_api_key');
    }
    setShowKeyInput(false);
  };

  const clearSavedKey = () => {
    localStorage.removeItem('flamingo_gemini_api_key');
    setApiKey('');
    setShowKeyInput(true);
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
    e.target.value = ''; // Reset value to allow re-uploading the same file
  };

  const getGeminiMimeType = (file) => {
    const ext = file.name.toLowerCase().split('.').pop();
    switch (ext) {
      case 'mp3':
        return 'audio/mp3';
      case 'wav':
        return 'audio/wav';
      case 'm4a':
        return 'audio/m4a';
      case 'ogg':
        return 'audio/ogg';
      default:
        return file.type || 'audio/mp3';
    }
  };

  const validateAndSetFile = (file) => {
    console.log("Selected file:", file.name, "type:", file.type, "size:", file.size);
    setErrorMsg('');
    const fileNameLower = file.name.toLowerCase();
    const isAudioType = file.type && file.type.startsWith('audio/');
    const hasAudioExt = 
      fileNameLower.endsWith('.mp3') || 
      fileNameLower.endsWith('.wav') || 
      fileNameLower.endsWith('.m4a') || 
      fileNameLower.endsWith('.ogg');

    if (!isAudioType && !hasAudioExt) {
      console.warn("Rejected file selection (unsupported extension/mime):", file.name, file.type);
      setErrorMsg('Por favor, sube un archivo de audio válido (.mp3, .wav, .m4a o .ogg).');
      return;
    }
    setAudioFile(file);
  };

  // Convert file to Base64 helper
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Helper to save transcription
  const saveTranscription = async (parsedResult, audioUrl, finalTranscript) => {
    const transcriptionData = {
      bookId: bookId || 'new_book',
      audioName: audioFile ? audioFile.name : 'audio_grabacion.mp3',
      audioUrl: audioUrl || '',
      generalSummary: parsedResult.generalSummary || '',
      transcript: finalTranscript || '',
      attendees: parsedResult.speakers || [],
      result: parsedResult, // Keep result field for backward compatibility
      createdAt: new Date().toISOString()
    };

    try {
      if (!isDemoMode) {
        await addDoc(collection(db, 'transcriptions'), transcriptionData);
      } else {
        const currentHistory = JSON.parse(localStorage.getItem('flamingo_transcription_history') || '[]');
        currentHistory.unshift(transcriptionData);
        localStorage.setItem('flamingo_transcription_history', JSON.stringify(currentHistory));
      }
      fetchHistory(); // Refresh history
    } catch (err) {
      console.error("Error al guardar la transcripción en el historial:", err);
    }
  };

  // Run the analysis using Gemini 2.5 Flash
  const handleAnalyzeAudio = async () => {
    if (!apiKey.trim()) {
      setErrorMsg('Por favor, ingresa una clave API de Gemini válida para continuar.');
      setShowKeyInput(true);
      return;
    }
    if (!audioFile) {
      setErrorMsg('Por favor, sube una grabación de audio primero.');
      return;
    }

    setStatus('reading');
    setProgressMsg('Leyendo y preparando el archivo de audio...');
    setErrorMsg('');
    setRawResponse('');
    setEditableRawResponse('');
    setShowRawEditor(false);
    setUploadedAudioUrl('');

    try {
      // 1. Upload audio file to storage if not in demo mode
      let audioUrl = '';
      if (!isDemoMode) {
        setStatus('uploading');
        setProgressMsg('Subiendo archivo de audio a Firebase Storage...');
        try {
          const storageRef = ref(storage, `recordings/${Date.now()}_${audioFile.name}`);
          const uploadTask = uploadBytesResumable(storageRef, audioFile);

          await new Promise((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              (snapshot) => {
                const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                setProgressMsg(`Subiendo audio... ${progress}%`);
              },
              (error) => {
                console.error("Audio upload error:", error);
                reject(error);
              },
              async () => {
                try {
                  audioUrl = await getDownloadURL(uploadTask.snapshot.ref);
                  resolve();
                } catch (err) {
                  reject(err);
                }
              }
            );
          });
        } catch (storageError) {
          console.warn("Storage upload failed, falling back to local Object URL:", storageError);
          audioUrl = URL.createObjectURL(audioFile);
          setProgressMsg('La subida a Storage falló (reglas de seguridad/conexión). Continuando transcripción con archivo local...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } else {
        audioUrl = URL.createObjectURL(audioFile);
      }

      setUploadedAudioUrl(audioUrl);

      // Helper to fetch base64 from URL
      const fetchBase64FromUrl = async (url) => {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
          };
          reader.onerror = reject;
        });
      };

      // 1.5. GCP Speech-to-Text Diarization (Strict mode in production, Gemini only in demo mode)
      let gcpDiarizedTranscript = "";
      let useGcpSst = false;

      if (!isDemoMode) {
        try {
          setStatus('analyzing');
          setProgressMsg('Iniciando transcripción con GCP Speech-to-Text API (Diarization)...');
          
          // Determine audio encoding from file extension
          const fileExt = audioFile.name.toLowerCase().split('.').pop();
          let encoding = 'ENCODING_UNSPECIFIED';
          let sampleRateHertz = undefined; // let API auto-detect when possible
          switch (fileExt) {
            case 'mp3':
              encoding = 'MP3';
              break;
            case 'flac':
              encoding = 'FLAC';
              break;
            case 'ogg':
              encoding = 'OGG_OPUS';
              break;
            case 'wav':
              encoding = 'LINEAR16';
              break;
            case 'm4a':
              // m4a (AAC) is not directly supported by STT v1, 
              // but we'll try MP3 encoding as closest match
              encoding = 'MP3';
              break;
            default:
              encoding = 'MP3'; // reasonable default for most audio files
          }

          // Construct GCS URI from the Firebase Storage download URL
          const bucketName = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "project-flamingo-497112.firebasestorage.app";
          let filePath = "";
          let useGcsUri = false;
          
          try {
            const urlObj = new URL(audioUrl);
            // Handle old format: https://firebasestorage.googleapis.com/v0/b/BUCKET/o/PATH?...
            if (urlObj.hostname === 'firebasestorage.googleapis.com') {
              const pathParts = urlObj.pathname.split('/o/');
              if (pathParts.length > 1) {
                filePath = decodeURIComponent(pathParts[1].split('?')[0]);
                useGcsUri = true;
              }
            }
            // Handle new format: https://BUCKET/v0/b/BUCKET/o/PATH or similar
            else if (urlObj.hostname.includes('firebasestorage') || urlObj.hostname.includes(bucketName)) {
              const pathParts = urlObj.pathname.split('/o/');
              if (pathParts.length > 1) {
                filePath = decodeURIComponent(pathParts[1].split('?')[0]);
                useGcsUri = true;
              }
            }
          } catch (e) {
            console.warn("Failed to parse file path from URL:", e);
          }

          // Get GCP API key specifically for Speech-to-Text, falling back to Firebase API key
          const gcpApiKey = import.meta.env.VITE_GCP_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY || "";

          // Determine min and max speaker counts based on user selection
          let minSpeakerCount = 2;
          let maxSpeakerCount = 6;
          if (expectedSpeakers !== 'auto') {
            const count = parseInt(expectedSpeakers, 10);
            if (count === 6) {
              minSpeakerCount = 6;
              maxSpeakerCount = 12;
            } else if (count >= 1 && count <= 5) {
              minSpeakerCount = count;
              maxSpeakerCount = count;
            }
          }
          console.log(`Setting diarization config: minSpeakerCount=${minSpeakerCount}, maxSpeakerCount=${maxSpeakerCount}, encoding=${encoding}, model=latest_long`);

          // Build the audio source — prefer GCS URI, fallback to inline base64 content
          let audioSource;
          if (useGcsUri && filePath) {
            const gcsUri = `gs://${bucketName}/${filePath}`;
            console.log("Speech-to-Text using GCS URI:", gcsUri);
            audioSource = { uri: gcsUri };
          } else {
            // Fallback: send audio as inline base64 content
            console.log("Speech-to-Text using inline base64 content (no valid GCS URI)");
            setProgressMsg('Codificando audio para envío directo a GCP STT...');
            const base64Audio = await fileToBase64(audioFile);
            audioSource = { content: base64Audio };
          }

          // Build config
          const sttConfig = {
            encoding: encoding,
            languageCode: "es-ES",
            enableAutomaticPunctuation: true,
            model: "latest_long",
            useEnhanced: true,
            diarizationConfig: {
              enableSpeakerDiarization: true,
              minSpeakerCount: minSpeakerCount,
              maxSpeakerCount: maxSpeakerCount
            }
          };

          // Only include sampleRateHertz if explicitly set (WAV files)
          if (sampleRateHertz) {
            sttConfig.sampleRateHertz = sampleRateHertz;
          }

          console.log("STT Request config:", JSON.stringify(sttConfig, null, 2));

          // Call Speech-to-Text API longrunningrecognize
          const sttRes = await fetch(
            `https://speech.googleapis.com/v1/speech:longrunningrecognize?key=${gcpApiKey.trim()}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                config: sttConfig,
                audio: audioSource
              })
            }
          );

          if (!sttRes.ok) {
            const sttErr = await sttRes.json().catch(() => ({}));
            throw new Error(sttErr?.error?.message || `GCP STT status ${sttRes.status}`);
          }

          const sttOp = await sttRes.json();
          const operationName = sttOp.name;
          console.log("GCP STT Operation started:", operationName);

          // Poll operation
          let done = false;
          let responseData = null;
          const pollInterval = 5000;
          const maxAttempts = 60; // 5 mins
          let attempts = 0;

          while (!done && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            attempts++;
            setProgressMsg(`Transcribiendo en GCP STT... (${attempts * pollInterval / 1000}s)`);

            const opRes = await fetch(`https://speech.googleapis.com/v1/${operationName}?key=${gcpApiKey.trim()}`);
            if (!opRes.ok) {
              throw new Error(`Error al verificar operación STT (${opRes.status})`);
            }
            responseData = await opRes.json();
            if (responseData.done) {
              done = true;
            }
          }

          if (!done) {
            throw new Error("La operación de transcripción de GCP STT expiró.");
          }

          if (responseData.error) {
            throw new Error(`Error en GCP STT: ${responseData.error.message}`);
          }

          // Parse words and reconstruct transcript
          const results = responseData.response?.results || [];
          const words = [];
          if (results.length > 0) {
            // In GCP STT v1 with diarization, the last result's last alternative contains all words with speaker tags
            const lastResult = results[results.length - 1];
            const lastAlt = lastResult.alternatives?.[lastResult.alternatives.length - 1] || lastResult.alternatives?.[0];
            if (lastAlt && lastAlt.words && lastAlt.words.length > 0) {
              console.log("Extracting speaker-diarized words from the last alternative of the last result");
              words.push(...lastAlt.words);
            } else {
              // Fallback: concatenate words from all results if the last result does not have words
              console.log("Last alternative did not contain words, falling back to concatenating all results");
              results.forEach(r => {
                const alt = r.alternatives?.[0];
                if (alt && alt.words) {
                  words.push(...alt.words);
                }
              });
            }
          }

          if (words.length > 0) {
            let currentSpeaker = null;
            let currentLine = "";
            const dialogLines = [];

            words.forEach(w => {
              const speaker = w.speakerTag;
              const word = w.word;
              
              if (currentSpeaker === null) {
                currentSpeaker = speaker;
                currentLine = word;
              } else if (currentSpeaker === speaker) {
                currentLine += " " + word;
              } else {
                dialogLines.push(`[Speaker ${currentSpeaker}]: ${currentLine}`);
                currentSpeaker = speaker;
                currentLine = word;
              }
            });

            if (currentSpeaker !== null) {
              dialogLines.push(`[Speaker ${currentSpeaker}]: ${currentLine}`);
            }

            gcpDiarizedTranscript = dialogLines.join('\n');
            useGcpSst = true;
            console.log("Reconstructed GCP Diarized Transcript:", gcpDiarizedTranscript);
          } else {
            throw new Error("GCP STT se completó pero no devolvió ninguna palabra.");
          }
        } catch (sttError) {
          console.error("GCP Speech-to-Text failed:", sttError);
          throw new Error(`Error en transcripción GCP Speech-to-Text: ${sttError.message}`);
        }
      }

      if (isDemoMode && !useGcpSst) {
        setProgressMsg('Generando transcripción provisional con Gemini 2.5 Flash...');
        const base64Data = await fileToBase64(audioFile);
        const mainAudioPart = {
          inlineData: {
            mimeType: getGeminiMimeType(audioFile),
            data: base64Data
          }
        };

        const expectedSpeakersText = expectedSpeakers === 'auto' 
          ? 'un número indeterminado de' 
          : expectedSpeakers === '6' 
            ? '6 o más' 
            : expectedSpeakers;

        const transcribePrompt = `
Eres un transcriptor experto. Transcribe el siguiente archivo de audio de una reunión de club de lectura en español.
Realiza la diarización acústica para separar las intervenciones de los diferentes hablantes. En esta grabación participan exactamente ${expectedSpeakersText} miembros/voces.
Escribe la transcripción completa de forma cronológica, etiquetando a cada hablante de forma secuencial como "[Speaker 1]", "[Speaker 2]", "[Speaker 3]", etc., según vayan apareciendo en el audio.
No intentes adivinar sus nombres reales. Limítate a transcribir exactamente lo que dicen y a separarlos por etiquetas de altavoz "[Speaker X]".
Devuelve únicamente el texto de la transcripción, sin ningún formato adicional.
`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [mainAudioPart, { text: transcribePrompt }]
                }
              ]
            })
          }
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Error de Gemini (${response.status})`);
        }

        const data = await response.json();
        gcpDiarizedTranscript = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!gcpDiarizedTranscript.trim()) {
          throw new Error("Gemini devolvió una transcripción vacía.");
        }
        console.log("Gemini Diarized Transcript Fallback:", gcpDiarizedTranscript);
      }

      // 2. Parse speaker tags and create snippets
      const lines = gcpDiarizedTranscript.split('\n');
      const speakersSet = new Set();
      lines.forEach(line => {
        const match = line.match(/^\[Speaker\s+(\d+)\]/i);
        if (match) {
          speakersSet.add(`Speaker ${match[1]}`);
        }
      });

      const detected = Array.from(speakersSet).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
      });

      if (detected.length === 0) {
        detected.push('Speaker 1');
      }

      // Extract snippets
      const snippets = {};
      lines.forEach(line => {
        const match = line.match(/^\[Speaker\s+(\d+)\]:\s*(.*)/i);
        if (match) {
          const spId = `Speaker ${match[1]}`;
          const text = match[2].trim();
          if (!snippets[spId] && text.length > 0) {
            snippets[spId] = text.length > 80 ? text.substring(0, 80) + '...' : text;
          }
        }
      });

      // Ensure every detected speaker has a snippet fallback
      detected.forEach(sp => {
        if (!snippets[sp]) {
          const lineWithSp = lines.find(l => l.includes(`[${sp}]`));
          snippets[sp] = lineWithSp ? lineWithSp.substring(0, 100) : "Intervención de audio.";
        }
      });

      setDiarizedTranscript(gcpDiarizedTranscript);
      setDetectedSpeakers(detected);
      setSpeakerSnippets(snippets);

      // Initialize mapping to empty select values
      const initialMapping = {};
      detected.forEach(sp => {
        initialMapping[sp] = '';
      });
      setSpeakerMapping(initialMapping);
      setStatus('mapping');

    } catch (err) {
      console.error('Audio processing error:', err);
      let msg = err.message || 'Ocurrió un error al procesar el audio.';
      if (msg.includes('blocked') || msg.includes('GenerativeService') || msg.includes('API key')) {
        msg = `La clave API está bloqueada o restringida: ${msg}. Por favor, ve a Google Cloud Console -> 'APIs y servicios' -> 'Credenciales', edita tu clave API y comprueba que no tenga restricciones que bloqueen 'Generative Language API'.`;
      }
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  // Stage 2: Confirm Mapping and Call Gemini for detailed Analysis
  const handleConfirmMapping = async () => {
    setStatus('analyzing');
    setProgressMsg('Sustituyendo nombres y enviando transcripción a Gemini para análisis final...');
    setErrorMsg('');

    try {
      // 1. Replace provisional speaker tags in the transcript with mapped names
      let mappedTranscript = diarizedTranscript;
      
      // Sort in descending order of speaker number to avoid replacing Speaker 10 before Speaker 1
      const sortedSpeakers = [...detectedSpeakers].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numB - numA;
      });

      sortedSpeakers.forEach(sp => {
        const mappedName = speakerMapping[sp] || 'Invitado';
        const num = sp.replace(/\D/g, '');
        const regex = new RegExp(`\\[Speaker\\s*${num}\\]`, 'gi');
        mappedTranscript = mappedTranscript.replace(regex, `[${mappedName}]`);
      });

      // Check if we should use demo fallback or if api key is missing
      if (isDemoMode || !apiKey.trim()) {
        await new Promise(resolve => setTimeout(resolve, 1500)); // simulate delay
        
        // Generate mock parsedResult matching the structure
        const mockSpeakers = detectedSpeakers.map(sp => {
          const mappedName = speakerMapping[sp] || 'Invitado';
          const snippet = speakerSnippets[sp] || "Intervención de la sesión del club.";
          return {
            id: mappedName,
            voiceSnippet: snippet,
            summary: `Yo opiné que la discusión fue muy fructífera. Considero que el libro aporta una perspectiva fundamental sobre los temas tratados y que cada miembro pudo dar su punto de vista libremente.`,
            notesMarkdown: `# Notas preliminares de ${mappedName}
## Mis Impresiones y Pensamientos Clave (en primera persona)
- Considero que este libro es excelente. Me gustó especialmente el desarrollo de los personajes principales y la atmósfera creada.
- Desde mi perspectiva, la narrativa fluye muy bien y engancha al lector desde las primeras páginas.
## Debates y Puntos de Vista con otros miembros
- Hablamos con los demás sobre la relevancia histórica y el estilo literario. Hubo opiniones diversas, pero coincidimos en que la obra no deja indiferente a nadie.
## Ideas y Estructura para mi Reseña Final
- Pienso enfocar mi reseña en la evolución del protagonista y el simbolismo de los escenarios.
- Organizaré el texto en tres secciones principales: Introducción a la temática, Análisis estilístico y Conclusiones personales.`
          };
        });

        const parsedResult = {
          generalSummary: `Simulación de discusión grupal. Los participantes debatieron ampliamente sobre el libro del club de lectura, analizando sus temáticas clave, el desarrollo estilístico y compartiendo sus perspectivas individuales.`,
          speakers: mockSpeakers
        };

        setAnalysisResult(parsedResult);
        setStatus('success');
        setSelectedSpeakerId(parsedResult.speakers[0]?.id || null);

        // Save session to database/localStorage
        await saveTranscription(parsedResult, uploadedAudioUrl, mappedTranscript);
        return;
      }

      // 2. Request analysis from Gemini 2.5 Flash using text transcript
      const finalPrompt = `
Eres un secretario experto y analista de clubes de lectura.
A continuación se presenta la transcripción completa de la discusión de un club de lectura, donde los diálogos ya están atribuidos a los miembros del club por sus nombres reales.

Transcripción de la Sesión:
"""
${mappedTranscript}
"""

Instrucciones de análisis:
1. Lee detenidamente la transcripción y extrae los temas clave discutidos, los acuerdos y desacuerdos principales.
2. Para cada miembro del club de lectura que participó en la sesión (los nombres indicados en la transcripción, tales como Jaime, Almu, Alejandro, Joaquin, Zepe):
   - Genera un resumen de 2 o 3 frases de sus opiniones y contribuciones principales, redactado estrictamente en primera persona singular (ej. "Yo opiné que...", "Pienso que...").
   - Genera un documento en Markdown detallado y extenso (mínimo 250-400 palabras) que sirva como sus Notas Preliminares Privadas personales. Debe capturar toda su perspectiva como hablante, pensamientos íntimos, aportaciones clave de debate y argumentos. Organizado estrictamente con el siguiente esquema:
     # Notas preliminares de [Nombre]
     ## Mis Impresiones y Pensamientos Clave (en primera persona)
     - Detallar lo que yo pensé o sentí durante la lectura y qué partes me impactaron más.
     ## Debates y Puntos de Vista con otros miembros
     - Registrar qué puntos de vista defendieron otros hablantes y en qué estuve de acuerdo o en desacuerdo, detallando la discusión.
     ## Ideas y Estructura para mi Reseña Final
     - Mis conclusiones principales y cómo planeo estructurar mis argumentos para la reseña final.
3. Si hay algún "Invitado", genera lo mismo para él.

Debes devolver tu respuesta estrictamente en formato JSON con la siguiente estructura exacta:
{
  "generalSummary": "Un resumen general de la sesión, los temas discutidos, conclusiones y dinámica del grupo.",
  "speakers": [
    {
      "id": "Nombre del Miembro" (ej. "Jaime", "Almu", etc.),
      "voiceSnippet": "Una cita directa representativa de este hablante de la transcripción.",
      "summary": "Resumen en primera persona singular...",
      "notesMarkdown": "Documento Markdown en primera persona singular..."
    }
  ]
}

Asegúrate de que 'notesMarkdown' sea texto Markdown válido y correctamente escapado dentro del JSON. Todo el contenido generado DEBE estar en español. No incluyes ningún envoltorio de markdown como \`\`\`json. Devuelve únicamente el JSON crudo.
`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: finalPrompt }]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Error de Gemini (${response.status})`);
      }

      const data = await response.json();
      const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        throw new Error('Se recibió una respuesta vacía de Gemini.');
      }

      // Save raw response immediately
      setRawResponse(textResponse);
      setEditableRawResponse(textResponse);

      // Parse JSON
      const parsedResult = parseGeminiResponse(textResponse);
      if (!parsedResult?.speakers || parsedResult.speakers.length === 0) {
        throw new Error('No se pudo extraer la estructura de hablantes de la respuesta de la API.');
      }

      if (!parsedResult.generalSummary) {
        parsedResult.generalSummary = "Discusión general de la sesión del club de lectura sobre el libro seleccionado.";
      }

      setAnalysisResult(parsedResult);
      setStatus('success');
      setSelectedSpeakerId(parsedResult.speakers[0]?.id || null);

      // Save session to database/localStorage
      await saveTranscription(parsedResult, uploadedAudioUrl, mappedTranscript);
    } catch (err) {
      console.error('Final analysis processing error:', err);
      let msg = err.message || 'Ocurrió un error al generar el análisis final de la sesión.';
      if (msg.includes('blocked') || msg.includes('GenerativeService') || msg.includes('API key')) {
        msg = `La clave API está bloqueada o restringida: ${msg}. Por favor, ve a Google Cloud Console -> 'APIs y servicios' -> 'Credenciales', edita tu clave API y comprueba que no tenga restricciones que bloqueen 'Generative Language API'.`;
      }
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  const handleSimulate5Speakers = () => {
    const s1 = registry[0]?.name || "Jaime";
    const s2 = registry[1]?.name || "Almu";
    const s3 = registry[2]?.name || "Alejandro";
    const s4 = registry[3]?.name || "Joaquin";
    const s5 = registry[4]?.name || "Zepe";

    const mockTranscript = `[Speaker 1]: Hola a todos, hoy vamos a debatir sobre el libro de Zafón "La sombra del viento". A mí me pareció una obra maestra. ¿Qué opinas tú, Almu?
[Speaker 2]: Hola! A mí lo que realmente me llegó al corazón fue la lealtad inquebrantable de Fermín. Sus diálogos traen luz al relato más oscuro. ¿Y tú, Alejandro?
[Speaker 3]: Buenas! No podemos obviar el contexto de la Barcelona de 1945. El miedo en las calles y la censura configuran la timidez de los personajes.
[Speaker 4]: El libro me entretuvo muchísimo, pero encontré algunos giros de guión bastante forzados y personajes femeninos poco desarrollados.
[Speaker 5]: Para mí, el libro es ante todo un homenaje al objeto físico del libro y al noble oficio de los libreros y encuadernadores.`;

    setDiarizedTranscript(mockTranscript);
    setDetectedSpeakers(['Speaker 1', 'Speaker 2', 'Speaker 3', 'Speaker 4', 'Speaker 5']);
    setSpeakerSnippets({
      'Speaker 1': 'Hola a todos, hoy vamos a debatir sobre el libro de Zafón "La sombra del viento"...',
      'Speaker 2': 'Hola! A mí lo que realmente me llegó al corazón fue la lealtad inquebrantable...',
      'Speaker 3': 'Buenas! No podemos obviar el contexto de la Barcelona de 1945...',
      'Speaker 4': 'El libro me entretuvo muchísimo, pero encontré algunos giros de guión...',
      'Speaker 5': 'Para mí, el libro es ante todo un homenaje al objeto físico del libro...'
    });
    setSpeakerMapping({
      'Speaker 1': '',
      'Speaker 2': '',
      'Speaker 3': '',
      'Speaker 4': '',
      'Speaker 5': ''
    });
    setAudioFile({ name: 'Simulacion_Club_Lectura.mp3', size: 14680064 });
    setUploadedAudioUrl('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
    setStatus('mapping');
    setActiveTab('new');
    setSelectedSpeakerId(s1);
    setTargetBookId('');
  };

  // Helper to parse LLM JSON (strips out potential markdown ticks)
  const parseGeminiResponseFallback = (text) => {
    try {
      const speakers = [];
      const speakerSplits = text.split(/"id"\s*:\s*/i);
      
      for (let i = 1; i < speakerSplits.length; i++) {
        const block = speakerSplits[i];
        
        let id = "";
        const idMatch = block.match(/^\s*"([^"]+)"/);
        if (idMatch) {
          id = idMatch[1];
        } else {
          const idMatchNoQuote = block.match(/^\s*([^,}\n]+)/);
          if (idMatchNoQuote) {
            id = idMatchNoQuote[1].replace(/["']/g, '').trim();
          }
        }
        if (!id) id = `Speaker ${i}`;

        const extractField = (fieldName) => {
          const fieldMarker = new RegExp(`"${fieldName}"\\s*:\\s*"`, 'i');
          const markerMatch = block.match(fieldMarker);
          if (!markerMatch) return "";
          
          const startIdx = markerMatch.index + markerMatch[0].length;
          const subText = block.substring(startIdx);
          
          const nextMarkers = [
            /"voiceSnippet"\s*:/i,
            /"summary"\s*:/i,
            /"notesMarkdown"\s*:/i,
            /"id"\s*:/i,
            /\s*}\s*,?\s*"/,
            /\s*}\s*\]/,
            /\s*}\s*$/
          ];
          
          let endIdx = subText.length;
          for (const marker of nextMarkers) {
            const match = subText.match(marker);
            if (match && match.index < endIdx) {
              endIdx = match.index;
            }
          }
          
          let val = subText.substring(0, endIdx).trim();
          let lastQuoteIdx = val.lastIndexOf('"');
          while (lastQuoteIdx > 0 && val[lastQuoteIdx - 1] === '\\') {
            lastQuoteIdx = val.substring(0, lastQuoteIdx).lastIndexOf('"');
          }
          
          if (lastQuoteIdx !== -1) {
            val = val.substring(0, lastQuoteIdx);
          }
          
          return val
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\')
            .trim();
        };
        
        const voiceSnippet = extractField("voiceSnippet");
        const summary = extractField("summary");
        const notesMarkdown = extractField("notesMarkdown");
        
        speakers.push({
          id,
          voiceSnippet: voiceSnippet || "Fragmento de transcripción no disponible",
          summary: summary || "Resumen no disponible",
          notesMarkdown: notesMarkdown || "Notas no disponibles"
        });
      }
      
      if (speakers.length > 0) {
        return { speakers };
      }
      return null;
    } catch (err) {
      console.error("Regex fallback parser failed:", err);
      return null;
    }
  };

  const parseGeminiResponse = (text) => {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();
    
    try {
      return JSON.parse(cleaned);
    } catch (jsonErr) {
      console.warn("JSON.parse failed. Attempting fallback regex parsing...", jsonErr);
      const fallbackResult = parseGeminiResponseFallback(cleaned);
      if (fallbackResult) {
        console.log("Successfully recovered structured speaker data using fallback regex parser!");
        return fallbackResult;
      }
      throw jsonErr;
    }
  };

  const handleReparseRaw = async () => {
    setErrorMsg('');
    try {
      const parsedResult = parseGeminiResponse(editableRawResponse);
      if (!parsedResult?.speakers || parsedResult.speakers.length === 0) {
        throw new Error('No se pudo extraer la estructura de hablantes del texto.');
      }
      setAnalysisResult(parsedResult);
      setStatus('success');
      setShowRawEditor(false);

      // Save transcription to database/localStorage
      await saveTranscription(parsedResult, uploadedAudioUrl);
    } catch (err) {
      console.error('Manual reparse failed:', err);
      setErrorMsg(`Error al volver a analizar: ${err.message}. Si el JSON está mal formado, puedes intentar editarlo abajo para corregir los errores de sintaxis.`);
    }
  };

  // Delete history item
  const handleDeleteHistoryItem = async (item) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar esta transcripción del historial?`)) {
      return;
    }
    try {
      if (!isDemoMode) {
        await deleteDoc(doc(db, 'transcriptions', item.id));
      } else {
        const currentHistory = JSON.parse(localStorage.getItem('flamingo_transcription_history') || '[]');
        const updatedHistory = currentHistory.filter(h => h.createdAt !== item.createdAt);
        localStorage.setItem('flamingo_transcription_history', JSON.stringify(updatedHistory));
      }
      fetchHistory();
    } catch (err) {
      console.error("Error al eliminar la transcripción del historial:", err);
      alert("Error al eliminar del historial: " + err.message);
    }
  };

  const speakersList = analysisResult ? (analysisResult.speakers || analysisResult.attendees || []) : [];

  return (
    <>
      <div className="voice-assistant-overlay" onClick={onClose}></div>
      <div className="voice-assistant-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="voice-assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={20} style={{ color: 'var(--primary)' }} />
            <h3 className="serif-title" style={{ fontSize: '1.4rem', margin: 0 }}>Sesiones del Club de Lectura</h3>
          </div>
          <button className="voice-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="voice-tabs">
          <button 
            type="button" 
            className={`voice-tab-btn ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            Añadir nueva sesión
          </button>
          <button 
            type="button" 
            className={`voice-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Historial de sesiones
          </button>
          <button 
            type="button" 
            className={`voice-tab-btn ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            Miembros del Club
          </button>
        </div>

        {/* Modal Body */}
        <div className="voice-assistant-body">
          {errorMsg && (
            <div className="voice-alert-danger">
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'new' ? (
            <>
              {/* Wallet-saving raw response recovery panel */}
              {rawResponse && status === 'error' && (
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(214, 130, 134, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Sparkles size={16} style={{ color: 'var(--primary)' }} />
                    <h5 style={{ fontWeight: '700', fontSize: '0.9rem', margin: 0 }}>Panel de recuperación para evitar costes</h5>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0 }}>
                    Obtuvimos con éxito la respuesta de Gemini, pero no se pudo analizar correctamente.
                    Para evitar gastar tu saldo de API, puedes ver el texto sin procesar abajo, corregir errores de tipografía del JSON (como comillas no escapadas) e intentar volver a analizarlo, o bien copiar la transcripción manualmente. No se realizarán nuevas llamadas a la API.
                  </p>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', height: 'auto' }}
                      onClick={() => setShowRawEditor(!showRawEditor)}
                    >
                      {showRawEditor ? "Ocultar respuesta cruda" : "Ver/Editar respuesta cruda"}
                    </button>
                    {showRawEditor && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', height: 'auto', background: 'var(--sage)' }}
                        onClick={handleReparseRaw}
                      >
                        Analizar texto editado
                      </button>
                    )}
                  </div>

                  {showRawEditor && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <textarea
                        style={{ 
                          width: '100%', 
                          height: '180px', 
                          fontFamily: 'monospace', 
                          fontSize: '0.75rem', 
                          background: 'var(--bg-secondary)', 
                          border: '1px solid var(--border)', 
                          color: 'var(--text-primary)', 
                          padding: '0.5rem', 
                          borderRadius: 'var(--radius-sm)',
                          resize: 'vertical',
                          lineHeight: '1.4'
                        }}
                        value={editableRawResponse}
                        onChange={(e) => setEditableRawResponse(e.target.value)}
                      />
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
                        💡 Consejo: Busca comas faltantes entre parámetros o comillas sin escapar como <code>"voiceSnippet": "Dije "hola""</code> (cámbialo a <code>\"hola\"</code>).
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 1. API Key Config Section */}
              {showKeyInput ? (
                <form onSubmit={handleKeySave} className="voice-key-form">
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Key size={14} /> Clave API de Gemini
                    </label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                      Tu clave se almacena de forma segura en el almacenamiento local de tu navegador y nunca se envía a nuestros servidores. Obtén una clave gratuita en <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>Google AI Studio</a>.
                    </p>
                    <input
                      type="password"
                      required
                      className="form-input"
                      placeholder="AIzaSy..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={saveKey}
                        onChange={(e) => setSaveKey(e.target.checked)}
                      />
                      Guardar clave en este navegador
                    </label>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.4rem 1rem' }}>
                      Guardar y continuar
                    </button>
                  </div>
                </form>
              ) : (
                <div className="voice-key-badge">
                  <span style={{ fontSize: '0.8rem', color: 'var(--sage)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--sage)' }}></span>
                    Gemini API configurada
                  </span>
                  <button 
                    type="button" 
                    onClick={clearSavedKey} 
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Cambiar clave
                  </button>
                </div>
              )}

              {/* 2. File Upload / Processing State */}
              {status === 'idle' || status === 'error' ? (
                <div style={{ marginTop: '1.5rem' }}>
                  <label className="form-label">Subir audio del club de lectura</label>
                  <div
                    className={`voice-upload-zone ${dragging ? 'dragging' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('voice-audio-input').click()}
                  >
                    <UploadCloud className="voice-upload-icon" />
                    {audioFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                        <FileAudio size={18} style={{ color: 'var(--primary)' }} />
                        <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{audioFile.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({(audioFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                      </div>
                    ) : (
                      <>
                        <p style={{ fontSize: '0.9rem', fontWeight: '600' }}>
                          Arrastra y suelta la grabación de la reunión aquí, o <span style={{ color: 'var(--primary)' }}>busca un archivo</span>
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Formatos soportados: MP3, WAV, M4A, OGG
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    id="voice-audio-input"
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/m4a,audio/x-m4a,audio/ogg"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />

                  {/* Speaker Diarization expected speakers selection */}
                  {audioFile && (
                    <div style={{ marginTop: '1.25rem', marginBottom: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                        <Volume2 size={14} /> Número de miembros esperado
                      </label>
                      <select
                        className="form-select"
                        value={expectedSpeakers}
                        onChange={(e) => setExpectedSpeakers(e.target.value)}
                        style={{ width: '100%', background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                      >
                        <option value="auto">Automático (Detectar automáticamente)</option>
                        <option value="1">1 miembro</option>
                        <option value="2">2 miembros</option>
                        <option value="3">3 miembros</option>
                        <option value="4">4 miembros</option>
                        <option value="5">5 miembros</option>
                        <option value="6">6 o más miembros</option>
                      </select>
                    </div>
                  )}

                  {/* Compression Notice */}
                  <div className="voice-notice-box">
                    <AlertTriangle size={14} style={{ flexShrink: 0, color: 'var(--clay)', marginTop: '0.1rem' }} />
                    <div>
                      <p style={{ fontWeight: '600', color: 'var(--clay)', fontSize: '0.8rem', marginBottom: '0.2rem' }}>Recomendación de tamaño de archivo</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        La subida directa desde el navegador está limitada a **20MB**. Para reuniones del club de lectura de 1 a 2 horas, recomendamos exportar el audio como **MP3 mono de 32 kbps** (¡una hora de audio ocupará solo unos 14MB, lo cual se procesa perfectamente y cuesta menos de 10 centavos!).
                      </p>
                    </div>
                  </div>

                  {audioFile && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAnalyzeAudio}
                      style={{ width: '100%', marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}
                    >
                      <Sparkles size={16} /> Iniciar transcripción y análisis por IA
                    </button>
                  )}

                  {/* Option to simulate 5 speakers */}
                  <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    border: '1px dashed var(--primary)',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(89, 178, 146, 0.04)',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                      🧪 ¿Quieres probar la interfaz con múltiples miembros y audio inmediatamente?
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSimulate5Speakers}
                      style={{ 
                        fontSize: '0.8rem', 
                        padding: '0.4rem 1rem', 
                        borderColor: 'var(--primary)', 
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        cursor: 'pointer'
                      }}
                    >
                      <Sparkles size={12} /> Simular conversación con 5 Miembros
                    </button>
                  </div>
                </div>
              ) : status === 'mapping' ? (
                <div style={{ marginTop: '1.5rem', textAlign: 'left' }}>
                  <h4 className="serif-title" style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--primary)' }}>
                    Mapeo de Miembros Detectados
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                    Hemos detectado {detectedSpeakers.length} voces/miembros en la grabación. Por favor, asigna cada uno a un miembro del club o a un Invitado basándose en la frase de muestra.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {detectedSpeakers.map((sp) => {
                      const snippet = speakerSnippets[sp] || "Frase no disponible";
                      return (
                        <div 
                          key={sp} 
                          style={{
                            background: 'var(--bg-secondary)',
                            padding: '1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--primary)' }}>
                              {sp}
                            </span>
                            <select
                              className="form-select"
                              value={speakerMapping[sp] || ''}
                              onChange={(e) => {
                                setSpeakerMapping(prev => ({
                                  ...prev,
                                  [sp]: e.target.value
                                }));
                              }}
                              style={{
                                width: '200px',
                                fontSize: '0.85rem',
                                background: 'var(--bg-card)',
                                color: 'var(--text-primary)',
                                borderColor: 'var(--border)'
                              }}
                            >
                              <option value="">-- Seleccionar miembro --</option>
                              {registry.map((member) => (
                                <option key={member.id} value={member.name}>
                                  {member.name}
                                </option>
                              ))}
                              <option value="Invitado">Invitado</option>
                            </select>
                          </div>
                          
                          <div style={{ 
                            background: 'var(--bg-card)', 
                            padding: '0.75rem', 
                            borderRadius: 'var(--radius-sm)',
                            borderLeft: '3px solid var(--primary)',
                            fontSize: '0.85rem',
                            fontStyle: 'italic',
                            color: 'var(--text-muted)'
                          }}>
                            “{snippet}”
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setStatus('idle')}
                      style={{ flex: 1 }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleConfirmMapping}
                      style={{ flex: 2, display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}
                      disabled={Object.values(speakerMapping).some(val => val === '')}
                    >
                      <Sparkles size={16} /> Confirmar y Generar Análisis
                    </button>
                  </div>
                  {Object.values(speakerMapping).some(val => val === '') && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--clay)', marginTop: '0.5rem', textAlign: 'center' }}>
                      * Por favor, asigna todas las voces antes de continuar.
                    </p>
                  )}
                </div>
              ) : (status === 'reading' || status === 'uploading' || status === 'analyzing') ? (
                <div className="voice-processing-box">
                  <Loader2 className="voice-spinner" size={32} />
                  <p style={{ fontWeight: '600', fontSize: '1rem', marginTop: '1rem' }}>Procesando grabación</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '340px', marginTop: '0.25rem' }}>
                    {progressMsg}
                  </p>
                </div>
              ) : status === 'success' && analysisResult ? (
                <div style={{ marginTop: '1.5rem' }}>
                  {/* Audio Player playback box */}
                  {uploadedAudioUrl && (
                    <div style={{
                      background: 'var(--bg-secondary)',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      marginBottom: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                      textAlign: 'left'
                    }}>
                      <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Volume2 size={14} /> REPRODUCIENDO GRABACIÓN ASOCIADA
                      </p>
                      <audio src={uploadedAudioUrl} controls style={{ width: '100%' }} />
                    </div>
                  )}

                  {/* General Summary */}
                  {(analysisResult.generalSummary || analysisResult.result?.generalSummary) && (
                    <div style={{
                      background: 'rgba(89, 178, 146, 0.05)',
                      padding: '1.25rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid rgba(89, 178, 146, 0.2)',
                      marginBottom: '1.5rem',
                      textAlign: 'left'
                    }}>
                      <h5 className="serif-title" style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Sparkles size={16} /> Resumen General de la Sesión
                      </h5>
                      <p style={{ fontSize: '0.875rem', lineHeight: '1.5', color: 'var(--text-primary)', margin: 0 }}>
                        {analysisResult.generalSummary || analysisResult.result?.generalSummary}
                      </p>
                    </div>
                  )}

                  {/* Complete Transcript (Collapsible) */}
                  {(analysisResult.transcript || analysisResult.result?.transcript || analysisResult.result?.result?.transcript) && (
                    <details style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.75rem 1rem',
                      marginBottom: '1.5rem',
                      textAlign: 'left'
                    }}>
                      <summary style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Ver transcripción completa de la sesión</span>
                      </summary>
                      <div style={{
                        marginTop: '0.75rem',
                        maxHeight: '250px',
                        overflowY: 'auto',
                        padding: '0.75rem',
                        background: 'var(--bg-card)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        fontSize: '0.825rem',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--text-muted)'
                      }}>
                        {analysisResult.transcript || analysisResult.result?.transcript || analysisResult.result?.result?.transcript}
                      </div>
                    </details>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 className="serif-title" style={{ fontSize: '1.2rem', margin: 0, textAlign: 'center', width: '100%' }}>
                      ¿Quién eres tú en esta grabación?
                    </h4>
                  </div>
                  
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', textAlign: 'center' }}>
                    Selecciona tu miembro abajo para revisar tus opiniones y ver/copiar tus notas detalladas.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {speakersList.map((speaker) => {
                      const isSelected = selectedSpeakerId === speaker.id;
                      // Display number or letter indicator
                      const avatarText = speaker.id.match(/\d+/) 
                        ? speaker.id.match(/\d+/)[0] 
                        : (speaker.id.match(/[A-Z]/) ? speaker.id.match(/[A-Z]/)[0] : 'S');

                      return (
                        <div 
                          key={speaker.id} 
                          className={`voice-speaker-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedSpeakerId(speaker.id)}
                          style={{ cursor: 'pointer', border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)' }}
                        >
                          <div className="voice-speaker-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div className={`voice-speaker-avatar ${isSelected ? 'active' : ''}`}>
                                {avatarText}
                              </div>
                              <div style={{ textAlign: 'left' }}>
                                <p style={{ fontWeight: '700', fontSize: '0.95rem', margin: 0 }}>{speaker.id}</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Participante del club de lectura</p>
                              </div>
                            </div>
                            {isSelected && (
                              <span className="voice-badge-applied">
                                <Check size={12} /> Seleccionado
                              </span>
                            )}
                          </div>

                          {/* Voice snippet */}
                          <div className="voice-speaker-snippet" style={{ textAlign: 'left' }}>
                            <Volume2 size={14} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '0.2rem' }} />
                            <span style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>
                              “{speaker.voiceSnippet}”
                            </span>
                          </div>

                          {/* Summary */}
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: '0.75rem 0', textAlign: 'left' }}>
                            <strong>Opiniones clave (en primera persona):</strong> {speaker.summary}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Notes Markdown Preview Container */}
                  {selectedSpeakerId && (
                    <div style={{
                      marginTop: '1.5rem',
                      padding: '1.25rem',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: '#FAF6EE', // light soft cream
                      boxShadow: 'var(--shadow-sm)',
                      textAlign: 'left'
                    }}>
                      <h5 className="serif-title" style={{ fontSize: '1.15rem', marginBottom: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Sparkles size={16} /> Notas preliminares privadas de {selectedSpeakerId}
                      </h5>
                      
                      <div className="voice-notes-markdown-preview" style={{
                        maxHeight: '350px',
                        overflowY: 'auto',
                        padding: '1rem',
                        background: '#ffffff',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.875rem',
                        lineHeight: '1.6',
                        marginBottom: '1rem',
                        color: 'var(--text-primary)'
                      }}>
                        {renderMarkdown(speakersList.find(s => s.id === selectedSpeakerId)?.notesMarkdown || '')}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', height: 'auto' }}
                          onClick={() => {
                            const markdown = speakersList.find(s => s.id === selectedSpeakerId)?.notesMarkdown;
                            if (markdown) {
                              navigator.clipboard.writeText(markdown);
                              alert("¡Notas copiadas al portapapeles con éxito!");
                            }
                          }}
                        >
                          Copiar al portapapeles
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Select Book Dropdown (General View Mode) */}
                  {selectedSpeakerId && !onApplyNotes && books && books.length > 0 && (
                    <div style={{
                      marginTop: '1.5rem',
                      padding: '1.25rem',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      textAlign: 'left'
                    }}>
                      <label className="form-label" style={{ fontSize: '0.85rem', margin: 0, fontWeight: 'bold' }}>
                        Aplicar estas notas a una reseña existente:
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select
                          className="form-select"
                          value={targetBookId}
                          onChange={(e) => setTargetBookId(e.target.value)}
                          style={{ flex: 1, fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
                        >
                          <option value="">-- Seleccionar reseña de libro --</option>
                          {books.map(b => (
                            <option key={b.id} value={b.id}>{b.title} - {b.author}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!targetBookId}
                          style={{ padding: '0.5rem 1.25rem', height: 'auto', fontSize: '0.85rem' }}
                          onClick={async () => {
                            const markdown = speakersList.find(s => s.id === selectedSpeakerId)?.notesMarkdown;
                            if (markdown && targetBookId && onApplyNotesToBook) {
                              try {
                                await onApplyNotesToBook(targetBookId, markdown);
                                alert("Notas de voz aplicadas con éxito al libro.");
                                onClose();
                              } catch (err) {
                                alert("Error al aplicar las notas: " + err.message);
                              }
                            }
                          }}
                        >
                          Aplicar a Reseña
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Bottom Action buttons */}
                  <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                    {onApplyNotes && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: '100%', maxWidth: '320px', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}
                        disabled={!selectedSpeakerId}
                        onClick={() => {
                          const selectedSpeaker = speakersList.find(s => s.id === selectedSpeakerId);
                          if (selectedSpeaker) {
                            onApplyNotes(selectedSpeaker.notesMarkdown);
                            onClose();
                          }
                        }}
                      >
                        <Check size={16} /> Aplicar notas de {selectedSpeakerId ? selectedSpeakerId.split(' ')[0] : '...'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ marginTop: '0.5rem' }}
                      onClick={() => {
                        setStatus('idle');
                        setAudioFile(null);
                        setAnalysisResult(null);
                        setRawResponse('');
                        setEditableRawResponse('');
                        setShowRawEditor(false);
                        setSelectedSpeakerId(null);
                        setTargetBookId('');
                      }}
                    >
                      Procesar otra grabación
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : activeTab === 'history' ? (
            /* History Tab */
            <div style={{ marginTop: '1rem' }}>
              <h4 className="serif-title" style={{ fontSize: '1.20rem', marginBottom: '1rem' }}>
                Historial de Sesiones
              </h4>
              {isDemoMode && (
                <p style={{ fontSize: '0.75rem', color: '#fbbf24', marginBottom: '1rem', fontStyle: 'italic' }}>
                  * Nota: En modo de demostración, las grabaciones de audio son locales de esta sesión y no se reproducirán tras recargar la página.
                </p>
              )}

              {loadingHistory ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 0' }}>
                  <Loader2 className="voice-spinner" size={24} />
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Cargando historial...</p>
                </div>
              ) : history.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)' }}>
                  <Volume2 size={36} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '0.75rem' }} />
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No hay transcripciones grabadas en el historial.</p>
                </div>
              ) : (
                <div className="voice-history-list">
                  {history.map((item, idx) => (
                    <div key={item.id || idx} className="voice-history-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ fontWeight: '600', fontSize: '0.9rem', margin: 0, color: 'var(--text-primary)' }}>{item.audioName}</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                            {new Date(item.createdAt).toLocaleDateString('es-ES', { 
                              day: 'numeric', 
                              month: 'long', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteHistoryItem(item)}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0.25rem' }}
                          title="Borrar del historial"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {item.audioUrl && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <audio src={item.audioUrl} controls style={{ width: '100%' }} />
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                          onClick={() => {
                            setAnalysisResult(item.result || item);
                            setAudioFile({ name: item.audioName });
                            setUploadedAudioUrl(item.audioUrl);
                            setStatus('success');
                            setActiveTab('new');
                            setSelectedSpeakerId(null);
                            setTargetBookId('');
                          }}
                        >
                          Cargar análisis pasados
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Members Tab */
            <div style={{ marginTop: '1rem' }}>
              <h4 className="serif-title" style={{ fontSize: '1.20rem', marginBottom: '0.5rem' }}>
                Registro de Miembros del Club
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                Registra a los 5 participantes fijos del club. Graba una firma de voz de 10 segundos para cada uno para que la IA los identifique automáticamente en futuras transcripciones.
              </p>

              {loadingRegistry ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 0' }}>
                  <Loader2 className="voice-spinner" size={24} />
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Cargando miembros...</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {registry.map((speaker, idx) => {
                    const isRec = isRecording && recordingSpeakerId === speaker.id;
                    const hasVoice = speaker.audioUrl || speaker.audioBase64;
                    const isSaving = savingSpeakerId === speaker.id;

                    return (
                      <div 
                        key={speaker.id} 
                        style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          padding: '1.25rem',
                          boxShadow: 'var(--shadow-sm)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1rem',
                          textAlign: 'left'
                        }}
                      >
                        {/* Header: Avatar and Name */}
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: 'var(--primary-glow)',
                            color: 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <User size={20} />
                          </div>
                          
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold', margin: 0 }}>Nombre del Participante</label>
                              <input 
                                type="text"
                                className="form-input"
                                value={speaker.name || ''}
                                onChange={(e) => handleUpdateSpeakerMeta(idx, 'name', e.target.value)}
                                placeholder="Ej. Juan, Sofía..."
                                style={{ fontSize: '0.9rem', padding: '0.4rem 0.6rem' }}
                                disabled={isRec}
                              />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 'bold', margin: 0 }}>Perfil / Estilo Literario (Pistas para la IA)</label>
                              <textarea 
                                className="form-input"
                                value={speaker.persona || ''}
                                onChange={(e) => handleUpdateSpeakerMeta(idx, 'persona', e.target.value)}
                                placeholder="Ej. Analiza aspectos de traducción, se enfoca en ritmo..."
                                style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem', minHeight: '60px', resize: 'vertical' }}
                                disabled={isRec}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Voice Signature Actions */}
                        <div style={{
                          borderTop: '1px solid var(--border)',
                          paddingTop: '0.85rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.75rem'
                        }}>
                          {/* Left: Status Badges and Playback */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {hasVoice ? (
                              <>
                                <span className="voice-badge-applied" style={{ background: 'var(--primary-glow)', color: 'var(--primary)', borderColor: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Check size={12} /> Firma registrada
                                </span>
                                <audio 
                                  src={speaker.audioUrl || (speaker.audioBase64 ? `data:audio/webm;base64,${speaker.audioBase64}` : '')} 
                                  controls 
                                  style={{ height: '28px', maxWidth: '180px' }} 
                                />
                              </>
                            ) : (
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                Sin firma de voz. Elige grabar abajo.
                              </span>
                            )}
                          </div>

                          {/* Right: Mic Recording / Stop / Delete / Save Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {isRec ? (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={stopRecordingVoice}
                                style={{
                                  padding: '0.4rem 0.8rem',
                                  fontSize: '0.8rem',
                                  borderColor: 'var(--accent-coral)',
                                  color: 'var(--accent-coral)',
                                  background: 'rgba(250, 103, 129, 0.05)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem'
                                }}
                              >
                                <Square size={12} fill="var(--accent-coral)" /> Parar ({recordCountdown}s)
                              </button>
                            ) : (
                              <>
                                <input 
                                  type="file" 
                                  accept="audio/*" 
                                  id={`file-upload-${speaker.id}`} 
                                  style={{ display: 'none' }} 
                                  onChange={(e) => handleUploadVoiceprintFile(speaker.id, e)} 
                                />
                                <button 
                                  type="button" 
                                  className="btn btn-secondary"
                                  onClick={() => document.getElementById(`file-upload-${speaker.id}`).click()}
                                  disabled={isRecording || isSaving}
                                  style={{
                                    padding: '0.4rem 0.8rem',
                                    fontSize: '0.8rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem'
                                  }}
                                  title="Subir archivo de audio como firma de voz"
                                >
                                  <FileUp size={12} /> Subir Audio
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => startRecordingVoice(speaker.id)}
                                  disabled={isRecording || isSaving}
                                  style={{
                                    padding: '0.4rem 0.8rem',
                                    fontSize: '0.8rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem'
                                  }}
                                >
                                  <Mic size={12} /> Grabar Voz
                                </button>
                              </>
                            )}

                            {hasVoice && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-icon"
                                onClick={() => handleDeleteVoiceprint(speaker.id)}
                                disabled={isRec || isRecording}
                                style={{ padding: '0.4rem', height: 'auto', borderColor: 'var(--border)' }}
                                title="Eliminar firma de voz"
                              >
                                <Trash2 size={12} style={{ color: 'var(--accent-coral)' }} />
                              </button>
                            )}

                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleSaveSpeakerProfile(idx)}
                              disabled={isRec || isSaving}
                              style={{
                                padding: '0.4rem 0.8rem',
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                              }}
                            >
                              {isSaving ? (
                                <Loader2 className="voice-spinner" size={12} />
                              ) : (
                                <Save size={12} />
                              )}
                              Guardar
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="voice-assistant-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
